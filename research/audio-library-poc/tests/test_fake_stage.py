import json

import pytest

from audio_library_poc.cache import hash_config, stage_cache_key
from audio_library_poc.execution import (
    ExpectedStageFailure,
    StageInterruption,
    StageOutput,
)
from audio_library_poc.fake_stage import FakeStage
from audio_library_poc.models import StageIdentity, StageSpecification

INPUT_SHA256 = "a" * 64
CODE_REVISION = "test-revision"


def fake_specification(**config: object) -> StageSpecification:
    return StageSpecification(
        stage_kind="fake.metadata",
        implementation_version="1.0.0",
        config=config,
    )


def execute_fake(tmp_path, specification, *, attempt: int):
    identity = StageIdentity(
        stage_kind=specification.stage_kind,
        input_sha256=INPUT_SHA256,
        implementation_version=specification.implementation_version,
        config_sha256=hash_config(specification.config),
        output_schema_version=specification.output_schema_version,
        model_identifier=specification.model_identifier,
        model_sha256=specification.model_sha256,
        code_revision=CODE_REVISION,
    )
    cache_key = stage_cache_key(identity)
    return FakeStage().execute(
        specification=specification,
        identity=identity,
        cache_key=cache_key,
        attempt=attempt,
        staging_directory=tmp_path / f"attempt-{attempt}",
    )


def test_fake_stage_output_is_deterministic_across_attempts(tmp_path) -> None:
    specification = fake_specification(payload={"label": "fixture"})

    first = execute_fake(tmp_path, specification, attempt=1)
    repeated = execute_fake(tmp_path, specification, attempt=7)

    assert isinstance(first, StageOutput)
    assert StageOutput.model_validate(first) == first
    assert not hasattr(first, "content")
    assert first.artifacts[0].artifact_name == "fake-result.json"
    first_path = tmp_path / "attempt-1" / first.artifacts[0].artifact_name
    repeated_path = tmp_path / "attempt-7" / repeated.artifacts[0].artifact_name
    assert first_path.read_bytes() == repeated_path.read_bytes()
    assert json.loads(first_path.read_bytes()) == {
        "cache_key": (
            "1ca6fdf2f4f600ee651ca0ddb9b54d4ea5714bb830210ded1318f3ba95eb15fa"
        ),
        "identity": {
            "stage_kind": "fake.metadata",
            "input_sha256": "a" * 64,
            "implementation_version": "1.0.0",
            "config_sha256": (
                "60c963c13881a9078531d90d7545b20b717a6bd68e483396201d927720706613"
            ),
            "output_schema_version": "1.0.0",
            "model_identifier": None,
            "model_sha256": None,
            "code_revision": CODE_REVISION,
        },
        "payload": {"label": "fixture"},
        "schema_version": "1.0.0",
    }


def test_fake_stage_retries_for_configured_attempts_then_succeeds(tmp_path) -> None:
    specification = fake_specification(retryable_failures=2)

    for attempt in (1, 2):
        with pytest.raises(ExpectedStageFailure) as captured:
            execute_fake(tmp_path, specification, attempt=attempt)

        assert captured.value.error.code == "fake.retryable"
        assert captured.value.error.retryable is True
        assert captured.value.error.details == {"attempt": attempt}

    output = execute_fake(tmp_path, specification, attempt=3)
    assert (tmp_path / "attempt-3" / output.artifacts[0].artifact_name).is_file()


def test_fake_stage_can_fail_terminally(tmp_path) -> None:
    specification = fake_specification(terminal_failure=True)

    with pytest.raises(ExpectedStageFailure) as captured:
        execute_fake(tmp_path, specification, attempt=1)

    assert captured.value.error.code == "fake.terminal"
    assert captured.value.error.retryable is False


def test_fake_stage_can_interrupt_before_publication(tmp_path) -> None:
    specification = fake_specification(interrupt_attempts=[1])
    interrupted_staging = tmp_path / "attempt-1"

    with pytest.raises(StageInterruption):
        execute_fake(tmp_path, specification, attempt=1)

    assert (interrupted_staging / "fake-result.json.partial").exists()
    assert not (interrupted_staging / "fake-result.json").exists()
    output = execute_fake(tmp_path, specification, attempt=2)
    assert (tmp_path / "attempt-2" / output.artifacts[0].artifact_name).is_file()
