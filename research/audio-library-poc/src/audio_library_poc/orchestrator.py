"""Single-process, file-backed orchestration for deterministic POC stages."""

from __future__ import annotations

import hashlib
import os
import stat
from collections.abc import Callable
from enum import StrEnum
from pathlib import Path
from typing import Literal, Self
from uuid import uuid4

from pydantic import Field, TypeAdapter, ValidationError, model_validator

from audio_library_poc.cache import hash_config, stage_cache_key
from audio_library_poc.events import JsonlEventLog
from audio_library_poc.execution import (
    ExpectedStageFailure,
    StagedArtifact,
    StageExecutor,
    StageInterruption,
    StageOutput,
)
from audio_library_poc.fake_stage import FakeStage
from audio_library_poc.io import atomic_write_json, read_json
from audio_library_poc.models import (
    ArtifactReference,
    ContractModel,
    Identifier,
    Metrics,
    Sha256,
    StageIdentity,
    StageResultEnvelope,
    StageSpecification,
    StageStatus,
    TypedError,
)


class PersistedStageState(ContractModel):
    schema_version: Literal["1.1.0"] = "1.1.0"
    run_id: Identifier
    identity: StageIdentity
    cache_key: Sha256
    max_attempts: int = Field(ge=1)
    attempts: int = Field(ge=0)
    status: StageStatus
    result_path: str

    @model_validator(mode="after")
    def validate_cache_identity(self) -> Self:
        if self.cache_key != stage_cache_key(self.identity):
            raise ValueError("cache_key must match identity")
        return self


class ControlRequest(StrEnum):
    NONE = "none"
    PAUSE = "pause"
    CANCEL = "cancel"


class PathEntryKind(StrEnum):
    """Filesystem entry kinds relevant to safe derived-cache access."""

    REGULAR = "regular"
    SYMLINK = "symlink"
    JUNCTION = "junction"


class _InvalidStageOutput(ValueError):
    """A staged bundle violated the executor output contract."""


def inspect_path_entry(path: Path) -> PathEntryKind:
    """Inspect one path without resolving through a link or junction."""

    candidate = Path(path)
    if candidate.is_symlink():
        return PathEntryKind.SYMLINK
    is_junction = getattr(candidate, "is_junction", None)
    if is_junction is not None and is_junction():
        return PathEntryKind.JUNCTION
    return PathEntryKind.REGULAR


class PersistedRunControl(ContractModel):
    schema_version: Literal["1.0.0"] = "1.0.0"
    requested: ControlRequest = ControlRequest.NONE


