import hashlib
import json

import pytest

import audio_library_poc.orchestrator as orchestrator_module
from audio_library_poc.cache import hash_config, stage_cache_key
from audio_library_poc.events import read_events
from audio_library_poc.execution import (
    ExpectedStageFailure,
    StagedArtifact,
    StageOutput,
)
from audio_library_poc.fake_stage import SimulatedInterruption
from audio_library_poc.io import atomic_write_json as atomic_write_json_without_crash
from audio_library_poc.models import (
    Metrics,
    StageIdentity,
    StageSpecification,
    StageStatus,
    TypedError,
)
from audio_library_poc.orchestrator import (
    PathEntryKind,
    StageOrchestrator,
)

INPUT_SHA256 = "a" * 64
CODE_REVISION = "test-revision"


def fake_specification(
    *,
    stage_kind: str = "fake.metadata",
    implementation_version: str = "1.0.0",
    output_schema_version: str = "1.0.0",
    model_identifier: str | None = None,
    model_sha256: str | None = None,
    max_attempts: int = 3,
    **config: object,
) -> StageSpecification:
    return StageSpecification(
        stage_kind=stage_kind,
        implementation_version=implementation_version,
        output_schema_version=output_schema_version,
        model_identifier=model_identifier,
        model_sha256=model_sha256,
        config=config,
        max_attempts=max_attempts,
    )


def identity(
    specification,
    input_sha256=INPUT_SHA256,
    code_revision=CODE_REVISION,
):
    stage_identity = StageIdentity(
        stage_kind=specification.stage_kind,
        input_sha256=input_sha256,
        implementation_version=specification.implementation_version,
        config_sha256=hash_config(specification.config),
        output_schema_version=specification.output_schema_version,
        model_identifier=specification.model_identifier,
        model_sha256=specification.model_sha256,
        code_revision=code_revision,
    )
    return stage_identity, stage_cache_key(stage_identity)


def stage_root(workspace, run_id="run-01"):
    return workspace / "runs" / run_id / "stages" / "fake.metadata"


class NeverExecutor:
    def __init__(self) -> None:
        self.calls = 0

    def execute(self, **_kwargs):
        self.calls += 1
        raise AssertionError("a committed result must not execute again")


class InjectedPublicationCrash(RuntimeError):
    pass


def crash_after_write(monkeypatch, target_path) -> None:
    crashed = False

    def write_then_crash(path, value) -> None:
        nonlocal crashed
        atomic_write_json_without_crash(path, value)
        if not crashed and path == target_path:
            crashed = True
            raise InjectedPublicationCrash

    monkeypatch.setattr(
        orchestrator_module,
        "atomic_write_json",
        write_then_crash,
    )


def crash_after_artifact_write(monkeypatch) -> None:
    publish_without_crash = StageOrchestrator._publish_staged_bundle
    crashed = False

    def publish_then_crash(self, paths, prepared):
        nonlocal crashed
        published = publish_without_crash(self, paths, prepared)
        if not crashed:
            crashed = True
            raise InjectedPublicationCrash
        return published

    monkeypatch.setattr(
        StageOrchestrator,
        "_publish_staged_bundle",
        publish_then_crash,
    )


class UnsafeArtifactExecutor:
    def __init__(
        self,
        artifact_name: str,
        *,
        artifact_kind: str = "fake.result",
    ) -> None:
        self.artifact_name = artifact_name
        self.artifact_kind = artifact_kind

    def execute(self, **_kwargs):
        return StageOutput.model_construct(
            artifacts=(
                StagedArtifact.model_construct(
                    artifact_name=self.artifact_name,
                    artifact_kind=self.artifact_kind,
                    media_type="application/json",
                    durable=False,
                ),
            ),
            metrics=Metrics(),
        )


class OneAttemptSuccessExecutor:
    def __init__(self) -> None:
        self.attempts: list[int] = []

    def execute(self, *, attempt, staging_directory, **_kwargs):
        self.attempts.append(attempt)
        staging_directory.mkdir(parents=True, exist_ok=True)
        (staging_directory / "rebuilt-result.json").write_bytes(b'{"rebuilt":true}\n')
        return StageOutput(
            artifacts=(
                StagedArtifact(
                    artifact_name="rebuilt-result.json",
                    artifact_kind="fake.result",
                    media_type="application/json",
                    durable=False,
                ),
            )
        )


class BundleExecutor:
    def __init__(
        self,
        files: dict[str, bytes],
        *,
        declared_names: tuple[str, ...] | None = None,
        directories: tuple[str, ...] = (),
        metrics: Metrics | None = None,
    ) -> None:
        self.files = files
        self.declared_names = declared_names or tuple(files)
        self.directories = directories
        self.metrics = metrics or Metrics()
        self.attempts: list[int] = []

    def execute(self, *, attempt, staging_directory, **_kwargs):
        self.attempts.append(attempt)
        staging_directory.mkdir(parents=True, exist_ok=True)
        for name, payload in self.files.items():
            (staging_directory / name).write_bytes(payload)
        for name in self.directories:
            (staging_directory / name).mkdir()
        return StageOutput(
            artifacts=tuple(
                StagedArtifact(
                    artifact_name=name,
                    artifact_kind="test.artifact",
                    media_type="application/octet-stream",
                    durable=False,
                )
                for name in self.declared_names
            ),
            metrics=self.metrics,
        )


class PreResultCrashExecutor:
    def __init__(self, artifact_root, *, retryable_attempts: int = 0) -> None:
        self.artifact_root = artifact_root
        self.retryable_attempts = retryable_attempts
        self.attempts: list[int] = []

    def execute(self, *, attempt, staging_directory, **_kwargs):
        self.attempts.append(attempt)
        if attempt <= self.retryable_attempts:
            raise ExpectedStageFailure(
                TypedError(
                    code="test.retryable",
                    message="injected retryable failure",
                    retryable=True,
                    details={"attempt": attempt},
                )
            )
        staging = type(self.artifact_root)(staging_directory)
        first_artifact_attempt = self.retryable_attempts + 1
        if attempt != first_artifact_attempt:
            assert not self.artifact_root.exists()
            assert not staging.exists()
        staging.mkdir(parents=True)
        artifact_name = f"attempt-{attempt:04d}.json"
        (staging / artifact_name).write_bytes(f'{{"attempt":{attempt}}}\n'.encode())
        return StageOutput(
            artifacts=(
                StagedArtifact(
                    artifact_name=artifact_name,
                    artifact_kind="fake.result",
                    media_type="application/json",
                    durable=False,
                ),
            )
        )


@pytest.mark.parametrize(
    "artifact_name",
    [
        "../escape.json",
        "nested/escape.json",
        r"nested\escape.json",
        "/absolute/escape.json",
        r"C:\absolute\escape.json",
    ],
)
def test_artifact_paths_are_rejected_before_any_artifact_write(
    tmp_path,
    artifact_name,
    monkeypatch,
) -> None:
    specification = fake_specification()
    _, cache_key = identity(specification)
    artifact_root = stage_root(tmp_path) / "artifacts" / cache_key

    result = StageOrchestrator(
        tmp_path,
        executor=UnsafeArtifactExecutor(artifact_name),
    ).run_stage(
        run_id="run-01",
        specification=specification,
        input_sha256=INPUT_SHA256,
        code_revision=CODE_REVISION,
    )

    assert result.status is StageStatus.FAILED_TERMINAL
    assert result.attempt == result.metrics.counters["attempts"] == 1
    assert result.error is not None
    assert result.error.code == "stage.invalid_output"
    assert result.error.retryable is False
    assert result.artifacts == []
    assert not artifact_root.exists()
    assert not list(tmp_path.rglob("escape.json"))


