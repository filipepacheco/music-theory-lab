"""Real ChordMini BTC inference runtime.

Kept out of ``chordmini_btc_stage.py`` so importing the stage in the
offline harness never drags in torch, librosa, or the vendored model. The
lazy import mirrors the pattern used by the separator and beat_this
runtimes.
"""

from __future__ import annotations

from pathlib import Path

from audio_library_poc.chord_analysis import (
    ChordAnalysisResult,
    ChordAnalyzerProvenance,
    ChordFrameEvidenceArtifact,
    ChordSourceFacts,
    EffectiveChordAnalyzerSettings,
    summarize_coverage,
)
from audio_library_poc.chordmini_btc_stage import (
    CHORDMINI_BTC_CANDIDATE_ID,
    ChordMiniBtcStageConfig,
    build_baseline_segments,
    build_chordmini_metrics,
    build_segments,
)
from audio_library_poc.execution import ExpectedStageFailure
from audio_library_poc.models import Metrics, StageIdentity, TypedError
from audio_library_poc.separation import SeparatorPrecision

#: Floor for the log, so digital silence maps to a large finite number
#: instead of -inf.
_LOG_EPSILON = 1e-6


def run_chordmini_btc_inference(
    *,
    workspace: Path,
    source_path: Path,
    checkpoint_path: Path,
    config: ChordMiniBtcStageConfig,
    identity: StageIdentity,
    candidate_id: str = CHORDMINI_BTC_CANDIDATE_ID,
    verified: bool = False,
) -> tuple[ChordAnalysisResult, Metrics, ChordFrameEvidenceArtifact]:
    """Run the verified BTC path after the bridge has verified checkpoint bytes.

    Heavy imports deliberately start here. The executor verifies both path and
    SHA-256 first, so a missing or replaced checkpoint cannot be hidden by an
    unavailable torch/librosa environment.
    """

    from audio_library_poc.metadata import hash_file

    if hash_file(checkpoint_path) != identity.model_sha256:
        raise ExpectedStageFailure(
            TypedError(
                code="chord.checkpoint_hash_mismatch",
                message="checkpoint bytes changed before deserialization",
                retryable=False,
            )
        )

    import time

    end_to_end_started = time.perf_counter()

    import librosa
    import numpy as np
    import torch

    from audio_library_poc.vendor.chordmini.model.btc_model import BTC_model
    from audio_library_poc.vendor.chordmini.model.chords import idx2voca_chord
    from audio_library_poc.vendor.chordmini.model.config import ModelConfig

    device = _resolve_device(config.device)

    model_config = ModelConfig()
    model = BTC_model(model_config)
    # Keep the cheap bridge check, then bind the exact bytes again at the
    # deserialization boundary. A checkpoint may be replaced while imports and
    # model construction are in progress.
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
    if "model_state_dict" not in checkpoint:
        raise ExpectedStageFailure(
            TypedError(
                code="chord.checkpoint_shape_unexpected",
                message=(
                    "checkpoint has no model_state_dict — "
                    "not a ChordMini BTC checkpoint"
                ),
                retryable=False,
                details={"relative_path": config.checkpoint_relative_path},
            )
        )
    model.load_state_dict(checkpoint["model_state_dict"], strict=True)
    model = model.to(device).eval()

    normalization = checkpoint.get("normalization") or {}
    if "mean" not in normalization or "std" not in normalization:
        raise ExpectedStageFailure(
            TypedError(
                code="chord.checkpoint_missing_normalization",
                message="checkpoint has no normalization mean/std tensors",
                retryable=False,
            )
        )
    mean = torch.as_tensor(normalization["mean"], dtype=torch.float32, device=device)
    std = torch.as_tensor(normalization["std"], dtype=torch.float32, device=device)
    if not bool(torch.isfinite(std).all()) or bool((std == 0).any()):
        raise ExpectedStageFailure(
            TypedError(
                code="chord.checkpoint_invalid_normalization",
                message="checkpoint normalization std must be finite and non-zero",
                retryable=False,
            )
        )

    audio_np, native_sr, channels = _load_source_audio(source_path)
    frame_count = audio_np.shape[0]
    if frame_count == 0:
        raise ExpectedStageFailure(
            TypedError(
                code="chord.source_empty",
                message="chord source audio has no samples",
                retryable=False,
            )
        )
    duration_seconds = frame_count / native_sr
    peak_source = float(np.max(np.abs(audio_np))) if frame_count else 0.0

    audio_mono = audio_np.mean(axis=1) if audio_np.ndim == 2 else audio_np
    if native_sr != model_config.sample_rate:
        audio_mono = librosa.resample(
            audio_mono, orig_sr=native_sr, target_sr=model_config.sample_rate
        )
    cqt = librosa.cqt(
        audio_mono,
        sr=model_config.sample_rate,
        hop_length=model_config.hop_length,
        n_bins=model_config.n_bins,
        bins_per_octave=model_config.bins_per_octave,
    )
    cqt_mag = np.abs(cqt).astype(np.float32).T  # (T, n_bins)

    # Log magnitude, not linear. The checkpoint's normalization statistics
    # (mean -2.37, std 1.96) are log-domain -- a magnitude spectrogram cannot
    # have a negative mean -- so feeding linear magnitude puts every frame
    # out of distribution and the model falls back to predicting "N". It also
    # makes the features scale with the recording's level rather than shift
    # with it, which is why quiet masters failed hardest: Doolittle-era
    # Pixies came back 93% no-chord where a loud remaster came back 16%.
    raw_features = torch.from_numpy(np.log(cqt_mag + _LOG_EPSILON))

    if verified:
        inference_features = raw_features
        normalization_mean = mean
        normalization_std = std
    else:
        # Exact historical baseline: normalize the full CQT first, then pad
        # normalized final windows with zeros. It remains runnable under its
        # preserved 1.2.0 identity for Phase 4 comparison.
        inference_features = (raw_features.to(device) - mean) / std
        normalization_mean = 0.0
        normalization_std = 1.0

    predictions, evidence_frames, wall_seconds = _run_inference(
        model=model,
        raw_features=inference_features,
        mean=normalization_mean,
        std=normalization_std,
        seq_len=model_config.seq_len,
        num_chords=model_config.n_classes,
        overlap=config.sliding_window_overlap,
        logit_smoothing_kernel=(config.logit_smoothing_kernel if verified else 1),
        logit_smoothing_gaussian=(
            config.logit_smoothing_gaussian if verified else False
        ),
        categorical_smoothing_window=(
            config.categorical_smoothing_window if verified else 1
        ),
        precision=config.precision,
        device=device,
    )

    idx_to_chord = idx2voca_chord()
    segment_builder = build_segments if verified else build_baseline_segments
    segments = segment_builder(
        predictions=predictions.tolist(),
        idx_to_chord=idx_to_chord,
        frame_duration=(
            model_config.hop_length / model_config.sample_rate
            if verified
            else model_config.frame_duration
        ),
        duration_seconds=duration_seconds,
        min_segment_seconds=config.min_segment_seconds,
    )
    coverage = summarize_coverage(segments)

    effective_frame_duration = (
        model_config.hop_length / model_config.sample_rate
        if verified
        else model_config.frame_duration
    )
    settings = EffectiveChordAnalyzerSettings(
        device=config.device,
        precision=config.precision,
        frame_duration_seconds=effective_frame_duration,
        sample_rate=model_config.sample_rate,
        hop_length=model_config.hop_length,
        seq_len=model_config.seq_len,
    )
    result = ChordAnalysisResult(
        source_sha256=identity.input_sha256,
        provenance=ChordAnalyzerProvenance(
            candidate=candidate_id,
            implementation_version=identity.implementation_version,
            model_identifier=identity.model_identifier,
            model_sha256=identity.model_sha256,
            code_revision=identity.code_revision,
        ),
        settings=settings,
        source=ChordSourceFacts(
            sample_rate=native_sr,
            channels=channels,
            frame_count=frame_count,
            duration_seconds=duration_seconds,
            peak_absolute_sample=peak_source,
        ),
        segments=tuple(segments),
        coverage=coverage,
    )
    metrics = build_chordmini_metrics(
        wall_seconds=wall_seconds,
        end_to_end_seconds=time.perf_counter() - end_to_end_started,
        peak_vram_bytes=(
            int(torch.cuda.max_memory_allocated(device)) if device.type == "cuda" else 0
        ),
        frame_count=len(predictions),
        segment_count=len(segments),
        coverage=coverage,
    )
    window_hop_frames = max(
        1,
        int(round(model_config.seq_len * (1.0 - config.sliding_window_overlap))),
    )
    frame_evidence = ChordFrameEvidenceArtifact(
        candidate=candidate_id,
        implementation_version=identity.implementation_version,
        config_sha256=identity.config_sha256,
        source_sha256=identity.input_sha256,
        model_sha256=identity.model_sha256,
        code_revision=identity.code_revision,
        frame_duration_seconds=effective_frame_duration,
        effective_settings={
            "device": config.device,
            "effective_precision": config.precision,
            "sample_rate": model_config.sample_rate,
            "hop_length": model_config.hop_length,
            "seq_len": model_config.seq_len,
            "frame_duration_seconds": effective_frame_duration,
            "frame_timing": (
                "exact_hop_length_divided_by_sample_rate"
                if verified
                else "legacy_rounded_config"
            ),
            "feature_transform": "log(abs(cqt)+1e-6).T",
            "normalization_strategy": (
                "raw_pad_then_normalize"
                if verified
                else "normalize_full_cqt_then_zero_pad"
            ),
            "overlap": 1.0 - (window_hop_frames / model_config.seq_len),
            "window_hop_frames": window_hop_frames,
            "overlap_aggregation": "mean_logits",
            "logit_smoothing_kernel": (
                config.logit_smoothing_kernel if verified else 1
            ),
            "logit_smoothing_gaussian": (
                config.logit_smoothing_gaussian if verified else False
            ),
            "categorical_smoothing_window": (
                config.categorical_smoothing_window if verified else 1
            ),
        },
        frames=tuple(evidence_frames),
    )
    return result, metrics, frame_evidence


