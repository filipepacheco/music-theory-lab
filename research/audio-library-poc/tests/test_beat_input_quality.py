from __future__ import annotations

import numpy as np
import pytest
import soundfile as sf
from pydantic import ValidationError

from audio_library_poc.beat_analysis import (
    BeatAnalysisResult,
    BeatAnalyzerProvenance,
    BeatEstimate,
    BeatSourceFacts,
    EffectiveBeatAnalyzerSettings,
)
from audio_library_poc.beat_input_quality import (
    BeatInputQualityMeasurements,
    BeatInputQualityPolicyConfig,
    CalibrationEvidence,
    decide_beat_input_quality,
    measure_beat_input_quality,
)
from audio_library_poc.beat_quality_stage import (
    BEAT_INPUT_QUALITY_STAGE_KIND,
    BeatInputQualityStageExecutor,
)
from audio_library_poc.cache import hash_config, stage_cache_key
from audio_library_poc.metadata import hash_file
from audio_library_poc.models import StageIdentity, StageSpecification
from audio_library_poc.separation import SeparatorPrecision


def _beat_result(
    *,
    count: int = 32,
    downbeats: bool = True,
    tempo_bpm: float = 120.0,
    warnings: tuple[str, ...] = (),
    source_sha256: str = "a" * 64,
) -> BeatAnalysisResult:
    beats = tuple(
        BeatEstimate(
            time_seconds=1.0 + index * 0.5, is_downbeat=downbeats and index % 4 == 0
        )
        for index in range(count)
    )
    return BeatAnalysisResult(
        source_sha256=source_sha256,
        provenance=BeatAnalyzerProvenance(
            candidate="beat_this",
            implementation_version="1.0.0",
            model_identifier="beat_this-final0.ckpt",
            model_sha256="b" * 64,
            code_revision="test-revision",
        ),
        settings=EffectiveBeatAnalyzerSettings(
            device="cpu", precision=SeparatorPrecision.FLOAT32, use_dbn=False
        ),
        source=BeatSourceFacts(
            sample_rate=100,
            channels=1,
            frame_count=2000,
            duration_seconds=20.0,
            peak_absolute_sample=0.5,
        ),
        beats=beats,
        downbeat_count=sum(beat.is_downbeat for beat in beats),
        tempo_median_bpm=tempo_bpm,
        warnings=warnings,
    )


def _measurements(**overrides: float | int) -> BeatInputQualityMeasurements:
    values: dict[str, float | int] = {
        "beat_count": 32,
        "downbeat_count": 8,
        "median_inter_beat_seconds": 0.5,
        "inter_beat_mad_seconds": 0.0,
        "inter_beat_p05_seconds": 0.5,
        "inter_beat_p95_seconds": 0.5,
        "max_to_median_inter_beat_ratio": 1.0,
        "active_duration_seconds": 16.0,
        "beat_supported_active_seconds": 16.0,
        "active_coverage_ratio": 1.0,
        "longest_unsupported_active_run_seconds": 0.0,
        "longest_unsupported_active_run_beats": 0.0,
        "first_beat_seconds": 1.0,
        "last_beat_seconds": 16.5,
        "detected_span_ratio": 0.775,
    }
    values.update(overrides)
    return BeatInputQualityMeasurements(**values)


def _calibration(
    policy: BeatInputQualityPolicyConfig | None = None,
    **overrides: object,
) -> CalibrationEvidence:
    policy = policy or BeatInputQualityPolicyConfig.production_v1()
    values: dict[str, object] = {
        "calibration_id": "held-out-library-v1",
        "config_sha256": policy.sha256(),
        "held_out": True,
        "confidence_level": 0.95,
        "invalid_accepted_upper_bound": 0.05,
        "valid_retained_lower_bound": 0.85,
    }
    values.update(overrides)
    return CalibrationEvidence(**values)


def test_valid_supported_grid_is_eligible_only_with_passing_calibration() -> None:
    decision = decide_beat_input_quality(
        result=_beat_result(),
        result_sha256="c" * 64,
        measurements=_measurements(),
        policy_config=BeatInputQualityPolicyConfig.production_v1(),
        calibration=_calibration(),
    )

    assert decision.beat_input_valid is True
    assert decision.publication_allowed is True
    assert decision.fatal_reason_codes == ()
    assert decision.policy.calibration_id == "held-out-library-v1"
    assert decision.beat_result_identity.result_sha256 == "c" * 64


