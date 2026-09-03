"""Tests for the HPCP key-detection stage bridge + result contract."""

from __future__ import annotations

import hashlib
from pathlib import Path

import pytest
from pydantic import ValidationError

from audio_library_poc.cache import hash_config, stage_cache_key
from audio_library_poc.execution import ExpectedStageFailure
from audio_library_poc.hpcp_key_stage import (
    HPCP_KEY_CANDIDATE_ID,
    HPCP_KEY_IMPLEMENTATION_VERSION,
    HPCP_KEY_STAGE_KIND,
    HpcpKeyStageConfig,
    HpcpKeyStageExecutor,
    build_hpcp_key_metrics,
)
from audio_library_poc.key_analysis import (
    EffectiveKeyAnalyzerSettings,
    KeyAnalysisResult,
    KeyAnalyzerProvenance,
    KeyEstimate,
    KeySourceFacts,
    peak_margin,
)
from audio_library_poc.models import StageIdentity, StageSpecification, TonalMode


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
    }
    if extra_config is not None:
        config.update(extra_config)
    return StageSpecification(
        stage_kind=HPCP_KEY_STAGE_KIND,
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
        model_identifier=None,
        model_sha256=None,
        code_revision="test-revision",
    )


def _execute(
    executor: HpcpKeyStageExecutor,
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


def _twenty_four_estimates(peak_tonic: int, peak_mode: TonalMode) -> list[KeyEstimate]:
    """Build a full 24-estimate spread ordered best-first with the given peak."""

    estimates: list[KeyEstimate] = []
    for tonic in range(12):
        for mode in (TonalMode.MAJOR, TonalMode.MINOR):
            is_peak = tonic == peak_tonic and mode is peak_mode
            score = (
                0.9
                if is_peak
                else 0.5 - 0.01 * (tonic * 2 + (0 if mode is TonalMode.MAJOR else 1))
            )
            estimates.append(KeyEstimate(tonic_pc=tonic, mode=mode, score=score))
    estimates.sort(key=lambda estimate: estimate.score, reverse=True)
    return estimates


def _valid_result(*, source_sha256: str = "a" * 64) -> KeyAnalysisResult:
    provenance = KeyAnalyzerProvenance(
        candidate=HPCP_KEY_CANDIDATE_ID,
        implementation_version=HPCP_KEY_IMPLEMENTATION_VERSION,
        code_revision="test",
    )
    settings = EffectiveKeyAnalyzerSettings(
        sample_rate=22050,
        hop_length=2048,
        n_chroma=12,
        profile="krumhansl_kessler",
    )
    source = KeySourceFacts(
        sample_rate=44100,
        channels=2,
        frame_count=44100,
        duration_seconds=1.0,
        peak_absolute_sample=0.5,
    )
    estimates = _twenty_four_estimates(peak_tonic=2, peak_mode=TonalMode.MINOR)
    return KeyAnalysisResult(
        source_sha256=source_sha256,
        provenance=provenance,
        settings=settings,
        source=source,
        estimates=tuple(estimates),
        top_estimate=estimates[0],
    )


def test_stage_kind_and_identity_constants() -> None:
    assert HPCP_KEY_STAGE_KIND == "key.hpcp"
    assert HPCP_KEY_CANDIDATE_ID == "hpcp"
    assert HPCP_KEY_IMPLEMENTATION_VERSION == "1.0.0"


def test_config_rejects_absolute_path() -> None:
    with pytest.raises(ValidationError):
        HpcpKeyStageConfig(source_relative_path="/absolute/track.wav")


def test_config_defaults() -> None:
    cfg = HpcpKeyStageConfig(source_relative_path="originals/track.wav")
    assert cfg.sample_rate == 22050
    assert cfg.hop_length == 2048


def test_key_analysis_result_requires_all_24_candidates() -> None:
    provenance = KeyAnalyzerProvenance(
        candidate="hpcp",
        implementation_version="1.0.0",
        code_revision="test",
    )
    settings = EffectiveKeyAnalyzerSettings(
        sample_rate=22050,
        hop_length=2048,
        n_chroma=12,
        profile="krumhansl_kessler",
    )
    source = KeySourceFacts(
        sample_rate=44100,
        channels=2,
        frame_count=44100,
        duration_seconds=1.0,
        peak_absolute_sample=0.5,
    )
    # Only 23 estimates — min_length violation on the field itself.
    incomplete = _twenty_four_estimates(peak_tonic=0, peak_mode=TonalMode.MAJOR)[:23]
    with pytest.raises(ValidationError):
        KeyAnalysisResult(
            source_sha256="a" * 64,
            provenance=provenance,
            settings=settings,
            source=source,
            estimates=tuple(incomplete),
            top_estimate=incomplete[0],
        )


def test_key_analysis_result_rejects_duplicate_candidates() -> None:
    provenance = KeyAnalyzerProvenance(
        candidate="hpcp",
        implementation_version="1.0.0",
        code_revision="test",
    )
    settings = EffectiveKeyAnalyzerSettings(
        sample_rate=22050,
        hop_length=2048,
        n_chroma=12,
        profile="krumhansl_kessler",
    )
    source = KeySourceFacts(
        sample_rate=44100,
        channels=2,
        frame_count=44100,
        duration_seconds=1.0,
        peak_absolute_sample=0.5,
    )
    estimates = _twenty_four_estimates(peak_tonic=0, peak_mode=TonalMode.MAJOR)
    # Duplicate one entry — trigger the model validator's coverage check.
    dup = list(estimates)
    dup[-1] = KeyEstimate(
        tonic_pc=dup[0].tonic_pc,
        mode=dup[0].mode,
        score=dup[-1].score,
    )
    with pytest.raises(ValidationError):
        KeyAnalysisResult(
            source_sha256="a" * 64,
            provenance=provenance,
            settings=settings,
            source=source,
            estimates=tuple(dup),
            top_estimate=dup[0],
        )


def test_key_analysis_result_rejects_non_descending_scores() -> None:
    provenance = KeyAnalyzerProvenance(
        candidate="hpcp",
        implementation_version="1.0.0",
        code_revision="test",
    )
    settings = EffectiveKeyAnalyzerSettings(
        sample_rate=22050,
        hop_length=2048,
        n_chroma=12,
        profile="krumhansl_kessler",
    )
    source = KeySourceFacts(
        sample_rate=44100,
        channels=2,
        frame_count=44100,
        duration_seconds=1.0,
        peak_absolute_sample=0.5,
    )
    estimates = _twenty_four_estimates(peak_tonic=0, peak_mode=TonalMode.MAJOR)
    scrambled = list(estimates)
    scrambled[0], scrambled[5] = scrambled[5], scrambled[0]
    with pytest.raises(ValidationError):
        KeyAnalysisResult(
            source_sha256="a" * 64,
            provenance=provenance,
            settings=settings,
            source=source,
            estimates=tuple(scrambled),
            top_estimate=scrambled[0],
        )


def test_key_analysis_result_rejects_top_estimate_mismatch() -> None:
    provenance = KeyAnalyzerProvenance(
        candidate="hpcp",
        implementation_version="1.0.0",
        code_revision="test",
    )
    settings = EffectiveKeyAnalyzerSettings(
        sample_rate=22050,
        hop_length=2048,
        n_chroma=12,
        profile="krumhansl_kessler",
    )
    source = KeySourceFacts(
        sample_rate=44100,
        channels=2,
        frame_count=44100,
        duration_seconds=1.0,
        peak_absolute_sample=0.5,
    )
    estimates = _twenty_four_estimates(peak_tonic=0, peak_mode=TonalMode.MAJOR)
    wrong_top = estimates[5]  # not the highest-scored one
    with pytest.raises(ValidationError):
        KeyAnalysisResult(
            source_sha256="a" * 64,
            provenance=provenance,
            settings=settings,
            source=source,
            estimates=tuple(estimates),
            top_estimate=wrong_top,
        )


def test_peak_margin_of_valid_result_is_non_negative() -> None:
    result = _valid_result()
    assert peak_margin(result) >= 0


def test_invalid_config_yields_typed_failure(tmp_path: Path) -> None:
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    source_relative, source_sha256 = _build_source(workspace)
    executor = HpcpKeyStageExecutor(workspace)
    specification = _specification(
        source_relative_path=source_relative,
        extra_config={"sample_rate": 100},  # below min
    )

    with pytest.raises(ExpectedStageFailure) as captured:
        _execute(
            executor,
            specification=specification,
            input_sha256=source_sha256,
            tmp_path=tmp_path,
        )
    assert captured.value.error.code == "key.invalid_config"


def test_source_missing_yields_typed_failure(tmp_path: Path) -> None:
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    executor = HpcpKeyStageExecutor(workspace)
    specification = _specification()

    with pytest.raises(ExpectedStageFailure) as captured:
        _execute(
            executor,
            specification=specification,
            input_sha256="a" * 64,
            tmp_path=tmp_path,
        )
    assert captured.value.error.code == "key.source_missing"


def test_source_hash_mismatch_yields_typed_failure(tmp_path: Path) -> None:
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    source_relative, _real_sha256 = _build_source(workspace, contents=b"REAL")
    executor = HpcpKeyStageExecutor(workspace)
    specification = _specification(source_relative_path=source_relative)

    with pytest.raises(ExpectedStageFailure) as captured:
        _execute(
            executor,
            specification=specification,
            input_sha256="0" * 64,
            tmp_path=tmp_path,
        )
    assert captured.value.error.code == "key.source_hash_mismatch"


def test_build_metrics_shape() -> None:
    metrics = build_hpcp_key_metrics(
        wall_seconds=1.5,
        top_score=0.95,
        second_score=0.72,
    )
    assert metrics.duration_seconds == pytest.approx(1.5)
    assert metrics.measurements["top_score"] == pytest.approx(0.95)
    assert metrics.measurements["peak_margin"] == pytest.approx(0.23)


def test_build_metrics_clamps_negative_margin_to_zero() -> None:
    metrics = build_hpcp_key_metrics(
        wall_seconds=1.0,
        top_score=0.4,
        second_score=0.5,
    )
    assert metrics.measurements["peak_margin"] == pytest.approx(0.0)
