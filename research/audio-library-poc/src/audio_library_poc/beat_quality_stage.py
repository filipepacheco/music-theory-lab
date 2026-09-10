"""Offline stage adapter for the beat-input quality decision."""

from __future__ import annotations

from pathlib import Path

import numpy as np
import soundfile as sf
from pydantic import Field, ValidationError, field_validator

from audio_library_poc.beat_analysis import (
    BeatAnalysisResult,
    BeatAnalyzerProvenance,
    BeatSourceFacts,
    EffectiveBeatAnalyzerSettings,
)
from audio_library_poc.beat_input_quality import (
    BeatInputQualityPolicyConfig,
    CalibrationEvidence,
    decide_beat_input_quality,
    measure_beat_input_quality,
)
from audio_library_poc.execution import (
    ExpectedStageFailure,
    StagedArtifact,
    StageOutput,
)
from audio_library_poc.io import atomic_write_json
from audio_library_poc.metadata import hash_file
from audio_library_poc.models import (
    ContractModel,
    Metrics,
    StageIdentity,
    StageSpecification,
    TypedError,
)
from audio_library_poc.paths import validate_workspace_relative_path
from audio_library_poc.separation import SeparatorPrecision

BEAT_INPUT_QUALITY_STAGE_KIND = "quality.beat_input"
BEAT_INPUT_QUALITY_IMPLEMENTATION_VERSION = "1.0.0"
_RESULT_ARTIFACT_FILENAME = "beat-input-quality-decision.json"


class BeatInputQualityStageConfig(ContractModel):
    source_relative_path: str = Field(min_length=1)
    beat_result_relative_path: str | None = None
    analyzer_candidate: str = "beat_this"
    analyzer_implementation_version: str = "1.0.0"
    model_identifier: str = "unknown-model"
    model_sha256: str = "0" * 64
    analyzer_code_revision: str = "unknown-revision"
    policy: BeatInputQualityPolicyConfig
    calibration: CalibrationEvidence | None = None

    @field_validator("source_relative_path", "beat_result_relative_path")
    @classmethod
    def validate_workspace_path(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return validate_workspace_relative_path(value)


class BeatInputQualityStageExecutor:
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
        config = self._config(specification)
        source_path = self._file(config.source_relative_path, "source")
        contract_invalid = hash_file(source_path) != identity.input_sha256
        try:
            audio, sample_rate = sf.read(
                str(source_path), dtype="float32", always_2d=True
            )
        except (OSError, RuntimeError, ValueError):
            contract_invalid = True
            audio = np.empty((0, 1), dtype=np.float32)
            sample_rate = 1
        beat_path = self._optional_file(config.beat_result_relative_path)
        contract_invalid = contract_invalid or beat_path is None
        try:
            if beat_path is None:
                raise OSError("beat result missing")
            result = BeatAnalysisResult.model_validate_json(
                beat_path.read_text(encoding="utf-8")
            )
        except (OSError, UnicodeError, ValidationError):
            contract_invalid = True
            result = BeatAnalysisResult(
                source_sha256=identity.input_sha256,
                provenance=BeatAnalyzerProvenance(
                    candidate=config.analyzer_candidate,
                    implementation_version=config.analyzer_implementation_version,
                    model_identifier=config.model_identifier,
                    model_sha256=config.model_sha256,
                    code_revision=config.analyzer_code_revision,
                ),
                settings=EffectiveBeatAnalyzerSettings(
                    device="unknown",
                    precision=SeparatorPrecision.FLOAT32,
                    use_dbn=False,
                ),
                source=BeatSourceFacts(
                    sample_rate=int(sample_rate),
                    channels=int(audio.shape[1]),
                    frame_count=int(audio.shape[0]),
                    duration_seconds=float(audio.shape[0] / sample_rate),
                    peak_absolute_sample=float(abs(audio).max()) if audio.size else 0,
                ),
                downbeat_count=0,
                tempo_median_bpm=0,
            )
        measurements = measure_beat_input_quality(
            result=result,
            audio=audio,
            sample_rate=int(sample_rate),
            policy_config=config.policy,
        )
        decision = decide_beat_input_quality(
            result=result,
            result_sha256=hash_file(beat_path) if beat_path is not None else "0" * 64,
            measurements=measurements,
            policy_config=config.policy,
            calibration=config.calibration,
            expected_source_sha256=identity.input_sha256,
            expected_analyzer_candidate=config.analyzer_candidate,
            expected_analyzer_implementation_version=(
                config.analyzer_implementation_version
            ),
            expected_model_identifier=config.model_identifier,
            expected_model_sha256=config.model_sha256,
            expected_code_revision=config.analyzer_code_revision,
            implementation_revision=identity.code_revision,
            contract_invalid=contract_invalid,
        )
        staging = Path(staging_directory)
        staging.mkdir(parents=True, exist_ok=True)
        atomic_write_json(staging / _RESULT_ARTIFACT_FILENAME, decision)
        return StageOutput(
            artifacts=(
                StagedArtifact(
                    artifact_name=_RESULT_ARTIFACT_FILENAME,
                    artifact_kind="beat.input_quality_decision",
                    media_type="application/json",
                    durable=True,
                ),
            ),
            metrics=Metrics(
                counters={
                    "fatal_reasons": len(decision.fatal_reason_codes),
                    "diagnostics": len(decision.diagnostic_codes),
                },
                measurements={
                    "active_coverage_ratio": measurements.active_coverage_ratio
                },
            ),
        )

    def _config(self, specification: StageSpecification) -> BeatInputQualityStageConfig:
        try:
            return BeatInputQualityStageConfig.model_validate(specification.config)
        except ValidationError as exc:
            self._fail(
                "beat.invalid_quality_config",
                "beat-input quality stage configuration is invalid",
                error_count=exc.error_count(),
            )

    def _file(self, relative_path: str, label: str) -> Path:
        path = (self.workspace / relative_path).resolve()
        if not path.is_relative_to(self.workspace) or not path.is_file():
            self._fail(
                "beat.contract_invalid",
                f"{label} must be a file inside the workspace",
                relative_path=relative_path,
            )
        return path

    def _optional_file(self, relative_path: str | None) -> Path | None:
        if relative_path is None:
            return None
        path = (self.workspace / relative_path).resolve()
        return path if path.is_relative_to(self.workspace) and path.is_file() else None

    @staticmethod
    def _fail(code: str, message: str, **details: object):
        raise ExpectedStageFailure(
            TypedError(
                code=code,
                message=message,
                retryable=False,
                details=details,
            )
        )
