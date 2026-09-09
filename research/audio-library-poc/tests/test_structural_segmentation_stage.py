"""Contract tests for the production structural-segmentation stage."""

from __future__ import annotations

from pathlib import Path

import pytest
from pydantic import ValidationError

from audio_library_poc.execution import ExpectedStageFailure
from audio_library_poc.models import StageIdentity, StageSpecification
from audio_library_poc.structural_segmentation_stage import (
    STRUCTURAL_SEGMENTATION_ARTIFACT,
    STRUCTURAL_SEGMENTATION_IMPLEMENTATION_VERSION,
    STRUCTURAL_SEGMENTATION_STAGE_KIND,
    StructuralSegmentationStageConfig,
    StructuralSegmentationStageExecutor,
)


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


def test_production_gate_requires_a_pinned_calibration_id() -> None:
    with pytest.raises(ValidationError, match="calibration id"):
        StructuralSegmentationStageConfig.model_validate(
            config(section_gate_version="1.0.0")
        )

    parsed = StructuralSegmentationStageConfig.model_validate(
        config(
            section_gate_version="1.0.0",
            section_calibration_id="held-out-library-v1",
        )
    )
    assert parsed.section_calibration_id == "held-out-library-v1"


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
