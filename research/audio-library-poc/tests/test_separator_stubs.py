"""Tests for the separator protocol and both stub adapters."""

from __future__ import annotations

from dataclasses import replace
from pathlib import Path
from typing import cast

import pytest
from pydantic import ValidationError

from audio_library_poc.cache import hash_config, stage_cache_key
from audio_library_poc.models import Metrics, StageIdentity
from audio_library_poc.separation import SeparatorPrecision
from audio_library_poc.separators import (
    BS_ROFORMER_STAGE_KIND,
    DEMUCS_HTDEMUCS_6S_STAGE_KIND,
    BsRoformerSeparator,
    BsRoformerStageConfig,
    DemucsSeparator,
    DemucsStageConfig,
    Separator,
    SeparatorNotImplementedError,
    SeparatorRequest,
    SeparatorResponse,
)

INPUT_SHA256 = "a" * 64
MODEL_SHA256 = "b" * 64


def _identity(stage_kind: str) -> StageIdentity:
    return StageIdentity(
        stage_kind=stage_kind,
        input_sha256=INPUT_SHA256,
        implementation_version="0.0.0",
        config_sha256=hash_config({"payload": "smoke"}),
        output_schema_version="1.0.0",
        model_identifier="pinned/model:v1",
        model_sha256=MODEL_SHA256,
        code_revision="test-revision",
    )


def _request(config, staging: Path, stage_kind: str) -> SeparatorRequest:
    return SeparatorRequest(
        source_path=staging / "audio.wav",
        source_sha256=INPUT_SHA256,
        staging_directory=staging,
        config=config,
        stage_identity=_identity(stage_kind),
    )


def _valid_bs_roformer_config() -> BsRoformerStageConfig:
    return BsRoformerStageConfig(
        source_relative_path="originals/track.wav",
        checkpoint_relative_path="models/bs-rofo-sw-fixed.ckpt",
        config_relative_path="models/bs-rofo-sw-fixed.yaml",
        segment=8.0,
        overlap=0.25,
        shifts=1,
        device="cuda",
        precision=SeparatorPrecision.FLOAT16,
        retain_native=False,
        batch_size=1,
        use_test_time_augmentation=False,
    )


def _valid_demucs_config() -> DemucsStageConfig:
    return DemucsStageConfig(
        source_relative_path="originals/track.wav",
        segment=None,
        overlap=0.25,
        shifts=1,
        device="cuda",
        precision=SeparatorPrecision.FLOAT32,
        retain_native=False,
        split=True,
        jobs=0,
    )


def test_stub_adapters_conform_to_the_separator_protocol() -> None:
    assert isinstance(BsRoformerSeparator(), Separator)
    assert isinstance(DemucsSeparator(), Separator)


def test_bs_roformer_stage_kind_and_candidate_id_are_stable() -> None:
    assert BS_ROFORMER_STAGE_KIND == "separator.bs_roformer"
    assert BsRoformerSeparator.candidate_id == "bs_roformer"
    assert BsRoformerSeparator.ConfigModel is BsRoformerStageConfig


def test_demucs_stage_kind_and_candidate_id_are_stable() -> None:
    assert DEMUCS_HTDEMUCS_6S_STAGE_KIND == "separator.demucs_htdemucs_6s"
    assert DemucsSeparator.candidate_id == "demucs_htdemucs_6s"
    assert DemucsSeparator.ConfigModel is DemucsStageConfig


def test_bs_roformer_config_rejects_absolute_source_path() -> None:
    with pytest.raises(ValidationError) as captured:
        BsRoformerStageConfig(source_relative_path="/absolute/path.wav")
    assert "source_relative_path" in str(captured.value)


def test_demucs_config_rejects_extra_keys() -> None:
    with pytest.raises(ValidationError):
        DemucsStageConfig(
            source_relative_path="originals/track.wav",
            unexpected_key="oops",
        )


def test_bs_roformer_reports_missing_checkpoint_before_touching_torch(
    tmp_path: Path,
) -> None:
    # The real runtime resolves the checkpoint path before importing the
    # heavy torch/bs_roformer packages, so this test proves the wiring
    # without needing any model weights on disk.
    from audio_library_poc.execution import ExpectedStageFailure

    request = _request(
        _valid_bs_roformer_config(),
        tmp_path,
        BS_ROFORMER_STAGE_KIND,
    )
    with pytest.raises(ExpectedStageFailure) as captured:
        BsRoformerSeparator().separate(request)
    assert captured.value.error.code == "separator.checkpoint_missing"
    assert captured.value.error.retryable is False
    assert captured.value.error.details["relative_path"] == (
        "models/bs-rofo-sw-fixed.ckpt"
    )


def test_demucs_separate_raises_not_implemented(tmp_path: Path) -> None:
    request = _request(
        _valid_demucs_config(),
        tmp_path,
        DEMUCS_HTDEMUCS_6S_STAGE_KIND,
    )
    with pytest.raises(SeparatorNotImplementedError) as captured:
        DemucsSeparator().separate(request)
    assert captured.value.error.code == "separator.not_implemented"
    assert captured.value.error.retryable is False
    assert captured.value.error.details["candidate_id"] == "demucs_htdemucs_6s"


def test_bs_roformer_rejects_wrong_config_type(tmp_path: Path) -> None:
    wrong_request = _request(
        _valid_demucs_config(),
        tmp_path,
        BS_ROFORMER_STAGE_KIND,
    )
    with pytest.raises(TypeError):
        BsRoformerSeparator().separate(wrong_request)


def test_separator_response_defaults_have_no_retained_native(tmp_path: Path) -> None:
    class NoopSeparator:
        candidate_id = "noop"
        implementation_version = "0.0.0"
        ConfigModel = BsRoformerStageConfig

        def separate(self, request: SeparatorRequest) -> SeparatorResponse:
            raise NotImplementedError

    _ = NoopSeparator()
    metrics = Metrics()
    # Confirm the dataclass defaults do not carry retained-native filenames or
    # a non-JSON result artifact name — a real separator must opt into either.
    example = SeparatorResponse(
        result=cast(object, None),  # not read by these assertions
        stem_artifact_names=("vocals.wav", "drums.wav"),
        metrics=metrics,
    )
    assert example.retained_native_artifact_names == ()
    assert example.result_artifact_name == "separation-result.json"
    assert replace(example, metrics=Metrics(counters={"x": 1})).metrics.counters == {
        "x": 1
    }


def test_cache_identity_covers_pinned_model(tmp_path: Path) -> None:
    identity_a = _identity(BS_ROFORMER_STAGE_KIND)
    identity_b = identity_a.model_copy(update={"model_sha256": "c" * 64})
    assert stage_cache_key(identity_a) != stage_cache_key(identity_b)
