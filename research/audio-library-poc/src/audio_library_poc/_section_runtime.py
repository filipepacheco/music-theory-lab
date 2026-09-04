"""Real section-boundary inference runtime, kept out of the stage module.

Splitting the librosa/numpy imports off here means importing
``section_stage`` in the offline harness never drags in MIR deps. The
same pattern is used by ``_hpcp_key_runtime`` and ``_chordmini_btc_runtime``.

Algorithm (following the librosa segmentation tutorial):

1. Load audio via soundfile, mono-mix, resample to ``config.sample_rate``.
2. Extract a 12-bin CQT chromagram via ``librosa.feature.chroma_cqt``.
3. Run ``librosa.segment.agglomerative`` with ``k = n_segments`` to get the
   boundary frames.
4. Turn boundary frames into ``[start, end)`` seconds intervals that cover
   the whole ``[0, duration_seconds]`` span (the last interval is stretched
   to exactly ``duration_seconds`` so downstream contracts never see a
   sub-frame gap at the tail).
5. Assign a letter label to each section: compute one mean-chroma vector
   per section, cosine-cluster them with a 0.9 similarity threshold, then
   letter the resulting clusters A, B, C, ... in order of first appearance.
   Labels are opaque cluster ids — they do not name the section
   semantically (chorus vs. verse), matching the MSAF ``foote`` convention
   the peer session's brief called out.
"""

from __future__ import annotations

import time
from pathlib import Path

import librosa
import numpy as np
import soundfile as sf

from audio_library_poc.execution import ExpectedStageFailure
from audio_library_poc.models import Metrics, StageIdentity, TypedError
from audio_library_poc.section_analysis import (
    EffectiveSectionAnalyzerSettings,
    SectionAnalysisResult,
    SectionAnalyzerProvenance,
    SectionSegment,
    SectionSourceFacts,
)
from audio_library_poc.section_stage import (
    SECTION_LIBROSA_CANDIDATE_ID,
    SECTION_LIBROSA_IMPLEMENTATION_VERSION,
    SectionLibrosaStageConfig,
    build_section_metrics,
)


def run_section_inference(
    *,
    source_path: Path,
    config: SectionLibrosaStageConfig,
    identity: StageIdentity,
) -> tuple[SectionAnalysisResult, Metrics]:
    audio_np, native_sr, channels = _load_source_audio(source_path)
    frame_count = audio_np.shape[0]
    duration_seconds = frame_count / native_sr
    peak_source = float(np.max(np.abs(audio_np))) if frame_count else 0.0

    if frame_count == 0:
        raise ExpectedStageFailure(
            TypedError(
                code="section.empty_source",
                message="section source audio has zero frames",
                retryable=False,
                details={"source_path": str(source_path)},
            )
        )

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
    sections = detect_sections(
        chroma=chroma,
        sr=config.sample_rate,
        hop_length=config.hop_length,
        n_segments=config.n_segments,
        duration_seconds=duration_seconds,
    )
    wall_seconds = time.time() - started

    settings = EffectiveSectionAnalyzerSettings(
        sample_rate=config.sample_rate,
        hop_length=config.hop_length,
        feature="chroma_cqt",
        n_segments=config.n_segments,
    )
    result = SectionAnalysisResult(
        source_sha256=identity.input_sha256,
        provenance=SectionAnalyzerProvenance(
            candidate=SECTION_LIBROSA_CANDIDATE_ID,
            implementation_version=SECTION_LIBROSA_IMPLEMENTATION_VERSION,
            code_revision=identity.code_revision,
        ),
        settings=settings,
        source=SectionSourceFacts(
            sample_rate=native_sr,
            channels=channels,
            frame_count=frame_count,
            duration_seconds=duration_seconds,
            peak_absolute_sample=peak_source,
        ),
        sections=tuple(sections),
    )
    metrics = build_section_metrics(
        wall_seconds=wall_seconds,
        section_count=len(sections),
        unique_label_count=len({section.label for section in sections}),
    )
    return result, metrics