@pytest.mark.parametrize(
    "blocked_kind",
    [PathEntryKind.SYMLINK, PathEntryKind.JUNCTION],
)
def test_artifact_publication_rejects_reparse_root_before_resolve_or_write(
    tmp_path,
    monkeypatch,
    blocked_kind,
) -> None:
    specification = fake_specification(max_attempts=1)
    _, cache_key = identity(specification)
    artifact_root = stage_root(tmp_path) / "artifacts" / cache_key
    protected_path = tmp_path / "originals" / "fake-result.json"
    protected_path.parent.mkdir(parents=True)
    protected_path.write_bytes(b"protected-original")
    protected_before = protected_path.read_bytes()
    inspected_paths = []

    def inspect_entry(path):
        inspected_paths.append(path)
        if path == artifact_root:
            return blocked_kind
        return PathEntryKind.REGULAR

    class ResettingExecutor:
        def execute(self, *, staging_directory, **_kwargs):
            inspected_paths.clear()
            staging_directory.mkdir(parents=True, exist_ok=True)
            (staging_directory / "fake-result.json").write_bytes(
                b"would-overwrite-protected-data"
            )
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

    orchestrator = StageOrchestrator(
        tmp_path,
        executor=ResettingExecutor(),
        path_entry_inspector=inspect_entry,
    )
    path_type = type(tmp_path)
    real_resolve = path_type.resolve
    resolved_paths = []

    def resolve_reparse_to_originals(path, *args, **kwargs):
        resolved_paths.append(path)
        if path == artifact_root:
            return protected_path.parent
        if path == artifact_root / protected_path.name:
            return protected_path
        return real_resolve(path, *args, **kwargs)

    monkeypatch.setattr(path_type, "resolve", resolve_reparse_to_originals)

    with pytest.raises(ValueError, match="symlink or junction"):
        orchestrator.run_stage(
            run_id="run-01",
            specification=specification,
            input_sha256=INPUT_SHA256,
            code_revision=CODE_REVISION,
        )

    expected_ancestors = [tmp_path]
    ancestor = tmp_path
    for component in artifact_root.relative_to(tmp_path).parts:
        ancestor /= component
        expected_ancestors.append(ancestor)
    assert any(
        inspected_paths[index : index + len(expected_ancestors)] == expected_ancestors
        for index in range(len(inspected_paths) - len(expected_ancestors) + 1)
    )
    assert artifact_root not in resolved_paths
    assert protected_path.read_bytes() == protected_before
    assert not artifact_root.exists()
    assert not list(tmp_path.rglob("*.tmp"))


def test_complete_executor_output_is_revalidated_before_publication(
    tmp_path,
    monkeypatch,
) -> None:
    specification = fake_specification()
    _, cache_key = identity(specification)
    root = stage_root(tmp_path)

    result = StageOrchestrator(
        tmp_path,
        executor=UnsafeArtifactExecutor(
            "would-be-orphan.json",
            artifact_kind="INVALID ARTIFACT KIND",
        ),
    ).run_stage(
        run_id="run-01",
        specification=specification,
        input_sha256=INPUT_SHA256,
        code_revision=CODE_REVISION,
    )

    persisted_result = json.loads(
        (root / "results" / f"{cache_key}.json").read_text(encoding="utf-8")
    )
    persisted_attempt = json.loads(
        (root / "attempts" / cache_key / "0001.json").read_text(encoding="utf-8")
    )
    state = json.loads(
        (root / "states" / f"{cache_key}.json").read_text(encoding="utf-8")
    )
    assert result.status is StageStatus.FAILED_TERMINAL
    assert result.error is not None
    assert result.error.code == "stage.invalid_output"
    assert result.error.retryable is False
    assert result.attempt == result.metrics.counters["attempts"] == 1
    assert persisted_result == persisted_attempt
    assert persisted_result["attempt"] == 1
    assert persisted_result["metrics"]["counters"]["attempts"] == 1
    assert state["status"] == "failed_terminal"
    assert state["attempts"] == 1
    assert not (root / "artifacts" / cache_key).exists()
    assert not list(tmp_path.rglob("would-be-orphan.json"))


def test_cached_artifact_escape_is_rejected_before_file_access(
    tmp_path,
    monkeypatch,
) -> None:
    specification = fake_specification()
    stage_identity, cache_key = identity(specification)
    orchestrator = StageOrchestrator(tmp_path)
    result = orchestrator.run_stage(
        run_id="run-01",
        specification=specification,
        input_sha256=INPUT_SHA256,
        code_revision=CODE_REVISION,
    )
    artifact_path = tmp_path / result.artifacts[0].path
    result_path = stage_root(tmp_path) / "results" / f"{cache_key}.json"
    escaped_path = tmp_path.parent / "escaped-cache-artifact.json"
    path_type = type(artifact_path)
    real_resolve = path_type.resolve

    def resolve_with_escape(path, *args, **kwargs):
        if path == artifact_path:
            return escaped_path
        return real_resolve(path, *args, **kwargs)

    def fail_if_hashed(_path):
        pytest.fail("an escaped cached artifact must never be hashed")

    monkeypatch.setattr(path_type, "resolve", resolve_with_escape)
    monkeypatch.setattr(orchestrator_module, "_hash_file", fail_if_hashed)

    cached, invalid_success = orchestrator._read_valid_result(
        result_path,
        identity=stage_identity,
        cache_key=cache_key,
        artifacts_directory=stage_root(tmp_path) / "artifacts" / cache_key,
    )

    assert cached is None
    assert invalid_success is True


@pytest.mark.parametrize(
    ("foreign_run_id", "foreign_stage_kind"),
    [
        ("run-02", "fake.metadata"),
        ("run-01", "fake.other"),
    ],
    ids=["cross-run", "cross-stage"],
)
def test_cached_artifact_must_be_a_direct_child_of_exact_namespace(
    tmp_path,
    monkeypatch,
    foreign_run_id,
    foreign_stage_kind,
) -> None:
    specification = fake_specification()
    _, cache_key = identity(specification)
    orchestrator = StageOrchestrator(tmp_path)
    first = orchestrator.run_stage(
        run_id="run-01",
        specification=specification,
        input_sha256=INPUT_SHA256,
        code_revision=CODE_REVISION,
    )
    root = stage_root(tmp_path)
    result_path = root / "results" / f"{cache_key}.json"
    original_artifact = tmp_path / first.artifacts[0].path
    original_content = original_artifact.read_bytes()
    foreign_artifact = (
        tmp_path
        / "runs"
        / foreign_run_id
        / "stages"
        / foreign_stage_kind
        / "artifacts"
        / cache_key
        / "foreign-result.json"
    )
    foreign_artifact.parent.mkdir(parents=True)
    foreign_artifact.write_bytes(original_content)

    persisted = json.loads(result_path.read_text(encoding="utf-8"))
    persisted["artifacts"][0]["path"] = foreign_artifact.relative_to(
        tmp_path
    ).as_posix()
    result_path.write_text(json.dumps(persisted), encoding="utf-8")

    real_hash_file = orchestrator_module._hash_file

    def guarded_hash_file(path):
        if path == foreign_artifact.resolve():
            pytest.fail("foreign cached artifacts must be rejected before hashing")
        return real_hash_file(path)

    monkeypatch.setattr(orchestrator_module, "_hash_file", guarded_hash_file)
    executor = OneAttemptSuccessExecutor()
    rebuilt = StageOrchestrator(tmp_path, executor=executor).run_stage(
        run_id="run-01",
        specification=specification,
        input_sha256=INPUT_SHA256,
        code_revision=CODE_REVISION,
    )

    rebuilt_artifact = tmp_path / rebuilt.artifacts[0].path
    assert executor.attempts == [1]
    assert rebuilt.status is StageStatus.SUCCEEDED
    assert rebuilt.attempt == rebuilt.metrics.counters["attempts"] == 1
    assert rebuilt_artifact.parent == root / "artifacts" / cache_key
    assert foreign_artifact.read_bytes() == original_content
    assert not original_artifact.exists()
    assert any(
        event.event_name == "stage.cache_invalidated"
        for event in read_events(tmp_path / "runs" / "run-01" / "events.jsonl")
    )


def test_success_is_published_and_resume_uses_valid_cache(tmp_path) -> None:
    specification = fake_specification(payload={"label": "fixture"})
    _, cache_key = identity(specification)
    orchestrator = StageOrchestrator(tmp_path)

    first = orchestrator.run_stage(
        run_id="run-01",
        specification=specification,
        input_sha256=INPUT_SHA256,
        code_revision=CODE_REVISION,
    )
    repeated = orchestrator.run_stage(
        run_id="run-01",
        specification=specification,
        input_sha256=INPUT_SHA256,
        code_revision=CODE_REVISION,
    )

    root = stage_root(tmp_path)
    state_path = root / "states" / f"{cache_key}.json"
    result_path = root / "results" / f"{cache_key}.json"
    attempt_path = root / "attempts" / cache_key / "0001.json"
    artifact_path = root / "artifacts" / cache_key / "fake-result.json"
    state = json.loads(state_path.read_text(encoding="utf-8"))

    assert first == repeated
    assert first.status is StageStatus.SUCCEEDED
    assert state["attempts"] == 1
    assert state["status"] == "succeeded"
    assert result_path.exists()
    assert attempt_path.exists()
    assert artifact_path.read_bytes()
    assert first.artifacts[0].path == artifact_path.relative_to(tmp_path).as_posix()
    assert [
        event.event_name
        for event in read_events(tmp_path / "runs" / "run-01" / "events.jsonl")
    ] == ["stage.started", "stage.succeeded", "stage.cache_hit"]


