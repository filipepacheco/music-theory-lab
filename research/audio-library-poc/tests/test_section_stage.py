"""Tests for the section.librosa_segment stage bridge, contract, and labeling."""

from __future__ import annotations

import hashlib
from pathlib import Path

import pytest
from pydantic import ValidationError

from audio_library_poc.cache import hash_config, stage_cache_key
from audio_library_poc.execution import ExpectedStageFailure
from audio_library_poc.models import StageIdentity, StageSpecification
from audio_library_poc.section_analysis import (
    EffectiveSectionAnalyzerSettings,
    SectionAnalysisResult,
    SectionAnalyzerProvenance,
    SectionSegment,
    SectionSourceFacts,
    coverage_seconds,
)
from audio_library_poc.section_stage import (
    SECTION_LIBROSA_CANDIDATE_ID,
    SECTION_LIBROSA_IMPLEMENTATION_VERSION,
    SECTION_LIBROSA_STAGE_KIND,
    SectionLibrosaStageConfig,
    SectionLibrosaStageExecutor,
    build_section_metrics,
)


def _build_source(workspace: Path, *, contents: bytes = b"AUDIO") -> tuple[str, str]:
    originals = workspace / "originals"
    originals.mkdir(parents=True, exist_ok=True)
    file_path = originals / "track.wav"
    file_path.write_bytes(contents)
    return "originals/track.wav", hashlib.sha256(contents).hexdigest()


def _specification(
    *,
    source_relative_path: str = "originals/track.wav",
    extra_config: dict[str, object] | None = None,
) -> StageSpecification:
    config: dict[str, object] = {
        "source_relative_path": source_relative_path,
        "sample_rate": 22050,
        "hop_length": 2048,
        "n_segments": 7,
    }
    if extra_config is not None:
        config.update(extra_config)
    return StageSpecification(
        stage_kind=SECTION_LIBROSA_STAGE_KIND,
        implementation_version="1.0.0",
        config=config,
    )


def _identity(spec: StageSpecification, input_sha256: str) -> StageIdentity:
    return StageIdentity(
        stage_kind=spec.stage_kind,
        input_sha256=input_sha256,
        implementation_version=spec.implementation_version,
        config_sha256=hash_config(spec.config),
        output_schema_version=spec.output_schema_version,
        code_revision="test-revision",
    )


