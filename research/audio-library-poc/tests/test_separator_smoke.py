"""End-to-end smoke of the separator seam via the real `run` CLI subprocess.

These tests exercise everything that would break on a first real Phase 2 run
except loading a model: pipeline manifest validation, dispatcher wiring,
workspace source resolution, streaming SHA-256 verification of the source
audio, staging directory creation, and the orchestrator's typed-failure
publishing path. They deliberately use ``subprocess`` (not the in-process
``main``) so packaging bugs and installed-entry-point regressions surface
before real MP3s are dropped in.

The synthetic audio is a short 16-bit PCM WAV built with ``wave`` from the
standard library — the stubs never read the file bytes past the SHA-256 the
bridge computes, so no real audio decoding is exercised here.
"""

from __future__ import annotations

import hashlib
import json
import struct
import subprocess
import textwrap
import wave
from pathlib import Path

import pytest

from audio_library_poc.cache import hash_config, stage_cache_key
from audio_library_poc.models import StageIdentity

PACKAGE_ROOT = Path(__file__).parents[1]
VENV_ROOT = PACKAGE_ROOT / ".venv"
CLI_EXECUTABLE = VENV_ROOT / "Scripts" / "audio-library-poc.exe"


pytestmark = pytest.mark.skipif(
    not CLI_EXECUTABLE.is_file(),
    reason=(
        f"installed CLI entry point not found at {CLI_EXECUTABLE}; run "
        "`uv sync --extra dev` first"
    ),
)


def _write_synthetic_wav(path: Path, *, frames: int = 4096) -> str:
    """Write a small deterministic 16-bit stereo PCM WAV and return its SHA-256."""

    path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path), "wb") as sink:
        sink.setnchannels(2)
        sink.setsampwidth(2)
        sink.setframerate(44100)
        # Alternating +1000 / -1000 samples per channel: deterministic and
        # unambiguously non-silent, so a real decoder would see actual audio.
        pattern = b"".join(
            struct.pack("<hh", 1000 if index % 2 == 0 else -1000, 500)
            for index in range(frames)
        )
        sink.writeframes(pattern)
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _pipeline_yaml(*, stage_kind: str, source_relative_path: str) -> str:
    return textwrap.dedent(
        f"""\
        schema_version: "1.0.0"
        pipeline_id: separator-smoke-pipeline
        code_revision: separator-smoke-code-rev
        stages:
          - stage_kind: {stage_kind}
            implementation_version: "1.0.0"
            model_identifier: pinned/example:v1
            model_sha256: "{"b" * 64}"
            max_attempts: 1
            config:
              source_relative_path: {source_relative_path}
              checkpoint_relative_path: models/bs-rofo-sw-fixed.ckpt
              config_relative_path: models/bs-rofo-sw-fixed.yaml
              segment: 8.0
              overlap: 0.25
              shifts: 1
              device: cuda
              precision: float16
              retain_native: false
              batch_size: 1
              use_test_time_augmentation: false
        """
    )


def _demucs_pipeline_yaml(source_relative_path: str) -> str:
    return textwrap.dedent(
        f"""\
        schema_version: "1.0.0"
        pipeline_id: separator-smoke-pipeline-demucs
        code_revision: separator-smoke-code-rev
        stages:
          - stage_kind: separator.demucs_htdemucs_6s
            implementation_version: "0.0.0"
            model_identifier: pinned/htdemucs_6s:v1
            model_sha256: "{"c" * 64}"
            max_attempts: 1
            config:
              source_relative_path: {source_relative_path}
              segment: null
              overlap: 0.25
              shifts: 1
              device: cuda
              precision: float32
              retain_native: false
              split: true
              jobs: 0
        """
    )


def _run_cli(*args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [str(CLI_EXECUTABLE), *args],
        capture_output=True,
        text=True,
        check=False,
        timeout=60,
        cwd=str(PACKAGE_ROOT),
    )


def _read_events(workspace: Path, run_id: str) -> list[dict]:
    events_path = workspace / "runs" / run_id / "events.jsonl"
    return [
        json.loads(line)
        for line in events_path.read_text(encoding="utf-8").splitlines()
    ]


def _expected_cache_key(
    *,
    stage_kind: str,
    input_sha256: str,
    config: dict,
    implementation_version: str,
    model_identifier: str,
    model_sha256: str,
    code_revision: str,
) -> str:
    identity = StageIdentity(
        stage_kind=stage_kind,
        input_sha256=input_sha256,
        implementation_version=implementation_version,
        config_sha256=hash_config(config),
        output_schema_version="1.0.0",
        model_identifier=model_identifier,
        model_sha256=model_sha256,
        code_revision=code_revision,
    )
    return stage_cache_key(identity)


