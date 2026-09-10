"""Contract tests for the production structural-segmentation stage."""

from __future__ import annotations

import hashlib
import sys
from pathlib import Path

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
from audio_library_poc.cache import hash_config
from audio_library_poc.execution import ExpectedStageFailure
from audio_library_poc.io import canonical_json_bytes
from audio_library_poc.models import StageIdentity, StageSpecification
from audio_library_poc.separation import SeparatorPrecision
from audio_library_poc.structural_segmentation_stage import (
    STRUCTURAL_SEGMENTATION_ARTIFACT,
    STRUCTURAL_SEGMENTATION_IMPLEMENTATION_VERSION,
    STRUCTURAL_SEGMENTATION_STAGE_KIND,
    StructuralSegmentationStageConfig,
    StructuralSegmentationStageExecutor,
    structural_calibration_config_sha256,
)


def passing_section_calibration() -> dict[str, object]:
    return {
        "calibration_id": "held-out-library-v1",
        "config_sha256": structural_calibration_config_sha256(gate_version="1.0.0"),
        "held_out": True,
        "accepted_boundary_precision_3s": 0.8,
        "exact_count_accuracy": 0.7,
        "coverage": 0.6,
        "invalid_fallback_partitions": 0,
    }


def config(**updates: object) -> dict[str, object]:
    values: dict[str, object] = {
        "source_relative_path": "originals/track.wav",
        "beat_result_relative_path": "runs/beat.json",
        "beat_result_sha256": "a" * 64,
        "beat_quality_decision_relative_path": "runs/quality.json",
        "beat_quality_decision_sha256": "b" * 64,
    }
    values.update(updates)
    return values


def test_stage_identity_and_published_feature_parameters_are_pinned() -> None:
    parsed = StructuralSegmentationStageConfig.model_validate(config())

    assert STRUCTURAL_SEGMENTATION_STAGE_KIND == "section.mcfee_ellis_laplacian"
    assert STRUCTURAL_SEGMENTATION_IMPLEMENTATION_VERSION == "1.0.0"
    assert STRUCTURAL_SEGMENTATION_ARTIFACT == "structural-segmentation-result.json"
    assert (parsed.sample_rate, parsed.fft_window, parsed.hop_length) == (
        22050,
        2048,
        512,
    )
    assert (
        parsed.librosa_version,
        parsed.numpy_version,
        parsed.scipy_version,
        parsed.scikit_learn_version,
    ) == ("0.10.2.post1", "2.5.2", "1.18.1", "1.9.0")


@pytest.mark.parametrize(
    "missing",
    [
        "beat_result_relative_path",
        "beat_result_sha256",
        "beat_quality_decision_relative_path",
        "beat_quality_decision_sha256",
    ],
)
def test_config_requires_every_immutable_dependency_pointer(missing: str) -> None:
    values = config()
    del values[missing]

    with pytest.raises(ValidationError):
        StructuralSegmentationStageConfig.model_validate(values)


def test_production_gate_requires_passing_held_out_calibration() -> None:
    with pytest.raises(ValidationError, match="calibration evidence"):
        StructuralSegmentationStageConfig.model_validate(
            config(section_gate_version="1.0.0")
        )

    parsed = StructuralSegmentationStageConfig.model_validate(
        config(
            section_gate_version="1.0.0",
            section_calibration=passing_section_calibration(),
        )
    )
    assert parsed.section_calibration is not None
    assert parsed.section_calibration.calibration_id == "held-out-library-v1"

    with pytest.raises(ValidationError, match="held-out target"):
        StructuralSegmentationStageConfig.model_validate(
            config(
                section_gate_version="1.0.0",
                section_calibration={
                    **passing_section_calibration(),
                    "coverage": 0.59,
                },
            )
        )

    with pytest.raises(ValidationError, match="match stage config"):
        StructuralSegmentationStageConfig.model_validate(
            config(
                sample_rate=44100,
                section_gate_version="1.0.0",
                section_calibration=passing_section_calibration(),
            )
        )