def _execute(
    executor: SectionLibrosaStageExecutor,
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


def test_stage_kind_and_identity_constants() -> None:
    assert SECTION_LIBROSA_STAGE_KIND == "section.librosa_segment"
    assert SECTION_LIBROSA_CANDIDATE_ID == "librosa_segment"
    assert SECTION_LIBROSA_IMPLEMENTATION_VERSION == "1.0.0"


def test_config_defaults() -> None:
    cfg = SectionLibrosaStageConfig(source_relative_path="originals/track.wav")
    assert cfg.sample_rate == 22050
    assert cfg.hop_length == 2048
    assert cfg.n_segments == 7


def test_config_rejects_absolute_path() -> None:
    with pytest.raises(ValidationError):
        SectionLibrosaStageConfig(source_relative_path="/absolute/track.wav")


def test_config_rejects_too_few_segments() -> None:
    with pytest.raises(ValidationError):
        SectionLibrosaStageConfig(
            source_relative_path="originals/track.wav", n_segments=1
        )


def test_config_rejects_too_many_segments() -> None:
    with pytest.raises(ValidationError):
        SectionLibrosaStageConfig(
            source_relative_path="originals/track.wav", n_segments=1000
        )


def test_section_segment_rejects_invalid_label() -> None:
    with pytest.raises(ValidationError):
        SectionSegment(start_seconds=0.0, end_seconds=1.0, label="chorus")


def test_section_segment_rejects_lowercase_label() -> None:
    with pytest.raises(ValidationError):
        SectionSegment(start_seconds=0.0, end_seconds=1.0, label="a")


def test_section_segment_accepts_letter_and_suffix() -> None:
    assert SectionSegment(start_seconds=0.0, end_seconds=1.0, label="A").label == "A"
    assert SectionSegment(start_seconds=0.0, end_seconds=1.0, label="C3").label == "C3"


def _make_source(duration: float = 120.0) -> SectionSourceFacts:
    return SectionSourceFacts(
        sample_rate=44100,
        channels=2,
        frame_count=int(duration * 44100),
        duration_seconds=duration,
        peak_absolute_sample=0.5,
    )


def _make_provenance() -> SectionAnalyzerProvenance:
    return SectionAnalyzerProvenance(
        candidate="librosa_segment",
        implementation_version="1.0.0",
        code_revision="test",
    )


def _make_settings() -> EffectiveSectionAnalyzerSettings:
    return EffectiveSectionAnalyzerSettings(
        sample_rate=22050,
        hop_length=2048,
        feature="chroma_cqt",
        n_segments=7,
    )


def test_result_boundary_monotonicity() -> None:
    result = SectionAnalysisResult(
        source_sha256="a" * 64,
        provenance=_make_provenance(),
        settings=_make_settings(),
        source=_make_source(duration=120.0),
        sections=(
            SectionSegment(start_seconds=0.0, end_seconds=30.0, label="A"),
            SectionSegment(start_seconds=30.0, end_seconds=90.0, label="B"),
            SectionSegment(start_seconds=90.0, end_seconds=120.0, label="A"),
        ),
    )
    assert len(result.sections) == 3
    # coverage-to-duration invariant
    assert coverage_seconds(result.sections) == pytest.approx(
        result.source.duration_seconds
    )


def test_result_rejects_overlap() -> None:
    with pytest.raises(ValidationError):
        SectionAnalysisResult(
            source_sha256="a" * 64,
            provenance=_make_provenance(),
            settings=_make_settings(),
            source=_make_source(duration=10.0),
            sections=(
                SectionSegment(start_seconds=0.0, end_seconds=6.0, label="A"),
                SectionSegment(start_seconds=5.0, end_seconds=10.0, label="B"),
            ),
        )


def test_result_rejects_gap() -> None:
    with pytest.raises(ValidationError):
        SectionAnalysisResult(
            source_sha256="a" * 64,
            provenance=_make_provenance(),
            settings=_make_settings(),
            source=_make_source(duration=10.0),
            sections=(
                SectionSegment(start_seconds=0.0, end_seconds=3.0, label="A"),
                SectionSegment(start_seconds=5.0, end_seconds=10.0, label="B"),
            ),
        )


def test_result_rejects_first_section_not_at_zero() -> None:
    with pytest.raises(ValidationError):
        SectionAnalysisResult(
            source_sha256="a" * 64,
            provenance=_make_provenance(),
            settings=_make_settings(),
            source=_make_source(duration=10.0),
            sections=(
                SectionSegment(start_seconds=2.0, end_seconds=10.0, label="A"),
            ),
        )


def test_result_rejects_last_section_before_duration() -> None:
    with pytest.raises(ValidationError):
        SectionAnalysisResult(
            source_sha256="a" * 64,
            provenance=_make_provenance(),
            settings=_make_settings(),
            source=_make_source(duration=10.0),
            sections=(
                SectionSegment(start_seconds=0.0, end_seconds=8.0, label="A"),
            ),
        )


def test_result_allows_single_section() -> None:
    result = SectionAnalysisResult(
        source_sha256="a" * 64,
        provenance=_make_provenance(),
        settings=_make_settings(),
        source=_make_source(duration=5.0),
        sections=(SectionSegment(start_seconds=0.0, end_seconds=5.0, label="A"),),
    )
    assert len(result.sections) == 1


def test_result_forbids_extra_fields() -> None:
    with pytest.raises(ValidationError):
        SectionAnalysisResult.model_validate(
            {
                "schema_version": "1.0.0",
                "source_sha256": "a" * 64,
                "provenance": _make_provenance().model_dump(),
                "settings": _make_settings().model_dump(),
                "source": _make_source(duration=5.0).model_dump(),
                "sections": [
                    {"start_seconds": 0.0, "end_seconds": 5.0, "label": "A"},
                ],
                "unexpected_field": "boom",
            }
        )


def test_invalid_config_yields_typed_failure(tmp_path: Path) -> None:
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    source_relative, source_sha256 = _build_source(workspace)
    executor = SectionLibrosaStageExecutor(workspace)
    specification = _specification(
        source_relative_path=source_relative,
        extra_config={"n_segments": 0},
    )

    with pytest.raises(ExpectedStageFailure) as captured:
        _execute(
            executor,
            specification=specification,
            input_sha256=source_sha256,
            tmp_path=tmp_path,
        )

    assert captured.value.error.code == "section.invalid_config"


def test_source_missing_yields_typed_failure(tmp_path: Path) -> None:
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    executor = SectionLibrosaStageExecutor(workspace)
    specification = _specification()

    with pytest.raises(ExpectedStageFailure) as captured:
        _execute(
            executor,
            specification=specification,
            input_sha256="a" * 64,
            tmp_path=tmp_path,
        )

    assert captured.value.error.code == "section.source_missing"


def test_source_hash_mismatch_yields_typed_failure(tmp_path: Path) -> None:
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    source_relative, _real_sha256 = _build_source(workspace, contents=b"REAL")
    executor = SectionLibrosaStageExecutor(workspace)
    specification = _specification(source_relative_path=source_relative)

    with pytest.raises(ExpectedStageFailure) as captured:
        _execute(
            executor,
            specification=specification,
            input_sha256="0" * 64,
            tmp_path=tmp_path,
        )

    assert captured.value.error.code == "section.source_hash_mismatch"


def test_build_metrics_shape() -> None:
    metrics = build_section_metrics(
        wall_seconds=1.25,
        section_count=7,
        unique_label_count=3,
    )
    assert metrics.duration_seconds == pytest.approx(1.25)
    assert metrics.counters == {"sections_emitted": 7, "unique_labels": 3}
    assert metrics.measurements == {}


def test_stage_kind_registered_in_dispatch() -> None:
    from audio_library_poc.stage_dispatch import known_stage_kinds

    assert SECTION_LIBROSA_STAGE_KIND in known_stage_kinds()
