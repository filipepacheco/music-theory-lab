import pytest
from pydantic import ValidationError

from audio_library_poc.cache import hash_config, stage_cache_key
from audio_library_poc.models import (
    ArtifactReference,
    Metrics,
    PipelineManifest,
    StageIdentity,
    StageResultEnvelope,
    TypedError,
)


def stage_identity() -> StageIdentity:
    return StageIdentity(
        stage_kind="fake.metadata",
        input_sha256="a" * 64,
        implementation_version="1.0.0",
        config_sha256="d" * 64,
        output_schema_version="1.0.0",
        code_revision="working-tree",
    )


def artifact_reference() -> ArtifactReference:
    return ArtifactReference(
        artifact_kind="fake.result",
        path="artifacts/result.json",
        sha256="b" * 64,
        size_bytes=42,
        media_type="application/json",
        durable=True,
    )


def stage_error(*, retryable: bool) -> TypedError:
    return TypedError(
        code="fake.failure",
        message="fake stage failed",
        retryable=retryable,
    )


def test_pipeline_and_result_capture_reproducibility_provenance() -> None:
    pipeline = PipelineManifest.model_validate(
        {
            "schema_version": "1.0.0",
            "pipeline_id": "phase-1-fake",
            "code_revision": "working-tree",
            "stages": [
                {
                    "stage_kind": "fake.metadata",
                    "implementation_version": "1.0.0",
                    "output_schema_version": "1.0.0",
                    "config": {"label": "metadata"},
                    "model_identifier": "fixture-model",
                    "model_sha256": "e" * 64,
                }
            ],
        }
    )
    specification = pipeline.stages[0]
    identity = StageIdentity(
        stage_kind=specification.stage_kind,
        input_sha256="a" * 64,
        implementation_version=specification.implementation_version,
        config_sha256=hash_config(specification.config),
        output_schema_version=specification.output_schema_version,
        model_identifier=specification.model_identifier,
        model_sha256=specification.model_sha256,
        code_revision=pipeline.code_revision,
    )
    artifact = ArtifactReference(
        artifact_kind="fake.result",
        path="artifacts/result.json",
        sha256="b" * 64,
        size_bytes=42,
        media_type="application/json",
        durable=True,
    )
    result = StageResultEnvelope(
        identity=identity,
        cache_key=stage_cache_key(identity),
        status="succeeded",
        attempt=1,
        artifacts=[artifact],
        metrics=Metrics(
            duration_seconds=0.25,
            counters={"attempts": 1, "records": 1},
        ),
    )
    serialized = result.model_dump(mode="json")

    assert pipeline.stages[0].config == {"label": "metadata"}
    assert result.artifacts[0].durable is True
    assert result.stage_kind == identity.stage_kind
    assert result.input_sha256 == identity.input_sha256
    assert result.implementation_version == identity.implementation_version
    assert result.config_sha256 == identity.config_sha256
    assert result.output_schema_version == identity.output_schema_version
    assert result.model_identifier == identity.model_identifier
    assert result.model_sha256 == identity.model_sha256
    assert result.code_revision == identity.code_revision
    assert result.attempt == 1
    assert serialized["schema_version"] == "2.0.0"
    assert serialized["identity"] == identity.model_dump(mode="json")
    assert "stage_kind" not in serialized
    assert "input_sha256" not in serialized


def test_failed_stage_result_requires_a_typed_error() -> None:
    identity = stage_identity()

    with pytest.raises(ValidationError, match="error"):
        StageResultEnvelope(
            identity=identity,
            cache_key=stage_cache_key(identity),
            status="failed_retryable",
            attempt=1,
            metrics=Metrics(),
        )


@pytest.mark.parametrize("status", ["queued", "running"])
def test_stage_result_rejects_noncanonical_statuses(status: str) -> None:
    identity = stage_identity()

    with pytest.raises(ValidationError, match="status"):
        StageResultEnvelope(
            identity=identity,
            cache_key=stage_cache_key(identity),
            status=status,
            attempt=0,
        )


