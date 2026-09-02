"""Bounded-memory audio validation for dependency-free synthetic PCM16 POCs."""

from __future__ import annotations

import math
import sys
import wave
from array import array
from collections.abc import Iterator, Mapping, Sequence
from pathlib import Path
from typing import Protocol

from pydantic import BaseModel, ValidationError

from audio_library_poc.models import JsonValue, TypedError
from audio_library_poc.separation import (
    APP_STEM_KINDS,
    AppStemKind,
    AppStemSignalFacts,
    AudioSignalFacts,
    AudioValidationTolerances,
    ReconstructionMetric,
    SeparationValidationReport,
)


class AudioSource(Protocol):
    """A signal readable as bounded interleaved floating-point chunks."""

    @property
    def sample_rate(self) -> int: ...

    @property
    def channels(self) -> int: ...

    @property
    def frame_count(self) -> int: ...

    def iter_interleaved_chunks(
        self,
        chunk_frames: int,
    ) -> Iterator[Sequence[float]]: ...


class AudioValidationError(RuntimeError):
    """Validation failure carrying the POC's serializable typed error."""

    def __init__(self, error: TypedError) -> None:
        super().__init__(error.message)
        self.error = error


class Pcm16WaveSource:
    """Minimal PCM16 WAV reader for generated fixtures, not general decoding."""

    def __init__(self, path: Path) -> None:
        self.path = Path(path)
        self._sample_rate, self._channels, self._frame_count = _inspect_pcm16_wave(
            self.path
        )

    @property
    def sample_rate(self) -> int:
        return self._sample_rate

    @property
    def channels(self) -> int:
        return self._channels

    @property
    def frame_count(self) -> int:
        return self._frame_count

    def iter_interleaved_chunks(
        self,
        chunk_frames: int,
    ) -> Iterator[Sequence[float]]:
        _validate_chunk_frames(chunk_frames)
        try:
            with wave.open(str(self.path), "rb") as source:
                current = _pcm16_wave_facts(source, path=self.path)
                expected = (self.sample_rate, self.channels, self.frame_count)
                if current != expected:
                    _raise_audio_error(
                        "audio.wav_changed",
                        "WAV metadata changed after the source was opened",
                        filename=str(self.path),
                    )

                while payload := source.readframes(chunk_frames):
                    frame_size = self.channels * 2
                    if len(payload) % frame_size:
                        _raise_audio_error(
                            "audio.misaligned_chunk",
                            "PCM16 WAV payload is not aligned to complete frames",
                            filename=str(self.path),
                            sample_count=len(payload) // 2,
                            channels=self.channels,
                        )
                    samples = array("h")
                    samples.frombytes(payload)
                    if sys.byteorder != "little":
                        samples.byteswap()
                    yield tuple(sample / 32768.0 for sample in samples)
        except AudioValidationError:
            raise
        except (EOFError, OSError, wave.Error) as error:
            _raise_audio_error(
                "audio.wav_read_failed",
                "PCM16 WAV fixture could not be read",
                filename=str(self.path),
                exception_type=type(error).__name__,
            )