def test_multiple_staged_artifacts_publish_and_cache_as_one_bundle(tmp_path) -> None:
    specification = fake_specification()
    files = {
        "vocals.wav": b"vocal-stem",
        "bass.wav": b"bass-stem",
        "drums.wav": b"drum-stem",
    }
    executor = BundleExecutor(
        files,
        metrics=Metrics(
            duration_seconds=2.5,
            counters={"files": len(files)},
            measurements={"peak_vram_mb": 512.0},
        ),
    )
    orchestrator = StageOrchestrator(tmp_path, executor=executor)

    first = orchestrator.run_stage(
        run_id="run-01",
        specification=specification,
        input_sha256=INPUT_SHA256,
        code_revision=CODE_REVISION,
    )
    cached = orchestrator.run_stage(
        run_id="run-01",
        specification=specification,
        input_sha256=INPUT_SHA256,
        code_revision=CODE_REVISION,
    )

    assert first == cached
    assert executor.attempts == [1]
    assert len(first.artifacts) == len(files)
    assert first.metrics.duration_seconds == 2.5
    assert first.metrics.counters == {"files": 3, "attempts": 1}
    assert first.metrics.measurements == {"peak_vram_mb": 512.0}
    for artifact in first.artifacts:
        destination = tmp_path / artifact.path
        payload = files[destination.name]
        assert destination.read_bytes() == payload
        assert artifact.size_bytes == len(payload)
        assert artifact.sha256 == hashlib.sha256(payload).hexdigest()


@pytest.mark.parametrize(
    ("extra_name", "is_directory"),
    [("undeclared.partial", False), ("undeclared-directory", True)],
)
def test_cache_rejects_undeclared_bundle_entries(
    tmp_path,
    extra_name,
    is_directory,
) -> None:
    specification = fake_specification()
    _, cache_key = identity(specification)
    files = {"vocals.wav": b"vocals", "bass.wav": b"bass"}
    first = StageOrchestrator(
        tmp_path,
        executor=BundleExecutor(files),
    ).run_stage(
        run_id="run-01",
        specification=specification,
        input_sha256=INPUT_SHA256,
        code_revision=CODE_REVISION,
    )
    artifact_root = stage_root(tmp_path) / "artifacts" / cache_key
    extra = artifact_root / extra_name
    if is_directory:
        extra.mkdir()
    else:
        extra.write_bytes(b"undeclared")

    rebuilding_executor = BundleExecutor(files)
    rebuilt = StageOrchestrator(
        tmp_path,
        executor=rebuilding_executor,
    ).run_stage(
        run_id="run-01",
        specification=specification,
        input_sha256=INPUT_SHA256,
        code_revision=CODE_REVISION,
    )

    assert first.status is StageStatus.SUCCEEDED
    assert rebuilt.status is StageStatus.SUCCEEDED
    assert rebuilding_executor.attempts == [1]
    assert sorted(path.name for path in artifact_root.iterdir()) == sorted(files)
    assert any(
        event.event_name == "stage.cache_invalidated"
        for event in read_events(tmp_path / "runs" / "run-01" / "events.jsonl")
    )


def test_large_staged_artifact_is_returned_as_descriptor_not_bytes(tmp_path) -> None:
    specification = fake_specification()
    payload = b"x" * (8 * 1024 * 1024)
    executor = BundleExecutor({"large-stem.wav": payload})

    result = StageOrchestrator(tmp_path, executor=executor).run_stage(
        run_id="run-01",
        specification=specification,
        input_sha256=INPUT_SHA256,
        code_revision=CODE_REVISION,
    )

    assert result.artifacts[0].size_bytes == len(payload)
    assert (tmp_path / result.artifacts[0].path).stat().st_size == len(payload)
    assert "content" not in StageOutput.model_json_schema()["properties"]
    assert "content" not in StagedArtifact.model_json_schema()["properties"]


@pytest.mark.parametrize(
    ("files", "declared_names", "directories"),
    [
        (
            {"declared.wav": b"declared", "extra.wav": b"extra"},
            ("declared.wav",),
            (),
        ),
        ({}, ("missing.wav",), ()),
        ({}, ("directory.wav",), ("directory.wav",)),
    ],
    ids=["undeclared-extra", "missing", "directory"],
)
def test_staged_bundle_must_exactly_match_regular_file_descriptors(
    tmp_path,
    files,
    declared_names,
    directories,
) -> None:
    specification = fake_specification(max_attempts=1)
    _, cache_key = identity(specification)
    result = StageOrchestrator(
        tmp_path,
        executor=BundleExecutor(
            files,
            declared_names=declared_names,
            directories=directories,
        ),
    ).run_stage(
        run_id="run-01",
        specification=specification,
        input_sha256=INPUT_SHA256,
        code_revision=CODE_REVISION,
    )

    root = stage_root(tmp_path)
    assert result.status is StageStatus.FAILED_TERMINAL
    assert result.error is not None
    assert result.error.code == "stage.invalid_output"
    assert result.artifacts == []
    assert not (root / "artifacts" / cache_key).exists()
    assert not (root / "staging" / cache_key).exists()


@pytest.mark.parametrize(
    "blocked_kind",
    [PathEntryKind.SYMLINK, PathEntryKind.JUNCTION],
)
def test_staged_bundle_rejects_reparse_artifact_entry(
    tmp_path,
    blocked_kind,
) -> None:
    specification = fake_specification(max_attempts=1)
    _, cache_key = identity(specification)
    staged_file = stage_root(tmp_path) / "staging" / cache_key / "stem.wav"

    def inspect_entry(path):
        if path == staged_file:
            return blocked_kind
        return PathEntryKind.REGULAR

    result = StageOrchestrator(
        tmp_path,
        executor=BundleExecutor({"stem.wav": b"stem"}),
        path_entry_inspector=inspect_entry,
    ).run_stage(
        run_id="run-01",
        specification=specification,
        input_sha256=INPUT_SHA256,
        code_revision=CODE_REVISION,
    )

    assert result.status is StageStatus.FAILED_TERMINAL
    assert result.error is not None
    assert result.error.code == "stage.invalid_output"
    assert not (stage_root(tmp_path) / "artifacts" / cache_key).exists()


def test_multi_artifact_bundle_crash_is_uncommitted_and_retries_atomically(
    tmp_path,
    monkeypatch,
) -> None:
    specification = fake_specification(max_attempts=2)
    _, cache_key = identity(specification)
    root = stage_root(tmp_path)
    artifact_root = root / "artifacts" / cache_key
    staging_root = root / "staging" / cache_key
    result_path = root / "results" / f"{cache_key}.json"
    protected = tmp_path / "originals" / "keep.bin"
    foreign = root / "artifacts" / "foreign-cache" / "keep.bin"
    protected.parent.mkdir(parents=True)
    foreign.parent.mkdir(parents=True)
    protected.write_bytes(b"original")
    foreign.write_bytes(b"foreign")
    executor = BundleExecutor({"vocals.wav": b"vocals", "bass.wav": b"bass"})
    orchestrator = StageOrchestrator(tmp_path, executor=executor)
    crash_after_artifact_write(monkeypatch)

    with pytest.raises(InjectedPublicationCrash):
        orchestrator.run_stage(
            run_id="run-01",
            specification=specification,
            input_sha256=INPUT_SHA256,
            code_revision=CODE_REVISION,
        )

    assert sorted(path.name for path in artifact_root.iterdir()) == [
        "bass.wav",
        "vocals.wav",
    ]
    assert not staging_root.exists()
    assert not result_path.exists()

    recovered = orchestrator.run_stage(
        run_id="run-01",
        specification=specification,
        input_sha256=INPUT_SHA256,
        code_revision=CODE_REVISION,
    )

    assert executor.attempts == [1, 2]
    assert recovered.status is StageStatus.SUCCEEDED
    assert recovered.attempt == 2
    assert sorted(path.name for path in artifact_root.iterdir()) == [
        "bass.wav",
        "vocals.wav",
    ]
    assert protected.read_bytes() == b"original"
    assert foreign.read_bytes() == b"foreign"


