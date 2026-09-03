"""Tests for the Separator-to-stage bridge."""

from __future__ import annotations

import hashlib
from pathlib import Path
from typing import ClassVar

import pytest

from audio_library_poc.cache import hash_config, stage_cache_key
from audio_library_poc.execution import ExpectedStageFailure
from audio_library_poc.metadata import hash_file
from audio_library_poc.models import StageIdentity, StageSpecification
from audio_library_poc.separator_stage import SeparatorStageExecutor
from audio_library_poc.separators import (
    BS_ROFORMER_STAGE_KIND,
    BsRoformerSeparator,
    BsRoformerStageConfig,
    SeparatorNotImplementedError,
    SeparatorRequest,
    SeparatorResponse,
)

MODEL_IDENTIFIER = "pinned/bs-roformer:v1"
MODEL_SHA256 = "b" * 64


def _build_source(workspace: Path, *, contents: bytes = b"AUDIO") -> tuple[str, str]:
    originals = workspace / "originals"
    originals.mkdir(parents=True, exist_ok=True)
    file_path = originals / "track.wav"
    file_path.write_bytes(contents)
    return "originals/track.wav", hashlib.sha256(contents).hexdigest()


def _specification(
    *,
    stage_kind: str = BS_ROFORMER_STAGE_KIND,
    source_relative_path: str = "originals/track.wav",
    model_identifier: str | None = MODEL_IDENTIFIER,
    model_sha256: str | None = MODEL_SHA256,
    extra_config: dict[str, object] | None = None,
) -> StageSpecification:
    config: dict[str, object] = {
        "source_relative_path": source_relative_path,
        "checkpoint_relative_path": "models/bs-rofo-sw-fixed.ckpt",
        "config_relative_path": "models/bs-rofo-sw-fixed.yaml",
        "segment": 8.0,
        "overlap": 0.25,
        "shifts": 1,
        "device": "cuda",
        "precision": "float16",
        "retain_native": False,
        "batch_size": 1,
        "use_test_time_augmentation": False,
    }
    if extra_config is not None:
        config.update(extra_config)
    return StageSpecification(
        stage_kind=stage_kind,
        implementation_version="1.0.0",
        config=config,
        model_identifier=model_identifier,
        model_sha256=model_sha256,
    )


def _identity(specification: StageSpecification, input_sha256: str) -> StageIdentity:
    return StageIdentity(
        stage_kind=specification.stage_kind,
        input_sha256=input_sha256,
        implementation_version=specification.implementation_version,
        config_sha256=hash_config(specification.config),
        output_schema_version=specification.output_schema_version,
        model_identifier=specification.model_identifier,
        model_sha256=specification.model_sha256,
        code_revision="test-revision",
    )


def _execute(
    executor: SeparatorStageExecutor,
    *,
    specification: StageSpecification,
    input_sha256: str,
    tmp_path: Path,
):
    identity = _identity(specification, input_sha256)
    return executor.execute(
        specification=specification,
        identity=identity,
        cache_key=stage_cache_key(identity),
        attempt=1,
        staging_directory=tmp_path / "staging",
    )


def test_invalid_config_yields_typed_failure(tmp_path: Path) -> None:
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    source_relative, source_sha256 = _build_source(workspace)
    executor = SeparatorStageExecutor(BsRoformerSeparator(), workspace)
    specification = _specification(
        source_relative_path=source_relative,
        extra_config={"batch_size": -1},
    )

    with pytest.raises(ExpectedStageFailure) as captured:
        _execute(
            executor,
            specification=specification,
            input_sha256=source_sha256,
            tmp_path=tmp_path,
        )

    assert captured.value.error.code == "separator.invalid_config"
    assert captured.value.error.retryable is False


def test_missing_model_identity_yields_typed_failure(tmp_path: Path) -> None:
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    source_relative, source_sha256 = _build_source(workspace)
    executor = SeparatorStageExecutor(BsRoformerSeparator(), workspace)
    specification = _specification(
        source_relative_path=source_relative,
        model_identifier=None,
        model_sha256=None,
    )

    with pytest.raises(ExpectedStageFailure) as captured:
        _execute(
            executor,
            specification=specification,
            input_sha256=source_sha256,
            tmp_path=tmp_path,
        )

    assert captured.value.error.code == "separator.missing_model_identity"


