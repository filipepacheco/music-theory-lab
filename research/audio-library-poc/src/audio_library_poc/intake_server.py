"""Local-only HTTP service that turns an uploaded audio file into library data.

This is the one part of the POC that listens on a socket, and it is a
development convenience, not a product surface. It binds loopback by default,
has no authentication, and runs arbitrary decode + inference work for anyone
who can reach it, so it must never be exposed off the machine. The offline
``audio-library-poc`` CLI is untouched and still reaches the network only
through ``fetch_checkpoints.py``; this ships as its own console script so
that promise keeps holding.

What it automates is the manual part: hash the upload, write the manifest,
run beat/chord/key/section, then publish into ``public/library`` with
``--copy-audio`` so the viewer gets a player. Uploaded audio lands in the
ignored workspace and the copied source is covered by
``public/library/tracks/*/source.*`` in .gitignore, so originals stay local.

One job runs at a time. There is a single GPU behind this and a queue is
easier to reason about than a semaphore.
"""

from __future__ import annotations

import argparse
import queue
import subprocess
import sys
import threading
import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Literal

import yaml

from audio_library_poc.metadata import hash_file
from audio_library_poc.models import PipelineManifest, StageStatus
from audio_library_poc.orchestrator import StageOrchestrator
from audio_library_poc.stage_dispatch import build_stage_dispatcher
from audio_library_poc.track_intake import (
    INTAKE_STAGE_KINDS,
    CheckpointRef,
    build_intake_manifest,
    intake_source_relative_path,
    slugify,
)

BEAT_CHECKPOINT_PATH = "models/beat_this-final0.ckpt"
CHORD_CHECKPOINT_PATH = "models/chordmini-btc-model-best.pth"

#: Extensions the intake accepts. The decoders downstream dispatch on suffix.
ALLOWED_SUFFIXES = frozenset({".mp3", ".m4a", ".wav", ".flac", ".ogg"})

#: Refuse anything larger than this rather than filling the disk. A 10-minute
#: lossless stereo file lands well under it.
MAX_UPLOAD_BYTES = 256 * 1024 * 1024

JobStatus = Literal["queued", "running", "succeeded", "failed"]


@dataclass
class StageProgress:
    kind: str
    status: Literal["pending", "running", "succeeded", "failed"] = "pending"
    detail: str | None = None

    def as_json(self) -> dict[str, Any]:
        return {"kind": self.kind, "status": self.status, "detail": self.detail}


@dataclass
class Job:
    """One uploaded file working its way through the four stages."""

    id: str
    slug: str
    title: str
    artist: str
    filename: str
    source_sha256: str
    status: JobStatus = "queued"
    error: str | None = None
    created_at: str = field(
        default_factory=lambda: datetime.now(UTC).isoformat(timespec="seconds")
    )
    finished_at: str | None = None
    stages: list[StageProgress] = field(
        default_factory=lambda: [StageProgress(kind=k) for k in INTAKE_STAGE_KINDS]
    )

    def as_json(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "slug": self.slug,
            "title": self.title,
            "artist": self.artist,
            "filename": self.filename,
            "source_sha256": self.source_sha256,
            "status": self.status,
            "error": self.error,
            "created_at": self.created_at,
            "finished_at": self.finished_at,
            "stages": [stage.as_json() for stage in self.stages],
        }


class IntakeError(Exception):
    """A request the caller can fix: bad suffix, oversized file, no checkpoint."""