def test_mutation_after_bundle_publish_cannot_commit_success(
    tmp_path,
    monkeypatch,
) -> None:
    specification = fake_specification(max_attempts=2)
    _, cache_key = identity(specification)
    root = stage_root(tmp_path)
    result_path = root / "results" / f"{cache_key}.json"
    artifact_root = root / "artifacts" / cache_key
    executor = BundleExecutor({"vocals.wav": b"original-stem"})
    publish_without_mutation = StageOrchestrator._publish_staged_bundle

    def publish_then_mutate(self, paths, prepared):
        artifacts = publish_without_mutation(self, paths, prepared)
        (self.workspace / artifacts[0].path).write_bytes(b"mutated-stem")
        return artifacts

    monkeypatch.setattr(
        StageOrchestrator,
        "_publish_staged_bundle",
        publish_then_mutate,
    )
    orchestrator = StageOrchestrator(tmp_path, executor=executor)

    with pytest.raises(
        SimulatedInterruption,
        match="changed before result commit",
    ):
        orchestrator.run_stage(
            run_id="run-01",
            specification=specification,
            input_sha256=INPUT_SHA256,
            code_revision=CODE_REVISION,
        )

    assert not result_path.exists()
    assert (artifact_root / "vocals.wav").read_bytes() == b"mutated-stem"
    monkeypatch.setattr(
        StageOrchestrator,
        "_publish_staged_bundle",
        publish_without_mutation,
    )

    recovered = orchestrator.run_stage(
        run_id="run-01",
        specification=specification,
        input_sha256=INPUT_SHA256,
        code_revision=CODE_REVISION,
    )

    assert executor.attempts == [1, 2]
    assert recovered.status is StageStatus.SUCCEEDED
    assert (artifact_root / "vocals.wav").read_bytes() == b"original-stem"


def test_valid_result_repairs_stale_state_without_repeating_work(tmp_path) -> None:
    specification = fake_specification()
    _, cache_key = identity(specification)
    orchestrator = StageOrchestrator(tmp_path)
    orchestrator.run_stage(
        run_id="run-01",
        specification=specification,
        input_sha256=INPUT_SHA256,
        code_revision=CODE_REVISION,
    )
    root = stage_root(tmp_path)
    state_path = root / "states" / f"{cache_key}.json"
    stale_state = json.loads(state_path.read_text())
    stale_state["status"] = "running"
    state_path.write_text(json.dumps(stale_state), encoding="utf-8")

    guard = NeverExecutor()
    resumed = StageOrchestrator(tmp_path, executor=guard).run_stage(
        run_id="run-01",
        specification=specification,
        input_sha256=INPUT_SHA256,
        code_revision=CODE_REVISION,
    )

    repaired_state = json.loads(state_path.read_text())
    assert resumed.status is StageStatus.SUCCEEDED
    assert repaired_state["status"] == "succeeded"
    assert repaired_state["attempts"] == 1
    assert len(list((root / "attempts" / cache_key).glob("*.json"))) == 1
    assert guard.calls == 0


@pytest.mark.parametrize(
    ("specification_kwargs", "expected_status", "expected_error_code"),
    [
        ({}, StageStatus.SUCCEEDED, None),
        (
            {"terminal_failure": True},
            StageStatus.FAILED_TERMINAL,
            "fake.terminal",
        ),
        (
            {"retryable_failures": 1, "max_attempts": 1},
            StageStatus.FAILED_RETRYABLE,
            "fake.retryable",
        ),
    ],
    ids=["success", "terminal-failure", "retry-exhaustion"],
)
@pytest.mark.parametrize(
    "crash_point",
    ["canonical-result", "attempt-envelope"],
)
def test_committed_result_repairs_publication_crash_without_reexecution(
    tmp_path,
    monkeypatch,
    specification_kwargs,
    expected_status,
    expected_error_code,
    crash_point,
) -> None:
    specification = fake_specification(**specification_kwargs)
    _, cache_key = identity(specification)
    root = stage_root(tmp_path)
    result_path = root / "results" / f"{cache_key}.json"
    attempt_path = root / "attempts" / cache_key / "0001.json"
    state_path = root / "states" / f"{cache_key}.json"
    crash_path = result_path if crash_point == "canonical-result" else attempt_path
    crash_after_write(monkeypatch, crash_path)

    with pytest.raises(InjectedPublicationCrash):
        StageOrchestrator(tmp_path).run_stage(
            run_id="run-01",
            specification=specification,
            input_sha256=INPUT_SHA256,
            code_revision=CODE_REVISION,
        )

    stale_state = json.loads(state_path.read_text(encoding="utf-8"))
    assert result_path.exists()
    assert attempt_path.exists() is (crash_point == "attempt-envelope")
    assert stale_state["status"] == "running"

    guard = NeverExecutor()
    recovered = StageOrchestrator(tmp_path, executor=guard).run_stage(
        run_id="run-01",
        specification=specification,
        input_sha256=INPUT_SHA256,
        code_revision=CODE_REVISION,
    )

    repaired_state = json.loads(state_path.read_text(encoding="utf-8"))
    canonical_result = json.loads(result_path.read_text(encoding="utf-8"))
    repaired_attempt = json.loads(attempt_path.read_text(encoding="utf-8"))
    assert recovered.status is expected_status
    assert (
        recovered.error.code if recovered.error is not None else None
    ) == expected_error_code
    assert repaired_attempt == canonical_result
    assert repaired_state["status"] == expected_status.value
    assert repaired_state["attempts"] == 1
    assert guard.calls == 0


def test_committed_retryable_attempt_is_reconciled_before_next_attempt(
    tmp_path,
    monkeypatch,
) -> None:
    specification = fake_specification(retryable_failures=1, max_attempts=2)
    _, cache_key = identity(specification)
    root = stage_root(tmp_path)
    result_path = root / "results" / f"{cache_key}.json"
    attempt_root = root / "attempts" / cache_key
    state_path = root / "states" / f"{cache_key}.json"
    crash_after_write(monkeypatch, result_path)

    with pytest.raises(InjectedPublicationCrash):
        StageOrchestrator(tmp_path).run_stage(
            run_id="run-01",
            specification=specification,
            input_sha256=INPUT_SHA256,
            code_revision=CODE_REVISION,
        )

    assert result_path.exists()
    assert not (attempt_root / "0001.json").exists()
    assert json.loads(state_path.read_text(encoding="utf-8"))["status"] == "running"

    recovered = StageOrchestrator(tmp_path).run_stage(
        run_id="run-01",
        specification=specification,
        input_sha256=INPUT_SHA256,
        code_revision=CODE_REVISION,
    )

    first_attempt = json.loads((attempt_root / "0001.json").read_text(encoding="utf-8"))
    second_attempt = json.loads(
        (attempt_root / "0002.json").read_text(encoding="utf-8")
    )
    state = json.loads(state_path.read_text(encoding="utf-8"))
    started_attempts = [
        event.attempt
        for event in read_events(tmp_path / "runs" / "run-01" / "events.jsonl")
        if event.event_name == "stage.started"
    ]
    assert first_attempt["status"] == "failed_retryable"
    assert second_attempt["status"] == "succeeded"
    assert recovered.status is StageStatus.SUCCEEDED
    assert recovered.metrics.counters["attempts"] == 2
    assert state["status"] == "succeeded"
    assert state["attempts"] == 2
    assert started_attempts == [1, 2]


def test_pre_result_artifact_crash_clears_exact_namespace_before_retry(
    tmp_path,
    monkeypatch,
) -> None:
    specification = fake_specification(max_attempts=2)
    _, cache_key = identity(specification)
    root = stage_root(tmp_path)
    artifact_root = root / "artifacts" / cache_key
    staging_root = root / "staging" / cache_key
    attempt_root = root / "attempts" / cache_key
    result_path = root / "results" / f"{cache_key}.json"
    state_path = root / "states" / f"{cache_key}.json"
    events_path = tmp_path / "runs" / "run-01" / "events.jsonl"
    control_path = tmp_path / "runs" / "run-01" / "control.json"
    protected_path = tmp_path / "originals" / "protected-audio.bin"
    foreign_path = root / "artifacts" / "foreign-cache" / "keep.bin"
    protected_path.parent.mkdir(parents=True)
    protected_path.write_bytes(b"protected-original")
    foreign_path.parent.mkdir(parents=True)
    foreign_path.write_bytes(b"foreign-derived-data")
    protected_before = protected_path.read_bytes()
    foreign_before = foreign_path.read_bytes()
    executor = PreResultCrashExecutor(artifact_root)
    orchestrator = StageOrchestrator(tmp_path, executor=executor)
    orchestrator.clear_control("run-01")
    control_before = control_path.read_bytes()
    crash_after_artifact_write(monkeypatch)

    with pytest.raises(InjectedPublicationCrash):
        orchestrator.run_stage(
            run_id="run-01",
            specification=specification,
            input_sha256=INPUT_SHA256,
            code_revision=CODE_REVISION,
        )

    orphan_path = artifact_root / "attempt-0001.json"
    assert orphan_path.read_bytes() == b'{"attempt":1}\n'
    assert not staging_root.exists()
    assert not result_path.exists()
    assert json.loads(state_path.read_text(encoding="utf-8"))["status"] == "running"
    events_before = events_path.read_bytes()

    recovered = orchestrator.run_stage(
        run_id="run-01",
        specification=specification,
        input_sha256=INPUT_SHA256,
        code_revision=CODE_REVISION,
    )

    committed_artifact = artifact_root / "attempt-0002.json"
    state = json.loads(state_path.read_text(encoding="utf-8"))
    attempt_files = sorted(path.name for path in attempt_root.iterdir())
    assert executor.attempts == [1, 2]
    assert recovered.status is StageStatus.SUCCEEDED
    assert recovered.attempt == recovered.metrics.counters["attempts"] == 2
    assert state["status"] == "succeeded"
    assert state["attempts"] == 2
    assert attempt_files == ["0002.json"]
    assert sorted(path.name for path in artifact_root.iterdir()) == [
        committed_artifact.name
    ]
    assert committed_artifact.read_bytes() == b'{"attempt":2}\n'
    assert not orphan_path.exists()
    assert not staging_root.exists()
    assert not list(artifact_root.rglob("*.tmp"))
    assert protected_path.read_bytes() == protected_before
    assert foreign_path.read_bytes() == foreign_before
    assert control_path.read_bytes() == control_before
    assert events_path.read_bytes().startswith(events_before)


