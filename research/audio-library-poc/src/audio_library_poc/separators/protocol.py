"""Adapter contract every candidate stem-separator implements."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import ClassVar, Protocol, runtime_checkable

from audio_library_poc.execution import ExpectedStageFailure
from audio_library_poc.models import Metrics, StageIdentity, TypedError
from audio_library_poc.separation import SeparationResult
from audio_library_poc.separators.config import BaseSeparatorStageConfig


@dataclass(frozen=True)
class SeparatorRequest:
    """Runtime inputs handed to one separator invocation.

    ``source_path`` is the absolute, workspace-resolved path to the source
    audio file. ``source_sha256`` mirrors the stage's ``input_sha256`` and
    must equal the actual hash of ``source_path``; the bridge verifies this
    before invoking ``separate``. ``staging_directory`` is the exact directory
    the separator writes stems and any per-candidate retained-native artifacts
    into; the orchestrator publishes it atomically after ``separate`` returns.
    ``stage_identity`` carries the immutable provenance the caller committed to.
    """

    source_path: Path
    source_sha256: str
    staging_directory: Path
    config: BaseSeparatorStageConfig
    stage_identity: StageIdentity


@dataclass(frozen=True)
class SeparatorResponse:
    """Descriptor bundle a separator returns after writing its files.

    ``result`` is the validated ``SeparationResult`` the bridge will persist
    as the canonical stage artifact. ``stem_artifact_names`` and
    ``retained_native_artifact_names`` are the exact filenames the separator
    wrote inside ``staging_directory``. ``result_artifact_name`` is the
    filename to persist the ``SeparationResult`` JSON under (must not
    collide with any stem or retained-native filename). ``metrics`` flow
    into ``StageOutput.metrics`` as-is.
    """

    result: SeparationResult
    stem_artifact_names: tuple[str, ...]
    retained_native_artifact_names: tuple[str, ...] = ()
    result_artifact_name: str = "separation-result.json"
    metrics: Metrics = field(default_factory=Metrics)


@runtime_checkable
class Separator(Protocol):
    """One candidate stem-separator implementation.

    Implementations advertise their identity as class attributes so a
    dispatcher can build them without touching per-candidate config yet.
    ``ConfigModel`` is the strict pydantic model used to validate the raw
    ``StageSpecification.config`` mapping into a typed config instance.
    """

    candidate_id: ClassVar[str]
    implementation_version: ClassVar[str]
    ConfigModel: ClassVar[type[BaseSeparatorStageConfig]]

    def separate(self, request: SeparatorRequest) -> SeparatorResponse: ...


class SeparatorNotImplementedError(ExpectedStageFailure):
    """Typed failure raised by stub separators before real inference lands.

    Uses the shared ``TypedError`` contract with a non-retryable
    ``separator.not_implemented`` code so the orchestrator publishes a clean
    ``FAILED_TERMINAL`` result rather than a Python traceback.
    """

    def __init__(self, candidate_id: str, *, message: str | None = None) -> None:
        error = TypedError(
            code="separator.not_implemented",
            message=(
                message
                or f"separator {candidate_id!r} has no inference implementation yet"
            ),
            retryable=False,
            details={"candidate_id": candidate_id},
        )
        super().__init__(error)