class JobRegistry:
    """Jobs plus the worker thread that drains them, oldest first.

    Deliberately in-memory: a restart loses the list, but never the work —
    completed stages are committed in the workspace cache, so re-uploading the
    same file replays as cache hits.
    """

    def __init__(self) -> None:
        self._jobs: dict[str, Job] = {}
        self._order: list[str] = []
        self._lock = threading.Lock()
        self._queue: queue.Queue[str] = queue.Queue()
        self._worker: threading.Thread | None = None

    def add(self, job: Job) -> None:
        with self._lock:
            self._jobs[job.id] = job
            self._order.append(job.id)
        self._queue.put(job.id)

    def get(self, job_id: str) -> Job | None:
        with self._lock:
            return self._jobs.get(job_id)

    def list(self) -> list[Job]:
        with self._lock:
            return [self._jobs[i] for i in reversed(self._order)]

    def start(self, runner: JobRunner) -> None:
        if self._worker is not None:
            return
        self._worker = threading.Thread(
            target=self._drain, args=(runner,), daemon=True, name="intake-worker"
        )
        self._worker.start()

    def _drain(self, runner: JobRunner) -> None:
        while True:
            job_id = self._queue.get()
            job = self.get(job_id)
            if job is None:
                continue
            try:
                runner.execute(job)
            except Exception as exc:  # noqa: BLE001 - the worker must not die
                job.status = "failed"
                job.error = f"{type(exc).__name__}: {exc}"
                job.finished_at = datetime.now(UTC).isoformat(timespec="seconds")


class JobRunner:
    """Runs a job's stages, then publishes the workspace into public/library.

    ``public`` is the app's ``public/`` directory, not ``public/library``:
    ``sync_workspace_to_public.py`` appends ``library`` itself. Passing the
    deeper path publishes into ``public/library/library`` and the viewer sees
    nothing, so `main` refuses it outright.
    """

    def __init__(self, workspace: Path, public: Path, *, copy_audio: bool = True):
        self.workspace = workspace
        self.public = public
        self.copy_audio = copy_audio

    def execute(self, job: Job) -> None:
        job.status = "running"
        manifest_path = self.workspace / f"intake-{job.slug}.local.yaml"
        manifest = PipelineManifest.model_validate(
            yaml.safe_load(manifest_path.read_text(encoding="utf-8"))
        )
        orchestrator = StageOrchestrator(
            self.workspace, dispatcher=build_stage_dispatcher(self.workspace)
        )
        by_kind = {stage.kind: stage for stage in job.stages}

        for specification in manifest.stages:
            progress = by_kind[specification.stage_kind]
            progress.status = "running"
            result = orchestrator.run_stage(
                run_id=job.slug,
                specification=specification,
                input_sha256=job.source_sha256,
                code_revision=manifest.code_revision,
            )
            if result.status is StageStatus.SUCCEEDED:
                progress.status = "succeeded"
                continue
            progress.status = "failed"
            progress.detail = _describe_failure(result)
            # section is optional to the public export; the other three are
            # not, so only a section failure is worth continuing past.
            if specification.stage_kind != "section.librosa_segment":
                job.status = "failed"
                job.error = f"{specification.stage_kind}: {progress.detail}"
                job.finished_at = datetime.now(UTC).isoformat(timespec="seconds")
                return

        self.publish()
        job.status = "succeeded"
        job.finished_at = datetime.now(UTC).isoformat(timespec="seconds")

    def publish(self) -> None:
        """Run the sync script the same way a human would, in its own process."""

        script = (
            Path(__file__).resolve().parents[2]
            / "scripts"
            / "sync_workspace_to_public.py"
        )
        command = [
            sys.executable,
            str(script),
            "--workspace",
            str(self.workspace),
            "--public",
            str(self.public),
        ]
        if self.copy_audio:
            command.append("--copy-audio")
        completed = subprocess.run(  # noqa: S603 - fixed argv, no shell
            command, capture_output=True, text=True, check=False
        )
        if completed.returncode != 0:
            raise RuntimeError(
                f"sync failed ({completed.returncode}): "
                f"{completed.stderr.strip() or completed.stdout.strip()}"
            )


def _describe_failure(result: Any) -> str:
    error = getattr(result, "error", None)
    if error is None:
        return str(getattr(result, "status", "failed"))
    code = getattr(error, "code", None)
    message = getattr(error, "message", None)
    return f"{code}: {message}" if code else str(message or error)


