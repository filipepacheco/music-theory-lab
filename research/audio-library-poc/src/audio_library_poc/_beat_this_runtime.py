"""Real Beat This! inference runtime, kept out of the stage module.

Splitting the torch/beat_this imports off here means importing
``beat_this_stage`` in the offline harness never drags in torch or
beat_this. The Phase 1 test suite still runs without the ``inference``
extras installed.

Contract with the bridge:
- The bridge has already validated ``BeatThisStageConfig``, resolved and
  hashed the source audio, and committed the stage identity.
- The runtime owns loading the pinned checkpoint, running inference, and
  building the ``BeatAnalysisResult``. Provenance echoes the identity so
  the bridge's provenance_mismatch guard passes.
"""

from __future__ import annotations

import time
from pathlib import Path
from statistics import median

import numpy as np
import soundfile as sf
import torch
from beat_this.inference import Audio2Beats

from audio_library_poc.beat_analysis import (
    BeatAnalysisResult,
    BeatAnalyzerProvenance,
    BeatEstimate,
    BeatSourceFacts,
    EffectiveBeatAnalyzerSettings,
)
from audio_library_poc.beat_this_stage import (
    BEAT_THIS_CANDIDATE_ID,
    BEAT_THIS_IMPLEMENTATION_VERSION,
    BeatThisStageConfig,
    build_beat_this_metrics,
)
from audio_library_poc.execution import ExpectedStageFailure
from audio_library_poc.models import Metrics, StageIdentity, TypedError
from audio_library_poc.separation import SeparatorPrecision


def run_beat_this_inference(
    *,
    workspace: Path,
    source_path: Path,
    config: BeatThisStageConfig,
    identity: StageIdentity,
) -> tuple[BeatAnalysisResult, Metrics]:
    checkpoint_path = _resolve_checkpoint(
        workspace,
        config.checkpoint_relative_path,
    )
    device = _resolve_device(config.device)
    use_float16 = config.precision == SeparatorPrecision.FLOAT16

    audio_np, sample_rate = _load_source_audio(source_path)
    frame_count = audio_np.shape[0]
    channels = audio_np.shape[1] if audio_np.ndim == 2 else 1
    duration_seconds = frame_count / sample_rate
    peak_source = float(np.max(np.abs(audio_np))) if frame_count else 0.0

    analyzer = Audio2Beats(
        checkpoint_path=str(checkpoint_path),
        device=str(device),
        float16=use_float16,
        dbn=config.use_dbn,
    )

    started = time.time()
    beat_times, downbeat_times = analyzer(audio_np, sample_rate)
    wall_seconds = time.time() - started

    beats = _merge_beats(beat_times, downbeat_times)
    if not beats:
        raise ExpectedStageFailure(
            TypedError(
                code="beat.no_beats_detected",
                message="Beat This! detected no beats in the source audio",
                retryable=False,
                details={
                    "source_relative_path": config.source_relative_path,
                    "duration_seconds": duration_seconds,
                },
            )
        )
    tempo_bpm = _median_tempo_bpm(beats)

    result = BeatAnalysisResult(
        source_sha256=identity.input_sha256,
        provenance=BeatAnalyzerProvenance(
            candidate=BEAT_THIS_CANDIDATE_ID,
            implementation_version=BEAT_THIS_IMPLEMENTATION_VERSION,
            model_identifier=identity.model_identifier,
            model_sha256=identity.model_sha256,
            code_revision=identity.code_revision,
        ),
        settings=EffectiveBeatAnalyzerSettings(
            device=config.device,
            precision=SeparatorPrecision.FLOAT16 if use_float16 else config.precision,
            use_dbn=config.use_dbn,
        ),
        source=BeatSourceFacts(
            sample_rate=sample_rate,
            channels=channels,
            frame_count=frame_count,
            duration_seconds=duration_seconds,
            peak_absolute_sample=peak_source,
        ),
        beats=tuple(beats),
        downbeat_count=sum(1 for beat in beats if beat.is_downbeat),
        tempo_median_bpm=tempo_bpm,
    )
    metrics = build_beat_this_metrics(
        wall_seconds=wall_seconds,
        beat_count=len(beats),
        downbeat_count=result.downbeat_count,
        tempo_bpm=tempo_bpm,
    )
    return result, metrics


def _resolve_checkpoint(workspace: Path, checkpoint_relative_path: str) -> Path:
    candidate = (workspace / Path(checkpoint_relative_path)).resolve()
    if not candidate.is_relative_to(workspace):
        raise ExpectedStageFailure(
            TypedError(
                code="beat.checkpoint_outside_workspace",
                message="Beat This! checkpoint must resolve inside the workspace",
                retryable=False,
                details={"relative_path": checkpoint_relative_path},
            )
        )
    if not candidate.is_file():
        raise ExpectedStageFailure(
            TypedError(
                code="beat.checkpoint_missing",
                message="Beat This! checkpoint file is missing",
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
                code="beat.cuda_unavailable",
                message="config requested cuda but torch.cuda.is_available() is False",
                retryable=False,
                details={"requested": device_str},
            )
        )
    return device


def _load_source_audio(path: Path) -> tuple[np.ndarray, int]:
    audio, sample_rate = sf.read(str(path), dtype="float32", always_2d=True)
    return np.ascontiguousarray(audio), int(sample_rate)


def _merge_beats(beat_times, downbeat_times) -> list[BeatEstimate]:
    """Merge the (beats, downbeats) arrays Beat This! returns into a sorted list.

    Beat This! returns downbeats as a strict subset of beats, but the two
    arrays are independent floats — align them with a small tolerance so
    off-by-microseconds doesn't cost us a downbeat flag.
    """

    beat_list = [float(t) for t in beat_times]
    downbeat_set = {round(float(t), 6) for t in downbeat_times}
    tolerance = 1e-4

    def _is_downbeat(time_seconds: float) -> bool:
        rounded = round(time_seconds, 6)
        if rounded in downbeat_set:
            return True
        for candidate in downbeat_set:
            if abs(candidate - time_seconds) <= tolerance:
                return True
        return False

    merged = [
        BeatEstimate(time_seconds=t, is_downbeat=_is_downbeat(t))
        for t in sorted(beat_list)
    ]
    return merged


def _median_tempo_bpm(beats: list[BeatEstimate]) -> float:
    if len(beats) < 2:
        return 0.0
    intervals = [
        beats[i].time_seconds - beats[i - 1].time_seconds
        for i in range(1, len(beats))
        if beats[i].time_seconds > beats[i - 1].time_seconds
    ]
    if not intervals:
        return 0.0
    return float(60.0 / median(intervals))