def test_pre_result_artifact_crash_clears_exact_namespace_when_exhausted(
    tmp_path,
    monkeypatch,
) -> None:
    specification = fake_specification(max_attempts=1)
    _, cache_key = identity(specification)
    root = stage_root(tmp_path)
    artifact_root = root / "artifacts" / cache_key
    staging_root = root / "staging" / cache_key
    attempt_root = root / "attempts" / cache_key
    result_path = root / "results" / f"{cache_key}.json"
    state_path = root / "states" / f"{cache_key}.json"
    protected_path = tmp_path / "originals" / "protected-audio.bin"
    foreign_path = root / "artifacts" / "foreign-cache" / "keep.bin"
    protected_path.parent.mkdir(parents=True)
    protected_path.write_bytes(b"protected-original")
    foreign_path.parent.mkdir(parents=True)
    foreign_path.write_bytes(b"foreign-derived-data")
    protected_before = protected_path.read_bytes()
    foreign_before = foreign_path.read_bytes()
    executor = PreResultCrashExecutor(artifact_root)
    crash_after_artifact_write(monkeypatch)

    with pytest.raises(InjectedPublicationCrash):
        StageOrchestrator(tmp_path, executor=executor).run_stage(
            run_id="run-01",
            specification=specification,
            input_sha256=INPUT_SHA256,
            code_revision=CODE_REVISION,
        )

    assert (artifact_root / "attempt-0001.json").exists()
    assert not staging_root.exists()
    assert not result_path.exists()

    guard = NeverExecutor()
    recovered = StageOrchestrator(tmp_path, executor=guard).run_stage(
        run_id="run-01",
        specification=specification,
        input_sha256=INPUT_SHA256,
        code_revision=CODE_REVISION,
    )

    state = json.loads(state_path.read_text(encoding="utf-8"))
    persisted_result = json.loads(result_path.read_text(encoding="utf-8"))
    persisted_attempt = json.loads(
        (attempt_root / "0001.json").read_text(encoding="utf-8")
    )
    assert guard.calls == 0
    assert recovered.status is StageStatus.FAILED_TERMINAL
    assert recovered.attempt == recovered.metrics.counters["attempts"] == 1
    assert recovered.error is not None
    assert recovered.error.code == "stage.attempts_exhausted"
    assert persisted_attempt == persisted_result
    assert persisted_result["artifacts"] == []
    assert state["status"] == "failed_terminal"
    assert state["attempts"] == 1
    assert not artifact_root.exists()
    assert not staging_root.exists()
    assert not list(root.rglob("*.tmp"))
    assert not list(root.rglob("*.partial"))
    assert protected_path.read_bytes() == protected_before
    assert foreign_path.read_bytes() == foreign_before


def test_pre_result_artifact_crash_after_retry_consumes_attempt_number(
    tmp_path,
    monkeypatch,
) -> None:
    specification = fake_specification(max_attempts=3)
    _, cache_key = identity(specification)
    root = stage_root(tmp_path)
    artifact_root = root / "artifacts" / cache_key
    staging_root = root / "staging" / cache_key
    attempt_root = root / "attempts" / cache_key
    result_path = root / "results" / f"{cache_key}.json"
    state_path = root / "states" / f"{cache_key}.json"
    executor = PreResultCrashExecutor(artifact_root, retryable_attempts=1)
    crash_after_artifact_write(monkeypatch)

    with pytest.raises(InjectedPublicationCrash):
        StageOrchestrator(tmp_path, executor=executor).run_stage(
            run_id="run-01",
            specification=specification,
            input_sha256=INPUT_SHA256,
            code_revision=CODE_REVISION,
        )

    committed_retry = json.loads(result_path.read_text(encoding="utf-8"))
    assert committed_retry["status"] == "failed_retryable"
    assert committed_retry["attempt"] == 1
    assert json.loads(state_path.read_text(encoding="utf-8"))["attempts"] == 2
    assert (artifact_root / "attempt-0002.json").exists()
    assert not staging_root.exists()

    recovered = StageOrchestrator(tmp_path, executor=executor).run_stage(
        run_id="run-01",
        specification=specification,
        input_sha256=INPUT_SHA256,
        code_revision=CODE_REVISION,
    )

    assert executor.attempts == [1, 2, 3]
    assert recovered.status is StageStatus.SUCCEEDED
    assert recovered.attempt == recovered.metrics.counters["attempts"] == 3
    assert sorted(path.name for path in attempt_root.iterdir()) == [
        "0001.json",
        "0003.json",
    ]
    assert sorted(path.name for path in artifact_root.iterdir()) == [
        "attempt-0003.json"
    ]
    assert not staging_root.exists()
    assert json.loads(state_path.read_text(encoding="utf-8"))["attempts"] == 3


def test_pre_result_artifact_crash_after_retry_exhausts_without_reexecution(
    tmp_path,
    monkeypatch,
) -> None:
    specification = fake_specification(max_attempts=2)
    _, cache_key = identity(specification)
    root = stage_root(tmp_path)
    artifact_root = root / "artifacts" / cache_key
    staging_root = root / "staging" / cache_key
    attempt_root = root / "attempts" / cache_key
    result_path = root / "results" / f"{cache_key}.json"
    state_path = root / "states" / f"{cache_key}.json"
    executor = PreResultCrashExecutor(artifact_root, retryable_attempts=1)
    crash_after_artifact_write(monkeypatch)

    with pytest.raises(InjectedPublicationCrash):
        StageOrchestrator(tmp_path, executor=executor).run_stage(
            run_id="run-01",
            specification=specification,
            input_sha256=INPUT_SHA256,
            code_revision=CODE_REVISION,
        )

    assert executor.attempts == [1, 2]
    assert (artifact_root / "attempt-0002.json").exists()
    assert not staging_root.exists()

    guard = NeverExecutor()
    recovered = StageOrchestrator(tmp_path, executor=guard).run_stage(
        run_id="run-01",
        specification=specification,
        input_sha256=INPUT_SHA256,
        code_revision=CODE_REVISION,
    )

    first_attempt = json.loads((attempt_root / "0001.json").read_text(encoding="utf-8"))
    final_attempt = json.loads((attempt_root / "0002.json").read_text(encoding="utf-8"))
    assert guard.calls == 0
    assert recovered.status is StageStatus.FAILED_TERMINAL
    assert recovered.attempt == recovered.metrics.counters["attempts"] == 2
    assert recovered.error is not None
    assert recovered.error.code == "stage.attempts_exhausted"
    assert first_attempt["status"] == "failed_retryable"
    assert final_attempt["status"] == "failed_terminal"
    assert json.loads(result_path.read_text(encoding="utf-8")) == final_attempt
    assert json.loads(state_path.read_text(encoding="utf-8"))["attempts"] == 2
    assert not artifact_root.exists()
    assert not staging_root.exists()