def _run_inference(
    *,
    model,
    raw_features,
    mean,
    std,
    seq_len: int,
    num_chords: int,
    overlap: float,
    logit_smoothing_kernel: int,
    logit_smoothing_gaussian: bool,
    categorical_smoothing_window: int,
    precision: SeparatorPrecision,
    device,
) -> tuple[object, list[dict[str, object]], float]:
    """Run raw-pad → normalize windows and retain pre/post decision evidence."""

    import time

    import torch

    from audio_library_poc.vendor.chordmini.model.temporal_smoothing import (
        apply_temporal_smoothing,
    )

    n_frames = raw_features.shape[0]
    if n_frames == 0:
        import numpy as np

        return np.zeros(0, dtype=np.int64), [], 0.0

    if device.type != "cuda" and precision is not SeparatorPrecision.FLOAT32:
        raise ExpectedStageFailure(
            TypedError(
                code="chord.precision_unsupported",
                message="float16 and bfloat16 chord inference require CUDA",
                retryable=False,
            )
        )

    step = max(1, int(round(seq_len * (1.0 - overlap))))
    logits_sum = torch.zeros(n_frames, num_chords, device=device)
    counts = torch.zeros(n_frames, dtype=torch.int32, device=device)

    autocast_dtype = None
    if precision is SeparatorPrecision.FLOAT16:
        autocast_dtype = torch.float16
    elif precision is SeparatorPrecision.BFLOAT16:
        autocast_dtype = torch.bfloat16

    if device.type == "cuda":
        torch.cuda.synchronize(device)
    started = time.time()
    with torch.inference_mode():
        for start in range(0, n_frames, step):
            end = min(start + seq_len, n_frames)
            window = raw_features[start:end]
            if window.shape[0] < seq_len:
                pad = torch.zeros(
                    seq_len - window.shape[0], window.shape[1], device=device
                )
                window = torch.cat([window, pad], dim=0)
            # Upstream pads raw log-CQT features, then applies checkpoint
            # normalization. Padding with already-normalized zero changes the
            # final-window distribution unless mean is exactly zero.
            batch = ((window.to(device) - mean) / std).unsqueeze(0)
            if autocast_dtype is not None and device.type == "cuda":
                with torch.autocast(device_type="cuda", dtype=autocast_dtype):
                    logits = model(batch)
            else:
                logits = model(batch)
            usable = end - start
            if (
                not isinstance(logits, torch.Tensor)
                or logits.ndim != 3
                or logits.shape[0] != 1
                or logits.shape[1] < usable
                or logits.shape[2] != num_chords
                or not bool(torch.isfinite(logits).all())
            ):
                raise ExpectedStageFailure(
                    TypedError(
                        code="chord.model_output_malformed",
                        message=(
                            "chord model must return finite "
                            "[batch, frames, classes] logits"
                        ),
                        retryable=False,
                    )
                )
            logits_sum[start:end] += logits[0, :usable].float()
            counts[start:end] += 1
            if end >= n_frames:
                break
    if device.type == "cuda":
        torch.cuda.synchronize(device)
    wall_seconds = time.time() - started

    counts = counts.clamp_min(1).unsqueeze(1)
    averaged = logits_sum / counts.float()
    smoothed = (
        apply_temporal_smoothing(
            averaged, logit_smoothing_kernel, logit_smoothing_gaussian
        )
        if logit_smoothing_kernel > 1
        else averaged
    )
    post_predictions = smoothed.argmax(dim=-1)
    predictions, votes = _smooth_categorical(
        post_predictions, categorical_smoothing_window, num_chords
    )
    pre_values, pre_indices = averaged.topk(k=2, dim=-1)
    post_values, post_indices = smoothed.topk(k=2, dim=-1)
    evidence = [
        {
            "frame_index": index,
            "overlap_votes": int(counts[index].item()),
            "raw_argmax_index": int(pre_indices[index, 0].item()),
            "raw_top_logit": float(pre_values[index, 0].item()),
            "raw_runner_up_index": int(pre_indices[index, 1].item()),
            "raw_runner_up_logit": float(pre_values[index, 1].item()),
            "post_logit_smoothing_argmax_index": int(post_indices[index, 0].item()),
            "categorical_votes": votes[index],
            "post_categorical_index": int(predictions[index].item()),
        }
        for index in range(n_frames)
    ]
    return predictions.cpu().numpy(), evidence, wall_seconds