def test_stage_fails_closed_when_a_dependency_artifact_is_missing(
    tmp_path: Path,
) -> None:
    source = tmp_path / "originals" / "track.wav"
    source.parent.mkdir()
    source.write_bytes(b"audio")
    specification = StageSpecification(
        stage_kind=STRUCTURAL_SEGMENTATION_STAGE_KIND,
        implementation_version=STRUCTURAL_SEGMENTATION_IMPLEMENTATION_VERSION,
        config=config(),
    )
    identity = StageIdentity(
        stage_kind=STRUCTURAL_SEGMENTATION_STAGE_KIND,
        input_sha256="0" * 64,
        implementation_version=STRUCTURAL_SEGMENTATION_IMPLEMENTATION_VERSION,
        config_sha256="1" * 64,
        output_schema_version="1.0.0",
        code_revision="test",
    )

    with pytest.raises(ExpectedStageFailure) as captured:
        StructuralSegmentationStageExecutor(tmp_path).execute(
            specification=specification,
            identity=identity,
            cache_key="ignored",
            attempt=1,
            staging_directory=tmp_path / "staging",
        )

    assert captured.value.error.code == "section.source_identity_mismatch"


@pytest.mark.skipif(
    sys.platform != "win32",
    reason="byte identity is certified on the pinned Windows inference runtime",
)
def test_repeated_windows_stage_identity_is_byte_identical(tmp_path: Path) -> None:
    pytest.importorskip(
        "librosa", reason="requires the optional inference dependency set"
    )
    pytest.importorskip(
        "sklearn", reason="requires the optional inference dependency set"
    )
    from audio_library_poc._structural_segmentation_runtime import (
        run_structural_segmentation,
    )

    sample_rate = 22050
    duration_seconds = 18.0
    timeline = np.arange(int(sample_rate * duration_seconds)) / sample_rate
    audio = (0.1 * np.sin(2 * np.pi * 220 * timeline)).astype(np.float32)
    source = tmp_path / "track.wav"
    sf.write(source, audio, sample_rate, subtype="FLOAT")
    source_sha256 = hashlib.sha256(source.read_bytes()).hexdigest()
    beats = tuple(
        BeatEstimate(time_seconds=1.0 + index * 0.5, is_downbeat=index % 4 == 0)
        for index in range(32)
    )
    beat_result = BeatAnalysisResult(
        source_sha256=source_sha256,
        provenance=BeatAnalyzerProvenance(
            candidate="beat_this",
            implementation_version="1.0.0",
            model_identifier="beat_this-final0.ckpt",
            model_sha256="a" * 64,
            code_revision="repeatability-test",
        ),
        settings=EffectiveBeatAnalyzerSettings(
            device="cpu",
            precision=SeparatorPrecision.FLOAT32,
            use_dbn=False,
        ),
        source=BeatSourceFacts(
            sample_rate=sample_rate,
            channels=1,
            frame_count=len(audio),
            duration_seconds=duration_seconds,
            peak_absolute_sample=float(abs(audio).max()),
        ),
        beats=beats,
        downbeat_count=8,
        tempo_median_bpm=120.0,
    )
    stage_config = StructuralSegmentationStageConfig.model_validate(
        config(
            section_gate_version="1.0.0",
            section_calibration=passing_section_calibration(),
        )
    )
    config_payload = stage_config.model_dump(mode="json")
    identity = StageIdentity(
        stage_kind=STRUCTURAL_SEGMENTATION_STAGE_KIND,
        input_sha256=source_sha256,
        implementation_version=STRUCTURAL_SEGMENTATION_IMPLEMENTATION_VERSION,
        config_sha256=hash_config(config_payload),
        output_schema_version="1.0.0",
        code_revision="repeatability-test",
    )

    first, _ = run_structural_segmentation(
        source_path=source,
        beat_result=beat_result,
        config=stage_config,
        identity=identity,
        beat_input_valid=True,
    )
    second, _ = run_structural_segmentation(
        source_path=source,
        beat_result=beat_result,
        config=stage_config,
        identity=identity,
        beat_input_valid=True,
    )

    assert canonical_json_bytes(first) == canonical_json_bytes(second)
