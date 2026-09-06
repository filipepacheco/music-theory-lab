"""Bridge that runs the librosa-based section-boundary detector.

Mirrors ``HpcpKeyStageExecutor``: validate config, resolve the source
audio inside the workspace, hash-verify it against ``input_sha256``, then
call the runtime. The runtime returns a strict ``SectionAnalysisResult``
plus a Metrics payload.

Detector choice: **librosa** — the ``librosa.segment`` module is already a
transitive dep of the POC's chord and key runtimes, so no new install
burden. MSAF's ``foote`` detector was considered but its dep tree
(scikit-learn pinned to <0.22, madmom) does not resolve on modern Python
3.12 environments the way the rest of the POC installs. Letter labels
follow the same "opaque cluster id" convention MSAF uses for its
unsupervised detectors — see ``section_analysis.SectionSegment`` for the
downstream contract.
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
from audio_library_poc.section_analysis import SectionAnalysisResult

SECTION_LIBROSA_STAGE_KIND = "section.librosa_segment"
SECTION_LIBROSA_CANDIDATE_ID = "librosa_segment"
SECTION_LIBROSA_IMPLEMENTATION_VERSION = "1.0.0"
_RESULT_ARTIFACT_FILENAME = "section-analysis-result.json"


class SectionLibrosaStageConfig(ContractModel):
    """Config surface for the section.librosa_segment stage.

    No model checkpoint — the librosa detector is a pure algorithm. The
    knobs mirror librosa's own defaults for the segmentation tutorial:
    22050 Hz mono, 2048-sample hop, chroma_cqt features, 7 segments.
    ``n_segments`` bounds the agglomerative clustering; downstream can
    still get ``n_segments`` back on the result under ``settings`` so a
    later run with a different value produces a distinct cache identity.
    """

    source_relative_path: str = Field(min_length=1)
    sample_rate: int = Field(default=22050, ge=8000, le=96000)
    hop_length: int = Field(default=2048, ge=64, le=8192)
    n_segments: int = Field(default=7, ge=2, le=64)

    @field_validator("source_relative_path")
    @classmethod
    def validate_source_path(cls, value: str) -> str:
        return validate_workspace_relative_path(value)


class SectionLibrosaStageExecutor:
    """StageExecutor for the section.librosa_segment stage kind."""

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

        from audio_library_poc._section_runtime import run_section_inference

        result, metrics = run_section_inference(
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
                    artifact_kind="section.analysis_result",
                    media_type="application/json",
                    durable=True,
                ),
            ),
            metrics=metrics,
        )


def build_section_metrics(
    *,
    wall_seconds: float,
    section_count: int,
    unique_label_count: int,
) -> Metrics:
    """Shared metrics shape the runtime returns and tests assert against."""

    return Metrics(
        duration_seconds=wall_seconds,
        counters={
            "sections_emitted": section_count,
            "unique_labels": unique_label_count,
        },
        measurements={},
    )


def _validate_config(specification: StageSpecification) -> SectionLibrosaStageConfig:
    try:
        return SectionLibrosaStageConfig.model_validate(specification.config)
    except ValidationError as exc:
        raise ExpectedStageFailure(
            TypedError(
                code="section.invalid_config",
                message="section.librosa_segment stage configuration is invalid",
                retryable=False,
                details={
                    "candidate_id": SECTION_LIBROSA_CANDIDATE_ID,
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
                code="section.source_outside_workspace",
                message="section source audio must be inside the workspace",
                retryable=False,
                details={"source_relative_path": source_relative_path},
            )
        )
    if not candidate.is_file():
        raise ExpectedStageFailure(
            TypedError(
                code="section.source_missing",
                message="section source audio file is missing",
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
                code="section.source_hash_mismatch",
                message="section source audio hash does not match input_sha256",
                retryable=False,
                details={"declared": declared_sha256, "actual": actual},
            )
        )


def _validate_result(result: SectionAnalysisResult, *, identity: StageIdentity) -> None:
    if result.source_sha256 != identity.input_sha256:
        raise ExpectedStageFailure(
            TypedError(
                code="section.result_source_mismatch",
                message="SectionAnalysisResult.source_sha256 must match input_sha256",
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
                code="section.provenance_mismatch",
                message=(
                    "SectionAnalysisResult.provenance must match the committed "
                    "stage identity"
                ),
                retryable=False,
            )
        )


__all__ = (
    "SECTION_LIBROSA_STAGE_KIND",
    "SECTION_LIBROSA_CANDIDATE_ID",
    "SECTION_LIBROSA_IMPLEMENTATION_VERSION",
    "SectionLibrosaStageConfig",
    "SectionLibrosaStageExecutor",
    "build_section_metrics",
)
