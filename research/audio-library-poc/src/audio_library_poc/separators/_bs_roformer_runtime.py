"""Real BS-RoFormer inference runtime, kept out of the adapter module.

Splitting the torch-heavy inference off means importing
``audio_library_poc.separators.bs_roformer`` in the offline harness never
drags in ``torch`` or ``bs_roformer``. The Phase 1 test suite still runs
without the ``inference`` extras installed.

Contract with the bridge:
- The bridge has already validated the config against ``BsRoformerStageConfig``,
  resolved ``source_relative_path`` under the workspace, and hashed it against
  ``identity.input_sha256``. ``request.source_sha256`` is authoritative.
- The bridge has NOT touched ``checkpoint_relative_path`` or
  ``config_relative_path``; this runtime resolves and reads both.
- The bridge validates the returned ``SeparationResult`` against the committed
  ``StageIdentity``: ``provenance.model_identifier / model_sha256 /
  implementation_version / code_revision`` must all match.
"""

from __future__ import annotations

import math
import time
from pathlib import Path

import numpy as np
import soundfile as sf
import torch
import yaml
from bs_roformer.inference import SafeLoaderWithTuple, demix_track
from ml_collections import ConfigDict

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
_EXPECTED_CANDIDATE_INSTRUMENTS = frozenset(
    {"vocals", "drums", "bass", "guitar", "other", "piano"}
)


def run_bs_roformer_inference(
    *,
    request: SeparatorRequest,
    candidate_id: str,
    implementation_version: str,
) -> SeparatorResponse:
    """Run the pinned six-stem BS-RoFormer model on ``request.source_path``.

    Emits exactly five app-stem WAV files (16-bit PCM, source sample rate)
    into ``request.staging_directory`` and returns the strict descriptor
    bundle the bridge translates into the atomically-published artifact set.
    """

    config = request.config
    identity = request.stage_identity
    _require_supported_precision(config.precision)

    workspace = _resolve_workspace(request.source_path, config.source_relative_path)
    checkpoint_path = _resolve_asset(
        workspace,
        config.checkpoint_relative_path,
        label="checkpoint",
    )
    yaml_config_path = _resolve_asset(
        workspace,
        config.config_relative_path,
        label="config",
    )

    model_config = _load_bs_roformer_config(yaml_config_path)
    _validate_model_config(model_config)

    device = _resolve_device(config.device)
    model = _load_model(model_config, checkpoint_path, device=device)

    mix_np, sample_rate = _load_source_audio(request.source_path)
    frame_count = mix_np.shape[1]
    duration_seconds = frame_count / sample_rate
    peak_source = float(np.max(np.abs(mix_np))) if frame_count else 0.0

    mix_tensor = torch.from_numpy(mix_np).float()

    started = time.time()
    with torch.inference_mode():
        raw_stems, _ = demix_track(model_config, model, mix_tensor, device)
    elapsed = time.time() - started

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

    validation_report = SeparationValidationReport(
        chunk_frames=_chunk_frames(model_config),
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

    provenance = SeparatorProvenance(
        candidate=candidate_id,
        implementation_version=implementation_version,
        model_identifier=identity.model_identifier,
        model_sha256=identity.model_sha256,
        code_revision=identity.code_revision,
    )
    settings = EffectiveSeparatorSettings(
        segment=None,
        overlap=1.0 - 1.0 / max(_num_overlap(model_config), 1),
        shifts=1,
        device=config.device,
        precision=SeparatorPrecision.FLOAT16,
        retain_native=config.retain_native,
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
            "chunks": _estimated_chunks(frame_count, _chunk_frames(model_config)),
            "app_stems_written": len(_APP_STEM_FILENAMES),
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


def _require_supported_precision(precision: SeparatorPrecision) -> None:
    if precision is not SeparatorPrecision.FLOAT16:
        raise ExpectedStageFailure(
            TypedError(
                code="separator.unsupported_precision",
                message=(
                    "BS-RoFormer inference currently only supports "
                    "precision=float16; demix_track hard-codes torch.cuda.amp"
                ),
                retryable=False,
                details={"requested": precision.value},
            )
        )


def _resolve_workspace(source_path: Path, source_relative_path: str) -> Path:
    """Recover the workspace root from the bridge-resolved source_path.

    The bridge resolved ``workspace / source_relative_path`` into
    ``source_path``. Stripping the relative components from the tail gives us
    back the workspace root without threading it through the request.
    """

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
                message=(f"BS-RoFormer {label} path must resolve inside the workspace"),
                retryable=False,
                details={"relative_path": relative_path},
            )
        )
    if not candidate.is_file():
        raise ExpectedStageFailure(
            TypedError(
                code=f"separator.{label}_missing",
                message=f"BS-RoFormer {label} file is missing",
                retryable=False,
                details={"relative_path": relative_path},
            )
        )
    return candidate


