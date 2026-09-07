"""HTTP surface for the local intake service.

Split from ``intake_server.py`` for two reasons, one structural and one that
is a real trap.

Structural: everything in ``intake_server`` works without the ``server``
extra installed, which is what lets the tests and CI import it. FastAPI is
imported here, at module scope, so importing this module is the thing that
requires the extra.

The trap: FastAPI resolves a route's annotations against its module globals.
Under ``from __future__ import annotations`` every annotation is a string, so
a route whose ``UploadFile`` came from a function-local import leaves FastAPI
holding a ForwardRef it cannot resolve, and every request dies with a
PydanticUserError about a type that is "not fully defined". This module
therefore has no ``__future__`` import and does its FastAPI imports at the
top. Do not add one.
"""

from pathlib import Path
from typing import Any

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from audio_library_poc.intake_server import (
    BEAT_CHECKPOINT_PATH,
    CHORD_CHECKPOINT_PATH,
    INTAKE_STAGE_KINDS,
    IntakeError,
    JobRegistry,
    JobRunner,
    prepare_job,
)


def create_app(workspace: Path, public: Path, *, device: str = "cuda") -> FastAPI:
    """Build the intake app for one workspace and one publish target."""

    app = FastAPI(title="Audio library intake", docs_url=None, redoc_url=None)
    # The Vite dev server proxies /intake, but a direct browser call from
    # localhost:5173 should work too. Loopback origins only.
    app.add_middleware(
        CORSMiddleware,
        allow_origin_regex=r"^http://(localhost|127\.0\.0\.1)(:\d+)?$",
        allow_methods=["*"],
        allow_headers=["*"],
    )

    registry = JobRegistry()
    registry.start(JobRunner(workspace, public))

    @app.get("/intake/health")
    def health() -> dict[str, Any]:
        missing = [
            path
            for path in (BEAT_CHECKPOINT_PATH, CHORD_CHECKPOINT_PATH)
            if not (workspace / path).is_file()
        ]
        return {
            "ok": not missing,
            "workspace": str(workspace),
            "public": str(public),
            "library_root": str(public / "library"),
            "device": device,
            "missing_checkpoints": missing,
            "stages": list(INTAKE_STAGE_KINDS),
        }

    @app.get("/intake/jobs")
    def list_jobs() -> dict[str, Any]:
        return {"jobs": [job.as_json() for job in registry.list()]}

    @app.get("/intake/jobs/{job_id}")
    def get_job(job_id: str) -> dict[str, Any]:
        job = registry.get(job_id)
        if job is None:
            raise HTTPException(status_code=404, detail="job desconhecido")
        return job.as_json()

    @app.post("/intake/tracks", status_code=202)
    async def create_track(
        file: UploadFile = File(...),
        title: str = Form(""),
        artist: str = Form(""),
        segment_count: int = Form(7),
    ) -> dict[str, Any]:
        payload = await file.read()
        try:
            job = prepare_job(
                workspace=workspace,
                filename=file.filename or "",
                payload=payload,
                title=title.strip(),
                artist=artist.strip(),
                segment_count=segment_count,
                device=device,
            )
        except (IntakeError, ValueError) as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        registry.add(job)
        return job.as_json()

    return app
