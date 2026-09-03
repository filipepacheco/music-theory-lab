"""Bridge that runs a candidate ``Separator`` inside the shared stage seam.

The orchestrator only knows about ``StageExecutor``. This bridge validates a
separator's config, verifies the source audio hash, calls the separator, and
translates its ``SeparatorResponse`` into the ``StagedArtifact`` bundle the
orchestrator expects. When the underlying separator raises
``SeparatorNotImplementedError`` (the current stubs), the failure flows
through as a clean ``FAILED_TERMINAL`` result — no traceback and no partial
publication.
"""

from __future__ import annotations

from pathlib import Path

from pydantic import ValidationError

from audio_library_poc.execution import (
    ExpectedStageFailure,
    StagedArtifact,
    StageOutput,
)
from audio_library_poc.io import atomic_write_json
from audio_library_poc.metadata import hash_file
from audio_library_poc.models import StageIdentity, StageSpecification, TypedError
from audio_library_poc.separators.protocol import (
    Separator,
    SeparatorRequest,
    SeparatorResponse,
)

_RESULT_MEDIA_TYPE = "application/json"
_STEM_MEDIA_TYPE = "audio/wav"


class SeparatorStageExecutor:
    """One stage executor per ``Separator`` instance."""

    def __init__(self, separator: Separator, workspace: Path) -> None:
        self.separator = separator
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

        config = _validate_config(self.separator, specification)
        _require_model_identity(specification)
        source_path = _resolve_source(self.workspace, config.source_relative_path)
        _verify_source_hash(source_path, identity.input_sha256)

        staging = Path(staging_directory)
        staging.mkdir(parents=True, exist_ok=True)

        request = SeparatorRequest(
            source_path=source_path,
            source_sha256=identity.input_sha256,
            staging_directory=staging,
            config=config,
            stage_identity=identity,
        )
        response = self.separator.separate(request)
        _validate_response(response, identity=identity)
        _write_result(staging, response)
        return _assemble_output(response)


def _validate_config(separator: Separator, specification: StageSpecification):
    try:
        return separator.ConfigModel.model_validate(specification.config)
    except ValidationError as exc:
        raise ExpectedStageFailure(
            TypedError(
                code="separator.invalid_config",
                message="separator stage configuration is invalid",
                retryable=False,
                details={
                    "candidate_id": separator.candidate_id,
                    "exception_type": type(exc).__name__,
                    "error_count": exc.error_count(),
                },
            )
        ) from exc


def _require_model_identity(specification: StageSpecification) -> None:
    if not specification.model_identifier or not specification.model_sha256:
        raise ExpectedStageFailure(
            TypedError(
                code="separator.missing_model_identity",
                message=(
                    "separator stages require model_identifier and model_sha256 "
                    "so cache identity captures the pinned checkpoint"
                ),
                retryable=False,
            )
        )


def _resolve_source(workspace: Path, source_relative_path: str) -> Path:
    candidate = (workspace / Path(source_relative_path)).resolve()
    if not candidate.is_relative_to(workspace):
        raise ExpectedStageFailure(
            TypedError(
                code="separator.source_outside_workspace",
                message="separator source audio must be inside the workspace",
                retryable=False,
                details={"source_relative_path": source_relative_path},
            )
        )
    if not candidate.is_file():
        raise ExpectedStageFailure(
            TypedError(
                code="separator.source_missing",
                message="separator source audio file is missing",
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
                code="separator.source_hash_mismatch",
                message="separator source audio hash does not match input_sha256",
                retryable=False,
                details={"declared": declared_sha256, "actual": actual},
            )
        )


def _validate_response(
    response: SeparatorResponse,
    *,
    identity: StageIdentity,
) -> None:
    if response.result.source_sha256 != identity.input_sha256:
        raise ExpectedStageFailure(
            TypedError(
                code="separator.result_source_mismatch",
                message=(
                    "SeparationResult.source_sha256 must match the stage input_sha256"
                ),
                retryable=False,
            )
        )

    provenance = response.result.provenance
    if (
        provenance.model_identifier != identity.model_identifier
        or provenance.model_sha256 != identity.model_sha256
        or provenance.implementation_version != identity.implementation_version
        or provenance.code_revision != identity.code_revision
    ):
        raise ExpectedStageFailure(
            TypedError(
                code="separator.provenance_mismatch",
                message=(
                    "SeparationResult.provenance must match the committed "
                    "stage identity"
                ),
                retryable=False,
            )
        )

    declared_stem_names = {
        stem.artifact_filename.casefold() for stem in response.result.stems
    }
    written_stem_names = {name.casefold() for name in response.stem_artifact_names}
    if declared_stem_names != written_stem_names:
        raise ExpectedStageFailure(
            TypedError(
                code="separator.stem_manifest_mismatch",
                message=(
                    "stem_artifact_names must exactly match "
                    "SeparationResult.stems filenames"
                ),
                retryable=False,
            )
        )

    all_names = [
        *response.stem_artifact_names,
        *response.retained_native_artifact_names,
        response.result_artifact_name,
    ]
    normalized = [name.casefold() for name in all_names]
    if len(normalized) != len(set(normalized)):
        raise ExpectedStageFailure(
            TypedError(
                code="separator.duplicate_artifact_names",
                message=(
                    "separator response artifact names must be case-insensitively "
                    "unique across stems, retained-native, and result JSON"
                ),
                retryable=False,
            )
        )


def _write_result(staging: Path, response: SeparatorResponse) -> None:
    atomic_write_json(staging / response.result_artifact_name, response.result)


def _assemble_output(response: SeparatorResponse) -> StageOutput:
    artifacts: list[StagedArtifact] = []
    for stem in response.result.stems:
        artifacts.append(
            StagedArtifact(
                artifact_name=stem.artifact_filename,
                artifact_kind=f"separator.stem.{stem.stem_kind.value}",
                media_type=_STEM_MEDIA_TYPE,
                durable=True,
            )
        )
    for filename in response.retained_native_artifact_names:
        artifacts.append(
            StagedArtifact(
                artifact_name=filename,
                artifact_kind="separator.native",
                media_type=_STEM_MEDIA_TYPE,
                durable=False,
            )
        )
    artifacts.append(
        StagedArtifact(
            artifact_name=response.result_artifact_name,
            artifact_kind="separator.result",
            media_type=_RESULT_MEDIA_TYPE,
            durable=False,
        )
    )
    return StageOutput(artifacts=tuple(artifacts), metrics=response.metrics)