@pytest.mark.parametrize(
    "blocked_kind",
    [PathEntryKind.SYMLINK, PathEntryKind.JUNCTION],
)
def test_pre_result_cleanup_rejects_intermediate_reparse_before_resolve(
    tmp_path,
    monkeypatch,
    blocked_kind,
) -> None:
    specification = fake_specification(max_attempts=2)
    _, cache_key = identity(specification)
    root = stage_root(tmp_path)
    artifact_root = root / "artifacts" / cache_key
    staging_root = root / "staging" / cache_key
    protected_path = tmp_path / "originals" / "protected-audio.bin"
    protected_path.parent.mkdir(parents=True)
    protected_path.write_bytes(b"protected-original")
    executor = PreResultCrashExecutor(artifact_root)
    crash_after_artifact_write(monkeypatch)

    with pytest.raises(InjectedPublicationCrash):
        StageOrchestrator(tmp_path, executor=executor).run_stage(
            run_id="run-01",
            specification=specification,
            input_sha256=INPUT_SHA256,
            code_revision=CODE_REVISION,
        )

    orphan_path = artifact_root / "attempt-0001.json"
    preserved = {
        orphan_path: orphan_path.read_bytes(),
        protected_path: protected_path.read_bytes(),
    }
    assert not staging_root.exists()
    blocked_ancestor = root / "artifacts"
    inspected_paths = []

    def inspect_entry(path):
        inspected_paths.append(path)
        if path == blocked_ancestor:
            return blocked_kind
        return PathEntryKind.REGULAR

    guard = NeverExecutor()
    guarded_orchestrator = StageOrchestrator(
        tmp_path,
        executor=guard,
        path_entry_inspector=inspect_entry,
    )
    path_type = type(tmp_path)
    real_resolve = path_type.resolve
    resolved_paths = []

    def resolve_reparse_to_originals(path, *args, **kwargs):
        resolved_paths.append(path)
        if path == blocked_ancestor:
            return protected_path.parent
        return real_resolve(path, *args, **kwargs)

    monkeypatch.setattr(path_type, "resolve", resolve_reparse_to_originals)

    with pytest.raises(ValueError, match="intermediate symlink or junction"):
        guarded_orchestrator.run_stage(
            run_id="run-01",
            specification=specification,
            input_sha256=INPUT_SHA256,
            code_revision=CODE_REVISION,
        )

    assert blocked_ancestor in inspected_paths
    assert blocked_ancestor not in resolved_paths
    assert guard.calls == 0
    assert {path: path.read_bytes() for path in preserved} == preserved


def test_retryable_failures_are_persisted_then_succeed(tmp_path) -> None:
    specification = fake_specification(retryable_failures=2, max_attempts=3)
    _, cache_key = identity(specification)

    result = StageOrchestrator(tmp_path).run_stage(
        run_id="run-01",
        specification=specification,
        input_sha256=INPUT_SHA256,
        code_revision=CODE_REVISION,
    )

    root = stage_root(tmp_path)
    state = json.loads(
        (root / "states" / f"{cache_key}.json").read_text(encoding="utf-8")
    )
    attempt_root = root / "attempts" / cache_key
    statuses = [
        json.loads((attempt_root / f"{attempt:04d}.json").read_text())["status"]
        for attempt in (1, 2, 3)
    ]
    events = read_events(tmp_path / "runs" / "run-01" / "events.jsonl")
    first_failure = next(
        event for event in events if event.event_name == "stage.failed_retryable"
    )

    assert result.status is StageStatus.SUCCEEDED
    assert state["attempts"] == 3
    assert statuses == ["failed_retryable", "failed_retryable", "succeeded"]
    assert first_failure.stage_kind == "fake.metadata"
    assert first_failure.attempt == 1
    assert first_failure.error is not None
    assert first_failure.error.code == "fake.retryable"


def test_retryable_failure_stops_at_max_attempts(tmp_path) -> None:
    specification = fake_specification(retryable_failures=5, max_attempts=2)
    _, cache_key = identity(specification)

    result = StageOrchestrator(tmp_path).run_stage(
        run_id="run-01",
        specification=specification,
        input_sha256=INPUT_SHA256,
        code_revision=CODE_REVISION,
    )

    root = stage_root(tmp_path)
    state = json.loads(
        (root / "states" / f"{cache_key}.json").read_text(encoding="utf-8")
    )
    event_names = [
        event.event_name
        for event in read_events(tmp_path / "runs" / "run-01" / "events.jsonl")
    ]

    assert result.status is StageStatus.FAILED_RETRYABLE
    assert result.error is not None and result.error.retryable is True
    assert state["attempts"] == 2
    assert event_names[-1] == "stage.retries_exhausted"
    assert not (root / "artifacts" / cache_key).exists()

    state_path = root / "states" / f"{cache_key}.json"
    state["status"] = "running"
    state_path.write_text(json.dumps(state), encoding="utf-8")
    guard = NeverExecutor()
    recovered = StageOrchestrator(tmp_path, executor=guard).run_stage(
        run_id="run-01",
        specification=specification,
        input_sha256=INPUT_SHA256,
        code_revision=CODE_REVISION,
    )

    repaired_state = json.loads(state_path.read_text(encoding="utf-8"))
    assert recovered == result
    assert recovered.error is not None
    assert recovered.error.code == "fake.retryable"
    assert repaired_state["status"] == "failed_retryable"
    assert guard.calls == 0


def test_terminal_failure_is_not_retried(tmp_path) -> None:
    specification = fake_specification(terminal_failure=True, max_attempts=3)
    _, cache_key = identity(specification)

    result = StageOrchestrator(tmp_path).run_stage(
        run_id="run-01",
        specification=specification,
        input_sha256=INPUT_SHA256,
        code_revision=CODE_REVISION,
    )

    root = stage_root(tmp_path)
    state = json.loads(
        (root / "states" / f"{cache_key}.json").read_text(encoding="utf-8")
    )
    attempt_files = list((root / "attempts" / cache_key).glob("*.json"))

    assert result.status is StageStatus.FAILED_TERMINAL
    assert result.error is not None and result.error.retryable is False
    assert state["attempts"] == 1
    assert len(attempt_files) == 1

    state_path = root / "states" / f"{cache_key}.json"
    state["status"] = "running"
    state_path.write_text(json.dumps(state), encoding="utf-8")
    guard = NeverExecutor()
    recovered = StageOrchestrator(tmp_path, executor=guard).run_stage(
        run_id="run-01",
        specification=specification,
        input_sha256=INPUT_SHA256,
        code_revision=CODE_REVISION,
    )

    repaired_state = json.loads(state_path.read_text(encoding="utf-8"))
    assert recovered == result
    assert repaired_state["status"] == "failed_terminal"
    assert guard.calls == 0


def test_interrupted_attempt_resumes_without_accepting_partial_output(
    tmp_path,
) -> None:
    specification = fake_specification(interrupt_attempts=[1], max_attempts=3)
    _, cache_key = identity(specification)
    orchestrator = StageOrchestrator(tmp_path)

    with pytest.raises(SimulatedInterruption):
        orchestrator.run_stage(
            run_id="run-01",
            specification=specification,
            input_sha256=INPUT_SHA256,
            code_revision=CODE_REVISION,
        )

    root = stage_root(tmp_path)
    state_path = root / "states" / f"{cache_key}.json"
    result_path = root / "results" / f"{cache_key}.json"
    final_artifact = root / "artifacts" / cache_key / "fake-result.json"
    state_after_interruption = json.loads(state_path.read_text())

    assert state_after_interruption["attempts"] == 1
    assert state_after_interruption["status"] == "running"
    assert not result_path.exists()
    assert not final_artifact.exists()

    resumed = StageOrchestrator(tmp_path).run_stage(
        run_id="run-01",
        specification=specification,
        input_sha256=INPUT_SHA256,
        code_revision=CODE_REVISION,
    )
    state_after_resume = json.loads(state_path.read_text())
    event_names = [
        event.event_name
        for event in read_events(tmp_path / "runs" / "run-01" / "events.jsonl")
    ]

    assert resumed.status is StageStatus.SUCCEEDED
    assert state_after_resume["attempts"] == 2
    assert resumed.artifacts[0].path == final_artifact.relative_to(tmp_path).as_posix()
    assert not (root / "staging" / cache_key).exists()
    assert event_names == [
        "stage.started",
        "stage.interrupted",
        "stage.started",
        "stage.succeeded",
    ]


