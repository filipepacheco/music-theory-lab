"""Tests for the Beat This! stage bridge and its typed-failure surface."""

from __future__ import annotations

import hashlib
from pathlib import Path

import pytest
from pydantic import ValidationError

from audio_library_poc.beat_analysis import (
    BeatAnalysisResult,
    BeatAnalyzerProvenance,
    BeatEstimate,
    BeatSourceFacts,
    EffectiveBeatAnalyzerSettings,
)
from audio_library_poc.beat_this_stage import (
    BEAT_THIS_CANDIDATE_ID,
    BEAT_THIS_IMPLEMENTATION_VERSION,
    BEAT_THIS_STAGE_KIND,
    BeatThisStageConfig,
    BeatThisStageExecutor,
    build_beat_this_metrics,
)
from audio_library_poc.cache import hash_config, stage_cache_key
from audio_library_poc.execution import ExpectedStageFailure
from audio_library_poc.models import StageIdentity, StageSpecification
from audio_library_poc.separation import SeparatorPrecision

MODEL_IDENTIFIER = "pinned/beat_this:final0"
MODEL_SHA256 = "b" * 64


def _build_source(workspace: Path, *, contents: bytes = b"AUDIO") -> tuple[str, str]:
    originals = workspace / "originals"
    originals.mkdir(parents=True, exist_ok=True)
    file_path = originals / "track.wav"
    file_path.write_bytes(contents)
    return "originals/track.wav", hashlib.sha256(contents).hexdigest()


def _specification(
    *,
    source_relative_path: str = "originals/track.wav",
    checkpoint_relative_path: str = "models/beat_this-final0.ckpt",
    model_identifier: str | None = MODEL_IDENTIFIER,
    model_sha256: str | None = MODEL_SHA256,
    extra_config: dict[str, object] | None = None,
) -> StageSpecification:
    config: dict[str, object] = {
        "source_relative_path": source_relative_path,
        "checkpoint_relative_path": checkpoint_relative_path,
        "device": "cuda",
        "precision": "float16",
        "use_dbn": False,
    }
    if extra_config is not None:
        config.update(extra_config)
    return StageSpecification(
        stage_kind=BEAT_THIS_STAGE_KIND,
        implementation_version="1.0.0",
        config=config,
        model_identifier=model_identifier,
        model_sha256=model_sha256,
    )


def _identity(spec: StageSpecification, input_sha256: str) -> StageIdentity:
    return StageIdentity(
        stage_kind=spec.stage_kind,
        input_sha256=input_sha256,
        implementation_version=spec.implementation_version,
        config_sha256=hash_config(spec.config),
        output_schema_version=spec.output_schema_version,
        model_identifier=spec.model_identifier,
        model_sha256=spec.model_sha256,
        code_revision="test-revision",
    )


def _execute(
    executor: BeatThisStageExecutor,
    *,
    specification: StageSpecification,
    input_sha256: str,
    tmp_path: Path,
):
    identity = _identity(specification, input_sha256)
    return executor.execute(
        specification=specification,
        identity=identity,
        cache_key=stage_cache_key(identity),
        attempt=1,
        staging_directory=tmp_path / "staging",
    )


def test_config_rejects_absolute_paths() -> None:
    with pytest.raises(ValidationError):
        BeatThisStageConfig(
            source_relative_path="/absolute/track.wav",
            checkpoint_relative_path="models/x.ckpt",
        )


def test_config_defaults() -> None:
    cfg = BeatThisStageConfig(
        source_relative_path="originals/track.wav",
        checkpoint_relative_path="models/beat_this-final0.ckpt",
    )
    assert cfg.device == "cuda"
    assert cfg.precision is SeparatorPrecision.FLOAT16
    assert cfg.use_dbn is False


def test_stage_kind_and_identity_constants() -> None:
    assert BEAT_THIS_STAGE_KIND == "beat.beat_this"
    assert BEAT_THIS_CANDIDATE_ID == "beat_this"
    assert BEAT_THIS_IMPLEMENTATION_VERSION == "1.0.0"


def test_invalid_config_yields_typed_failure(tmp_path: Path) -> None:
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    source_relative, source_sha256 = _build_source(workspace)
    executor = BeatThisStageExecutor(workspace)
    specification = _specification(
        source_relative_path=source_relative,
        extra_config={"device": ""},
    )

    with pytest.raises(ExpectedStageFailure) as captured:
        _execute(
            executor,
            specification=specification,
            input_sha256=source_sha256,
            tmp_path=tmp_path,
        )

    assert captured.value.error.code == "beat.invalid_config"


def test_missing_model_identity_yields_typed_failure(tmp_path: Path) -> None:
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    source_relative, source_sha256 = _build_source(workspace)
    executor = BeatThisStageExecutor(workspace)
    specification = _specification(
        source_relative_path=source_relative,
        model_identifier=None,
        model_sha256=None,
    )

    with pytest.raises(ExpectedStageFailure) as captured:
        _execute(
            executor,
            specification=specification,
            input_sha256=source_sha256,
            tmp_path=tmp_path,
        )

    assert captured.value.error.code == "beat.missing_model_identity"