def checkpoint_ref(workspace: Path, relative_path: str) -> CheckpointRef:
    """Pin a checkpoint by hashing what is actually on disk."""

    path = workspace / relative_path
    if not path.is_file():
        raise IntakeError(
            f"checkpoint ausente: {relative_path}. "
            "Rode scripts/fetch_checkpoints.py antes de analisar faixas."
        )
    return CheckpointRef(relative_path=relative_path, sha256=hash_file(path))


def prepare_job(
    *,
    workspace: Path,
    filename: str,
    payload: bytes,
    title: str,
    artist: str,
    segment_count: int,
    device: str,
) -> Job:
    """Validate an upload, land it in the workspace, and write its manifest.

    Raises `IntakeError` for anything the caller can correct. Nothing here
    starts work; the returned job still has to be queued.
    """

    suffix = Path(filename).suffix.lower()
    if suffix not in ALLOWED_SUFFIXES:
        allowed = ", ".join(sorted(ALLOWED_SUFFIXES))
        raise IntakeError(
            f"formato não suportado: {suffix or '(sem extensão)'}. Use {allowed}."
        )
    if not payload:
        raise IntakeError("arquivo vazio")
    if len(payload) > MAX_UPLOAD_BYTES:
        limit_mb = MAX_UPLOAD_BYTES // (1024 * 1024)
        raise IntakeError(f"arquivo maior que {limit_mb} MB")

    slug = slugify(title or Path(filename).stem)
    relative = intake_source_relative_path(slug, suffix)
    destination = workspace / relative
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_bytes(payload)

    manifest = build_intake_manifest(
        slug=slug,
        source_relative_path=relative,
        beat_checkpoint=checkpoint_ref(workspace, BEAT_CHECKPOINT_PATH),
        chord_checkpoint=checkpoint_ref(workspace, CHORD_CHECKPOINT_PATH),
        device=device,
        segment_count=segment_count,
    )
    # Validate before writing: a manifest that cannot load is a bug here, not
    # something the operator should discover mid-run.
    PipelineManifest.model_validate(manifest)
    (workspace / f"intake-{slug}.local.yaml").write_text(
        yaml.safe_dump(manifest, sort_keys=False, allow_unicode=True),
        encoding="utf-8",
    )

    return Job(
        id=uuid.uuid4().hex,
        slug=slug,
        title=title or Path(filename).stem,
        artist=artist,
        filename=filename,
        source_sha256=hash_file(destination),
    )


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="audio-library-intake",
        description="Local-only upload-and-analyze service. Do not expose off-host.",
    )
    parser.add_argument("--workspace", required=True, type=Path)
    parser.add_argument(
        "--public",
        required=True,
        type=Path,
        help=(
            "the app's public/ directory. Results land in public/library/ -- "
            "the sync script appends 'library' itself, so do not pass it here."
        ),
    )
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", default=8756, type=int)
    parser.add_argument(
        "--device",
        default="cuda",
        help="torch device for the beat and chord stages",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    import uvicorn

    from audio_library_poc.intake_app import create_app

    arguments = build_parser().parse_args(argv)
    if arguments.host not in {"127.0.0.1", "localhost", "::1"}:
        print(
            f"refusing to bind {arguments.host}: this service has no "
            "authentication and runs inference for any caller",
            file=sys.stderr,
        )
        return 2
    public = arguments.public.resolve()
    if public.name == "library":
        # Publishing would land in public/library/library and the viewer would
        # never look there. Easier to refuse than to leave someone hunting.
        print(
            f"--public should be the app's public/ directory, not {public}. "
            f"Results already go into <public>/library/. Try {public.parent}.",
            file=sys.stderr,
        )
        return 2
    app = create_app(
        arguments.workspace.resolve(),
        public,
        device=arguments.device,
    )
    uvicorn.run(app, host=arguments.host, port=arguments.port, log_level="info")
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
