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
    source_path: Path
    source_sha256: str
    staging_directory: Path
    config: BaseSeparatorStageConfig
    stage_identity: StageIdentity


@dataclass(frozen=True)
class SeparatorResponse:
    result: SeparationResult
    stem_artifact_names: tuple[str, ...]
    retained_native_artifact_names: tuple[str, ...] = ()
    result_artifact_name: str = "separation-result.json"
    metrics: Metrics = field(default_factory=Metrics)


@runtime_checkable
class Separator(Protocol):
    candidate_id: ClassVar[str]
    implementation_version: ClassVar[str]
    ConfigModel: ClassVar[type[BaseSeparatorStageConfig]]

    def separate(self, request: SeparatorRequest) -> SeparatorResponse: ...


class SeparatorNotImplementedError(ExpectedStageFailure):
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
