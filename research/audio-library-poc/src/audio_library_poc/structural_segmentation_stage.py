"""Stage bridge for stable McFee-Ellis structural segmentation."""

from __future__ import annotations

import hashlib
import json
from dataclasses import asdict
from pathlib import Path
from typing import Literal

from pydantic import Field, ValidationError, field_validator, model_validator

from audio_library_poc.beat_analysis import BeatAnalysisResult
from audio_library_poc.beat_input_quality import BeatInputQualityDecision
from audio_library_poc.execution import (
    ExpectedStageFailure,
    StagedArtifact,
    StageOutput,
)
from audio_library_poc.io import atomic_write_json
from audio_library_poc.metadata import hash_file
from audio_library_poc.models import (
    ContractModel,
    StageIdentity,
    StageSpecification,
    TypedError,
)
from audio_library_poc.paths import validate_workspace_relative_path
from audio_library_poc.structural_segmentation import (
    ResolvedStructuralParameters,
    SectionCalibrationEvidence,
    SectionStabilityThresholds,
    perturbation_configurations,
)

STRUCTURAL_SEGMENTATION_STAGE_KIND = "section.mcfee_ellis_laplacian"
STRUCTURAL_SEGMENTATION_IMPLEMENTATION_VERSION = "1.0.0"
STRUCTURAL_SEGMENTATION_ARTIFACT = "structural-segmentation-result.json"


def structural_calibration_config_sha256(
    *,
    gate_version: str,
    sample_rate: int = 22050,
    fft_window: int = 2048,
    hop_length: int = 512,
    librosa_version: str = "0.10.2.post1",
    numpy_version: str = "2.5.2",
    scipy_version: str = "1.18.1",
    scikit_learn_version: str = "1.9.0",
) -> str:
    """Digest every fixed choice that held-out section calibration evaluates."""

    parameters = ResolvedStructuralParameters(
        sample_rate=sample_rate,
        fft_window=fft_window,
        hop_length=hop_length,
    ).model_dump(mode="json", exclude={"boundary_tolerance_seconds"})
    thresholds = asdict(
        SectionStabilityThresholds(
            gate_version=gate_version,
            calibration_id=None,
        )
    )
    thresholds.pop("calibration_id")
    payload = {
        "stage_kind": STRUCTURAL_SEGMENTATION_STAGE_KIND,
        "implementation_version": STRUCTURAL_SEGMENTATION_IMPLEMENTATION_VERSION,
        "features_and_algorithm": parameters,
        "boundary_tolerance_rule": "max(3.0s, median_inter_beat_seconds)",
        "dependencies": {
            "librosa": librosa_version,
            "numpy": numpy_version,
            "scipy": scipy_version,
            "scikit-learn": scikit_learn_version,
        },
        "perturbations": [
            item.model_dump(mode="json") for item in perturbation_configurations()
        ],
        "gate": thresholds,
    }
    encoded = json.dumps(
        payload,
        sort_keys=True,
        separators=(",", ":"),
    ).encode()
    return hashlib.sha256(encoded).hexdigest()


class StructuralSegmentationStageConfig(ContractModel):
    source_relative_path: str = Field(min_length=1)
    beat_result_relative_path: str = Field(min_length=1)
    beat_result_sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    beat_quality_decision_relative_path: str = Field(min_length=1)
    beat_quality_decision_sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    sample_rate: int = Field(default=22050, gt=0)
    fft_window: int = Field(default=2048, gt=0)
    hop_length: int = Field(default=512, gt=0)
    librosa_version: Literal["0.10.2.post1"] = "0.10.2.post1"
    numpy_version: Literal["2.5.2"] = "2.5.2"
    scipy_version: Literal["1.18.1"] = "1.18.1"
    scikit_learn_version: Literal["1.9.0"] = "1.9.0"
    section_gate_version: Literal["1.0.0-provisional", "1.0.0"] = "1.0.0-provisional"
    section_calibration: SectionCalibrationEvidence | None = None

    @field_validator(
        "source_relative_path",
        "beat_result_relative_path",
        "beat_quality_decision_relative_path",
    )
    @classmethod
    def validate_path(cls, value: str) -> str:
        return validate_workspace_relative_path(value)

    @model_validator(mode="after")
    def validate_calibration_pin(self) -> StructuralSegmentationStageConfig:
        calibrated = self.section_calibration is not None
        if calibrated == self.section_gate_version.endswith("-provisional"):
            raise ValueError(
                "production section gate requires calibration evidence; "
                "provisional gate forbids one"
            )
        if self.section_calibration is not None and not self.section_calibration.passes:
            raise ValueError("section calibration must pass every held-out target")
        if self.section_calibration is not None:
            expected_digest = structural_calibration_config_sha256(
                gate_version=self.section_gate_version,
                sample_rate=self.sample_rate,
                fft_window=self.fft_window,
                hop_length=self.hop_length,
                librosa_version=self.librosa_version,
                numpy_version=self.numpy_version,
                scipy_version=self.scipy_version,
                scikit_learn_version=self.scikit_learn_version,
            )
            if self.section_calibration.config_sha256 != expected_digest:
                raise ValueError("section calibration does not match stage config")
        return self