def _smooth_categorical(predictions, window: int, num_chords: int):
    """Apply the documented optional majority filter after logit decoding."""

    if window <= 1:
        return predictions, [1] * int(predictions.shape[0])
    import torch

    half = window // 2
    smoothed = predictions.clone()
    votes: list[int] = []
    for index in range(int(predictions.shape[0])):
        start = max(0, index - half)
        end = min(predictions.shape[0], index + half + 1)
        chunk = predictions[start:end]
        counts = torch.bincount(chunk, minlength=num_chords)
        smoothed[index] = counts.argmax()
        votes.append(int(counts.max().item()))
    return smoothed, votes


def _resolve_device(device_str: str):
    import torch

    device = torch.device(device_str)
    if device.type == "cuda" and not torch.cuda.is_available():
        raise ExpectedStageFailure(
            TypedError(
                code="chord.cuda_unavailable",
                message="config requested cuda but torch.cuda.is_available() is False",
                retryable=False,
                details={"requested": device_str},
            )
        )
    return device


def _load_source_audio(path: Path):
    import numpy as np
    import soundfile as sf

    audio, sample_rate = sf.read(str(path), dtype="float32", always_2d=True)
    channels = audio.shape[1]
    return np.ascontiguousarray(audio), int(sample_rate), channels