def validate_separation_audio(
    source: AudioSource,
    stems: Mapping[AppStemKind | str, AudioSource],
    *,
    tolerances: AudioValidationTolerances | None = None,
    chunk_frames: int = 65_536,
) -> SeparationValidationReport:
    """Validate five stems while retaining at most bounded chunks for six signals."""

    _validate_chunk_frames(chunk_frames)
    accepted_tolerances = _validate_tolerances(tolerances)
    normalized_stems = _normalize_stems(stems)

    source_metadata = _read_source_metadata(source, signal_name="source")
    stem_metadata = {
        kind: _read_source_metadata(stem, signal_name=kind.value)
        for kind, stem in normalized_stems.items()
    }
    warnings = _validate_signal_compatibility(
        source_metadata,
        stem_metadata,
        accepted_tolerances,
    )

    ordered_sources = (source, *(normalized_stems[kind] for kind in APP_STEM_KINDS))
    signal_names = ("source", *(kind.value for kind in APP_STEM_KINDS))
    cursors = tuple(
        _AudioCursor(
            audio_source,
            signal_name=signal_name,
            channels=source_metadata.channels,
            chunk_frames=chunk_frames,
        )
        for audio_source, signal_name in zip(
            ordered_sources,
            signal_names,
            strict=True,
        )
    )

    source_energy = 0.0
    error_energy = 0.0
    compared_frame_count = 0
    compared_sample_count = 0
    while True:
        blocks = tuple(cursor.read_frames(chunk_frames) for cursor in cursors)
        largest_sample_count = max((len(block) for block in blocks), default=0)
        if largest_sample_count == 0:
            break

        block_frame_count = largest_sample_count // source_metadata.channels
        compared_frame_count += block_frame_count
        compared_sample_count += largest_sample_count
        for sample_index in range(largest_sample_count):
            source_sample = (
                blocks[0][sample_index] if sample_index < len(blocks[0]) else 0.0
            )
            reconstructed = sum(
                block[sample_index] if sample_index < len(block) else 0.0
                for block in blocks[1:]
            )
            error = source_sample - reconstructed
            source_energy += source_sample * source_sample
            error_energy += error * error

    expected_frame_counts = (
        source_metadata.frame_count,
        *(stem_metadata[kind].frame_count for kind in APP_STEM_KINDS),
    )
    for cursor, expected_frame_count in zip(
        cursors,
        expected_frame_counts,
        strict=True,
    ):
        if cursor.observed_frame_count != expected_frame_count:
            _raise_audio_error(
                "audio.declared_frame_count_mismatch",
                "streamed frame count does not match declared frame_count",
                signal=cursor.signal_name,
                declared_frame_count=expected_frame_count,
                observed_frame_count=cursor.observed_frame_count,
            )

    if compared_sample_count:
        source_rms = math.sqrt(source_energy / compared_sample_count)
        error_rms = math.sqrt(error_energy / compared_sample_count)
    else:
        source_rms = 0.0
        error_rms = 0.0
    relative_rms = error_rms / max(
        source_rms,
        accepted_tolerances.relative_rms_floor,
    )
    reconstruction = ReconstructionMetric(
        source_rms=source_rms,
        error_rms=error_rms,
        relative_rms=relative_rms,
        compared_frame_count=compared_frame_count,
        compared_sample_count=compared_sample_count,
    )
    if relative_rms > accepted_tolerances.reconstruction_relative_rms:
        _raise_audio_error(
            "audio.reconstruction_mismatch",
            "stem sum exceeds the reconstruction relative RMS tolerance",
            relative_rms=relative_rms,
            tolerance=accepted_tolerances.reconstruction_relative_rms,
            source_rms=source_rms,
            error_rms=error_rms,
        )

    source_facts = _signal_facts(source_metadata, cursors[0])
    stem_facts = tuple(
        AppStemSignalFacts(
            stem_kind=kind,
            signal=_signal_facts(stem_metadata[kind], cursors[index]),
        )
        for index, kind in enumerate(APP_STEM_KINDS, start=1)
    )
    return SeparationValidationReport(
        chunk_frames=chunk_frames,
        tolerances=accepted_tolerances,
        source=source_facts,
        stems=stem_facts,
        reconstruction=reconstruction,
        warnings=tuple(warnings),
    )


class _SignalMetadata:
    def __init__(self, sample_rate: int, channels: int, frame_count: int) -> None:
        self.sample_rate = sample_rate
        self.channels = channels
        self.frame_count = frame_count

    @property
    def duration_seconds(self) -> float:
        return self.frame_count / self.sample_rate


