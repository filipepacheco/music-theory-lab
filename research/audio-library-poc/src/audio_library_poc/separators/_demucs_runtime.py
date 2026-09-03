"""Real Demucs htdemucs_6s inference runtime.

Kept out of ``demucs.py`` so importing the adapter in the offline harness
never drags in ``torch`` or ``demucs``. Mirrors the split used by
``_bs_roformer_runtime.py``.

Contract with the bridge is identical: the bridge has already validated the
config, resolved and hashed the source audio, and committed the stage
identity — this module only resolves the pinned checkpoint and returns a
strict ``SeparatorResponse``.
"""

from __future__ import annotations

import contextlib
import time
from pathlib import Path

import numpy as np
import soundfile as sf
import torch
from demucs.apply import BagOfModels, apply_model
from demucs.states import load_model

from audio_library_poc.execution import ExpectedStageFailure
from audio_library_poc.models import Metrics, TypedError
from audio_library_poc.separation import (
    AppStemArtifact,
    AppStemKind,
    AppStemSignalFacts,
    AudioSignalFacts,
    AudioValidationTolerances,
    EffectiveSeparatorSettings,
    ReconstructionMetric,
    SeparationResult,
    SeparationValidationReport,
    SeparatorPrecision,
    SeparatorProvenance,
)
from audio_library_poc.separators.protocol import (
    SeparatorRequest,
    SeparatorResponse,
)

_APP_STEM_FILENAMES: tuple[tuple[AppStemKind, str, tuple[str, ...]], ...] = (
    (AppStemKind.VOCALS, "vocals.wav", ("vocals",)),
    (AppStemKind.DRUMS, "drums.wav", ("drums",)),
    (AppStemKind.BASS, "bass.wav", ("bass",)),
    (AppStemKind.GUITAR, "guitar.wav", ("guitar",)),
    (AppStemKind.OTHER, "other.wav", ("other", "piano")),
)
_EXPECTED_SOURCES = frozenset({"vocals", "drums", "bass", "guitar", "other", "piano"})

_PRECISION_TO_AUTOCAST_DTYPE = {
    SeparatorPrecision.FLOAT16: torch.float16,
    SeparatorPrecision.BFLOAT16: torch.bfloat16,
}


def run_demucs_inference(
    *,
    request: SeparatorRequest,
    candidate_id: str,
    implementation_version: str,
) -> SeparatorResponse:
    """Run the pinned htdemucs_6s model on ``request.source_path``."""

    config = request.config
    identity = request.stage_identity

    workspace = _resolve_workspace(request.source_path, config.source_relative_path)
    checkpoint_path = _resolve_asset(
        workspace,
        config.checkpoint_relative_path,
        label="checkpoint",
    )

    device = _resolve_device(config.device)
    sub_model = load_model(checkpoint_path)
    bag = BagOfModels([sub_model], weights=None, segment=None)
    bag.to(device)
    bag.eval()
    _validate_sources(bag.sources)

    mix_np, sample_rate = _load_source_audio(request.source_path)
    frame_count = mix_np.shape[1]
    duration_seconds = frame_count / sample_rate
    peak_source = float(np.max(np.abs(mix_np))) if frame_count else 0.0

    mix_tensor = torch.from_numpy(mix_np).float().unsqueeze(0)

    autocast_dtype = _PRECISION_TO_AUTOCAST_DTYPE.get(config.precision)
    autocast_ctx: contextlib.AbstractContextManager
    if autocast_dtype is not None and device.type == "cuda":
        autocast_ctx = torch.autocast(device_type="cuda", dtype=autocast_dtype)
    else:
        autocast_ctx = contextlib.nullcontext()

    started = time.time()
    with torch.inference_mode(), autocast_ctx:
        stems_tensor = apply_model(
            bag,
            mix_tensor,
            shifts=config.shifts,
            split=config.split,
            overlap=config.overlap,
            segment=config.segment,
            num_workers=config.jobs,
            device=device,
        )
    elapsed = time.time() - started
    # Shape is (batch=1, sources, channels, frames); drop batch, cast to float32.
    stems_np = stems_tensor[0].to(dtype=torch.float32, device="cpu").numpy()

    raw_stems = _split_stems(stems_np, bag.sources)
    stem_arrays = _fold_stems(raw_stems)
    reconstruction = _reconstruction_metric(mix_np, stem_arrays)

    staging = request.staging_directory
    for _stem_kind, artifact_filename, _sources in _APP_STEM_FILENAMES:
        _write_stem_wav(
            staging / artifact_filename,
            stem_arrays[artifact_filename],
            sample_rate,
        )

    stems_signal_facts = tuple(
        AppStemSignalFacts(
            stem_kind=stem_kind,
            signal=AudioSignalFacts(
                sample_rate=sample_rate,
                channels=stem_arrays[artifact_filename].shape[0],
                frame_count=stem_arrays[artifact_filename].shape[1],
                duration_seconds=stem_arrays[artifact_filename].shape[1] / sample_rate,
                peak_absolute_sample=float(
                    np.max(np.abs(stem_arrays[artifact_filename]))
                )
                if stem_arrays[artifact_filename].size
                else 0.0,
            ),
        )
        for stem_kind, artifact_filename, _sources in _APP_STEM_FILENAMES
    )

    provenance = SeparatorProvenance(
        candidate=candidate_id,
        implementation_version=implementation_version,
        model_identifier=identity.model_identifier,
        model_sha256=identity.model_sha256,
        code_revision=identity.code_revision,
    )
    settings = EffectiveSeparatorSettings(
        segment=config.segment,
        overlap=config.overlap,
        shifts=config.shifts,
        device=config.device,
        precision=config.precision,
        retain_native=config.retain_native,
    )
    validation_report = SeparationValidationReport(
        chunk_frames=_effective_segment_frames(bag, config.segment, sample_rate),
        tolerances=AudioValidationTolerances(),
        source=AudioSignalFacts(
            sample_rate=sample_rate,
            channels=mix_np.shape[0],
            frame_count=frame_count,
            duration_seconds=duration_seconds,
            peak_absolute_sample=peak_source,
        ),
        stems=stems_signal_facts,
        reconstruction=reconstruction,
    )
    result = SeparationResult(
        source_sha256=request.source_sha256,
        provenance=provenance,
        settings=settings,
        stems=tuple(
            AppStemArtifact(
                stem_kind=stem_kind,
                artifact_filename=artifact_filename,
                candidate_native_sources=sources,
            )
            for stem_kind, artifact_filename, sources in _APP_STEM_FILENAMES
        ),
        validation=validation_report,
    )

    metrics = Metrics(
        duration_seconds=elapsed,
        counters={
            "app_stems_written": len(_APP_STEM_FILENAMES),
            "shifts": config.shifts,
        },
        measurements={
            "reconstruction_relative_rms": reconstruction.relative_rms,
            "source_peak_absolute_sample": peak_source,
        },
    )

    return SeparatorResponse(
        result=result,
        stem_artifact_names=tuple(
            filename for _kind, filename, _sources in _APP_STEM_FILENAMES
        ),
        metrics=metrics,
    )


