"""Bridge for the transparent HPCP + Krumhansl-Kessler key baseline.

No external model — the runtime is pure numpy + librosa. Cache identity
still flows through ``code_revision`` + ``implementation_version`` +
``config_sha256`` (same as every other stage). ``model_identifier`` and
``model_sha256`` are absent by design for this stage kind.
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
from audio_library_poc.key_analysis import KeyAnalysisResult
from audio_library_poc.metadata import hash_file
from audio_library_poc.models import (
    ContractModel,
    Metrics,
    StageIdentity,
    StageSpecification,
    TypedError,
)
from audio_library_poc.paths import validate_workspace_relative_path

HPCP_KEY_STAGE_KIND = "key.hpcp"
HPCP_KEY_CANDIDATE_ID = "hpcp"
HPCP_KEY_IMPLEMENTATION_VERSION = "1.0.0"
_RESULT_ARTIFACT_FILENAME = "key-analysis-result.json"


class HpcpKeyStageConfig(ContractModel):
    """Config surface for the key.hpcp stage.

    ``sample_rate`` and ``hop_length`` control librosa's chromagram
    extraction. ``n_chroma`` is fixed at 12 by the profile geometry; the
    field is exposed so the recorded settings show it explicitly.
    """

    source_relative_path: str = Field(min_length=1)
    sample_rate: int = Field(default=22050, ge=8000, le=96000)
    hop_length: int = Field(default=2048, ge=64, le=8192)

    @field_validator("source_relative_path")
    @classmethod
    def validate_source_path(cls, value: str) -> str:
        return validate_workspace_relative_path(value)


class HpcpKeyStageExecutor:
    """StageExecutor for the key.hpcp stage kind."""

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
        source_path = _resolve_source(self.workspace, config.source_relative_path)
        _verify_source_hash(source_path, identity.input_sha256)

        staging = Path(staging_directory)
        staging.mkdir(parents=True, exist_ok=True)

        from audio_library_poc._hpcp_key_runtime import run_hpcp_key_inference

        result, metrics = run_hpcp_key_inference(
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
                    artifact_kind="key.analysis_result",
                    media_type="application/json",
                    durable=True,
                ),
            ),
            metrics=metrics,
        )


def build_hpcp_key_metrics(
    *,
    wall_seconds: float,
    top_score: float,
    second_score: float,
) -> Metrics:
    return Metrics(
        duration_seconds=wall_seconds,
        counters={},
        measurements={
            "top_score": top_score,
            "peak_margin": max(0.0, top_score - second_score),
        },
    )


def _validate_config(specification: StageSpecification) -> HpcpKeyStageConfig:
    try:
        return HpcpKeyStageConfig.model_validate(specification.config)
    except ValidationError as exc:
        raise ExpectedStageFailure(
            TypedError(
                code="key.invalid_config",
                message="key.hpcp stage configuration is invalid",
                retryable=False,
                details={
                    "candidate_id": HPCP_KEY_CANDIDATE_ID,
                    "exception_type": type(exc).__name__,
                    "error_count": exc.error_count(),
                },
            )
        ) from exc


def _resolve_source(workspace: Path, source_relative_path: str) -> Path:
    candidate = (workspace / Path(source_relative_path)).resolve()
    if not candidate.is_relative_to(workspace):
        raise ExpectedStageFailure(
            TypedError(
                code="key.source_outside_workspace",
                message="key source audio must be inside the workspace",
                retryable=False,
                details={"source_relative_path": source_relative_path},
            )
        )
    if not candidate.is_file():
        raise ExpectedStageFailure(
            TypedError(
                code="key.source_missing",
                message="key source audio file is missing",
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
                code="key.source_hash_mismatch",
                message="key source audio hash does not match input_sha256",
                retryable=False,
                details={"declared": declared_sha256, "actual": actual},
            )
        )


def _validate_result(result: KeyAnalysisResult, *, identity: StageIdentity) -> None:
    if result.source_sha256 != identity.input_sha256:
        raise ExpectedStageFailure(
            TypedError(
                code="key.result_source_mismatch",
                message="KeyAnalysisResult.source_sha256 must match input_sha256",
                retryable=False,
            )
        )
    provenance = result.provenance
    if (
        provenance.implementation_version != identity.implementation_version
        or provenance.code_revision != identity.code_revision
    ):
        raise ExpectedStageFailure(
            TypedError(
                code="key.provenance_mismatch",
                message=(
                    "KeyAnalysisResult.provenance must match the committed "
                    "stage identity"
                ),
                retryable=False,
            )
        )


__all__ = (
    "HPCP_KEY_STAGE_KIND",
    "HPCP_KEY_CANDIDATE_ID",
    "HPCP_KEY_IMPLEMENTATION_VERSION",
    "HpcpKeyStageConfig",
    "HpcpKeyStageExecutor",
    "build_hpcp_key_metrics",
)
