"""Guarded ChordMini ChordNet stage.

The ChordNet source is pinned to the same ChordMini revision as BTC, but its
checkpoint terms, source URL, and reviewed model subset are not committed.
This bridge deliberately validates those facts before importing a runtime.
It can therefore be dispatched and synthetically tested without claiming a
real ChordNet inference run.
"""

from __future__ import annotations

from pathlib import Path
from urllib.parse import urlparse

from pydantic import Field, ValidationError, field_validator

from audio_library_poc.asset_resolution import resolve_workspace_asset
from audio_library_poc.chord_analysis import ChordFrameEvidenceArtifact
from audio_library_poc.chordmini_btc_stage import (
    _resolve_source,
    _validate_result,
    _verify_checkpoint_hash,
    _verify_source_hash,
)
from audio_library_poc.execution import (
    ExpectedStageFailure,
    StagedArtifact,
    StageOutput,
)
from audio_library_poc.io import atomic_write_json
from audio_library_poc.models import (
    ContractModel,
    StageIdentity,
    StageSpecification,
    TypedError,
)
from audio_library_poc.paths import validate_workspace_relative_path
from audio_library_poc.separation import SeparatorPrecision

CHORDMINI_CHORDNET_STAGE_KIND = "chord.chordmini_chordnet"
CHORDMINI_CHORDNET_CANDIDATE_ID = "chordmini_chordnet"
CHORDMINI_CHORDNET_IMPLEMENTATION_VERSION = "1.0.0"
_RESULT_ARTIFACT_FILENAME = "chord-analysis-result.json"
_FRAME_EVIDENCE_ARTIFACT_FILENAME = "chord-frame-evidence-v1.json"


class ChordNetStageConfig(ContractModel):
    source_relative_path: str = Field(min_length=1)
    checkpoint_relative_path: str = Field(min_length=1)
    checkpoint_source: str = Field(min_length=1, max_length=2048)
    checkpoint_terms_reference: str = Field(min_length=1, max_length=2048)
    device: str = Field(default="cuda", min_length=1, max_length=128)
    precision: SeparatorPrecision = SeparatorPrecision.FLOAT16
    overlap: float = Field(default=0.5, ge=0, lt=0.95)
    seq_len: int = Field(default=108, ge=1, le=4096)
    hop_length: int = Field(default=2048, ge=1, le=65536)
    logit_smoothing_kernel: int = Field(default=9, ge=1, le=101)
    logit_smoothing_gaussian: bool = False
    categorical_smoothing_window: int = Field(default=1, ge=1, le=101)

    @field_validator("source_relative_path", "checkpoint_relative_path")
    @classmethod
    def validate_workspace_path(cls, value: str) -> str:
        return validate_workspace_relative_path(value)

    @field_validator("logit_smoothing_kernel", "categorical_smoothing_window")
    @classmethod
    def validate_odd_window(cls, value: int) -> int:
        if value % 2 == 0:
            raise ValueError("smoothing windows must be odd")
        return value

    @field_validator("checkpoint_source", "checkpoint_terms_reference")
    @classmethod
    def validate_auditable_https_url(cls, value: str) -> str:
        parsed = urlparse(value)
        if parsed.scheme != "https" or not parsed.netloc:
            raise ValueError("checkpoint provenance must be an auditable HTTPS URL")
        if "example" in parsed.netloc.casefold() or "placeholder" in value.casefold():
            raise ValueError("checkpoint provenance must not use a placeholder URL")
        return value


class ChordNetStageExecutor:
    """Execution boundary for an evidenced ChordNet candidate only."""

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
        if identity.implementation_version != CHORDMINI_CHORDNET_IMPLEMENTATION_VERSION:
            raise ExpectedStageFailure(
                TypedError(
                    code="chord.identity_version_mismatch",
                    message="stage identity does not match the ChordNet executor",
                    retryable=False,
                )
            )
        config = _validate_config(specification)
        _require_model_identity(specification)
        source_path = _resolve_source(self.workspace, config.source_relative_path)
        _verify_source_hash(source_path, identity.input_sha256)
        checkpoint_path = _resolve_checkpoint(
            self.workspace, config.checkpoint_relative_path
        )
        _verify_checkpoint_hash(checkpoint_path, identity.model_sha256)

        # This import stays after every source/terms/hash gate. The checked-in
        # runtime raises a typed "vendor unavailable" failure until the pinned
        # upstream subset has been reviewed and its checkpoint rights recorded.
        from audio_library_poc._chordnet_runtime import run_chordnet_inference

        result, metrics, evidence = run_chordnet_inference(
            workspace=self.workspace,
            source_path=source_path,
            checkpoint_path=checkpoint_path,
            config=config,
            identity=identity,
        )
        _validate_result(
            result,
            identity=identity,
            candidate_id=CHORDMINI_CHORDNET_CANDIDATE_ID,
        )
        evidence = ChordFrameEvidenceArtifact.model_validate(evidence)
        staging = Path(staging_directory)
        staging.mkdir(parents=True, exist_ok=True)
        atomic_write_json(staging / _RESULT_ARTIFACT_FILENAME, result)
        atomic_write_json(staging / _FRAME_EVIDENCE_ARTIFACT_FILENAME, evidence)
        return StageOutput(
            artifacts=(
                StagedArtifact(
                    artifact_name=_RESULT_ARTIFACT_FILENAME,
                    artifact_kind="chord.analysis_result",
                    media_type="application/json",
                    durable=True,
                ),
                StagedArtifact(
                    artifact_name=_FRAME_EVIDENCE_ARTIFACT_FILENAME,
                    artifact_kind="chord.frame_evidence",
                    media_type="application/json",
                    durable=True,
                ),
            ),
            metrics=metrics,
        )


def _validate_config(specification: StageSpecification) -> ChordNetStageConfig:
    try:
        return ChordNetStageConfig.model_validate(specification.config)
    except ValidationError as exc:
        raise ExpectedStageFailure(
            TypedError(
                code="chord.invalid_config",
                message="chord.chordmini_chordnet stage configuration is invalid",
                retryable=False,
                details={
                    "candidate_id": CHORDMINI_CHORDNET_CANDIDATE_ID,
                    "exception_type": type(exc).__name__,
                    "error_count": exc.error_count(),
                },
            )
        ) from exc


def _require_model_identity(specification: StageSpecification) -> None:
    if not specification.model_identifier or not specification.model_sha256:
        raise ExpectedStageFailure(
            TypedError(
                code="chord.missing_model_identity",
                message="ChordNet requires model_identifier and model_sha256",
                retryable=False,
            )
        )


def _resolve_checkpoint(workspace: Path, relative_path: str) -> Path:
    return resolve_workspace_asset(
        workspace,
        relative_path,
        code_prefix="chord",
        label="checkpoint",
        outside_message="ChordNet checkpoint must resolve inside the workspace",
        missing_message="ChordNet checkpoint file is missing",
    )
