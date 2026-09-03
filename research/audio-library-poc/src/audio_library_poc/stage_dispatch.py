"""Stage-kind → executor registry used by the orchestrator and CLI."""

from __future__ import annotations

from collections.abc import Callable
from pathlib import Path

from audio_library_poc.beat_this_stage import (
    BEAT_THIS_STAGE_KIND,
    BeatThisStageExecutor,
)
from audio_library_poc.execution import ExpectedStageFailure, StageExecutor
from audio_library_poc.fake_stage import FakeStage
from audio_library_poc.models import StageSpecification, TypedError
from audio_library_poc.separator_stage import SeparatorStageExecutor
from audio_library_poc.separators.bs_roformer import (
    BS_ROFORMER_STAGE_KIND,
    BsRoformerSeparator,
)
from audio_library_poc.separators.demucs import (
    DEMUCS_HTDEMUCS_6S_STAGE_KIND,
    DemucsSeparator,
)

FAKE_STAGE_KIND = "fake.deterministic"

StageExecutorFactory = Callable[[Path], StageExecutor]

_STAGE_KIND_REGISTRY: dict[str, StageExecutorFactory] = {
    FAKE_STAGE_KIND: lambda _workspace: FakeStage(),
    BS_ROFORMER_STAGE_KIND: lambda workspace: SeparatorStageExecutor(
        BsRoformerSeparator(),
        workspace,
    ),
    DEMUCS_HTDEMUCS_6S_STAGE_KIND: lambda workspace: SeparatorStageExecutor(
        DemucsSeparator(),
        workspace,
    ),
    BEAT_THIS_STAGE_KIND: lambda workspace: BeatThisStageExecutor(workspace),
}


def known_stage_kinds() -> tuple[str, ...]:
    """Return the stable, sorted set of registered stage kinds."""

    return tuple(sorted(_STAGE_KIND_REGISTRY))


def build_stage_dispatcher(
    workspace: Path,
) -> Callable[[StageSpecification], StageExecutor]:
    """Return a dispatcher that resolves per-stage executors from the registry.

    Unknown stage kinds raise ``ExpectedStageFailure`` with a typed error so
    the orchestrator publishes a clean ``FAILED_TERMINAL`` result instead of
    a Python traceback.
    """

    workspace_root = Path(workspace)

    def dispatcher(specification: StageSpecification) -> StageExecutor:
        factory = _STAGE_KIND_REGISTRY.get(specification.stage_kind)
        if factory is None:
            raise ExpectedStageFailure(
                TypedError(
                    code="stage.unknown_kind",
                    message=(
                        f"pipeline references unknown stage_kind "
                        f"{specification.stage_kind!r}"
                    ),
                    retryable=False,
                    details={"known_kinds": list(known_stage_kinds())},
                )
            )
        return factory(workspace_root)

    return dispatcher