@pytest.mark.parametrize(
    ("status", "attempt", "artifacts"),
    [
        ("succeeded", 1, [artifact_reference()]),
        ("paused", 0, []),
        ("cancelled", 0, []),
    ],
)
def test_non_failed_canonical_results_reject_errors(
    status: str,
    attempt: int,
    artifacts: list[ArtifactReference],
) -> None:
    identity = stage_identity()

    with pytest.raises(ValidationError, match="error must be absent"):
        StageResultEnvelope(
            identity=identity,
            cache_key=stage_cache_key(identity),
            status=status,
            attempt=attempt,
            artifacts=artifacts,
            error=stage_error(retryable=False),
        )


@pytest.mark.parametrize(
    ("status", "error", "artifacts"),
    [
        ("succeeded", None, [artifact_reference()]),
        ("failed_retryable", stage_error(retryable=True), []),
        ("failed_terminal", stage_error(retryable=False), []),
    ],
)
def test_committed_attempt_results_require_a_positive_attempt(
    status: str,
    error: TypedError | None,
    artifacts: list[ArtifactReference],
) -> None:
    identity = stage_identity()

    with pytest.raises(ValidationError, match="attempt must be at least 1"):
        StageResultEnvelope(
            identity=identity,
            cache_key=stage_cache_key(identity),
            status=status,
            attempt=0,
            artifacts=artifacts,
            error=error,
        )


def test_succeeded_result_requires_an_artifact() -> None:
    identity = stage_identity()

    with pytest.raises(ValidationError, match="at least one artifact"):
        StageResultEnvelope(
            identity=identity,
            cache_key=stage_cache_key(identity),
            status="succeeded",
            attempt=1,
        )


@pytest.mark.parametrize(
    ("status", "error"),
    [
        ("failed_retryable", stage_error(retryable=True)),
        ("failed_terminal", stage_error(retryable=False)),
        ("paused", None),
        ("cancelled", None),
    ],
)
def test_non_artifact_result_statuses_reject_artifacts(
    status: str,
    error: TypedError | None,
) -> None:
    identity = stage_identity()

    with pytest.raises(ValidationError, match="must not contain artifacts"):
        StageResultEnvelope(
            identity=identity,
            cache_key=stage_cache_key(identity),
            status=status,
            attempt=1,
            artifacts=[artifact_reference()],
            error=error,
        )


def test_attempts_metric_must_match_explicit_attempt() -> None:
    identity = stage_identity()

    with pytest.raises(ValidationError, match="must match attempt"):
        StageResultEnvelope(
            identity=identity,
            cache_key=stage_cache_key(identity),
            status="paused",
            attempt=0,
            metrics=Metrics(counters={"attempts": 1}),
        )


@pytest.mark.parametrize(
    "path",
    [
        "/absolute/result.json",
        r"C:\absolute\result.json",
        "D:drive-relative.json",
        r"\\server\share\result.json",
        "../escape.json",
        "artifacts/../escape.json",
        "./result.json",
        "artifacts/./result.json",
        "artifacts//result.json",
        "artifacts/",
        "artifacts/CON.json",
        "artifacts/COM¹.json",
        "artifacts/com².output.json",
        "artifacts/CoM³",
        "artifacts/LPT¹.json",
        "artifacts/lpt².output.json",
        "artifacts/LpT³",
        "artifacts/invalid?.json",
        "artifacts/control\x1f.json",
    ],
)
def test_artifact_reference_rejects_nonportable_paths(path: str) -> None:
    with pytest.raises(ValidationError, match="path"):
        ArtifactReference(
            artifact_kind="fake.result",
            path=path,
            sha256="b" * 64,
            size_bytes=42,
        )


@pytest.mark.parametrize(
    ("path", "expected"),
    [
        ("result.json", "result.json"),
        ("artifacts/stage/result.json", "artifacts/stage/result.json"),
        (r"artifacts\stage\result.json", "artifacts/stage/result.json"),
        ("artefatos/análise harmônica.json", "artefatos/análise harmônica.json"),
    ],
)
def test_artifact_reference_normalizes_valid_workspace_relative_paths(
    path: str,
    expected: str,
) -> None:
    artifact = ArtifactReference(
        artifact_kind="fake.result",
        path=path,
        sha256="b" * 64,
        size_bytes=42,
    )

    assert artifact.path == expected