class _AudioCursor:
    def __init__(
        self,
        source: AudioSource,
        *,
        signal_name: str,
        channels: int,
        chunk_frames: int,
    ) -> None:
        try:
            self._iterator = iter(source.iter_interleaved_chunks(chunk_frames))
        except Exception as error:
            if isinstance(error, AudioValidationError):
                raise
            _raise_audio_error(
                "audio.invalid_source",
                "audio source could not create a chunk iterator",
                signal=signal_name,
                exception_type=type(error).__name__,
            )
        self.signal_name = signal_name
        self._channels = channels
        self._chunk_frames = chunk_frames
        self._current: tuple[float, ...] = ()
        self._offset = 0
        self._exhausted = False
        self.observed_frame_count = 0
        self.peak_absolute_sample = 0.0

    def read_frames(self, requested_frames: int) -> tuple[float, ...]:
        output: list[float] = []
        requested_samples = requested_frames * self._channels
        while len(output) < requested_samples and not self._exhausted:
            if self._offset == len(self._current):
                self._load_chunk()
                if self._exhausted:
                    break
            remaining = requested_samples - len(output)
            available = len(self._current) - self._offset
            take = min(remaining, available)
            output.extend(self._current[self._offset : self._offset + take])
            self._offset += take
        return tuple(output)

    def _load_chunk(self) -> None:
        try:
            raw_chunk = next(self._iterator)
        except StopIteration:
            self._current = ()
            self._offset = 0
            self._exhausted = True
            return
        except AudioValidationError:
            raise
        except Exception as error:
            _raise_audio_error(
                "audio.chunk_read_failed",
                "audio source failed while yielding a chunk",
                signal=self.signal_name,
                exception_type=type(error).__name__,
            )

        if isinstance(raw_chunk, (str, bytes, bytearray)) or not isinstance(
            raw_chunk, Sequence
        ):
            _raise_audio_error(
                "audio.invalid_chunk",
                "audio chunks must be finite numeric sequences",
                signal=self.signal_name,
            )
        sample_count = len(raw_chunk)
        if sample_count == 0:
            _raise_audio_error(
                "audio.empty_chunk",
                "audio sources must not yield empty chunks",
                signal=self.signal_name,
            )
        if sample_count > self._chunk_frames * self._channels:
            _raise_audio_error(
                "audio.chunk_too_large",
                "audio source yielded more than the requested chunk bound",
                signal=self.signal_name,
                sample_count=sample_count,
                maximum_sample_count=self._chunk_frames * self._channels,
            )
        if sample_count % self._channels:
            _raise_audio_error(
                "audio.misaligned_chunk",
                "interleaved chunk does not contain complete channel frames",
                signal=self.signal_name,
                sample_count=sample_count,
                channels=self._channels,
            )

        converted: list[float] = []
        for sample_index, sample in enumerate(raw_chunk):
            if isinstance(sample, bool) or not isinstance(sample, (int, float)):
                _raise_audio_error(
                    "audio.invalid_sample",
                    "audio samples must be real numbers",
                    signal=self.signal_name,
                    sample_index=sample_index,
                )
            converted_sample = float(sample)
            if not math.isfinite(converted_sample):
                _raise_audio_error(
                    "audio.non_finite_sample",
                    "audio samples must be finite",
                    signal=self.signal_name,
                    sample_index=sample_index,
                )
            converted.append(converted_sample)
            self.peak_absolute_sample = max(
                self.peak_absolute_sample,
                abs(converted_sample),
            )

        self._current = tuple(converted)
        self._offset = 0
        self.observed_frame_count += sample_count // self._channels


def _normalize_stems(
    stems: Mapping[AppStemKind | str, AudioSource],
) -> dict[AppStemKind, AudioSource]:
    normalized: dict[AppStemKind, AudioSource] = {}
    unexpected: list[str] = []
    for raw_kind, source in stems.items():
        try:
            kind = (
                raw_kind if isinstance(raw_kind, AppStemKind) else AppStemKind(raw_kind)
            )
        except (TypeError, ValueError):
            unexpected.append(str(raw_kind))
            continue
        if kind in normalized:
            unexpected.append(str(raw_kind))
            continue
        normalized[kind] = source

    missing = [kind.value for kind in APP_STEM_KINDS if kind not in normalized]
    if missing or unexpected or len(normalized) != len(APP_STEM_KINDS):
        _raise_audio_error(
            "audio.invalid_stem_set",
            "stems must contain exactly the five application stem kinds",
            missing=missing,
            unexpected=unexpected,
        )
    return normalized


def _read_source_metadata(
    source: AudioSource,
    *,
    signal_name: str,
) -> _SignalMetadata:
    try:
        sample_rate = source.sample_rate
        channels = source.channels
        frame_count = source.frame_count
    except Exception as error:
        _raise_audio_error(
            "audio.invalid_source",
            "audio source metadata could not be read",
            signal=signal_name,
            exception_type=type(error).__name__,
        )

    values = {
        "sample_rate": sample_rate,
        "channels": channels,
        "frame_count": frame_count,
    }
    for field_name, value in values.items():
        if isinstance(value, bool) or not isinstance(value, int):
            _raise_audio_error(
                "audio.invalid_signal_facts",
                "audio source metadata values must be integers",
                signal=signal_name,
                field=field_name,
            )
    if sample_rate <= 0 or channels <= 0 or frame_count < 0:
        _raise_audio_error(
            "audio.invalid_signal_facts",
            "audio source metadata is outside the valid range",
            signal=signal_name,
            sample_rate=sample_rate,
            channels=channels,
            frame_count=frame_count,
        )
    return _SignalMetadata(sample_rate, channels, frame_count)


