"""Lazy, pinned-source ChordNet inference runtime."""

from __future__ import annotations

from audio_library_poc.chord_analysis import (
    ChordAnalysisResult,
    ChordAnalyzerProvenance,
    ChordFrameEvidenceArtifact,
    ChordSourceFacts,
    EffectiveChordAnalyzerSettings,
    summarize_coverage,
)
from audio_library_poc.chordmini_btc_stage import (
    build_chordmini_metrics,
    build_segments,
)
from audio_library_poc.execution import ExpectedStageFailure
from audio_library_poc.models import TypedError


def _count_layers(state_dict, prefix: str, marker: str) -> int | None:
    indices: set[int] = set()
    for key in state_dict:
        if prefix not in key:
            continue
        parts = str(key).split(".")
        for index, part in enumerate(parts[:-1]):
            if part == marker and parts[index + 1].isdigit():
                indices.add(int(parts[index + 1]))
                break
    return max(indices) + 1 if indices else None


def _infer_chordnet_architecture(
    state_dict, defaults: dict[str, object]
) -> dict[str, object]:
    """Mirror the pinned loader's state-shape inference before config overrides."""

    inferred = dict(defaults)
    fc_weight = state_dict["fc.weight"]
    inferred["n_freq"] = int(fc_weight.shape[1])
    inferred["n_classes"] = int(fc_weight.shape[0])
    feature_key = "transformer.encoder_f.0.attn_layer.0.out_proj.weight"
    if feature_key in state_dict:
        feature_dim = int(state_dict[feature_key].shape[0])
        if feature_dim and int(inferred["n_freq"]) % feature_dim == 0:
            inferred["n_group"] = int(inferred["n_freq"]) // feature_dim
    for field, prefix, marker in (
        ("f_layer", "transformer.encoder_f.", "attn_layer"),
        ("t_layer", "transformer.encoder_t.", "attn_layer"),
        ("d_layer", "transformer.decoder.", "attn_layer1"),
    ):
        value = _count_layers(state_dict, prefix, marker)
        if value is not None:
            inferred[field] = value
    for field, prefix in (
        ("f_head", "transformer.encoder_f."),
        ("t_head", "transformer.encoder_t."),
        ("d_head", "transformer.decoder."),
    ):
        for key, value in state_dict.items():
            if prefix in key and "attn_layer.0.in_proj_weight" in key:
                dimension = int(value.shape[1])
                for heads in (8, 6, 4, 2, 1):
                    if dimension % heads == 0:
                        inferred[field] = heads
                        break
                break
    return inferred


def _resolve_chordnet_state_dict(checkpoint) -> dict[str, object]:
    """Extract and normalize the state dict before inspecting its shape."""

    if not isinstance(checkpoint, dict):
        raise ExpectedStageFailure(
            TypedError(
                code="chord.checkpoint_shape_unexpected",
                message="ChordNet checkpoint has no compatible state dict",
                retryable=False,
            )
        )
    state = checkpoint.get("model_state_dict", checkpoint.get("model", checkpoint))
    if not isinstance(state, dict):
        raise ExpectedStageFailure(
            TypedError(
                code="chord.checkpoint_shape_unexpected",
                message="ChordNet checkpoint has no compatible state dict",
                retryable=False,
            )
        )
    normalized = {
        str(key).removeprefix("module."): value for key, value in state.items()
    }
    if "fc.weight" not in normalized:
        raise ExpectedStageFailure(
            TypedError(
                code="chord.checkpoint_shape_unexpected",
                message="ChordNet state dict has no fc.weight",
                retryable=False,
            )
        )
    return normalized