class StructuralSegmentationStageExecutor:
    def __init__(self, workspace: Path) -> None:
        self.workspace = Path(workspace).resolve()

    def execute(
        self,
        *,
        specification: StageSpecification,
        identity: StageIdentity,
        cache_key: str,
        attempt: int,
        staging_directory: Path,
    ) -> StageOutput:
        del cache_key
        if attempt < 1:
            raise ValueError("attempt must be positive")
        config = _validate_config(specification)
        source_path = _verified_file(
            self.workspace,
            config.source_relative_path,
            identity.input_sha256,
            error_code="section.source_identity_mismatch",
        )
        beat_path = _verified_file(
            self.workspace,
            config.beat_result_relative_path,
            config.beat_result_sha256,
            error_code="section.beat_identity_mismatch",
        )
        quality_path = _verified_file(
            self.workspace,
            config.beat_quality_decision_relative_path,
            config.beat_quality_decision_sha256,
            error_code="section.beat_quality_identity_mismatch",
        )
        try:
            beat = BeatAnalysisResult.model_validate_json(beat_path.read_text("utf-8"))
            quality = BeatInputQualityDecision.model_validate_json(
                quality_path.read_text("utf-8")
            )
        except (OSError, UnicodeError, ValidationError) as exc:
            raise _failure("section.dependency_invalid", type(exc).__name__) from exc
        if (
            beat.source_sha256 != identity.input_sha256
            or quality.source_sha256 != identity.input_sha256
            or quality.beat_result_identity.result_sha256 != config.beat_result_sha256
            or not quality.publication_allowed
        ):
            raise _failure("section.beat_input_ineligible")

        from audio_library_poc._structural_segmentation_runtime import (
            run_structural_segmentation,
        )

        result, metrics = run_structural_segmentation(
            source_path=source_path,
            beat_result=beat,
            config=config,
            identity=identity,
            beat_input_valid=quality.beat_input_valid,
            upstream_warnings=tuple(
                dict.fromkeys(
                    [warning.code for warning in beat.warnings]
                    + list(quality.diagnostic_codes)
                )
            ),
        )
        if result.source_sha256 != identity.input_sha256:
            raise _failure("section.result_source_mismatch")
        staging = Path(staging_directory)
        staging.mkdir(parents=True, exist_ok=True)
        atomic_write_json(staging / STRUCTURAL_SEGMENTATION_ARTIFACT, result)
        return StageOutput(
            artifacts=(
                StagedArtifact(
                    artifact_name=STRUCTURAL_SEGMENTATION_ARTIFACT,
                    artifact_kind="section.structural_segmentation_result",
                    media_type="application/json",
                    durable=True,
                ),
            ),
            metrics=metrics,
        )


def _validate_config(
    specification: StageSpecification,
) -> StructuralSegmentationStageConfig:
    try:
        return StructuralSegmentationStageConfig.model_validate(specification.config)
    except ValidationError as exc:
        raise _failure("section.invalid_config", type(exc).__name__) from exc


def _verified_file(
    workspace: Path, relative_path: str, expected_sha256: str, *, error_code: str
) -> Path:
    path = (workspace / relative_path).resolve()
    if (
        not path.is_relative_to(workspace)
        or not path.is_file()
        or hash_file(path) != expected_sha256
    ):
        raise _failure(error_code)
    return path


def _failure(code: str, exception_type: str | None = None) -> ExpectedStageFailure:
    details = {"exception_type": exception_type} if exception_type else {}
    return ExpectedStageFailure(
        TypedError(
            code=code,
            message="structural segmentation dependency or result is invalid",
            retryable=False,
            details=details,
        )
    )