def _resolve_workspace(source_path: Path, source_relative_path: str) -> Path:
    relative_parts = Path(source_relative_path).as_posix().split("/")
    root = source_path
    for _ in relative_parts:
        root = root.parent
    return root


def _resolve_asset(workspace: Path, relative_path: str, *, label: str) -> Path:
    candidate = (workspace / Path(relative_path)).resolve()
    if not candidate.is_relative_to(workspace):
        raise ExpectedStageFailure(
            TypedError(
                code=f"separator.{label}_outside_workspace",
                message=f"Demucs {label} path must resolve inside the workspace",
                retryable=False,
                details={"relative_path": relative_path},
            )
        )
    if not candidate.is_file():
        raise ExpectedStageFailure(
            TypedError(
                code=f"separator.{label}_missing",
                message=f"Demucs {label} file is missing",
                retryable=False,
                details={"relative_path": relative_path},
            )
        )
    return candidate


def _resolve_device(device_str: str) -> torch.device:
    device = torch.device(device_str)
    if device.type == "cuda" and not torch.cuda.is_available():
        raise ExpectedStageFailure(
            TypedError(
                code="separator.cuda_unavailable",
                message="config requested cuda but torch.cuda.is_available() is False",
                retryable=False,
                details={"requested": device_str},
            )
        )
    return device


def _validate_sources(sources: list[str]) -> None:
    if frozenset(sources) != _EXPECTED_SOURCES:
        raise ExpectedStageFailure(
            TypedError(
                code="separator.unexpected_stems",
                message=(
                    "Demucs model advertises stems the adapter does not know "
                    "how to fold into the app stem vocabulary"
                ),
                retryable=False,
                details={"actual_sources": list(sources)},
            )
        )


def _load_source_audio(path: Path) -> tuple[np.ndarray, int]:
    audio, sample_rate = sf.read(str(path), dtype="float32", always_2d=True)
    mix = np.ascontiguousarray(audio.T)
    return mix, int(sample_rate)


def _split_stems(stems_np: np.ndarray, sources: list[str]) -> dict[str, np.ndarray]:
    return {name: stems_np[index] for index, name in enumerate(sources)}


def _fold_stems(raw_stems: dict[str, np.ndarray]) -> dict[str, np.ndarray]:
    return {
        "vocals.wav": raw_stems["vocals"],
        "drums.wav": raw_stems["drums"],
        "bass.wav": raw_stems["bass"],
        "guitar.wav": raw_stems["guitar"],
        "other.wav": raw_stems["other"] + raw_stems["piano"],
    }


def _reconstruction_metric(
    source: np.ndarray,
    stems: dict[str, np.ndarray],
) -> ReconstructionMetric:
    reconstructed = sum(stems.values())
    error = source - reconstructed
    if source.size:
        source_rms = float(np.sqrt(np.mean(source.astype(np.float64) ** 2)))
        error_rms = float(np.sqrt(np.mean(error.astype(np.float64) ** 2)))
    else:
        source_rms = 0.0
        error_rms = 0.0
    relative_rms = error_rms / source_rms if source_rms > 0 else 0.0
    return ReconstructionMetric(
        source_rms=source_rms,
        error_rms=error_rms,
        relative_rms=relative_rms,
        compared_frame_count=source.shape[1],
        compared_sample_count=source.size,
    )


def _write_stem_wav(path: Path, waveform: np.ndarray, sample_rate: int) -> None:
    clipped = np.clip(waveform, -1.0, 1.0)
    quantized = np.round(clipped * 32767.0).astype(np.int16)
    sf.write(str(path), quantized.T, sample_rate, subtype="PCM_16")


def _effective_segment_frames(
    bag: BagOfModels,
    config_segment: float | None,
    sample_rate: int,
) -> int:
    # BagOfModels does NOT expose its own `.segment` attribute; the effective
    # segment length is whatever apply_model was called with, falling back to
    # each sub-model's own `.segment`. For our single-model bag we can read
    # the sub-model's attribute directly. Note: HTDemucs' segment is a
    # `fractions.Fraction` (e.g. 39/5), which float() handles cleanly.
    if config_segment is not None:
        segment_seconds = float(config_segment)
    else:
        sub_segment = getattr(bag.models[0], "segment", None)
        segment_seconds = float(sub_segment) if sub_segment is not None else 8.0
    return max(1, int(round(segment_seconds * sample_rate)))