def run_chordnet_inference(
    *, source_path, checkpoint_path, config, identity, **_kwargs
) -> tuple[ChordAnalysisResult, object, ChordFrameEvidenceArtifact]:
    """Run only after the bridge has verified checkpoint provenance and bytes."""

    import time

    from audio_library_poc.metadata import hash_file

    end_to_end_started = time.perf_counter()

    if hash_file(checkpoint_path) != identity.model_sha256:
        raise ExpectedStageFailure(
            TypedError(
                code="chord.checkpoint_hash_mismatch",
                message="checkpoint bytes changed before deserialization",
                retryable=False,
            )
        )

    import librosa
    import numpy as np
    import soundfile as sf
    import torch

    from audio_library_poc._chordmini_btc_runtime import _run_inference
    from audio_library_poc.chordnet_stage import CHORDMINI_CHORDNET_CANDIDATE_ID
    from audio_library_poc.vendor.chordmini.model.chord_net import ChordNet
    from audio_library_poc.vendor.chordmini.model.chords import idx2voca_chord

    device = torch.device(config.device)
    if device.type == "cuda" and not torch.cuda.is_available():
        raise ExpectedStageFailure(
            TypedError(
                code="chord.cuda_unavailable",
                message="config requested cuda but CUDA is unavailable",
                retryable=False,
            )
        )
    # The executor performed the early, dependency-free hash gate. Repeat it
    # immediately before deserializing because a local checkpoint can still be
    # replaced while torch and the model runtime are loading.
    if hash_file(checkpoint_path) != identity.model_sha256:
        raise ExpectedStageFailure(
            TypedError(
                code="chord.checkpoint_hash_mismatch",
                message="checkpoint bytes changed before deserialization",
                retryable=False,
            )
        )
    checkpoint = torch.load(
        str(checkpoint_path), map_location="cpu", weights_only=False
    )
    state = _resolve_chordnet_state_dict(checkpoint)
    # Pinned checkpoint loader fallbacks precede checkpoint-config overrides.
    architecture = _infer_chordnet_architecture(
        state,
        {
            "n_freq": 144,
            "n_classes": 170,
            "n_group": 2,
            "f_layer": 3,
            "f_head": 2,
            "t_layer": 4,
            "t_head": 4,
            "d_layer": 3,
            "d_head": 4,
            "dropout": 0.3,
        },
    )
    checkpoint_config = checkpoint.get("config", {})
    if isinstance(checkpoint_config, dict):
        for key in architecture:
            if key in checkpoint_config:
                architecture[key] = checkpoint_config[key]
    try:
        model = ChordNet(**architecture)
        model.load_state_dict(state, strict=True)
    except (RuntimeError, TypeError, ValueError) as exc:
        raise ExpectedStageFailure(
            TypedError(
                code="chord.checkpoint_incompatible",
                message="ChordNet checkpoint is incompatible with its resolved config",
                retryable=False,
                details={"exception_type": type(exc).__name__},
            )
        ) from exc
    model = model.to(device).eval()
    if device.type == "cuda":
        torch.cuda.reset_peak_memory_stats(device)
    normalization = checkpoint.get("normalization", {}) or {}
    mean = torch.as_tensor(
        normalization.get("mean", checkpoint.get("mean", 0.0)),
        dtype=torch.float32,
        device=device,
    )
    std = torch.as_tensor(
        normalization.get("std", checkpoint.get("std", 1.0)),
        dtype=torch.float32,
        device=device,
    )
    if not bool(torch.isfinite(mean).all() and torch.isfinite(std).all()) or bool(
        (std == 0).any()
    ):
        raise ExpectedStageFailure(
            TypedError(
                code="chord.checkpoint_invalid_normalization",
                message="ChordNet normalization must be finite with non-zero std",
                retryable=False,
            )
        )
    audio, native_sr = sf.read(str(source_path), dtype="float32", always_2d=True)
    if not len(audio):
        raise ExpectedStageFailure(
            TypedError(
                code="chord.source_empty",
                message="chord source audio has no samples",
                retryable=False,
            )
        )
    mono = audio.mean(axis=1)
    if native_sr != 22050:
        mono = librosa.resample(mono, orig_sr=native_sr, target_sr=22050)
    cqt = librosa.cqt(
        mono,
        sr=22050,
        hop_length=config.hop_length,
        n_bins=144,
        bins_per_octave=24,
        fmin=librosa.note_to_hz("C1"),
    )
    raw_features = torch.from_numpy(np.log(np.abs(cqt).astype(np.float32).T + 1e-6))
    predictions, frames, elapsed = _run_inference(
        model=lambda batch: model(batch)[0],
        raw_features=raw_features,
        mean=mean,
        std=std,
        seq_len=config.seq_len,
        num_chords=architecture["n_classes"],
        overlap=config.overlap,
        logit_smoothing_kernel=config.logit_smoothing_kernel,
        logit_smoothing_gaussian=config.logit_smoothing_gaussian,
        categorical_smoothing_window=config.categorical_smoothing_window,
        precision=config.precision,
        device=device,
    )
    duration = len(audio) / native_sr
    frame_duration = config.hop_length / 22050
    segments = build_segments(
        predictions.tolist(), idx2voca_chord(), frame_duration, duration
    )
    coverage = summarize_coverage(segments)
    result = ChordAnalysisResult(
        source_sha256=identity.input_sha256,
        provenance=ChordAnalyzerProvenance(
            candidate=CHORDMINI_CHORDNET_CANDIDATE_ID,
            implementation_version=identity.implementation_version,
            model_identifier=identity.model_identifier,
            model_sha256=identity.model_sha256,
            code_revision=identity.code_revision,
        ),
        settings=EffectiveChordAnalyzerSettings(
            device=config.device,
            precision=config.precision,
            frame_duration_seconds=frame_duration,
            sample_rate=22050,
            hop_length=config.hop_length,
            seq_len=config.seq_len,
        ),
        source=ChordSourceFacts(
            sample_rate=native_sr,
            channels=audio.shape[1],
            frame_count=len(audio),
            duration_seconds=duration,
            peak_absolute_sample=float(np.max(np.abs(audio))),
        ),
        segments=tuple(segments),
        coverage=coverage,
    )
    window_hop_frames = max(1, int(round(config.seq_len * (1.0 - config.overlap))))
    evidence = ChordFrameEvidenceArtifact(
        candidate=CHORDMINI_CHORDNET_CANDIDATE_ID,
        implementation_version=identity.implementation_version,
        config_sha256=identity.config_sha256,
        source_sha256=identity.input_sha256,
        model_sha256=identity.model_sha256,
        code_revision=identity.code_revision,
        frame_duration_seconds=frame_duration,
        effective_settings={
            "device": config.device,
            "effective_precision": config.precision,
            "sample_rate": 22050,
            "hop_length": config.hop_length,
            "seq_len": config.seq_len,
            "frame_duration_seconds": frame_duration,
            "frame_timing": "exact_hop_length_divided_by_sample_rate",
            "overlap": 1.0 - (window_hop_frames / config.seq_len),
            "window_hop_frames": window_hop_frames,
            "overlap_aggregation": "mean_logits",
            "logit_smoothing_kernel": config.logit_smoothing_kernel,
            "logit_smoothing_gaussian": config.logit_smoothing_gaussian,
            "categorical_smoothing_window": config.categorical_smoothing_window,
            "feature_transform": "log(abs(cqt)+1e-6).T",
            "normalization_strategy": "raw_pad_then_normalize",
            "checkpoint_source": config.checkpoint_source,
            "checkpoint_terms_reference": config.checkpoint_terms_reference,
        },
        frames=tuple(frames),
    )
    return (
        result,
        build_chordmini_metrics(
            wall_seconds=elapsed,
            end_to_end_seconds=time.perf_counter() - end_to_end_started,
            peak_vram_bytes=(
                int(torch.cuda.max_memory_allocated(device))
                if device.type == "cuda"
                else 0
            ),
            frame_count=len(predictions),
            segment_count=len(segments),
            coverage=coverage,
        ),
        evidence,
    )
