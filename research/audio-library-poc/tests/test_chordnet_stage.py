"""Offline contracts for the pinned ChordNet stage."""

import pytest
from pydantic import ValidationError

from audio_library_poc._chordnet_runtime import (
    _infer_chordnet_architecture,
    _resolve_chordnet_state_dict,
)
from audio_library_poc.chord_analysis import ChordFrameEvidenceArtifact
from audio_library_poc.chordnet_stage import ChordNetStageConfig


def _config(**overrides):
    values = {
        "source_relative_path": "originals/track.wav",
        "checkpoint_relative_path": "models/chordnet.pth",
        "checkpoint_source": "https://github.com/ptnghia-j/ChordMini/releases/model",
        "checkpoint_terms_reference": "https://github.com/ptnghia-j/ChordMini/blob/main/LICENSE",
    }
    values.update(overrides)
    return ChordNetStageConfig(**values)


def test_chordnet_config_has_honest_window_defaults() -> None:
    config = _config()
    assert (config.seq_len, config.hop_length, config.overlap) == (108, 2048, 0.5)
    assert config.logit_smoothing_kernel == 9


def test_chordnet_rejects_placeholder_checkpoint_provenance() -> None:
    with pytest.raises(ValidationError):
        _config(checkpoint_source="https://example.invalid/model")


def test_chordnet_rejects_even_smoothing_window() -> None:
    with pytest.raises(ValidationError):
        _config(logit_smoothing_kernel=2)


def test_frame_evidence_requires_explicit_pre_and_post_decisions() -> None:
    payload = _frame_evidence_payload()
    evidence = ChordFrameEvidenceArtifact.model_validate(payload)
    assert evidence.frames[0].post_categorical_index == 4
    assert evidence.effective_settings.device == "cuda"
    assert evidence.effective_settings.effective_precision == "float16"
    assert evidence.effective_settings.checkpoint_source == _config().checkpoint_source

    payload["effective_settings"] = {"seq_len": 108}
    with pytest.raises(ValidationError):
        ChordFrameEvidenceArtifact.model_validate(payload)


@pytest.mark.parametrize(
    ("settings_update", "outer_update"),
    [
        ({"unexpected": "value"}, {}),
        ({"effective_precision": "int8"}, {}),
        ({"checkpoint_terms_reference": None}, {}),
        ({"frame_duration_seconds": 0.0}, {}),
        ({}, {"frame_duration_seconds": 0.1}),
    ],
)
def test_frame_evidence_rejects_non_replayable_settings(
    settings_update, outer_update
) -> None:
    payload = _frame_evidence_payload()
    payload["effective_settings"].update(settings_update)
    payload.update(outer_update)

    with pytest.raises(ValidationError):
        ChordFrameEvidenceArtifact.model_validate(payload)


def _frame_evidence_payload() -> dict[str, object]:
    return {
        "candidate": "chordnet",
        "implementation_version": "1.0.0",
        "config_sha256": "a" * 64,
        "source_sha256": "b" * 64,
        "model_sha256": "c" * 64,
        "code_revision": "test",
        "frame_duration_seconds": 2048 / 22050,
        "effective_settings": {
            "sample_rate": 22050,
            "hop_length": 2048,
            "seq_len": 108,
            "device": "cuda",
            "effective_precision": "float16",
            "frame_duration_seconds": 2048 / 22050,
            "frame_timing": "exact_hop_length_divided_by_sample_rate",
            "feature_transform": "log(abs(cqt)+1e-6).T",
            "normalization_strategy": "raw_pad_then_normalize",
            "overlap": 0.5,
            "window_hop_frames": 54,
            "overlap_aggregation": "mean_logits",
            "logit_smoothing_kernel": 9,
            "logit_smoothing_gaussian": False,
            "categorical_smoothing_window": 1,
            "checkpoint_source": "https://github.com/ptnghia-j/ChordMini/releases/model",
            "checkpoint_terms_reference": "https://github.com/ptnghia-j/ChordMini/blob/main/LICENSE",
        },
        "frames": [
            {
                "frame_index": 0,
                "overlap_votes": 1,
                "raw_argmax_index": 4,
                "raw_top_logit": 2.0,
                "raw_runner_up_index": 3,
                "raw_runner_up_logit": 1.0,
                "post_logit_smoothing_argmax_index": 4,
                "post_categorical_index": 4,
                "categorical_votes": 1,
            }
        ],
    }


def test_chordnet_infers_student_architecture_before_checkpoint_overrides() -> None:
    class Shape:
        def __init__(self, *shape):
            self.shape = shape

    state = {
        "fc.weight": Shape(170, 144),
        "transformer.encoder_f.0.attn_layer.0.out_proj.weight": Shape(12, 12),
        "transformer.encoder_f.0.attn_layer.0.in_proj_weight": Shape(36, 12),
        "transformer.encoder_t.0.attn_layer.0.in_proj_weight": Shape(432, 144),
        "transformer.decoder.attn_layer1.0.in_proj_weight": Shape(432, 144),
        "transformer.encoder_f.0.attn_layer.2.in_proj_weight": Shape(36, 12),
        "transformer.encoder_t.0.attn_layer.3.in_proj_weight": Shape(432, 144),
        "transformer.decoder.attn_layer1.2.in_proj_weight": Shape(432, 144),
    }
    inferred = _infer_chordnet_architecture(
        state,
        {
            "n_freq": 144,
            "n_classes": 170,
            "n_group": 12,
            "f_layer": 5,
            "t_layer": 5,
            "d_layer": 5,
            "f_head": 8,
            "t_head": 8,
            "d_head": 8,
            "dropout": 0.2,
        },
    )
    assert (
        inferred["n_group"],
        inferred["f_layer"],
        inferred["t_layer"],
        inferred["d_layer"],
    ) == (12, 3, 4, 3)
    assert (inferred["f_head"], inferred["t_head"], inferred["d_head"]) == (6, 8, 8)


def test_chordnet_accepts_dataparallel_state_dict_at_load_seam() -> None:
    class Shape:
        def __init__(self, *shape):
            self.shape = shape

    state = _resolve_chordnet_state_dict(
        {
            "model_state_dict": {
                "module.fc.weight": Shape(170, 144),
                "module.transformer.encoder_f.0.attn_layer.0.out_proj.weight": (
                    Shape(12, 12)
                ),
            }
        }
    )

    assert "fc.weight" in state
    assert all(not key.startswith("module.") for key in state)
    inferred = _infer_chordnet_architecture(state, {"n_freq": 0, "n_classes": 0})
    assert inferred["n_freq"] == 144
    assert inferred["n_classes"] == 170
    assert inferred["n_group"] == 12