class StageOrchestrator:
    """Run one stage while persisting every orchestration boundary."""

    def __init__(
        self,
        workspace: Path,
        *,
        executor: StageExecutor | None = None,
        dispatcher: Callable[[StageSpecification], StageExecutor] | None = None,
        path_entry_inspector: Callable[[Path], PathEntryKind] | None = None,
    ) -> None:
        if executor is not None and dispatcher is not None:
            raise ValueError("provide either executor or dispatcher, not both")
        self.workspace = Path(workspace).resolve()
        self._dispatcher = dispatcher
        self.executor = (
            executor
            if executor is not None
            else (None if dispatcher is not None else FakeStage())
        )
        self.path_entry_inspector = path_entry_inspector or inspect_path_entry

    def _executor_for(self, specification: StageSpecification) -> StageExecutor:
        if self._dispatcher is not None:
            return self._dispatcher(specification)
        assert self.executor is not None
        return self.executor

    def request_pause(self, run_id: str) -> None:
        self._write_control(run_id, ControlRequest.PAUSE)

    def request_cancel(self, run_id: str) -> None:
        self._write_control(run_id, ControlRequest.CANCEL)

    def clear_control(self, run_id: str) -> None:
        self._write_control(run_id, ControlRequest.NONE)

    def run_stage(
        self,
        *,
        run_id: str,
        specification: StageSpecification,
        input_sha256: str,
        code_revision: str,
    ) -> StageResultEnvelope:
        validated_run_id = TypeAdapter(Identifier).validate_python(run_id)
        identity = StageIdentity(
            stage_kind=specification.stage_kind,
            input_sha256=input_sha256,
            implementation_version=specification.implementation_version,
            config_sha256=hash_config(specification.config),
            output_schema_version=specification.output_schema_version,
            model_identifier=specification.model_identifier,
            model_sha256=specification.model_sha256,
            code_revision=code_revision,
        )
        cache_key = stage_cache_key(identity)
        paths = self._paths(validated_run_id, identity, cache_key)
        event_log = JsonlEventLog(paths["events"])
        state = self._read_state(
            paths["state"],
            run_id=validated_run_id,
            identity=identity,
            cache_key=cache_key,
        )
        published, invalid_published_cache = self._read_valid_result(
            paths["result"],
            identity=identity,
            cache_key=cache_key,
            artifacts_directory=paths["artifacts"],
        )
        published_attempts = published.attempt if published is not None else 0
        invalid_successful_cache = invalid_published_cache or (
            published is None
            and state is not None
            and state.status is StageStatus.SUCCEEDED
        )

        if invalid_successful_cache:
            invalidated_attempts = state.attempts if state is not None else 0
            self._invalidate_cache(paths)
            event_log.emit(
                event_name="stage.cache_invalidated",
                stage_kind=identity.stage_kind,
                attempt=invalidated_attempts,
                status=StageStatus.QUEUED,
                cache_key=cache_key,
                fields={"reason": "successful_cache_failed_validation"},
            )
            state = None
            published = None
            published_attempts = 0

        uncommitted_attempt = (
            state is not None
            and state.status is StageStatus.RUNNING
            and (published is None or published.attempt < state.attempts)
        )
        if uncommitted_attempt:
            self._clear_uncommitted_derived(paths)

        if published is not None and published.status in {
            StageStatus.SUCCEEDED,
            StageStatus.FAILED_RETRYABLE,
            StageStatus.FAILED_TERMINAL,
        }:
            if uncommitted_attempt:
                self._reconcile_attempt(paths, published)
            else:
                state = self._reconcile_state(
                    paths,
                    published,
                    validated_run_id,
                    identity,
                    cache_key,
                    specification.max_attempts,
                )

        if published is not None and published.status is StageStatus.SUCCEEDED:
            event_log.emit(
                event_name="stage.cache_hit",
                stage_kind=identity.stage_kind,
                attempt=published_attempts,
                status=StageStatus.SUCCEEDED,
                cache_key=cache_key,
                fields={"result_path": self._relative(paths["result"])},
            )
            return published

        terminal_result = (
            published is not None and published.status is StageStatus.FAILED_TERMINAL
        )
        exhausted_retry = (
            published is not None
            and published.status is StageStatus.FAILED_RETRYABLE
            and published_attempts >= specification.max_attempts
        )
        if terminal_result or exhausted_retry:
            assert published is not None
            return published

        attempts = max(
            state.attempts if state is not None else 0,
            published_attempts,
        )

        try:
            executor = self._executor_for(specification)
        except ExpectedStageFailure as exc:
            dispatch_attempt = attempts + 1
            result = self._result(
                identity,
                cache_key,
                StageStatus.FAILED_TERMINAL,
                dispatch_attempt,
                error=exc.error,
            )
            dispatch_state = self._state(
                validated_run_id,
                identity,
                cache_key,
                specification.max_attempts,
                dispatch_attempt,
                StageStatus.FAILED_TERMINAL,
                paths["result"],
            )
            self._clear_staging(paths["staging"])
            self._publish_result(paths, result, dispatch_state)
            event_log.emit(
                event_name="stage.failed_terminal",
                stage_kind=identity.stage_kind,
                attempt=dispatch_attempt,
                status=StageStatus.FAILED_TERMINAL,
                cache_key=cache_key,
                fields={"error_code": exc.error.code},
                error=exc.error,
            )
            return result

        while attempts < specification.max_attempts:
            control = self._read_control(paths["control"])
            if control.requested is not ControlRequest.NONE:
                status = (
                    StageStatus.PAUSED
                    if control.requested is ControlRequest.PAUSE
                    else StageStatus.CANCELLED
                )
                result = self._result(identity, cache_key, status, attempts)
                controlled_state = self._state(
                    validated_run_id,
                    identity,
                    cache_key,
                    specification.max_attempts,
                    attempts,
                    status,
                    paths["result"],
                )
                atomic_write_json(paths["result"], result)
                atomic_write_json(paths["state"], controlled_state)
                event_log.emit(
                    event_name=f"stage.{status.value}",
                    stage_kind=identity.stage_kind,
                    attempt=attempts,
                    status=status,
                    cache_key=cache_key,
                )
                return result

            attempt = attempts + 1
            self._clear_staging(paths["staging"])
            self._remove_workspace_path(
                paths["artifacts"],
                label="uncommitted artifacts path",
            )
            running_state = self._state(
                validated_run_id,
                identity,
                cache_key,
                specification.max_attempts,
                attempt,
                StageStatus.RUNNING,
                paths["result"],
            )
            atomic_write_json(paths["state"], running_state)
            event_log.emit(
                event_name="stage.started",
                stage_kind=identity.stage_kind,
                attempt=attempt,
                status=StageStatus.RUNNING,
                cache_key=cache_key,
                fields={"max_attempts": specification.max_attempts},
            )

            try:
                raw_output = executor.execute(
                    specification=specification,
                    identity=identity,
                    cache_key=cache_key,
                    attempt=attempt,
                    staging_directory=paths["staging"],
                )
            except StageInterruption as exc:
                event_log.emit(
                    event_name="stage.interrupted",
                    stage_kind=identity.stage_kind,
                    attempt=attempt,
                    status=StageStatus.RUNNING,
                    cache_key=cache_key,
                    fields={"exception_type": type(exc).__name__},
                )
                raise
            except ExpectedStageFailure as exc:
                self._clear_uncommitted_derived(paths)
                status = (
                    StageStatus.FAILED_RETRYABLE
                    if exc.error.retryable
                    else StageStatus.FAILED_TERMINAL
                )
                result = self._result(
                    identity,
                    cache_key,
                    status,
                    attempt,
                    error=exc.error,
                )
                self._publish_result(
                    paths,
                    result,
                    running_state.model_copy(update={"status": status}),
                )
                event_log.emit(
                    event_name=f"stage.{status.value}",
                    stage_kind=identity.stage_kind,
                    attempt=attempt,
                    status=status,
                    cache_key=cache_key,
                    fields={"error_code": exc.error.code},
                    error=exc.error,
                )
                if status is StageStatus.FAILED_TERMINAL:
                    return result
                if attempt >= specification.max_attempts:
                    event_log.emit(
                        event_name="stage.retries_exhausted",
                        stage_kind=identity.stage_kind,
                        attempt=attempt,
                        status=status,
                        cache_key=cache_key,
                        fields={"max_attempts": specification.max_attempts},
                        error=exc.error,
                    )
                    return result
                attempts = attempt
                atomic_write_json(
                    paths["state"],
                    running_state.model_copy(update={"status": StageStatus.QUEUED}),
                )
                event_log.emit(
                    event_name="stage.retry_scheduled",
                    stage_kind=identity.stage_kind,
                    attempt=attempt,
                    status=StageStatus.QUEUED,
                    cache_key=cache_key,
                    fields={"next_attempt": attempt + 1},
                )
                continue

            try:
                output = StageOutput.model_validate(raw_output)
                prepared = self._prepare_staged_artifacts(
                    paths["staging"],
                    output,
                )
                artifacts = self._publish_staged_bundle(paths, prepared)
            except (ValidationError, _InvalidStageOutput) as exc:
                self._clear_uncommitted_derived(paths)
                details = {"exception_type": type(exc).__name__}
                if isinstance(exc, ValidationError):
                    details["error_count"] = exc.error_count()
                error = TypedError(
                    code="stage.invalid_output",
                    message="stage executor returned invalid output",
                    retryable=False,
                    details=details,
                )
                result = self._result(
                    identity,
                    cache_key,
                    StageStatus.FAILED_TERMINAL,
                    attempt,
                    error=error,
                )
                self._publish_result(
                    paths,
                    result,
                    running_state.model_copy(
                        update={"status": StageStatus.FAILED_TERMINAL}
                    ),
                )
                event_log.emit(
                    event_name="stage.failed_terminal",
                    stage_kind=identity.stage_kind,
                    attempt=attempt,
                    status=StageStatus.FAILED_TERMINAL,
                    cache_key=cache_key,
                    fields={"error_code": error.code},
                    error=error,
                )
                return result
            except StageInterruption as exc:
                event_log.emit(
                    event_name="stage.interrupted",
                    stage_kind=identity.stage_kind,
                    attempt=attempt,
                    status=StageStatus.RUNNING,
                    cache_key=cache_key,
                    fields={"exception_type": type(exc).__name__},
                )
                raise
            except OSError as exc:
                event_log.emit(
                    event_name="stage.interrupted",
                    stage_kind=identity.stage_kind,
                    attempt=attempt,
                    status=StageStatus.RUNNING,
                    cache_key=cache_key,
                    fields={"exception_type": type(exc).__name__},
                )
                raise StageInterruption(
                    "artifact bundle publication was interrupted"
                ) from exc

            result = self._result(
                identity,
                cache_key,
                StageStatus.SUCCEEDED,
                attempt,
                artifacts=artifacts,
                metrics=output.metrics,
            )
            self._publish_result(
                paths,
                result,
                running_state.model_copy(update={"status": StageStatus.SUCCEEDED}),
            )
            event_log.emit(
                event_name="stage.succeeded",
                stage_kind=identity.stage_kind,
                attempt=attempt,
                status=StageStatus.SUCCEEDED,
                cache_key=cache_key,
                fields={"artifact_count": len(artifacts)},
            )
            return result

        error = TypedError(
            code="stage.attempts_exhausted",
            message="stage has no attempts remaining",
            retryable=False,
            details={"max_attempts": specification.max_attempts},
        )
        result = self._result(
            identity,
            cache_key,
            StageStatus.FAILED_TERMINAL,
            attempts,
            error=error,
        )
        state = self._state(
            validated_run_id,
            identity,
            cache_key,
            specification.max_attempts,
            attempts,
            StageStatus.FAILED_TERMINAL,
            paths["result"],
        )
        self._clear_staging(paths["staging"])
        self._publish_result(paths, result, state)
        event_log.emit(
            event_name="stage.failed_terminal",
            stage_kind=identity.stage_kind,
            attempt=attempts,
            status=StageStatus.FAILED_TERMINAL,
            cache_key=cache_key,
            fields={"error_code": error.code},
            error=error,
        )
        return result

    @staticmethod
    def _result(
        identity: StageIdentity,
        cache_key: str,
        status: StageStatus,
        attempt: int,
        artifacts: list[ArtifactReference] | None = None,
        metrics: Metrics | None = None,
        error: TypedError | None = None,
    ) -> StageResultEnvelope:
        stage_metrics = metrics or Metrics()
        committed_metrics = stage_metrics.model_copy(
            update={
                "counters": {
                    **stage_metrics.counters,
                    "attempts": attempt,
                }
            }
        )
        return StageResultEnvelope(
            identity=identity,
            cache_key=cache_key,
            status=status,
            attempt=attempt,
            artifacts=artifacts or [],
            metrics=committed_metrics,
            error=error,
        )

    def _publish_result(
        self,
        paths: dict[str, Path],
        result: StageResultEnvelope,
        state: PersistedStageState,
    ) -> None:
        if state.attempts != result.attempt or state.status is not result.status:
            raise ValueError("persisted state must match the committed result")
        if (
            result.status is StageStatus.SUCCEEDED
            and not self._published_bundle_is_valid(
                paths["artifacts"],
                result.artifacts,
            )
        ):
            raise StageInterruption(
                "published artifact bundle changed before result commit"
            )
        atomic_write_json(paths["result"], result)
        atomic_write_json(
            paths["attempts"] / f"{result.attempt:04d}.json",
            result,
        )
        atomic_write_json(paths["state"], state)

    def _read_valid_result(
        self,
        path: Path,
        *,
        identity: StageIdentity,
        cache_key: str,
        artifacts_directory: Path,
    ) -> tuple[StageResultEnvelope | None, bool]:
        try:
            raw_result = read_json(path)
        except FileNotFoundError:
            return None, False
        except (OSError, ValueError):
            return None, True
        try:
            result = StageResultEnvelope.model_validate(raw_result)
        except (ValueError, ValidationError):
            return None, True
        if result.identity != identity or result.cache_key != cache_key:
            return None, True
        if result.status is not StageStatus.SUCCEEDED:
            return result, False
        if not self._published_bundle_is_valid(
            artifacts_directory,
            result.artifacts,
        ):
            return None, True
        return result, False

    def _published_bundle_is_valid(
        self,
        artifacts_directory: Path,
        artifacts: list[ArtifactReference],
    ) -> bool:
        try:
            expected_root, _ = self._inspect_workspace_path(
                artifacts_directory,
                label="artifact directory",
                reject_source_reparse=True,
            )
            if not expected_root.is_dir():
                return False
            resolved_root = self._resolve_workspace_descendant(
                expected_root,
                label="artifact directory",
            )
            entries = tuple(expected_root.iterdir())
            actual_names = [entry.name.casefold() for entry in entries]
            if len(actual_names) != len(set(actual_names)):
                return False

            declared_names: list[str] = []
            for artifact in artifacts:
                lexical_path = self._lexical_workspace_descendant(
                    self.workspace / Path(artifact.path),
                    label="cached artifact path",
                )
                if lexical_path.parent != expected_root:
                    return False
                declared_names.append(lexical_path.name.casefold())
            if len(declared_names) != len(set(declared_names)):
                return False
            if set(actual_names) != set(declared_names):
                return False

            for entry in entries:
                inspected, _ = self._inspect_workspace_path(
                    entry,
                    label="cached artifact path",
                    reject_source_reparse=True,
                )
                if inspected.parent != expected_root or not inspected.is_file():
                    return False

            for artifact in artifacts:
                lexical_path, _ = self._inspect_workspace_path(
                    self.workspace / Path(artifact.path),
                    label="cached artifact path",
                    reject_source_reparse=True,
                )
                artifact_path = self._resolve_workspace_descendant(
                    lexical_path,
                    label="cached artifact path",
                )
                if artifact_path.parent != resolved_root:
                    return False
                if artifact_path.stat().st_size != artifact.size_bytes:
                    return False
                if _hash_file(artifact_path) != artifact.sha256:
                    return False
        except (OSError, RuntimeError, ValueError):
            return False
        return True

    def _paths(
        self,
        run_id: str,
        identity: StageIdentity,
        cache_key: str,
    ) -> dict[str, Path]:
        run_root = self.workspace / "runs" / run_id
        stage_root = run_root / "stages" / identity.stage_kind
        return {
            "events": run_root / "events.jsonl",
            "control": run_root / "control.json",
            "state": stage_root / "states" / f"{cache_key}.json",
            "result": stage_root / "results" / f"{cache_key}.json",
            "attempts": stage_root / "attempts" / cache_key,
            "artifacts": stage_root / "artifacts" / cache_key,
            "staging": stage_root / "staging" / cache_key,
        }

    def _write_control(self, run_id: str, request: ControlRequest) -> None:
        validated_run_id = TypeAdapter(Identifier).validate_python(run_id)
        atomic_write_json(
            self.workspace / "runs" / validated_run_id / "control.json",
            PersistedRunControl(requested=request),
        )

    @staticmethod
    def _read_control(path: Path) -> PersistedRunControl:
        try:
            return PersistedRunControl.model_validate(read_json(path))
        except FileNotFoundError:
            return PersistedRunControl()

    def _state(
        self,
        run_id: str,
        identity: StageIdentity,
        cache_key: str,
        max_attempts: int,
        attempts: int,
        status: StageStatus,
        result_path: Path,
    ) -> PersistedStageState:
        return PersistedStageState(
            run_id=run_id,
            identity=identity,
            cache_key=cache_key,
            max_attempts=max_attempts,
            attempts=attempts,
            status=status,
            result_path=self._relative(result_path),
        )

    @staticmethod
    def _read_state(
        path: Path,
        *,
        run_id: str,
        identity: StageIdentity,
        cache_key: str,
    ) -> PersistedStageState | None:
        try:
            state = PersistedStageState.model_validate(read_json(path))
        except (OSError, ValueError, ValidationError):
            return None
        if (
            state.run_id != run_id
            or state.identity != identity
            or state.cache_key != cache_key
        ):
            return None
        return state

    def _reconcile_state(
        self,
        paths: dict[str, Path],
        result: StageResultEnvelope,
        run_id: str,
        identity: StageIdentity,
        cache_key: str,
        max_attempts: int,
    ) -> PersistedStageState:
        state = self._state(
            run_id,
            identity,
            cache_key,
            max_attempts,
            result.attempt,
            result.status,
            paths["result"],
        )
        self._reconcile_attempt(paths, result)
        atomic_write_json(paths["state"], state)
        return state

    @staticmethod
    def _reconcile_attempt(
        paths: dict[str, Path],
        result: StageResultEnvelope,
    ) -> None:
        atomic_write_json(
            paths["attempts"] / f"{result.attempt:04d}.json",
            result,
        )

    def _prepare_staged_artifacts(
        self,
        staging_directory: Path,
        output: StageOutput,
    ) -> list[tuple[StagedArtifact, str, int]]:
        try:
            staging_root, _ = self._inspect_workspace_path(
                staging_directory,
                label="staging directory",
                reject_source_reparse=True,
            )
        except ValueError as exc:
            raise _InvalidStageOutput("staging directory is unsafe") from exc
        if not staging_root.is_dir():
            raise _InvalidStageOutput("staging directory is missing")

        entries = tuple(staging_root.iterdir())
        actual_names = [entry.name.casefold() for entry in entries]
        if len(actual_names) != len(set(actual_names)):
            raise _InvalidStageOutput(
                "staging entries must be case-insensitively unique"
            )
        declared_names = {
            artifact.artifact_name.casefold() for artifact in output.artifacts
        }
        if set(actual_names) != declared_names:
            raise _InvalidStageOutput(
                "staging entries must exactly match declared artifacts"
            )

        prepared: list[tuple[StagedArtifact, str, int]] = []
        for artifact in output.artifacts:
            try:
                source, _ = self._inspect_workspace_path(
                    staging_root / artifact.artifact_name,
                    label="staged artifact",
                    reject_source_reparse=True,
                )
            except ValueError as exc:
                raise _InvalidStageOutput("staged artifact is unsafe") from exc
            if source.parent != staging_root or not source.is_file():
                raise _InvalidStageOutput(
                    "each staged artifact must be a direct regular file"
                )
            size_bytes = source.stat().st_size
            prepared.append((artifact, _hash_file(source), size_bytes))
        return prepared

    def _publish_staged_bundle(
        self,
        paths: dict[str, Path],
        prepared: list[tuple[StagedArtifact, str, int]],
    ) -> list[ArtifactReference]:
        staging_root, _ = self._inspect_workspace_path(
            paths["staging"],
            label="staging directory",
            reject_source_reparse=True,
        )
        artifact_root, _ = self._inspect_workspace_path(
            paths["artifacts"],
            label="artifact directory",
            reject_source_reparse=True,
        )
        if artifact_root.exists():
            raise _InvalidStageOutput("artifact directory must not already exist")

        artifact_parent, _ = self._inspect_workspace_path(
            artifact_root.parent,
            label="artifact parent directory",
            reject_source_reparse=True,
        )
        artifact_parent.mkdir(parents=True, exist_ok=True)
        self._inspect_workspace_path(
            artifact_parent,
            label="artifact parent directory",
            reject_source_reparse=True,
        )

        source_parent_snapshot = self._snapshot_existing_path_chain(
            staging_root.parent,
            label="staging parent directory",
        )
        destination_parent_snapshot = self._snapshot_existing_path_chain(
            artifact_parent,
            label="artifact parent directory",
        )
        staging_identity = _entry_identity(staging_root)
        self._assert_path_chain_unchanged(source_parent_snapshot)
        self._assert_path_chain_unchanged(destination_parent_snapshot)
        if _entry_identity(staging_root) != staging_identity:
            raise _InvalidStageOutput("staging directory identity changed")
        os.replace(staging_root, artifact_root)
        self._assert_path_chain_unchanged(source_parent_snapshot)
        self._assert_path_chain_unchanged(destination_parent_snapshot)
        if _entry_identity(artifact_root) != staging_identity:
            raise _InvalidStageOutput("published directory identity changed")

        references: list[ArtifactReference] = []
        for descriptor, expected_sha256, expected_size in prepared:
            destination, _ = self._inspect_workspace_path(
                artifact_root / descriptor.artifact_name,
                label="published artifact",
                reject_source_reparse=True,
            )
            if destination.parent != artifact_root or not destination.is_file():
                raise _InvalidStageOutput(
                    "each published artifact must be a direct regular file"
                )
            if destination.stat().st_size != expected_size:
                raise _InvalidStageOutput("published artifact size changed")
            if _hash_file(destination) != expected_sha256:
                raise _InvalidStageOutput("published artifact hash changed")
            references.append(
                ArtifactReference(
                    artifact_kind=descriptor.artifact_kind,
                    path=self._relative(destination),
                    sha256=expected_sha256,
                    size_bytes=expected_size,
                    media_type=descriptor.media_type,
                    durable=descriptor.durable,
                )
            )
        return references

    def _relative(self, path: Path) -> str:
        return Path(path).relative_to(self.workspace).as_posix()

    def _clear_staging(self, path: Path) -> None:
        self._remove_workspace_path(path, label="staging path")

    def _clear_uncommitted_derived(self, paths: dict[str, Path]) -> None:
        for key in ("artifacts", "staging"):
            self._remove_workspace_path(
                paths[key],
                label=f"uncommitted {key} path",
            )

    def _invalidate_cache(self, paths: dict[str, Path]) -> None:
        for key in ("attempts", "artifacts", "staging", "result", "state"):
            self._remove_workspace_path(
                paths[key],
                label=f"cache {key} path",
            )

    def _remove_workspace_path(self, path: Path, *, label: str) -> None:
        source, source_kind = self._inspect_workspace_path(
            path,
            label=label,
            reject_source_reparse=False,
        )
        if not os.path.lexists(source):
            return

        parent_snapshot = self._snapshot_existing_path_chain(
            source.parent,
            label=f"{label} parent",
        )
        source_identity = _entry_identity(source)
        quarantine = source.with_name(f".{source.name}.{uuid4().hex}.delete")
        if os.path.lexists(quarantine):
            raise RuntimeError("cleanup quarantine path unexpectedly exists")

        self._assert_path_chain_unchanged(parent_snapshot)
        if _entry_identity(source) != source_identity:
            raise ValueError(f"{label} changed before cleanup")
        try:
            os.replace(source, quarantine)
        except FileNotFoundError:
            return
        self._assert_path_chain_unchanged(parent_snapshot)
        if _entry_identity(quarantine) != source_identity:
            raise ValueError(f"{label} changed during cleanup quarantine")
        self._delete_quarantined_entry(quarantine, known_kind=source_kind)

    def _delete_quarantined_entry(
        self,
        path: Path,
        *,
        known_kind: PathEntryKind | None = None,
    ) -> None:
        try:
            entry_kind = known_kind or PathEntryKind(self.path_entry_inspector(path))
            if entry_kind is PathEntryKind.SYMLINK:
                path.unlink(missing_ok=True)
                return
            if entry_kind is PathEntryKind.JUNCTION:
                path.rmdir()
                return

            entry_stat = os.lstat(path)
            if stat.S_ISLNK(entry_stat.st_mode):
                path.unlink(missing_ok=True)
                return
            if stat.S_ISDIR(entry_stat.st_mode):
                for child in tuple(path.iterdir()):
                    self._delete_quarantined_entry(child)
                path.rmdir()
                return
            path.unlink(missing_ok=True)
        except FileNotFoundError:
            return

    def _snapshot_existing_path_chain(
        self,
        path: Path,
        *,
        label: str,
    ) -> tuple[tuple[Path, tuple[int, int, int]], ...]:
        source = self._lexical_workspace_descendant(path, label=label)
        chain = [self.workspace]
        current = self.workspace
        for component in source.relative_to(self.workspace).parts:
            current /= component
            chain.append(current)

        snapshot: list[tuple[Path, tuple[int, int, int]]] = []
        for entry in chain:
            if not os.path.lexists(entry):
                continue
            entry_kind = PathEntryKind(self.path_entry_inspector(entry))
            if entry_kind is not PathEntryKind.REGULAR:
                raise ValueError(f"{label} has a symlink or junction")
            snapshot.append((entry, _entry_identity(entry)))
        return tuple(snapshot)

    def _assert_path_chain_unchanged(
        self,
        snapshot: tuple[tuple[Path, tuple[int, int, int]], ...],
    ) -> None:
        for entry, expected_identity in snapshot:
            if not os.path.lexists(entry):
                raise ValueError("filesystem path chain changed during operation")
            entry_kind = PathEntryKind(self.path_entry_inspector(entry))
            if entry_kind is not PathEntryKind.REGULAR:
                raise ValueError("filesystem path chain became a reparse point")
            if _entry_identity(entry) != expected_identity:
                raise ValueError("filesystem path chain identity changed")

    def _inspect_workspace_path(
        self,
        path: Path,
        *,
        label: str,
        reject_source_reparse: bool,
    ) -> tuple[Path, PathEntryKind]:
        source = self._lexical_workspace_descendant(path, label=label)
        relative_parts = source.relative_to(self.workspace).parts
        ancestor = self.workspace
        workspace_kind = PathEntryKind(self.path_entry_inspector(ancestor))
        if workspace_kind is not PathEntryKind.REGULAR:
            raise ValueError(f"{label} has an intermediate symlink or junction")
        for component in relative_parts[:-1]:
            ancestor /= component
            entry_kind = PathEntryKind(self.path_entry_inspector(ancestor))
            if entry_kind is not PathEntryKind.REGULAR:
                raise ValueError(f"{label} has an intermediate symlink or junction")

        source_kind = PathEntryKind(self.path_entry_inspector(source))
        if reject_source_reparse and source_kind is not PathEntryKind.REGULAR:
            raise ValueError(f"{label} must not be a symlink or junction")
        return source, source_kind

    def _lexical_workspace_descendant(self, path: Path, *, label: str) -> Path:
        source = Path(path)
        if not source.is_absolute():
            source = self.workspace / source
        source = Path(os.path.abspath(source))
        if source == self.workspace or not source.is_relative_to(self.workspace):
            raise ValueError(f"{label} must be a non-root workspace descendant")
        return source

    def _resolve_workspace_descendant(self, path: Path, *, label: str) -> Path:
        source = self._lexical_workspace_descendant(path, label=label)
        target = source.resolve()
        if target == self.workspace or not target.is_relative_to(self.workspace):
            raise ValueError(f"{label} must stay inside the workspace")
        return target


def _hash_file(path: Path) -> str:
    digest = hashlib.sha256()
    with Path(path).open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _entry_identity(path: Path) -> tuple[int, int, int]:
    entry_stat = os.lstat(path)
    return (
        entry_stat.st_dev,
        entry_stat.st_ino,
        stat.S_IFMT(entry_stat.st_mode),
    )