@pytest.mark.parametrize(
    ("result", "measurement_overrides", "decision_overrides", "reason"),
    [
        (
            _beat_result(count=0),
            {
                "beat_count": 0,
                "downbeat_count": 0,
                "median_inter_beat_seconds": 0,
                "first_beat_seconds": 0,
                "last_beat_seconds": 0,
                "detected_span_ratio": 0,
            },
            {},
            "beat.no_beats_detected",
        ),
        (
            _beat_result(),
            {},
            {"expected_source_sha256": "d" * 64},
            "beat.contract_invalid",
        ),
        (
            _beat_result(),
            {},
            {"analyzer_fatal_codes": ("beat.decode_failed",)},
            "beat.analyzer_failed",
        ),
        (
            _beat_result(count=15),
            {"beat_count": 15, "downbeat_count": 4},
            {},
            "beat.insufficient_grid",
        ),
        (
            _beat_result(),
            {"beat_supported_active_seconds": 11.999},
            {},
            "beat.insufficient_supported_duration",
        ),
        (
            _beat_result(),
            {"active_coverage_ratio": 0.7999},
            {},
            "beat.insufficient_active_coverage",
        ),
        (
            _beat_result(),
            {
                "longest_unsupported_active_run_seconds": 8.001,
                "longest_unsupported_active_run_beats": 8.001,
            },
            {},
            "beat.long_active_gap",
        ),
    ],
)
def test_each_fatal_category_fails_closed(
    result: BeatAnalysisResult,
    measurement_overrides: dict[str, float | int],
    decision_overrides: dict[str, object],
    reason: str,
) -> None:
    decision = decide_beat_input_quality(
        result=result,
        result_sha256="c" * 64,
        measurements=_measurements(**measurement_overrides),
        policy_config=BeatInputQualityPolicyConfig.production_v1(),
        calibration=_calibration(),
        **decision_overrides,
    )

    assert reason in decision.fatal_reason_codes
    assert decision.beat_input_valid is False
    assert decision.publication_allowed is False


def test_exact_provisional_thresholds_are_inclusive() -> None:
    result = _beat_result(count=16)
    decision = decide_beat_input_quality(
        result=result,
        result_sha256="c" * 64,
        measurements=_measurements(
            beat_count=16,
            downbeat_count=4,
            beat_supported_active_seconds=12.0,
            active_coverage_ratio=0.8,
            longest_unsupported_active_run_seconds=8.0,
            longest_unsupported_active_run_beats=8.0,
        ),
        policy_config=BeatInputQualityPolicyConfig.production_v1(),
        calibration=_calibration(),
    )

    assert decision.fatal_reason_codes == ()
    assert decision.publication_allowed is True


@pytest.mark.parametrize(("seconds", "beats"), [(8.001, 8.0), (8.0, 8.001)])
def test_long_gap_is_nonfatal_unless_both_limits_are_exceeded(
    seconds: float, beats: float
) -> None:
    decision = decide_beat_input_quality(
        result=_beat_result(),
        result_sha256="c" * 64,
        measurements=_measurements(
            longest_unsupported_active_run_seconds=seconds,
            longest_unsupported_active_run_beats=beats,
        ),
        policy_config=BeatInputQualityPolicyConfig.production_v1(),
        calibration=_calibration(),
    )

    assert "beat.long_active_gap" not in decision.fatal_reason_codes


def test_unusual_but_usable_music_and_unknown_warnings_stay_nonfatal() -> None:
    result = _beat_result(
        downbeats=False,
        tempo_bpm=300.0,
        warnings=("future analyzer warning",),
    )
    decision = decide_beat_input_quality(
        result=result,
        result_sha256="c" * 64,
        measurements=_measurements(
            downbeat_count=0,
            max_to_median_inter_beat_ratio=3.0,
            first_beat_seconds=2.0,
            last_beat_seconds=18.0,
        ),
        policy_config=BeatInputQualityPolicyConfig.production_v1(),
        calibration=_calibration(),
    )

    assert decision.beat_input_valid is True
    assert set(decision.diagnostic_codes) >= {
        "beat.missing_downbeats",
        "beat.unusual_tempo",
        "beat.irregular_timing",
        "beat.leading_silence",
        "beat.trailing_silence",
        "beat.analyzer_warning:future analyzer warning",
    }


