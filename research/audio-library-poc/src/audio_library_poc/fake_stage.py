"""Deterministic stage double for exercising orchestration behavior."""

from __future__ import annotations

from pathlib import Path

from pydantic import Field, JsonValue, ValidationError

from audio_library_poc.execution import (
    ExpectedStageFailure,
    StagedArtifact,
    StageInterruption,
    StageOutput,
)
from audio_library_poc.io import atomic_write_json, canonical_json_bytes
from audio_library_poc.models import (
    ContractModel,
    StageIdentity,
    StageSpecification,
    TypedError,
)


class FakeStageConfig(ContractModel):
    """Behavior controls stored inside ``StageSpecification.config``."""

    retryable_failures: int = Field(default=0, ge=0)
    terminal_failure: bool = False
    interrupt_attempts: list[int] = Field(default_factory=list)
    payload: JsonValue = Field(default_factory=dict)


FakeStageError = ExpectedStageFailure
FakeStageOutput = StageOutput
SimulatedInterruption = StageInterruption


class FakeStage:
    """Produce attempt-independent bytes from the committed stage identity."""

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
        try:
            config = FakeStageConfig.model_validate(specification.config)
        except ValidationError as exc:
            raise ExpectedStageFailure(
                TypedError(
                    code="fake.invalid_config",
                    message="fake stage configuration is invalid",
                    retryable=False,
                    details={"exception_type": type(exc).__name__},
                )
            ) from exc

        payload = {
            "schema_version": "1.0.0",
            "identity": identity.model_dump(mode="json"),
            "cache_key": cache_key,
            "payload": config.payload,
        }
        staging = Path(staging_directory)

        if attempt in config.interrupt_attempts:
            staging.mkdir(parents=True, exist_ok=True)
            (staging / "fake-result.json.partial").write_bytes(
                canonical_json_bytes(payload)
            )
            raise StageInterruption(f"simulated interruption during attempt {attempt}")

        if config.terminal_failure:
            raise ExpectedStageFailure(
                TypedError(
                    code="fake.terminal",
                    message="fake stage produced a terminal failure",
                    retryable=False,
                    details={"attempt": attempt},
                )
            )

        if attempt <= config.retryable_failures:
            raise ExpectedStageFailure(
                TypedError(
                    code="fake.retryable",
                    message="fake stage produced a retryable failure",
                    retryable=True,
                    details={"attempt": attempt},
                )
            )

        atomic_write_json(staging / "fake-result.json", payload)
        return StageOutput(
            artifacts=(
                StagedArtifact(
                    artifact_name="fake-result.json",
                    artifact_kind="fake.result",
                    media_type="application/json",
                    durable=False,
                ),
            )
        )
