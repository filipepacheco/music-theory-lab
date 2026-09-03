"""Tests for scripts/bakeoff_report.py."""

from __future__ import annotations

import importlib.util
import json
import sys
from datetime import UTC, datetime
from pathlib import Path

import pytest

PACKAGE_ROOT = Path(__file__).parents[1]
SCRIPT_PATH = PACKAGE_ROOT / "scripts" / "bakeoff_report.py"


def _load_bakeoff_module():
    spec = importlib.util.spec_from_file_location("bakeoff_report", SCRIPT_PATH)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    # dataclasses look up cls.__module__ via sys.modules — the ad-hoc loader
    # needs the module registered before exec so @dataclass can find it.
    sys.modules["bakeoff_report"] = module
    spec.loader.exec_module(module)
    return module


bakeoff = _load_bakeoff_module()


CACHE_KEY_A = "a" * 64
CACHE_KEY_B = "b" * 64
CACHE_KEY_C = "c" * 64
CACHE_KEY_D = "d" * 64
SHA_TRACK_A = "aa" * 32
SHA_TRACK_B = "bb" * 32
MODEL_SHA = "e" * 64


def _envelope(
    *,
    cache_key: str,
    stage_kind: str,
    wall_seconds: float,
    model_identifier: str,
) -> dict:
    return {
        "schema_version": "2.0.0",
        "cache_key": cache_key,
        "status": "succeeded",
        "attempt": 1,
        "identity": {
            "stage_kind": stage_kind,
            "input_sha256": "1" * 64,
            "implementation_version": "1.0.0",
            "config_sha256": "2" * 64,
            "output_schema_version": "1.0.0",
            "model_identifier": model_identifier,
            "model_sha256": MODEL_SHA,
            "code_revision": "test",
        },
        "artifacts": [
            {
                "artifact_kind": f"separator.stem.{stem}",
                "path": f"runs/x/{stage_kind}/artifacts/{cache_key}/{stem}.wav",
                "sha256": "3" * 64,
                "size_bytes": 45_856_556 + i,
                "media_type": "audio/wav",
                "durable": True,
            }
            for i, stem in enumerate(("vocals", "drums", "bass", "guitar", "other"))
        ],
        "metrics": {
            "duration_seconds": wall_seconds,
            "counters": {"attempts": 1},
            "measurements": {},
            "warnings": [],
        },
        "error": None,
    }


def _separation_result(
    *,
    candidate: str,
    source_sha256: str,
    duration_seconds: float,
    relative_rms: float,
    chunk_frames: int,
    source_peak: float,
) -> dict:
    stems = []
    for stem in ("vocals", "drums", "bass", "guitar", "other"):
        stems.append(
            {
                "stem_kind": stem,
                "signal": {
                    "sample_rate": 44100,
                    "channels": 2,
                    "frame_count": int(duration_seconds * 44100),
                    "duration_seconds": duration_seconds,
                    "peak_absolute_sample": 0.5 if stem == "vocals" else 0.7,
                },
            }
        )
    return {
        "schema_version": "1.0.0",
        "source_sha256": source_sha256,
        "provenance": {
            "candidate": candidate,
            "implementation_version": "1.0.0",
            "model_identifier": "pinned",
            "model_sha256": MODEL_SHA,
            "code_revision": "test",
        },
        "settings": {
            "segment": None,
            "overlap": 0.25,
            "shifts": 1,
            "device": "cuda",
            "precision": "float16",
            "retain_native": False,
        },
        "stems": [
            {
                "stem_kind": stem,
                "artifact_filename": f"{stem}.wav",
                "candidate_native_sources": [stem]
                if stem != "other"
                else ["other", "piano"],
            }
            for stem in ("vocals", "drums", "bass", "guitar", "other")
        ],
        "validation": {
            "schema_version": "1.0.0",
            "passed": True,
            "chunk_frames": chunk_frames,
            "tolerances": {
                "frame_count": 0,
                "duration_seconds": 0.0,
                "reconstruction_relative_rms": 1e-06,
                "relative_rms_floor": 1e-12,
            },
            "source": {
                "sample_rate": 44100,
                "channels": 2,
                "frame_count": int(duration_seconds * 44100),
                "duration_seconds": duration_seconds,
                "peak_absolute_sample": source_peak,
            },
            "stems": stems,
            "reconstruction": {
                "method": "relative_rms",
                "source_rms": 0.19,
                "error_rms": relative_rms * 0.19,
                "relative_rms": relative_rms,
                "compared_frame_count": int(duration_seconds * 44100),
                "compared_sample_count": int(duration_seconds * 44100) * 2,
            },
            "warnings": [],
        },
        "retained_native_artifact_filenames": [],
    }


def _write_run(
    workspace: Path,
    *,
    run_id: str,
    stage_kind: str,
    cache_key: str,
    wall_seconds: float,
    candidate: str,
    source_sha256: str,
    duration_seconds: float,
    relative_rms: float,
    chunk_frames: int,
    source_peak: float,
) -> None:
    stage_dir = workspace / "runs" / run_id / "stages" / stage_kind
    (stage_dir / "results").mkdir(parents=True)
    (stage_dir / "attempts" / cache_key).mkdir(parents=True)
    artifact_dir = stage_dir / "artifacts" / cache_key
    artifact_dir.mkdir(parents=True)
    (stage_dir / "results" / f"{cache_key}.json").write_text(
        json.dumps(
            _envelope(
                cache_key=cache_key,
                stage_kind=stage_kind,
                wall_seconds=wall_seconds,
                model_identifier=candidate,
            )
        ),
        encoding="utf-8",
    )
    (artifact_dir / "separation-result.json").write_text(
        json.dumps(
            _separation_result(
                candidate=candidate,
                source_sha256=source_sha256,
                duration_seconds=duration_seconds,
                relative_rms=relative_rms,
                chunk_frames=chunk_frames,
                source_peak=source_peak,
            )
        ),
        encoding="utf-8",
    )