@pytest.mark.parametrize(
    "calibration",
    [
        None,
        _calibration(held_out=False),
        _calibration(invalid_accepted_upper_bound=0.0501),
        _calibration(valid_retained_lower_bound=0.8499),
        _calibration(),
    ],
)
def test_uncalibrated_policy_never_allows_publication(
    calibration: CalibrationEvidence | None,
) -> None:
    decision = decide_beat_input_quality(
        result=_beat_result(),
        result_sha256="c" * 64,
        measurements=_measurements(),
        policy_config=BeatInputQualityPolicyConfig.provisional_v1(),
        calibration=calibration,
    )

    assert decision.beat_input_valid is True
    assert decision.publication_allowed is False
    assert decision.policy.calibration_id is None
    assert "beat.gate_uncalibrated" in decision.diagnostic_codes


def test_calibration_for_another_configuration_cannot_activate_the_gate() -> None:
    policy = BeatInputQualityPolicyConfig.production_v1()
    decision = decide_beat_input_quality(
        result=_beat_result(),
        result_sha256="c" * 64,
        measurements=_measurements(),
        policy_config=policy,
        calibration=_calibration(config_sha256="d" * 64),
    )

    assert decision.publication_allowed is False
    assert decision.policy.calibration_id is None


def test_threshold_change_requires_a_new_major_gate_version_and_digest() -> None:
    baseline = BeatInputQualityPolicyConfig.production_v1()
    with pytest.raises(ValidationError, match="major gate version"):
        BeatInputQualityPolicyConfig(
            gate_version="1.1.0", minimum_active_coverage_ratio=0.75
        )

    changed = BeatInputQualityPolicyConfig(
        gate_version="2.0.0", minimum_active_coverage_ratio=0.75
    )
    assert changed.sha256() != baseline.sha256()


def test_waveform_measurement_uses_rms_channel_fold_and_ignores_edge_silence() -> None:
    # Opposite-polarity stereo would cancel under signed summation. The required
    # RMS fold still marks the middle 16 seconds active.
    audio = np.zeros((2000, 2), dtype=np.float32)
    audio[70:1670, 0] = 0.25
    audio[70:1670, 1] = -0.25
    result = _beat_result()

    measurements = measure_beat_input_quality(
        result=result,
        audio=audio,
        sample_rate=100,
        policy_config=BeatInputQualityPolicyConfig.provisional_v1(),
    )

    assert measurements.active_duration_seconds == pytest.approx(16.0)
    assert measurements.active_coverage_ratio == pytest.approx(1.0)
    assert measurements.beat_supported_active_seconds == pytest.approx(16.0)


def test_waveform_measurement_exposes_a_long_active_hole() -> None:
    audio = np.full((2000, 1), 0.25, dtype=np.float32)
    result = _beat_result(count=16)

    measurements = measure_beat_input_quality(
        result=result,
        audio=audio,
        sample_rate=100,
        policy_config=BeatInputQualityPolicyConfig.provisional_v1(),
    )

    assert measurements.longest_unsupported_active_run_seconds > 8
    assert measurements.longest_unsupported_active_run_beats > 8


def test_quality_stage_emits_the_versioned_decision_artifact(tmp_path) -> None:
    workspace = tmp_path / "workspace"
    source_path = workspace / "originals" / "track.wav"
    beat_path = workspace / "inputs" / "beat-analysis-result.json"
    source_path.parent.mkdir(parents=True)
    beat_path.parent.mkdir(parents=True)
    audio = np.full((2000, 1), 0.25, dtype=np.float32)
    sf.write(source_path, audio, 100, subtype="PCM_16")
    source_sha256 = hash_file(source_path)
    result = _beat_result(source_sha256=source_sha256)
    beat_path.write_text(result.model_dump_json(), encoding="utf-8")
    specification = StageSpecification(
        stage_kind=BEAT_INPUT_QUALITY_STAGE_KIND,
        implementation_version="1.0.0",
        config={
            "source_relative_path": "originals/track.wav",
            "beat_result_relative_path": "inputs/beat-analysis-result.json",
            "policy": BeatInputQualityPolicyConfig.provisional_v1().model_dump(
                mode="json"
            ),
        },
    )
    identity = StageIdentity(
        stage_kind=specification.stage_kind,
        input_sha256=source_sha256,
        implementation_version=specification.implementation_version,
        config_sha256=hash_config(specification.config),
        output_schema_version="1.0.0",
        code_revision="test-revision",
    )

    output = BeatInputQualityStageExecutor(workspace).execute(
        specification=specification,
        identity=identity,
        cache_key=stage_cache_key(identity),
        attempt=1,
        staging_directory=tmp_path / "staging",
    )

    assert output.artifacts[0].artifact_kind == "beat.input_quality_decision"
    artifact = tmp_path / "staging" / "beat-input-quality-decision.json"
    decision = artifact.read_text(encoding="utf-8")
    assert '"publication_allowed": false' in decision
