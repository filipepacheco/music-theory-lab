"""Real ChordMini BTC inference runtime.

Kept out of ``chordmini_btc_stage.py`` so importing the stage in the
offline harness never drags in torch, librosa, or the vendored model. The
lazy import mirrors the pattern used by the separator and beat_this
runtimes.
"""

from __future__ import annotations

import time
from pathlib import Path

import librosa
import numpy as np
import soundfile as sf
import torch

from audio_library_poc.chord_analysis import (
    ChordAnalysisResult,
    ChordAnalyzerProvenance,
    ChordSourceFacts,
    EffectiveChordAnalyzerSettings,
    summarize_coverage,
)
from audio_library_poc.chordmini_btc_stage import (
    CHORDMINI_BTC_CANDIDATE_ID,
    CHORDMINI_BTC_IMPLEMENTATION_VERSION,
    ChordMiniBtcStageConfig,
    build_chordmini_metrics,
    build_segments,
)
from audio_library_poc.execution import ExpectedStageFailure
from audio_library_poc.models import Metrics, StageIdentity, TypedError
from audio_library_poc.separation import SeparatorPrecision
from audio_library_poc.vendor.chordmini.model.btc_model import BTC_model
from audio_library_poc.vendor.chordmini.model.chords import idx2voca_chord
from audio_library_poc.vendor.chordmini.model.config import ModelConfig


def run_chordmini_btc_inference(
    *,
    workspace: Path,
    source_path: Path,
    config: ChordMiniBtcStageConfig,
    identity: StageIdentity,
) -> tuple[ChordAnalysisResult, Metrics]:
    checkpoint_path = _resolve_checkpoint(
        workspace,
        config.checkpoint_relative_path,
    )
    device = _resolve_device(config.device)

    model_config = ModelConfig()
    model = BTC_model(model_config)
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

    audio_np, native_sr, channels = _load_source_audio(source_path)
    frame_count = audio_np.shape[0]
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

    features = torch.from_numpy(cqt_mag).to(device)
    features = (features - mean) / std

    predictions, wall_seconds = _run_inference(
        model=model,
        features=features,
        seq_len=model_config.seq_len,
        num_chords=model_config.n_classes,
        overlap=config.sliding_window_overlap,
        precision=config.precision,
        device=device,
    )

    idx_to_chord = idx2voca_chord()
    segments = build_segments(
        predictions=predictions.tolist(),
        idx_to_chord=idx_to_chord,
        frame_duration=model_config.frame_duration,
        duration_seconds=duration_seconds,
        min_segment_seconds=config.min_segment_seconds,
    )
    coverage = summarize_coverage(segments)

    settings = EffectiveChordAnalyzerSettings(
        device=config.device,
        precision=config.precision,
        frame_duration_seconds=model_config.frame_duration,
        sample_rate=model_config.sample_rate,
        hop_length=model_config.hop_length,
        seq_len=model_config.seq_len,
    )
    result = ChordAnalysisResult(
        source_sha256=identity.input_sha256,
        provenance=ChordAnalyzerProvenance(
            candidate=CHORDMINI_BTC_CANDIDATE_ID,
            implementation_version=CHORDMINI_BTC_IMPLEMENTATION_VERSION,
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
        frame_count=len(predictions),
        segment_count=len(segments),
        coverage=coverage,
    )
    return result, metrics


def _run_inference(
    *,
    model,
    features: torch.Tensor,
    seq_len: int,
    num_chords: int,
    overlap: float,
    precision: SeparatorPrecision,
    device: torch.device,
) -> tuple[np.ndarray, float]:
    """Sliding-window inference, returning (per-frame chord indices, wall-clock)."""

    n_frames = features.shape[0]
    if n_frames == 0:
        return np.zeros(0, dtype=np.int64), 0.0

    step = max(1, int(round(seq_len * (1.0 - overlap))))
    logits_sum = torch.zeros(n_frames, num_chords, device=device)
    counts = torch.zeros(n_frames, dtype=torch.int32, device=device)

    autocast_dtype = None
    if precision is SeparatorPrecision.FLOAT16:
        autocast_dtype = torch.float16
    elif precision is SeparatorPrecision.BFLOAT16:
        autocast_dtype = torch.bfloat16

    started = time.time()
    with torch.inference_mode():
        for start in range(0, n_frames, step):
            end = min(start + seq_len, n_frames)
            window = features[start:end]
            if window.shape[0] < seq_len:
                pad = torch.zeros(
                    seq_len - window.shape[0], window.shape[1], device=device
                )
                window = torch.cat([window, pad], dim=0)
            batch = window.unsqueeze(0)
            if autocast_dtype is not None and device.type == "cuda":
                with torch.autocast(device_type="cuda", dtype=autocast_dtype):
                    logits = model(batch)
            else:
                logits = model(batch)
            usable = end - start
            logits_sum[start:end] += logits[0, :usable].float()
            counts[start:end] += 1
            if end >= n_frames:
                break
    wall_seconds = time.time() - started

    counts = counts.clamp_min(1).unsqueeze(1)
    averaged = logits_sum / counts.float()
    predictions = averaged.argmax(dim=-1).cpu().numpy()
    return predictions, wall_seconds


def _resolve_checkpoint(workspace: Path, checkpoint_relative_path: str) -> Path:
    candidate = (workspace / Path(checkpoint_relative_path)).resolve()
    if not candidate.is_relative_to(workspace):
        raise ExpectedStageFailure(
            TypedError(
                code="chord.checkpoint_outside_workspace",
                message="ChordMini BTC checkpoint must resolve inside the workspace",
                retryable=False,
                details={"relative_path": checkpoint_relative_path},
            )
        )
    if not candidate.is_file():
        raise ExpectedStageFailure(
            TypedError(
                code="chord.checkpoint_missing",
                message="ChordMini BTC checkpoint file is missing",
                retryable=False,
                details={"relative_path": checkpoint_relative_path},
            )
        )
    return candidate


def _resolve_device(device_str: str) -> torch.device:
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


def _load_source_audio(path: Path) -> tuple[np.ndarray, int, int]:
    audio, sample_rate = sf.read(str(path), dtype="float32", always_2d=True)
    channels = audio.shape[1]
    return np.ascontiguousarray(audio), int(sample_rate), channels