def test_bs_roformer_run_publishes_clean_checkpoint_missing(tmp_path: Path) -> None:
    workspace = tmp_path / "workspace"
    source = workspace / "originals" / "synthetic.wav"
    source_sha256 = _write_synthetic_wav(source)
    pipeline_path = workspace / "pipeline.local.yaml"
    pipeline_path.write_text(
        _pipeline_yaml(
            stage_kind="separator.bs_roformer",
            source_relative_path="originals/synthetic.wav",
        ),
        encoding="utf-8",
    )

    completed = _run_cli(
        "run",
        "--pipeline",
        str(pipeline_path),
        "--workspace",
        str(workspace),
        "--run-id",
        "bs-roformer-smoke",
        "--input-sha256",
        source_sha256,
    )

    assert completed.returncode == 4, completed.stderr
    assert completed.stderr == ""
    summary = json.loads(completed.stdout)
    assert summary["command"] == "run"
    assert summary["completed"] is False
    assert summary["status"] == "failed_terminal"
    assert summary["pipeline_id"] == "separator-smoke-pipeline"
    assert len(summary["stages"]) == 1
    stage = summary["stages"][0]
    assert stage["stage_kind"] == "separator.bs_roformer"
    assert stage["status"] == "failed_terminal"
    assert stage["attempts"] == 1
    # With the real runtime wired, missing model assets surface as a typed
    # failure before any torch import.
    assert stage["error"]["code"] == "separator.checkpoint_missing"
    assert stage["error"]["retryable"] is False
    assert stage["error"]["details"]["relative_path"] == (
        "models/bs-rofo-sw-fixed.ckpt"
    )
    assert stage["artifacts"] == []

    result_path = (
        workspace
        / "runs"
        / "bs-roformer-smoke"
        / "stages"
        / "separator.bs_roformer"
        / "results"
        / f"{stage['cache_key']}.json"
    )
    assert result_path.is_file()
    result_json = json.loads(result_path.read_text(encoding="utf-8"))
    assert result_json["status"] == "failed_terminal"
    assert result_json["identity"]["model_sha256"] == "b" * 64

    events = _read_events(workspace, "bs-roformer-smoke")
    event_names = [event["event_name"] for event in events]
    assert event_names == ["stage.started", "stage.failed_terminal"]

    staging_path = (
        workspace
        / "runs"
        / "bs-roformer-smoke"
        / "stages"
        / "separator.bs_roformer"
        / "staging"
        / stage["cache_key"]
    )
    assert not staging_path.exists()
    artifacts_path = (
        workspace
        / "runs"
        / "bs-roformer-smoke"
        / "stages"
        / "separator.bs_roformer"
        / "artifacts"
        / stage["cache_key"]
    )
    assert not artifacts_path.exists()


def test_demucs_run_publishes_clean_not_implemented(tmp_path: Path) -> None:
    workspace = tmp_path / "workspace"
    source = workspace / "originals" / "synthetic.wav"
    source_sha256 = _write_synthetic_wav(source)
    pipeline_path = workspace / "pipeline.local.yaml"
    pipeline_path.write_text(
        _demucs_pipeline_yaml("originals/synthetic.wav"),
        encoding="utf-8",
    )

    completed = _run_cli(
        "run",
        "--pipeline",
        str(pipeline_path),
        "--workspace",
        str(workspace),
        "--run-id",
        "demucs-smoke",
        "--input-sha256",
        source_sha256,
    )

    assert completed.returncode == 4, completed.stderr
    summary = json.loads(completed.stdout)
    stage = summary["stages"][0]
    assert stage["stage_kind"] == "separator.demucs_htdemucs_6s"
    assert stage["error"]["code"] == "separator.not_implemented"
    assert stage["error"]["details"]["candidate_id"] == "demucs_htdemucs_6s"


def test_run_reports_source_hash_mismatch_when_input_hash_wrong(
    tmp_path: Path,
) -> None:
    workspace = tmp_path / "workspace"
    source = workspace / "originals" / "synthetic.wav"
    _write_synthetic_wav(source)
    pipeline_path = workspace / "pipeline.local.yaml"
    pipeline_path.write_text(
        _pipeline_yaml(
            stage_kind="separator.bs_roformer",
            source_relative_path="originals/synthetic.wav",
        ),
        encoding="utf-8",
    )

    wrong_input_sha256 = "0" * 64
    completed = _run_cli(
        "run",
        "--pipeline",
        str(pipeline_path),
        "--workspace",
        str(workspace),
        "--run-id",
        "hash-mismatch-smoke",
        "--input-sha256",
        wrong_input_sha256,
    )

    assert completed.returncode == 4, completed.stderr
    summary = json.loads(completed.stdout)
    stage = summary["stages"][0]
    assert stage["error"]["code"] == "separator.source_hash_mismatch"
    assert stage["error"]["details"]["declared"] == wrong_input_sha256


def test_run_reports_unknown_stage_kind_from_manifest(tmp_path: Path) -> None:
    workspace = tmp_path / "workspace"
    pipeline_path = workspace / "pipeline.local.yaml"
    workspace.mkdir()
    pipeline_path.write_text(
        textwrap.dedent(
            """\
            schema_version: "1.0.0"
            pipeline_id: separator-smoke-unknown
            code_revision: unknown-stage-smoke
            stages:
              - stage_kind: separator.does_not_exist
                implementation_version: "0.0.0"
                max_attempts: 1
                config: {}
            """
        ),
        encoding="utf-8",
    )

    completed = _run_cli(
        "run",
        "--pipeline",
        str(pipeline_path),
        "--workspace",
        str(workspace),
        "--run-id",
        "unknown-kind-smoke",
        "--input-sha256",
        "a" * 64,
    )

    assert completed.returncode == 4, completed.stderr
    summary = json.loads(completed.stdout)
    stage = summary["stages"][0]
    assert stage["stage_kind"] == "separator.does_not_exist"
    assert stage["error"]["code"] == "stage.unknown_kind"
    known = stage["error"]["details"]["known_kinds"]
    assert "separator.bs_roformer" in known
    assert "separator.demucs_htdemucs_6s" in known
    assert "fake.deterministic" in known