@pytest.fixture
def fixture_workspace(tmp_path: Path) -> Path:
    workspace = tmp_path / "workspace"
    _write_run(
        workspace,
        run_id="track-a-bs-roformer",
        stage_kind="separator.bs_roformer",
        cache_key=CACHE_KEY_A,
        wall_seconds=60.0,
        candidate="bs_roformer",
        source_sha256=SHA_TRACK_A,
        duration_seconds=260.0,
        relative_rms=0.025,
        chunk_frames=588800,
        source_peak=1.05,
    )
    _write_run(
        workspace,
        run_id="track-a-demucs",
        stage_kind="separator.demucs_htdemucs_6s",
        cache_key=CACHE_KEY_B,
        wall_seconds=8.0,
        candidate="demucs_htdemucs_6s",
        source_sha256=SHA_TRACK_A,
        duration_seconds=260.0,
        relative_rms=0.120,
        chunk_frames=343980,
        source_peak=1.05,
    )
    _write_run(
        workspace,
        run_id="track-b-bs-roformer",
        stage_kind="separator.bs_roformer",
        cache_key=CACHE_KEY_C,
        wall_seconds=55.0,
        candidate="bs_roformer",
        source_sha256=SHA_TRACK_B,
        duration_seconds=334.0,
        relative_rms=0.020,
        chunk_frames=588800,
        source_peak=0.98,
    )
    _write_run(
        workspace,
        run_id="track-b-demucs",
        stage_kind="separator.demucs_htdemucs_6s",
        cache_key=CACHE_KEY_D,
        wall_seconds=10.0,
        candidate="demucs_htdemucs_6s",
        source_sha256=SHA_TRACK_B,
        duration_seconds=334.0,
        relative_rms=0.090,
        chunk_frames=343980,
        source_peak=0.98,
    )
    return workspace


def test_collect_runs_returns_only_succeeded_separator_stages(
    fixture_workspace: Path,
) -> None:
    runs = bakeoff.collect_runs(fixture_workspace)
    assert len(runs) == 4
    candidates = {run.candidate_id for run in runs}
    assert candidates == {"bs_roformer", "demucs_htdemucs_6s"}


def test_collect_runs_skips_failed_and_non_separator_stages(
    tmp_path: Path,
) -> None:
    workspace = tmp_path / "workspace"
    (workspace / "runs" / "empty-run" / "stages").mkdir(parents=True)
    fake_stage = (
        workspace / "runs" / "fake-run" / "stages" / "fake.deterministic" / "results"
    )
    fake_stage.mkdir(parents=True)
    (fake_stage / "cache.json").write_text(
        json.dumps({"status": "succeeded", "cache_key": "z" * 64}),
        encoding="utf-8",
    )
    failed_stage = (
        workspace
        / "runs"
        / "failed-run"
        / "stages"
        / "separator.bs_roformer"
        / "results"
    )
    failed_stage.mkdir(parents=True)
    (failed_stage / (CACHE_KEY_A + ".json")).write_text(
        json.dumps(
            {
                "status": "failed_terminal",
                "cache_key": CACHE_KEY_A,
                "identity": {"stage_kind": "separator.bs_roformer"},
                "artifacts": [],
            }
        ),
        encoding="utf-8",
    )
    assert bakeoff.collect_runs(workspace) == []


def test_render_report_includes_headings_and_metrics(
    fixture_workspace: Path,
) -> None:
    runs = bakeoff.collect_runs(fixture_workspace)
    report = bakeoff.render_report(
        runs,
        generated_at=datetime(2026, 9, 3, 12, 34, 56, tzinfo=UTC),
    )

    assert "# Bakeoff report" in report
    assert "Generated: 2026-09-03T12:34:56+00:00" in report
    assert "Runs: 4" in report
    assert "Candidates: bs_roformer, demucs_htdemucs_6s" in report

    # Per-track headings identify each source_sha256's leading 12 hex chars.
    assert f"`{SHA_TRACK_A[:12]}…`" in report
    assert f"`{SHA_TRACK_B[:12]}…`" in report

    # Aggregate table exists and reports both candidates.
    assert "## Aggregate" in report
    # Averaged wall seconds: bs_roformer = (60 + 55)/2 = 57.50; demucs = 9.00.
    assert "57.50" in report
    assert "9.00" in report
    # Averaged reconstruction rel RMS: bs_roformer = 0.0225; demucs = 0.1050.
    assert "0.0225" in report
    assert "0.1050" in report


def test_render_report_handles_empty_input() -> None:
    report = bakeoff.render_report([])
    assert report.startswith("# Bakeoff report")
    assert "No succeeded separator runs" in report


def test_main_writes_to_out_file(tmp_path: Path, fixture_workspace: Path) -> None:
    out_path = tmp_path / "report.md"
    exit_code = bakeoff.main(
        ["--workspace", str(fixture_workspace), "--out", str(out_path)]
    )
    assert exit_code == 0
    contents = out_path.read_text(encoding="utf-8")
    assert "# Bakeoff report" in contents
    assert "Runs: 4" in contents


def test_main_prints_to_stdout(capsys, fixture_workspace: Path) -> None:
    exit_code = bakeoff.main(["--workspace", str(fixture_workspace)])
    captured = capsys.readouterr()
    assert exit_code == 0
    assert captured.err == ""
    assert "# Bakeoff report" in captured.out
    assert "Aggregate" in captured.out


def teardown_module(_module) -> None:
    # Drop the ad-hoc import so pytest teardown is idempotent.
    sys.modules.pop("bakeoff_report", None)
