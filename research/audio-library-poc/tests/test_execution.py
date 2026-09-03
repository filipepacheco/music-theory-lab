import pytest
from pydantic import ValidationError

from audio_library_poc.execution import (
    StagedArtifact,
    StageOutput,
    validate_artifact_filename,
)


@pytest.mark.parametrize(
    "filename",
    [
        "CON",
        "con.json",
        "PrN.txt",
        "AUX",
        "aux.result.json",
        "nul.bin",
        "COM1",
        "com9.wav",
        "COM¹",
        "com².wav",
        "CoM³.output.json",
        "LPT1.log",
        "lpt9.output.json",
        "LPT¹",
        "lpt².log",
        "LpT³.output.json",
    ],
)
def test_validate_artifact_filename_rejects_windows_device_names(
    filename: str,
) -> None:
    with pytest.raises(ValueError, match="reserved on Windows"):
        validate_artifact_filename(filename)


@pytest.mark.parametrize(
    "filename",
    [
        "artifact.",
        "artifact ",
        "result.json.",
        "result.json ",
    ],
)
def test_validate_artifact_filename_rejects_trailing_dots_and_spaces(
    filename: str,
) -> None:
    with pytest.raises(ValueError, match="dot or space"):
        validate_artifact_filename(filename)


@pytest.mark.parametrize("character", ["<", ">", '"', "|", "?", "*"])
def test_validate_artifact_filename_rejects_windows_invalid_punctuation(
    character: str,
) -> None:
    with pytest.raises(ValueError, match="Windows-invalid"):
        validate_artifact_filename(f"artifact{character}.json")


@pytest.mark.parametrize("character", ["\x00", "\x01", "\t", "\n", "\x1f"])
def test_validate_artifact_filename_rejects_control_characters(
    character: str,
) -> None:
    with pytest.raises(ValueError, match="control characters"):
        validate_artifact_filename(f"artifact{character}.json")


@pytest.mark.parametrize(
    "filename",
    [
        "",
        ".",
        "..",
        "../escape.json",
        r"nested\artifact.json",
        "/absolute.json",
        r"C:\absolute.json",
        "C:drive-relative.json",
        "artifact:stream.json",
    ],
)
def test_validate_artifact_filename_preserves_existing_path_rejections(
    filename: str,
) -> None:
    with pytest.raises(ValueError):
        validate_artifact_filename(filename)


@pytest.mark.parametrize(
    "filename",
    [
        "artifact.json",
        "console.json",
        "auxiliary.txt",
        "com0.wav",
        "com10.wav",
        "lpt0.log",
        "lpt10.log",
        "mix result.json",
    ],
)
def test_validate_artifact_filename_accepts_portable_names(filename: str) -> None:
    assert validate_artifact_filename(filename) == filename


def test_staged_artifact_validates_artifact_name_at_construction() -> None:
    with pytest.raises(ValidationError, match="Windows-invalid"):
        StagedArtifact(
            artifact_name="invalid?.json",
            artifact_kind="fake.result",
            media_type="application/json",
            durable=True,
        )


def valid_staged_artifact_data() -> dict[str, object]:
    return {
        "artifact_name": "result.json",
        "artifact_kind": "fake.result",
        "media_type": "application/json",
        "durable": True,
    }


def valid_stage_output_data() -> dict[str, object]:
    return {"artifacts": [valid_staged_artifact_data()]}


def test_staged_artifact_is_strict_immutable_and_forbids_extra_fields() -> None:
    artifact = StagedArtifact.model_validate(valid_staged_artifact_data())

    with pytest.raises(ValidationError, match="frozen"):
        artifact.media_type = "text/plain"

    with pytest.raises(ValidationError, match="extra"):
        StagedArtifact.model_validate({**valid_staged_artifact_data(), "unexpected": 1})


def test_stage_output_is_strict_immutable_and_forbids_extra_fields() -> None:
    output = StageOutput.model_validate(valid_stage_output_data())

    with pytest.raises(ValidationError, match="frozen"):
        output.artifacts = ()

    with pytest.raises(ValidationError, match="extra"):
        StageOutput.model_validate({**valid_stage_output_data(), "unexpected": 1})


@pytest.mark.parametrize(
    ("field", "invalid_value"),
    [
        ("artifact_name", "../escape.json"),
        ("artifact_kind", "Invalid Kind"),
        ("media_type", "   "),
        ("durable", 1),
    ],
)
def test_staged_artifact_rejects_invalid_contract_fields(
    field: str,
    invalid_value: object,
) -> None:
    data = valid_staged_artifact_data()
    data[field] = invalid_value

    with pytest.raises(ValidationError, match=field):
        StagedArtifact.model_validate(data)


@pytest.mark.parametrize(
    ("field", "invalid_value"),
    [
        ("artifact_name", "../escape.json"),
        ("artifact_kind", "Invalid Kind"),
        ("media_type", ""),
        ("durable", "true"),
    ],
)
def test_staged_artifact_revalidates_bypassed_instances(
    field: str,
    invalid_value: object,
) -> None:
    data = valid_staged_artifact_data()
    data[field] = invalid_value
    bypassed = StagedArtifact.model_construct(**data)

    with pytest.raises(ValidationError, match=field):
        StagedArtifact.model_validate(bypassed)


def test_stage_output_requires_nonempty_unique_artifacts() -> None:
    with pytest.raises(ValidationError, match="at least 1"):
        StageOutput(artifacts=())

    duplicate = StagedArtifact.model_validate(valid_staged_artifact_data())
    with pytest.raises(ValidationError, match="case-insensitively unique"):
        StageOutput(artifacts=(duplicate, duplicate))

    case_variant = duplicate.model_copy(update={"artifact_name": "RESULT.JSON"})
    with pytest.raises(ValidationError, match="case-insensitively unique"):
        StageOutput(artifacts=(duplicate, case_variant))


def test_stage_output_contains_descriptors_not_artifact_bytes() -> None:
    output = StageOutput.model_validate(valid_stage_output_data())

    assert not hasattr(output, "content")
    assert not hasattr(output.artifacts[0], "content")


def test_stage_output_reserves_attempt_metrics_for_orchestration() -> None:
    with pytest.raises(ValidationError, match="reserved for orchestration"):
        StageOutput(
            artifacts=[valid_staged_artifact_data()],
            metrics={"counters": {"attempts": 1}},
        )


@pytest.mark.parametrize(
    "filename",
    [
        "mix resultado.json",
        "análise harmônica.json",
        "和声.json",
    ],
)
def test_validate_artifact_filename_accepts_unicode_and_internal_spaces(
    filename: str,
) -> None:
    assert validate_artifact_filename(filename) == filename
