"""Bridge that runs the Beat This! beat-tracking model inside the stage seam.

Structure mirrors ``SeparatorStageExecutor``: validate config, require
model identity, resolve the source audio inside the workspace, hash-verify
it against ``input_sha256``, then call the runtime. The Beat This! runtime
returns a strict ``BeatAnalysisResult`` plus the name of the JSON artifact
to publish.
"""

from __future__ import annotations

from pathlib import Path

from pydantic import Field, ValidationError, field_validator

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

BEAT_THIS_STAGE_KIND = "beat.beat_this"
BEAT_THIS_CANDIDATE_ID = "beat_this"
BEAT_THIS_IMPLEMENTATION_VERSION = "1.0.0"
_RESULT_ARTIFACT_FILENAME = "beat-analysis-result.json"


class BeatThisStageConfig(ContractModel):
    """Config surface for a beat.beat_this stage.

    ``source_relative_path`` and ``checkpoint_relative_path`` locate the
    audio file and the pinned Beat This! ``.ckpt`` inside the workspace.
    Precision maps to Beat This!'s ``float16`` boolean; use_dbn to its
    optional madmom-DBN post-processor (off by default per the Phase 3
    plan).
    """

    source_relative_path: str = Field(min_length=1)
    checkpoint_relative_path: str = Field(min_length=1)
    device: str = Field(default="cuda", min_length=1, max_length=128)
    precision: SeparatorPrecision = SeparatorPrecision.FLOAT16
    use_dbn: bool = False

    @field_validator("source_relative_path", "checkpoint_relative_path")
    @classmethod
    def validate_workspace_path(cls, value: str) -> str:
        return validate_workspace_relative_path(value)

    @field_validator("device")
    @classmethod
    def validate_device(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("device must not be blank")
        return value


class BeatThisStageExecutor:
    """StageExecutor for the beat.beat_this stage kind."""

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
        if attempt < 1:
            raise ValueError("attempt must be positive")

        config = _validate_config(specification)
        _require_model_identity(specification)
        source_path = _resolve_source(self.workspace, config.source_relative_path)
        _verify_source_hash(source_path, identity.input_sha256)

        staging = Path(staging_directory)
        staging.mkdir(parents=True, exist_ok=True)

        from audio_library_poc._beat_this_runtime import run_beat_this_inference

        result, metrics = run_beat_this_inference(
            workspace=self.workspace,
            source_path=source_path,
            config=config,
            identity=identity,
        )
        _validate_result(result, identity=identity)
        atomic_write_json(staging / _RESULT_ARTIFACT_FILENAME, result)

        return StageOutput(
            artifacts=(
                StagedArtifact(
                    artifact_name=_RESULT_ARTIFACT_FILENAME,
                    artifact_kind="beat.analysis_result",
                    media_type="application/json",
                    durable=True,
                ),
            ),
            metrics=metrics,
        )


def _validate_config(specification: StageSpecification) -> BeatThisStageConfig:
    try:
        return BeatThisStageConfig.model_validate(specification.config)
    except ValidationError as exc:
        raise ExpectedStageFailure(
            TypedError(
                code="beat.invalid_config",
                message="beat.beat_this stage configuration is invalid",
                retryable=False,
                details={
                    "candidate_id": BEAT_THIS_CANDIDATE_ID,
                    "exception_type": type(exc).__name__,
                    "error_count": exc.error_count(),
                },
            )
        ) from exc


def _require_model_identity(specification: StageSpecification) -> None:
    if not specification.model_identifier or not specification.model_sha256:
        raise ExpectedStageFailure(
            TypedError(
                code="beat.missing_model_identity",
                message=(
                    "beat.beat_this stages require model_identifier and "
                    "model_sha256 so cache identity captures the pinned checkpoint"
                ),
                retryable=False,
            )
        )


def _resolve_source(workspace: Path, source_relative_path: str) -> Path:
    candidate = (workspace / Path(source_relative_path)).resolve()
    if not candidate.is_relative_to(workspace):
        raise ExpectedStageFailure(
            TypedError(
                code="beat.source_outside_workspace",
                message="beat source audio must be inside the workspace",
                retryable=False,
                details={"source_relative_path": source_relative_path},
            )
        )
    if not candidate.is_file():
        raise ExpectedStageFailure(
            TypedError(
                code="beat.source_missing",
                message="beat source audio file is missing",
                retryable=False,
                details={"source_relative_path": source_relative_path},
            )
        )
    return candidate


def _verify_source_hash(source_path: Path, declared_sha256: str) -> None:
    actual = hash_file(source_path)
    if actual != declared_sha256:
        raise ExpectedStageFailure(
            TypedError(
                code="beat.source_hash_mismatch",
                message="beat source audio hash does not match input_sha256",
                retryable=False,
                details={"declared": declared_sha256, "actual": actual},
            )
        )


def _validate_result(result, *, identity: StageIdentity) -> None:
    if result.source_sha256 != identity.input_sha256:
        raise ExpectedStageFailure(
            TypedError(
                code="beat.result_source_mismatch",
                message="BeatAnalysisResult.source_sha256 must match input_sha256",
                retryable=False,
            )
        )
    provenance = result.provenance
    if (
        provenance.model_identifier != identity.model_identifier
        or provenance.model_sha256 != identity.model_sha256
        or provenance.implementation_version != identity.implementation_version
        or provenance.code_revision != identity.code_revision
    ):
        raise ExpectedStageFailure(
            TypedError(
                code="beat.provenance_mismatch",
                message=(
                    "BeatAnalysisResult.provenance must match the committed "
                    "stage identity"
                ),
                retryable=False,
            )
        )


def build_beat_this_metrics(
    *,
    wall_seconds: float,
    beat_count: int,
    downbeat_count: int,
    tempo_bpm: float,
) -> Metrics:
    """Shared helper: metric shape the runtime returns and tests assert against."""

    return Metrics(
        duration_seconds=wall_seconds,
        counters={
            "beats_detected": beat_count,
            "downbeats_detected": downbeat_count,
        },
        measurements={"tempo_median_bpm": tempo_bpm},
    )