def _validate_signal_compatibility(
    source: _SignalMetadata,
    stems: Mapping[AppStemKind, _SignalMetadata],
    tolerances: AudioValidationTolerances,
) -> list[str]:
    warnings: list[str] = []
    for kind in APP_STEM_KINDS:
        stem = stems[kind]
        if stem.sample_rate != source.sample_rate:
            _raise_audio_error(
                "audio.sample_rate_mismatch",
                "stem sample rate does not match the source",
                stem_kind=kind.value,
                source_sample_rate=source.sample_rate,
                stem_sample_rate=stem.sample_rate,
            )
        if stem.channels != source.channels:
            _raise_audio_error(
                "audio.channel_mismatch",
                "stem channel count does not match the source",
                stem_kind=kind.value,
                source_channels=source.channels,
                stem_channels=stem.channels,
            )

        frame_delta = abs(stem.frame_count - source.frame_count)
        if frame_delta > tolerances.frame_count:
            _raise_audio_error(
                "audio.frame_count_mismatch",
                "stem frame count exceeds the configured tolerance",
                stem_kind=kind.value,
                frame_delta=frame_delta,
                tolerance=tolerances.frame_count,
            )
        duration_delta = abs(stem.duration_seconds - source.duration_seconds)
        if duration_delta > tolerances.duration_seconds:
            _raise_audio_error(
                "audio.duration_mismatch",
                "stem duration exceeds the configured tolerance",
                stem_kind=kind.value,
                duration_delta_seconds=duration_delta,
                tolerance_seconds=tolerances.duration_seconds,
            )
        if frame_delta:
            warnings.append(
                f"{kind.value} differs from source by {frame_delta} frame(s)"
            )
    return warnings


def _validate_tolerances(
    tolerances: AudioValidationTolerances | None,
) -> AudioValidationTolerances:
    if tolerances is None:
        return AudioValidationTolerances()
    value: object = tolerances
    if isinstance(value, BaseModel):
        value = value.model_dump(mode="python")
    try:
        return AudioValidationTolerances.model_validate(value)
    except ValidationError as error:
        _raise_audio_error(
            "audio.invalid_tolerances",
            "audio validation tolerances are invalid",
            issue_count=error.error_count(),
        )


def _validate_chunk_frames(chunk_frames: int) -> None:
    if isinstance(chunk_frames, bool) or not isinstance(chunk_frames, int):
        _raise_audio_error(
            "audio.invalid_chunk_frames",
            "chunk_frames must be a positive integer",
        )
    if chunk_frames <= 0:
        _raise_audio_error(
            "audio.invalid_chunk_frames",
            "chunk_frames must be a positive integer",
            chunk_frames=chunk_frames,
        )


def _signal_facts(
    metadata: _SignalMetadata,
    cursor: _AudioCursor,
) -> AudioSignalFacts:
    return AudioSignalFacts(
        sample_rate=metadata.sample_rate,
        channels=metadata.channels,
        frame_count=metadata.frame_count,
        duration_seconds=metadata.duration_seconds,
        peak_absolute_sample=cursor.peak_absolute_sample,
    )


def _inspect_pcm16_wave(path: Path) -> tuple[int, int, int]:
    try:
        with wave.open(str(path), "rb") as source:
            return _pcm16_wave_facts(source, path=path)
    except AudioValidationError:
        raise
    except (EOFError, OSError, wave.Error) as error:
        _raise_audio_error(
            "audio.unsupported_wav_encoding",
            "file is not a readable uncompressed PCM16 WAV fixture",
            filename=str(path),
            exception_type=type(error).__name__,
        )


def _pcm16_wave_facts(
    source: wave.Wave_read,
    *,
    path: Path,
) -> tuple[int, int, int]:
    if source.getcomptype() != "NONE" or source.getsampwidth() != 2:
        _raise_audio_error(
            "audio.unsupported_wav_encoding",
            "only uncompressed 16-bit PCM WAV synthetic fixtures are supported",
            filename=str(path),
            compression=source.getcomptype(),
            sample_width_bytes=source.getsampwidth(),
        )
    sample_rate = source.getframerate()
    channels = source.getnchannels()
    frame_count = source.getnframes()
    if sample_rate <= 0 or channels <= 0 or frame_count < 0:
        _raise_audio_error(
            "audio.invalid_signal_facts",
            "PCM16 WAV fixture has invalid stream metadata",
            filename=str(path),
            sample_rate=sample_rate,
            channels=channels,
            frame_count=frame_count,
        )
    return sample_rate, channels, frame_count


def _raise_audio_error(
    code: str,
    message: str,
    **details: JsonValue,
) -> None:
    raise AudioValidationError(
        TypedError(
            code=code,
            message=message,
            retryable=False,
            details=details,
        )
    )