def test_interruption_on_last_attempt_persists_exhausted_result(tmp_path) -> None:
    specification = fake_specification(interrupt_attempts=[1], max_attempts=1)
    _, cache_key = identity(specification)
    orchestrator = StageOrchestrator(tmp_path)

    with pytest.raises(SimulatedInterruption):
        orchestrator.run_stage(
            run_id="run-01",
            specification=specification,
            input_sha256=INPUT_SHA256,
            code_revision=CODE_REVISION,
        )

    exhausted = StageOrchestrator(tmp_path).run_stage(
        run_id="run-01",
        specification=specification,
        input_sha256=INPUT_SHA256,
        code_revision=CODE_REVISION,
    )
    root = stage_root(tmp_path)
    state = json.loads(
        (root / "states" / f"{cache_key}.json").read_text(encoding="utf-8")
    )
    persisted = json.loads(
        (root / "results" / f"{cache_key}.json").read_text(encoding="utf-8")
    )

    assert exhausted.status is StageStatus.FAILED_TERMINAL
    assert exhausted.error is not None
    assert exhausted.error.code == "stage.attempts_exhausted"
    assert state["attempts"] == 1
    assert state["status"] == "failed_terminal"
    assert persisted["status"] == "failed_terminal"


def test_pause_yields_typed_envelope_and_can_resume(tmp_path) -> None:
    specification = fake_specification()
    _, cache_key = identity(specification)
    orchestrator = StageOrchestrator(tmp_path)
    orchestrator.request_pause("run-01")

    paused = orchestrator.run_stage(
        run_id="run-01",
        specification=specification,
        input_sha256=INPUT_SHA256,
        code_revision=CODE_REVISION,
    )

    root = stage_root(tmp_path)
    state_path = root / "states" / f"{cache_key}.json"
    paused_state = json.loads(state_path.read_text())
    assert paused.status is StageStatus.PAUSED
    assert paused.artifacts == []
    assert paused.metrics.counters["attempts"] == 0
    assert paused_state["status"] == "paused"
    assert not (root / "attempts" / cache_key).exists()

    orchestrator.clear_control("run-01")
    resumed = orchestrator.run_stage(
        run_id="run-01",
        specification=specification,
        input_sha256=INPUT_SHA256,
        code_revision=CODE_REVISION,
    )

    assert resumed.status is StageStatus.SUCCEEDED
    assert resumed.metrics.counters["attempts"] == 1


def test_cancel_yields_typed_envelope_without_running_stage(tmp_path) -> None:
    specification = fake_specification()
    _, cache_key = identity(specification)
    orchestrator = StageOrchestrator(tmp_path)
    orchestrator.request_cancel("run-01")

    cancelled = orchestrator.run_stage(
        run_id="run-01",
        specification=specification,
        input_sha256=INPUT_SHA256,
        code_revision=CODE_REVISION,
    )

    root = stage_root(tmp_path)
    state = json.loads(
        (root / "states" / f"{cache_key}.json").read_text(encoding="utf-8")
    )
    assert cancelled.status is StageStatus.CANCELLED
    assert cancelled.artifacts == []
    assert cancelled.error is None
    assert state["attempts"] == 0
    assert state["status"] == "cancelled"
    assert [
        event.event_name
        for event in read_events(tmp_path / "runs" / "run-01" / "events.jsonl")
    ] == ["stage.cancelled"]


def test_every_provenance_field_executes_a_fresh_identity(
    tmp_path,
) -> None:
    orchestrator = StageOrchestrator(tmp_path)
    executions = [
        (fake_specification(payload={"label": "base"}), "a" * 64, CODE_REVISION),
        (
            fake_specification(
                implementation_version="2.0.0",
                payload={"label": "base"},
            ),
            "a" * 64,
            CODE_REVISION,
        ),
        (
            fake_specification(payload={"label": "changed"}),
            "a" * 64,
            CODE_REVISION,
        ),
        (fake_specification(payload={"label": "base"}), "b" * 64, CODE_REVISION),
        (
            fake_specification(
                output_schema_version="2.0.0",
                payload={"label": "base"},
            ),
            "a" * 64,
            CODE_REVISION,
        ),
        (
            fake_specification(
                model_identifier="model-a",
                payload={"label": "base"},
            ),
            "a" * 64,
            CODE_REVISION,
        ),
        (
            fake_specification(
                model_sha256="b" * 64,
                payload={"label": "base"},
            ),
            "a" * 64,
            CODE_REVISION,
        ),
        (fake_specification(payload={"label": "base"}), "a" * 64, "revision-2"),
        (
            fake_specification(
                stage_kind="fake.other",
                payload={"label": "base"},
            ),
            "a" * 64,
            CODE_REVISION,
        ),
    ]

    results = [
        orchestrator.run_stage(
            run_id="run-01",
            specification=specification,
            input_sha256=input_sha256,
            code_revision=code_revision,
        )
        for specification, input_sha256, code_revision in executions
    ]

    assert len({result.cache_key for result in results}) == len(executions)
    assert all(result.status is StageStatus.SUCCEEDED for result in results)
    for result in results:
        root = tmp_path / "runs" / "run-01" / "stages" / result.stage_kind
        state_path = root / "states" / f"{result.cache_key}.json"
        persisted = json.loads(state_path.read_text(encoding="utf-8"))
        assert persisted["attempts"] == 1
        assert persisted["identity"] == result.identity.model_dump(mode="json")


def test_tampered_artifact_is_reexecuted_instead_of_accepted(tmp_path) -> None:
    specification = fake_specification(payload={"label": "fixture"})
    _, cache_key = identity(specification)
    orchestrator = StageOrchestrator(tmp_path)
    first = orchestrator.run_stage(
        run_id="run-01",
        specification=specification,
        input_sha256=INPUT_SHA256,
        code_revision=CODE_REVISION,
    )
    artifact_path = tmp_path / first.artifacts[0].path
    expected_content = artifact_path.read_bytes()
    artifact_path.write_bytes(b"tampered")

    repaired = orchestrator.run_stage(
        run_id="run-01",
        specification=specification,
        input_sha256=INPUT_SHA256,
        code_revision=CODE_REVISION,
    )

    state_path = stage_root(tmp_path) / "states" / f"{cache_key}.json"
    assert repaired.status is StageStatus.SUCCEEDED
    assert artifact_path.read_bytes() == expected_content
    assert json.loads(state_path.read_text())["attempts"] == 1
    assert "stage.cache_hit" not in [
        event.event_name
        for event in read_events(tmp_path / "runs" / "run-01" / "events.jsonl")
    ]


def test_invalid_success_result_rebuilds_with_single_attempt_budget(tmp_path) -> None:
    specification = fake_specification(max_attempts=1)
    _, cache_key = identity(specification)
    orchestrator = StageOrchestrator(tmp_path)
    orchestrator.run_stage(
        run_id="run-01",
        specification=specification,
        input_sha256=INPUT_SHA256,
        code_revision=CODE_REVISION,
    )
    root = stage_root(tmp_path)
    result_path = root / "results" / f"{cache_key}.json"
    result_path.write_text("{invalid", encoding="utf-8")

    rebuilt = orchestrator.run_stage(
        run_id="run-01",
        specification=specification,
        input_sha256=INPUT_SHA256,
        code_revision=CODE_REVISION,
    )

    state = json.loads(
        (root / "states" / f"{cache_key}.json").read_text(encoding="utf-8")
    )
    started_events = [
        event
        for event in read_events(tmp_path / "runs" / "run-01" / "events.jsonl")
        if event.event_name == "stage.started"
    ]
    assert rebuilt.status is StageStatus.SUCCEEDED
    assert rebuilt.metrics.counters["attempts"] == 1
    assert state["attempts"] == 1
    assert len(started_events) == 2


def test_missing_artifact_rebuilds_after_success_on_last_attempt(tmp_path) -> None:
    specification = fake_specification(retryable_failures=2, max_attempts=3)
    orchestrator = StageOrchestrator(tmp_path)
    first = orchestrator.run_stage(
        run_id="run-01",
        specification=specification,
        input_sha256=INPUT_SHA256,
        code_revision=CODE_REVISION,
    )
    artifact_path = tmp_path / first.artifacts[0].path
    artifact_path.unlink()

    rebuilt = orchestrator.run_stage(
        run_id="run-01",
        specification=specification,
        input_sha256=INPUT_SHA256,
        code_revision=CODE_REVISION,
    )

    started_events = [
        event
        for event in read_events(tmp_path / "runs" / "run-01" / "events.jsonl")
        if event.event_name == "stage.started"
    ]
    assert first.metrics.counters["attempts"] == 3
    assert rebuilt.status is StageStatus.SUCCEEDED
    assert rebuilt.metrics.counters["attempts"] == 3
    assert artifact_path.is_file()
    assert len(started_events) == 6


