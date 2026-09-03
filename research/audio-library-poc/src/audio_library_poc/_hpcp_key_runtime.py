"""Real HPCP + Krumhansl-Kessler key runtime.

Lazy-imports librosa so importing ``hpcp_key_stage`` in the offline harness
stays free of MIR deps. The algorithm is:

1. Load audio via soundfile, mono-mix, resample to config.sample_rate.
2. Extract a 12-bin CQT-based chromagram via librosa.feature.chroma_cqt.
3. Mean over time -> one 12-dim pitch-class vector.
4. Rotate each of two Krumhansl-Kessler profiles (major, minor) across
   all 12 tonics and compute Pearson correlation with the pitch-class
   vector. That's 24 candidates.
5. Sort best-first and return.
"""

from __future__ import annotations

import time
from pathlib import Path

import librosa
import numpy as np
import soundfile as sf

from audio_library_poc.hpcp_key_stage import (
    HPCP_KEY_CANDIDATE_ID,
    HPCP_KEY_IMPLEMENTATION_VERSION,
    HpcpKeyStageConfig,
    build_hpcp_key_metrics,
)
from audio_library_poc.key_analysis import (
    EffectiveKeyAnalyzerSettings,
    KeyAnalysisResult,
    KeyAnalyzerProvenance,
    KeyEstimate,
    KeySourceFacts,
)
from audio_library_poc.models import Metrics, StageIdentity, TonalMode

# Krumhansl & Kessler (1982) key profiles, C-rooted.
_KRUMHANSL_KESSLER_MAJOR = np.array(
    [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88],
    dtype=np.float64,
)
_KRUMHANSL_KESSLER_MINOR = np.array(
    [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17],
    dtype=np.float64,
)


def run_hpcp_key_inference(
    *,
    source_path: Path,
    config: HpcpKeyStageConfig,
    identity: StageIdentity,
) -> tuple[KeyAnalysisResult, Metrics]:
    audio_np, native_sr, channels = _load_source_audio(source_path)
    frame_count = audio_np.shape[0]
    duration_seconds = frame_count / native_sr
    peak_source = float(np.max(np.abs(audio_np))) if frame_count else 0.0

    audio_mono = audio_np.mean(axis=1) if audio_np.ndim == 2 else audio_np
    if native_sr != config.sample_rate:
        audio_mono = librosa.resample(
            audio_mono, orig_sr=native_sr, target_sr=config.sample_rate
        )

    started = time.time()
    chroma = librosa.feature.chroma_cqt(
        y=audio_mono,
        sr=config.sample_rate,
        hop_length=config.hop_length,
        n_chroma=12,
    )
    pitch_class_vector = chroma.mean(axis=1).astype(np.float64)
    estimates = _score_all_keys(pitch_class_vector)
    wall_seconds = time.time() - started

    top_estimate = estimates[0]
    settings = EffectiveKeyAnalyzerSettings(
        sample_rate=config.sample_rate,
        hop_length=config.hop_length,
        n_chroma=12,
        profile="krumhansl_kessler",
    )
    result = KeyAnalysisResult(
        source_sha256=identity.input_sha256,
        provenance=KeyAnalyzerProvenance(
            candidate=HPCP_KEY_CANDIDATE_ID,
            implementation_version=HPCP_KEY_IMPLEMENTATION_VERSION,
            code_revision=identity.code_revision,
        ),
        settings=settings,
        source=KeySourceFacts(
            sample_rate=native_sr,
            channels=channels,
            frame_count=frame_count,
            duration_seconds=duration_seconds,
            peak_absolute_sample=peak_source,
        ),
        estimates=tuple(estimates),
        top_estimate=top_estimate,
    )
    metrics = build_hpcp_key_metrics(
        wall_seconds=wall_seconds,
        top_score=top_estimate.score,
        second_score=estimates[1].score if len(estimates) > 1 else 0.0,
    )
    return result, metrics


def _score_all_keys(pitch_class_vector: np.ndarray) -> list[KeyEstimate]:
    """Correlate the 12-dim pitch-class vector with all 24 Krumhansl profiles."""

    scores: list[KeyEstimate] = []
    for tonic_pc in range(12):
        major_profile = np.roll(_KRUMHANSL_KESSLER_MAJOR, tonic_pc)
        minor_profile = np.roll(_KRUMHANSL_KESSLER_MINOR, tonic_pc)
        scores.append(
            KeyEstimate(
                tonic_pc=tonic_pc,
                mode=TonalMode.MAJOR,
                score=_pearson_correlation(pitch_class_vector, major_profile),
            )
        )
        scores.append(
            KeyEstimate(
                tonic_pc=tonic_pc,
                mode=TonalMode.MINOR,
                score=_pearson_correlation(pitch_class_vector, minor_profile),
            )
        )
    scores.sort(key=lambda estimate: estimate.score, reverse=True)
    return scores


def _pearson_correlation(a: np.ndarray, b: np.ndarray) -> float:
    a = np.asarray(a, dtype=np.float64)
    b = np.asarray(b, dtype=np.float64)
    a_std = a.std()
    b_std = b.std()
    if a_std == 0 or b_std == 0:
        return 0.0
    correlation = float(np.corrcoef(a, b)[0, 1])
    # Clamp to the [-1, 1] range the contract requires — numerical drift can
    # push a perfect correlation slightly above 1.
    return max(-1.0, min(1.0, correlation))


def _load_source_audio(path: Path) -> tuple[np.ndarray, int, int]:
    audio, sample_rate = sf.read(str(path), dtype="float32", always_2d=True)
    channels = audio.shape[1]
    return np.ascontiguousarray(audio), int(sample_rate), channels