def _load_bs_roformer_config(path: Path) -> ConfigDict:
    with path.open("r", encoding="utf-8") as source:
        raw = yaml.load(source, Loader=SafeLoaderWithTuple)
    return ConfigDict(raw)


def _validate_model_config(model_config: ConfigDict) -> None:
    try:
        instruments = tuple(model_config.training.instruments)
    except (AttributeError, KeyError) as exc:
        raise ExpectedStageFailure(
            TypedError(
                code="separator.model_config_invalid",
                message="model config missing training.instruments list",
                retryable=False,
            )
        ) from exc
    if frozenset(instruments) != _EXPECTED_CANDIDATE_INSTRUMENTS:
        raise ExpectedStageFailure(
            TypedError(
                code="separator.unexpected_stems",
                message=(
                    "BS-RoFormer model config declares stems the adapter does "
                    "not know how to fold into the app stem vocabulary"
                ),
                retryable=False,
                details={"actual_instruments": list(instruments)},
            )
        )
    target = getattr(model_config.training, "target_instrument", None)
    if target is not None:
        raise ExpectedStageFailure(
            TypedError(
                code="separator.single_target_model_unsupported",
                message=(
                    "BS-RoFormer models with a single target_instrument are "
                    "not supported by this adapter"
                ),
                retryable=False,
            )
        )


def _load_model(
    model_config: ConfigDict,
    checkpoint_path: Path,
    *,
    device: torch.device,
) -> torch.nn.Module:
    from bs_roformer import get_model_from_config

    model = get_model_from_config("bs_roformer", model_config)
    state_dict = torch.load(
        checkpoint_path,
        map_location="cpu",
        weights_only=True,
    )
    model.load_state_dict(state_dict)
    model.to(device)
    model.eval()
    return model


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


def _load_source_audio(path: Path) -> tuple[np.ndarray, int]:
    audio, sample_rate = sf.read(str(path), dtype="float32", always_2d=True)
    # soundfile returns shape (frames, channels); demix_track expects (channels, frames)
    mix = np.ascontiguousarray(audio.T)
    return mix, int(sample_rate)


def _fold_stems(raw_stems: dict[str, np.ndarray]) -> dict[str, np.ndarray]:
    """Fold candidate-native stems into the five app-stem WAV filenames."""

    folded: dict[str, np.ndarray] = {
        "vocals.wav": raw_stems["vocals"],
        "drums.wav": raw_stems["drums"],
        "bass.wav": raw_stems["bass"],
        "guitar.wav": raw_stems["guitar"],
        "other.wav": raw_stems["other"] + raw_stems["piano"],
    }
    return folded


def _reconstruction_metric(
    source: np.ndarray,
    stems: dict[str, np.ndarray],
) -> ReconstructionMetric:
    reconstructed = sum(stems.values())
    error = source - reconstructed
    compared_frame_count = source.shape[1]
    compared_sample_count = source.size
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
        compared_frame_count=compared_frame_count,
        compared_sample_count=compared_sample_count,
    )


def _write_stem_wav(path: Path, waveform: np.ndarray, sample_rate: int) -> None:
    # waveform shape is (channels, frames); soundfile expects (frames, channels)
    clipped = np.clip(waveform, -1.0, 1.0)
    quantized = np.round(clipped * 32767.0).astype(np.int16)
    sf.write(str(path), quantized.T, sample_rate, subtype="PCM_16")


def _chunk_frames(model_config: ConfigDict) -> int:
    inference = getattr(model_config, "inference", None)
    if inference is not None and hasattr(inference, "chunk_size"):
        return int(inference.chunk_size)
    audio = getattr(model_config, "audio", None)
    if audio is not None and hasattr(audio, "chunk_size"):
        return int(audio.chunk_size)
    return 588800


def _num_overlap(model_config: ConfigDict) -> int:
    inference = getattr(model_config, "inference", None)
    if inference is not None and hasattr(inference, "num_overlap"):
        return int(inference.num_overlap)
    return 2


def _estimated_chunks(frame_count: int, chunk_frames: int) -> int:
    if chunk_frames <= 0 or frame_count <= 0:
        return 0
    return int(math.ceil(frame_count / chunk_frames))
