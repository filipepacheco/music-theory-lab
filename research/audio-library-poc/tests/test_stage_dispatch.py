"""Tests for the stage-kind dispatcher registry and its orchestrator seam."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from audio_library_poc.beat_this_stage import (
    BEAT_THIS_STAGE_KIND,
    BeatThisStageExecutor,
)
from audio_library_poc.execution import ExpectedStageFailure
from audio_library_poc.fake_stage import FakeStage
from audio_library_poc.models import (
    StageResultEnvelope,
    StageSpecification,
    StageStatus,
)
from audio_library_poc.orchestrator import StageOrchestrator
from audio_library_poc.separator_stage import SeparatorStageExecutor
from audio_library_poc.separators import (
    BS_ROFORMER_STAGE_KIND,
    DEMUCS_HTDEMUCS_6S_STAGE_KIND,
)
from audio_library_poc.stage_dispatch import (
    FAKE_STAGE_KIND,
    build_stage_dispatcher,
    known_stage_kinds,
)

INPUT_SHA256 = "a" * 64
CODE_REVISION = "test-revision"


def test_known_stage_kinds_are_stable_and_sorted() -> None:
    assert known_stage_kinds() == (
        BEAT_THIS_STAGE_KIND,
        FAKE_STAGE_KIND,
        BS_ROFORMER_STAGE_KIND,
        DEMUCS_HTDEMUCS_6S_STAGE_KIND,
    )


def test_dispatcher_returns_beat_this_stage_for_beat_kind(tmp_path: Path) -> None:
    dispatcher = build_stage_dispatcher(tmp_path)
    executor = dispatcher(
        StageSpecification(
            stage_kind=BEAT_THIS_STAGE_KIND,
            implementation_version="1.0.0",
        )
    )
    assert isinstance(executor, BeatThisStageExecutor)


def test_dispatcher_returns_fake_stage_for_fake_kind(tmp_path: Path) -> None:
    dispatcher = build_stage_dispatcher(tmp_path)
    executor = dispatcher(
        StageSpecification(stage_kind=FAKE_STAGE_KIND, implementation_version="1.0.0")
    )
    assert isinstance(executor, FakeStage)


def test_dispatcher_returns_separator_stage_for_bs_roformer(tmp_path: Path) -> None:
    dispatcher = build_stage_dispatcher(tmp_path)
    executor = dispatcher(
        StageSpecification(
            stage_kind=BS_ROFORMER_STAGE_KIND,
            implementation_version="0.0.0",
        )
    )
    assert isinstance(executor, SeparatorStageExecutor)


def test_dispatcher_returns_separator_stage_for_demucs(tmp_path: Path) -> None:
    dispatcher = build_stage_dispatcher(tmp_path)
    executor = dispatcher(
        StageSpecification(
            stage_kind=DEMUCS_HTDEMUCS_6S_STAGE_KIND,
            implementation_version="0.0.0",
        )
    )
    assert isinstance(executor, SeparatorStageExecutor)


def test_dispatcher_raises_expected_stage_failure_for_unknown_kind(
    tmp_path: Path,
) -> None:
    dispatcher = build_stage_dispatcher(tmp_path)
    with pytest.raises(ExpectedStageFailure) as captured:
        dispatcher(
            StageSpecification(
                stage_kind="separator.nonexistent",
                implementation_version="0.0.0",
            )
        )
    assert captured.value.error.code == "stage.unknown_kind"
    assert captured.value.error.retryable is False
    assert "separator.nonexistent" in captured.value.error.details[
        "known_kinds"
    ] or captured.value.error.details["known_kinds"] == list(known_stage_kinds())


def test_orchestrator_rejects_executor_and_dispatcher_together(tmp_path: Path) -> None:
    with pytest.raises(ValueError, match="either executor or dispatcher"):
        StageOrchestrator(
            tmp_path,
            executor=FakeStage(),
            dispatcher=build_stage_dispatcher(tmp_path),
        )


def test_orchestrator_publishes_failed_terminal_for_unknown_kind(
    tmp_path: Path,
) -> None:
    workspace = tmp_path / "workspace"
    orchestrator = StageOrchestrator(
        workspace,
        dispatcher=build_stage_dispatcher(workspace),
    )
    specification = StageSpecification(
        stage_kind="separator.nonexistent",
        implementation_version="0.0.0",
        max_attempts=3,
    )

    result = orchestrator.run_stage(
        run_id="run-unknown",
        specification=specification,
        input_sha256=INPUT_SHA256,
        code_revision=CODE_REVISION,
    )

    assert isinstance(result, StageResultEnvelope)
    assert result.status is StageStatus.FAILED_TERMINAL
    assert result.error is not None
    assert result.error.code == "stage.unknown_kind"
    assert result.attempt == 1

    events_path = workspace / "runs" / "run-unknown" / "events.jsonl"
    event_names = [
        json.loads(line)["event_name"]
        for line in events_path.read_text(encoding="utf-8").splitlines()
    ]
    assert event_names == ["stage.failed_terminal"]


def test_orchestrator_dispatches_fake_stage_through_the_registry(
    tmp_path: Path,
) -> None:
    workspace = tmp_path / "workspace"
    orchestrator = StageOrchestrator(
        workspace,
        dispatcher=build_stage_dispatcher(workspace),
    )
    specification = StageSpecification(
        stage_kind=FAKE_STAGE_KIND,
        implementation_version="1.0.0",
        config={"payload": {"label": "dispatched"}},
    )

    result = orchestrator.run_stage(
        run_id="run-dispatched",
        specification=specification,
        input_sha256=INPUT_SHA256,
        code_revision=CODE_REVISION,
    )

    assert result.status is StageStatus.SUCCEEDED
    assert result.artifacts[0].artifact_kind == "fake.result"