def detect_sections(
    *,
    chroma: np.ndarray,
    sr: int,
    hop_length: int,
    n_segments: int,
    duration_seconds: float,
) -> list[SectionSegment]:
    """Turn a chroma feature matrix into labeled, gap-free SectionSegments.

    Requested ``n_segments`` is clamped to at most the number of feature
    frames so librosa never raises on a very short source.
    """

    n_frames = chroma.shape[1] if chroma.ndim == 2 else 0
    if n_frames <= 1:
        return [
            SectionSegment(
                start_seconds=0.0,
                end_seconds=max(duration_seconds, hop_length / sr),
                label="A",
            )
        ]

    k = max(2, min(n_segments, n_frames))
    boundary_frames = librosa.segment.agglomerative(chroma, k=k)
    boundary_times = librosa.frames_to_time(
        boundary_frames, sr=sr, hop_length=hop_length
    )
    # librosa returns boundary starts (with 0 as the first). Build (start, end)
    # pairs by appending duration_seconds as the tail.
    starts = list(float(t) for t in boundary_times)
    if not starts or starts[0] > 1e-3:
        starts.insert(0, 0.0)
    # Drop any duplicated or non-monotonic boundaries defensively.
    monotonic: list[float] = []
    for value in starts:
        if not monotonic or value > monotonic[-1] + 1e-6:
            monotonic.append(value)
    monotonic = [max(0.0, t) for t in monotonic if t < duration_seconds]
    monotonic.append(duration_seconds)

    # Cluster the per-section mean chroma vectors so repeats share a label.
    labels = _label_sections(
        chroma=chroma,
        boundary_times=monotonic,
        sr=sr,
        hop_length=hop_length,
    )

    sections: list[SectionSegment] = []
    for index in range(len(monotonic) - 1):
        start = monotonic[index]
        end = monotonic[index + 1]
        if end <= start:
            continue
        sections.append(
            SectionSegment(
                start_seconds=start,
                end_seconds=end,
                label=labels[index],
            )
        )
    if not sections:
        sections.append(
            SectionSegment(
                start_seconds=0.0,
                end_seconds=max(duration_seconds, hop_length / sr),
                label="A",
            )
        )
    return sections


def _label_sections(
    *,
    chroma: np.ndarray,
    boundary_times: list[float],
    sr: int,
    hop_length: int,
) -> list[str]:
    """Assign A, B, C, ... labels by cosine-clustering per-section mean chroma.

    Two sections whose mean-chroma cosine similarity exceeds 0.9 share a
    label. New sections that do not match any existing cluster get the next
    unused letter (A0, A1, ... after the alphabet runs out — but 26 is well
    beyond any reasonable pop-song section count).
    """

    means: list[np.ndarray] = []
    for index in range(len(boundary_times) - 1):
        start_time = boundary_times[index]
        end_time = boundary_times[index + 1]
        start_frame = int(round(start_time * sr / hop_length))
        end_frame = int(round(end_time * sr / hop_length))
        end_frame = max(end_frame, start_frame + 1)
        end_frame = min(end_frame, chroma.shape[1])
        window = chroma[:, start_frame:end_frame]
        if window.shape[1] == 0:
            means.append(np.zeros(chroma.shape[0], dtype=np.float64))
        else:
            means.append(window.mean(axis=1).astype(np.float64))

    labels: list[str] = []
    cluster_centroids: list[np.ndarray] = []
    for mean_vector in means:
        assigned: str | None = None
        best_similarity = 0.9  # threshold to join an existing cluster
        for cluster_index, centroid in enumerate(cluster_centroids):
            similarity = _cosine_similarity(mean_vector, centroid)
            if similarity > best_similarity:
                best_similarity = similarity
                assigned = _letter_label(cluster_index)
        if assigned is None:
            assigned = _letter_label(len(cluster_centroids))
            cluster_centroids.append(mean_vector)
        labels.append(assigned)
    return labels


def _cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    a_norm = float(np.linalg.norm(a))
    b_norm = float(np.linalg.norm(b))
    if a_norm == 0.0 or b_norm == 0.0:
        return 0.0
    return float(np.dot(a, b) / (a_norm * b_norm))


def _letter_label(cluster_index: int) -> str:
    """A, B, ..., Z, A1, B1, ... — stays within the SectionSegment label pattern."""

    letter = chr(ord("A") + (cluster_index % 26))
    suffix = cluster_index // 26
    if suffix == 0:
        return letter
    return f"{letter}{suffix}"


def _load_source_audio(path: Path) -> tuple[np.ndarray, int, int]:
    audio, sample_rate = sf.read(str(path), dtype="float32", always_2d=True)
    channels = audio.shape[1]
    return np.ascontiguousarray(audio), int(sample_rate), channels