def test_invalid_success_clears_namespace_before_one_attempt_rebuild(
    tmp_path,
) -> None:
    specification = fake_specification(retryable_failures=2, max_attempts=3)
    _, cache_key = identity(specification)
    orchestrator = StageOrchestrator(tmp_path)
    orchestrator.clear_control("run-01")
    first = orchestrator.run_stage(
        run_id="run-01",
        specification=specification,
        input_sha256=INPUT_SHA256,
        code_revision=CODE_REVISION,
    )
    root = stage_root(tmp_path)
    attempt_root = root / "attempts" / cache_key
    artifact_root = root / "artifacts" / cache_key
    staging_root = root / "staging" / cache_key
    state_path = root / "states" / f"{cache_key}.json"
    result_path = root / "results" / f"{cache_key}.json"
    events_path = tmp_path / "runs" / "run-01" / "events.jsonl"
    control_path = tmp_path / "runs" / "run-01" / "control.json"
    old_artifact = tmp_path / first.artifacts[0].path

    assert sorted(path.name for path in attempt_root.iterdir()) == [
        "0001.json",
        "0002.json",
        "0003.json",
    ]
    staging_root.mkdir(parents=True)
    (staging_root / "stale.partial").write_bytes(b"stale")
    old_artifact.write_bytes(b"tampered")
    events_before = events_path.read_bytes()
    control_before = control_path.read_bytes()

    one_attempt_specification = specification.model_copy(update={"max_attempts": 1})
    executor = OneAttemptSuccessExecutor()
    rebuilt = StageOrchestrator(tmp_path, executor=executor).run_stage(
        run_id="run-01",
        specification=one_attempt_specification,
        input_sha256=INPUT_SHA256,
        code_revision=CODE_REVISION,
    )

    state = json.loads(state_path.read_text(encoding="utf-8"))
    persisted_result = json.loads(result_path.read_text(encoding="utf-8"))
    invalidation_events = [
        event
        for event in read_events(events_path)
        if event.event_name == "stage.cache_invalidated"
    ]
    assert executor.attempts == [1]
    assert rebuilt.status is StageStatus.SUCCEEDED
    assert rebuilt.metrics.counters["attempts"] == 1
    assert sorted(path.name for path in attempt_root.iterdir()) == ["0001.json"]
    assert sorted(path.name for path in artifact_root.iterdir()) == [
        "rebuilt-result.json"
    ]
    assert not old_artifact.exists()
    assert not staging_root.exists()
    assert state["status"] == persisted_result["status"] == "succeeded"
    assert state["attempts"] == persisted_result["metrics"]["counters"]["attempts"]
    assert state["attempts"] == 1
    assert state["max_attempts"] == 1
    assert events_path.read_bytes().startswith(events_before)
    assert control_path.read_bytes() == control_before
    assert len(invalidation_events) == 1
    assert invalidation_events[0].attempt == 3
    assert invalidation_events[0].status is StageStatus.QUEUED
    assert invalidation_events[0].fields == {
        "reason": "successful_cache_failed_validation"
    }


@pytest.mark.parametrize(
    "blocked_kind",
    [PathEntryKind.SYMLINK, PathEntryKind.JUNCTION],
)
def test_invalid_cache_cleanup_aborts_at_intermediate_reparse_point(
    tmp_path,
    blocked_kind,
) -> None:
    specification = fake_specification(max_attempts=1)
    _, cache_key = identity(specification)
    initial_orchestrator = StageOrchestrator(tmp_path)
    initial_orchestrator.clear_control("run-01")
    first = initial_orchestrator.run_stage(
        run_id="run-01",
        specification=specification,
        input_sha256=INPUT_SHA256,
        code_revision=CODE_REVISION,
    )
    root = stage_root(tmp_path)
    attempt_root = root / "attempts" / cache_key
    artifact_root = root / "artifacts" / cache_key
    staging_root = root / "staging" / cache_key
    state_path = root / "states" / f"{cache_key}.json"
    result_path = root / "results" / f"{cache_key}.json"
    events_path = tmp_path / "runs" / "run-01" / "events.jsonl"
    control_path = tmp_path / "runs" / "run-01" / "control.json"
    attempt_path = attempt_root / "0001.json"
    artifact_path = tmp_path / first.artifacts[0].path
    staging_file = staging_root / "preserve.partial"
    protected_path = tmp_path / "originals" / "protected-audio.bin"

    staging_root.mkdir(parents=True)
    staging_file.write_bytes(b"partial-derived-data")
    protected_path.parent.mkdir(parents=True)
    protected_path.write_bytes(b"protected-original")
    artifact_path.write_bytes(b"tampered-cache-artifact")

    preserved_paths = (
        attempt_path,
        artifact_path,
        staging_file,
        result_path,
        state_path,
        events_path,
        control_path,
        protected_path,
    )
    before = {path: path.read_bytes() for path in preserved_paths}
    blocked_ancestor = root / "attempts"
    inspected_paths = []

    def inspect_entry(path):
        inspected_paths.append(path)
        if path == blocked_ancestor:
            return blocked_kind
        return PathEntryKind.REGULAR

    executor = NeverExecutor()
    guarded_orchestrator = StageOrchestrator(
        tmp_path,
        executor=executor,
        path_entry_inspector=inspect_entry,
    )

    with pytest.raises(ValueError, match="intermediate symlink or junction"):
        guarded_orchestrator.run_stage(
            run_id="run-01",
            specification=specification,
            input_sha256=INPUT_SHA256,
            code_revision=CODE_REVISION,
        )

    assert blocked_ancestor in inspected_paths
    assert executor.calls == 0
    assert {path: path.read_bytes() for path in preserved_paths} == before
    assert sorted(path.name for path in artifact_root.iterdir()) == [artifact_path.name]


def test_v1_1_success_cache_is_invalidated_and_rebuilt_as_v2(tmp_path) -> None:
    specification = fake_specification(max_attempts=1)
    _, cache_key = identity(specification)
    first = StageOrchestrator(tmp_path).run_stage(
        run_id="run-01",
        specification=specification,
        input_sha256=INPUT_SHA256,
        code_revision=CODE_REVISION,
    )
    root = stage_root(tmp_path)
    attempt_root = root / "attempts" / cache_key
    artifact_root = root / "artifacts" / cache_key
    staging_root = root / "staging" / cache_key
    state_path = root / "states" / f"{cache_key}.json"
    result_path = root / "results" / f"{cache_key}.json"
    attempt_path = attempt_root / "0001.json"
    old_artifact_path = tmp_path / first.artifacts[0].path

    old_envelope = json.loads(result_path.read_text(encoding="utf-8"))
    old_envelope["schema_version"] = "1.1.0"
    old_envelope.pop("attempt")
    atomic_write_json_without_crash(result_path, old_envelope)
    atomic_write_json_without_crash(attempt_path, old_envelope)
    state_path.unlink()
    staging_root.mkdir(parents=True)
    (staging_root / "old.partial").write_bytes(b"old-staging-data")

    executor = OneAttemptSuccessExecutor()
    rebuilt = StageOrchestrator(tmp_path, executor=executor).run_stage(
        run_id="run-01",
        specification=specification,
        input_sha256=INPUT_SHA256,
        code_revision=CODE_REVISION,
    )

    persisted_result = json.loads(result_path.read_text(encoding="utf-8"))
    persisted_attempt = json.loads(attempt_path.read_text(encoding="utf-8"))
    persisted_state = json.loads(state_path.read_text(encoding="utf-8"))
    rebuilt_artifact_path = tmp_path / rebuilt.artifacts[0].path
    invalidation_events = [
        event
        for event in read_events(tmp_path / "runs" / "run-01" / "events.jsonl")
        if event.event_name == "stage.cache_invalidated"
    ]

    assert executor.attempts == [1]
    assert rebuilt.status is StageStatus.SUCCEEDED
    assert rebuilt.schema_version == "2.0.0"
    assert rebuilt.attempt == 1
    assert persisted_result == persisted_attempt
    assert persisted_result["schema_version"] == "2.0.0"
    assert persisted_result["attempt"] == 1
    assert persisted_state["status"] == persisted_result["status"] == "succeeded"
    assert persisted_state["attempts"] == persisted_result["attempt"] == 1
    assert (
        persisted_state["result_path"] == result_path.relative_to(tmp_path).as_posix()
    )
    assert sorted(path.name for path in attempt_root.iterdir()) == ["0001.json"]
    assert sorted(path.name for path in artifact_root.iterdir()) == [
        "rebuilt-result.json"
    ]
    assert sorted(path.name for path in (root / "results").iterdir()) == [
        result_path.name
    ]
    assert sorted(path.name for path in (root / "states").iterdir()) == [
        state_path.name
    ]
    assert rebuilt_artifact_path.read_bytes() == b'{"rebuilt":true}\n'
    assert not old_artifact_path.exists()
    assert not staging_root.exists()
    assert len(invalidation_events) == 1
    assert invalidation_events[0].fields == {
        "reason": "successful_cache_failed_validation"
    }