def test_source_missing_yields_typed_failure(tmp_path: Path) -> None:
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    executor = BeatThisStageExecutor(workspace)
    specification = _specification()

    with pytest.raises(ExpectedStageFailure) as captured:
        _execute(
            executor,
            specification=specification,
            input_sha256="a" * 64,
            tmp_path=tmp_path,
        )

    assert captured.value.error.code == "beat.source_missing"


def test_source_hash_mismatch_yields_typed_failure(tmp_path: Path) -> None:
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    source_relative, real_sha256 = _build_source(workspace, contents=b"REAL AUDIO")
    executor = BeatThisStageExecutor(workspace)
    specification = _specification(source_relative_path=source_relative)

    with pytest.raises(ExpectedStageFailure) as captured:
        _execute(
            executor,
            specification=specification,
            input_sha256="0" * 64,
            tmp_path=tmp_path,
        )

    assert captured.value.error.code == "beat.source_hash_mismatch"


def test_checkpoint_missing_yields_typed_failure(tmp_path: Path) -> None:
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    source_relative, source_sha256 = _build_source(workspace)
    executor = BeatThisStageExecutor(workspace)
    specification = _specification(source_relative_path=source_relative)

    with pytest.raises(ExpectedStageFailure) as captured:
        _execute(
            executor,
            specification=specification,
            input_sha256=source_sha256,
            tmp_path=tmp_path,
        )

    assert captured.value.error.code == "beat.checkpoint_missing"
    assert captured.value.error.details["relative_path"] == (
        "models/beat_this-final0.ckpt"
    )


def test_beat_analysis_result_rejects_non_monotonic_beats() -> None:
    provenance = BeatAnalyzerProvenance(
        candidate="beat_this",
        implementation_version="1.0.0",
        model_identifier="pinned/x",
        model_sha256="b" * 64,
        code_revision="test",
    )
    settings = EffectiveBeatAnalyzerSettings(
        device="cuda",
        precision=SeparatorPrecision.FLOAT16,
        use_dbn=False,
    )
    source = BeatSourceFacts(
        sample_rate=44100,
        channels=2,
        frame_count=44100,
        duration_seconds=1.0,
        peak_absolute_sample=0.5,
    )
    with pytest.raises(ValidationError):
        BeatAnalysisResult(
            source_sha256="a" * 64,
            provenance=provenance,
            settings=settings,
            source=source,
            beats=(
                BeatEstimate(time_seconds=0.5, is_downbeat=True),
                BeatEstimate(time_seconds=0.3, is_downbeat=False),
            ),
            downbeat_count=1,
            tempo_median_bpm=120.0,
        )


def test_beat_analysis_result_rejects_wrong_downbeat_count() -> None:
    provenance = BeatAnalyzerProvenance(
        candidate="beat_this",
        implementation_version="1.0.0",
        model_identifier="pinned/x",
        model_sha256="b" * 64,
        code_revision="test",
    )
    settings = EffectiveBeatAnalyzerSettings(
        device="cuda",
        precision=SeparatorPrecision.FLOAT16,
        use_dbn=False,
    )
    source = BeatSourceFacts(
        sample_rate=44100,
        channels=2,
        frame_count=44100,
        duration_seconds=1.0,
        peak_absolute_sample=0.5,
    )
    with pytest.raises(ValidationError):
        BeatAnalysisResult(
            source_sha256="a" * 64,
            provenance=provenance,
            settings=settings,
            source=source,
            beats=(
                BeatEstimate(time_seconds=0.3, is_downbeat=True),
                BeatEstimate(time_seconds=0.6, is_downbeat=False),
            ),
            downbeat_count=99,  # wrong
            tempo_median_bpm=120.0,
        )


def test_beat_analysis_result_rejects_beats_after_duration() -> None:
    provenance = BeatAnalyzerProvenance(
        candidate="beat_this",
        implementation_version="1.0.0",
        model_identifier="pinned/x",
        model_sha256="b" * 64,
        code_revision="test",
    )
    settings = EffectiveBeatAnalyzerSettings(
        device="cuda",
        precision=SeparatorPrecision.FLOAT16,
        use_dbn=False,
    )
    source = BeatSourceFacts(
        sample_rate=44100,
        channels=2,
        frame_count=44100,
        duration_seconds=1.0,
        peak_absolute_sample=0.5,
    )
    with pytest.raises(ValidationError):
        BeatAnalysisResult(
            source_sha256="a" * 64,
            provenance=provenance,
            settings=settings,
            source=source,
            beats=(
                BeatEstimate(time_seconds=0.5, is_downbeat=True),
                BeatEstimate(time_seconds=1.5, is_downbeat=False),
            ),
            downbeat_count=1,
            tempo_median_bpm=60.0,
        )


def test_build_beat_this_metrics_shape() -> None:
    metrics = build_beat_this_metrics(
        wall_seconds=1.23,
        beat_count=520,
        downbeat_count=130,
        tempo_bpm=120.5,
    )
    assert metrics.duration_seconds == pytest.approx(1.23)
    assert metrics.counters == {"beats_detected": 520, "downbeats_detected": 130}
    assert metrics.measurements == {"tempo_median_bpm": pytest.approx(120.5)}
