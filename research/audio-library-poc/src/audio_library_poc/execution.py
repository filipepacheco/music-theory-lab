"""Neutral execution contracts shared by stage adapters and orchestration."""

from __future__ import annotations

from pathlib import Path
from typing import Protocol, Self

from pydantic import ConfigDict, Field, StrictBool, field_validator, model_validator

from audio_library_poc.models import (
    ContractModel,
    Identifier,
    Metrics,
    StageIdentity,
    StageSpecification,
    TypedError,
)
from audio_library_poc.paths import validate_portable_filename


class StagedArtifact(ContractModel):
    """One immutable file descriptor proposed from an attempt staging area."""

    model_config = ConfigDict(frozen=True, revalidate_instances="always")

    artifact_name: str = Field(min_length=1)
    artifact_kind: Identifier
    media_type: str = Field(min_length=1)
    durable: StrictBool

    @field_validator("artifact_name")
    @classmethod
    def validate_artifact_name(cls, value: str) -> str:
        return validate_artifact_filename(value)

    @field_validator("media_type")
    @classmethod
    def validate_media_type(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("media_type must not be blank")
        return value


class StageOutput(ContractModel):
    """Strict manifest for files completed inside an attempt staging area."""

    model_config = ConfigDict(frozen=True, revalidate_instances="always")

    artifacts: tuple[StagedArtifact, ...] = Field(min_length=1)
    metrics: Metrics = Field(default_factory=Metrics)

    @model_validator(mode="after")
    def validate_bundle(self) -> Self:
        names = [artifact.artifact_name.casefold() for artifact in self.artifacts]
        if len(names) != len(set(names)):
            raise ValueError("artifact_name values must be case-insensitively unique")
        if "attempts" in self.metrics.counters:
            raise ValueError("metrics.counters.attempts is reserved for orchestration")
        return self


def validate_artifact_filename(value: str) -> str:
    """Re-export the shared portable filename contract for stage adapters."""

    return validate_portable_filename(value)


class ExpectedStageFailure(RuntimeError):
    """Expected stage failure carrying the shared typed error contract."""

    def __init__(self, error: TypedError) -> None:
        super().__init__(error.message)
        self.error = error


class StageInterruption(RuntimeError):
    """Abrupt stop after local work but before result publication."""


class StageExecutor(Protocol):
    """Adapter boundary implemented by fake and future real stages."""

    def execute(
        self,
        *,
        specification: StageSpecification,
        identity: StageIdentity,
        cache_key: str,
        attempt: int,
        staging_directory: Path,
    ) -> StageOutput: ...