def test_source_missing_yields_typed_failure(tmp_path: Path) -> None:
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    executor = SeparatorStageExecutor(BsRoformerSeparator(), workspace)
    specification = _specification(source_relative_path="originals/track.wav")

    with pytest.raises(ExpectedStageFailure) as captured:
        _execute(
            executor,
            specification=specification,
            input_sha256="a" * 64,
            tmp_path=tmp_path,
        )

    assert captured.value.error.code == "separator.source_missing"
    assert captured.value.error.details["source_relative_path"] == (
        "originals/track.wav"
    )


def test_source_hash_mismatch_yields_typed_failure(tmp_path: Path) -> None:
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    source_relative, real_sha256 = _build_source(workspace, contents=b"REAL AUDIO")
    executor = SeparatorStageExecutor(BsRoformerSeparator(), workspace)
    specification = _specification(source_relative_path=source_relative)

    declared_wrong = "0" * 64
    with pytest.raises(ExpectedStageFailure) as captured:
        _execute(
            executor,
            specification=specification,
            input_sha256=declared_wrong,
            tmp_path=tmp_path,
        )

    assert captured.value.error.code == "separator.source_hash_mismatch"
    assert captured.value.error.details == {
        "declared": declared_wrong,
        "actual": real_sha256,
    }


def test_runtime_checkpoint_error_propagates_through_bridge(tmp_path: Path) -> None:
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    source_relative, source_sha256 = _build_source(workspace)
    executor = SeparatorStageExecutor(BsRoformerSeparator(), workspace)
    specification = _specification(source_relative_path=source_relative)

    with pytest.raises(ExpectedStageFailure) as captured:
        _execute(
            executor,
            specification=specification,
            input_sha256=source_sha256,
            tmp_path=tmp_path,
        )

    # With no checkpoint file at the configured workspace path, the runtime
    # rejects before importing torch — proving the bridge / runtime seam is
    # wired without needing model weights.
    assert captured.value.error.code == "separator.checkpoint_missing"
    assert captured.value.error.details["relative_path"] == (
        "models/bs-rofo-sw-fixed.ckpt"
    )


def test_bridge_hashes_the_source_file_exactly_once(
    tmp_path: Path,
    monkeypatch,
) -> None:
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    source_relative, source_sha256 = _build_source(workspace, contents=b"HASH-ONCE")
    executor = SeparatorStageExecutor(BsRoformerSeparator(), workspace)
    specification = _specification(source_relative_path=source_relative)

    calls: list[Path] = []
    real_hash_file = hash_file

    def counting_hash_file(path, **kwargs):
        calls.append(Path(path))
        return real_hash_file(path, **kwargs)

    monkeypatch.setattr(
        "audio_library_poc.separator_stage.hash_file",
        counting_hash_file,
    )

    with pytest.raises(ExpectedStageFailure):
        _execute(
            executor,
            specification=specification,
            input_sha256=source_sha256,
            tmp_path=tmp_path,
        )

    assert len(calls) == 1
    assert calls[0] == (workspace / "originals" / "track.wav").resolve()


class _RecordingSeparator:
    """Test separator that records the request instead of doing inference."""

    candidate_id: ClassVar[str] = "recording"
    implementation_version: ClassVar[str] = "0.0.0"
    ConfigModel: ClassVar[type[BsRoformerStageConfig]] = BsRoformerStageConfig

    def __init__(self) -> None:
        self.requests: list[SeparatorRequest] = []

    def separate(self, request: SeparatorRequest) -> SeparatorResponse:
        self.requests.append(request)
        raise SeparatorNotImplementedError(self.candidate_id)


def test_request_carries_resolved_source_path_and_config(tmp_path: Path) -> None:
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    source_relative, source_sha256 = _build_source(workspace)
    recorder = _RecordingSeparator()
    executor = SeparatorStageExecutor(recorder, workspace)
    specification = _specification(source_relative_path=source_relative)

    with pytest.raises(SeparatorNotImplementedError):
        _execute(
            executor,
            specification=specification,
            input_sha256=source_sha256,
            tmp_path=tmp_path,
        )

    assert len(recorder.requests) == 1
    request = recorder.requests[0]
    assert request.source_path == (workspace / "originals" / "track.wav").resolve()
    assert request.source_sha256 == source_sha256
    assert request.staging_directory == tmp_path / "staging"
    assert request.staging_directory.is_dir()
    assert isinstance(request.config, BsRoformerStageConfig)
    assert request.stage_identity.model_sha256 == MODEL_SHA256
