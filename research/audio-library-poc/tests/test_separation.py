from __future__ import annotations

import math
import sys
import wave
from array import array
from collections.abc import Iterator, Sequence
from dataclasses import dataclass, field
from pathlib import Path

import pytest
from pydantic import ValidationError

from audio_library_poc.audio_validation import (
    AudioSource,
    AudioValidationError,
    Pcm16WaveSource,
    validate_separation_audio,
)
from audio_library_poc.separation import (
    APP_STEM_KINDS,
    AppStemArtifact,
    AppStemKind,
    AudioValidationTolerances,
    EffectiveSeparatorSettings,
    SeparationResult,
    SeparatorPrecision,
    SeparatorProvenance,
    validate_separation_result,
)


@dataclass
class GeneratedAudioSource:
    sample_rate: int = 8_000
    channels: int = 1
    frame_count: int = 8
    sample: float = 0.0
    chunks: tuple[tuple[float, ...], ...] | None = None
    requested_chunk_frames: list[int] = field(default_factory=list)
    largest_yielded_sample_count: int = 0

    def iter_interleaved_chunks(
        self,
        chunk_frames: int,
    ) -> Iterator[Sequence[float]]:
        self.requested_chunk_frames.append(chunk_frames)
        if self.chunks is not None:
            for chunk in self.chunks:
                self.largest_yielded_sample_count = max(
                    self.largest_yielded_sample_count,
                    len(chunk),
                )
                yield chunk
            return

        remaining = self.frame_count
        while remaining:
            frames = min(remaining, chunk_frames)
            chunk = (self.sample,) * (frames * self.channels)
            self.largest_yielded_sample_count = max(
                self.largest_yielded_sample_count,
                len(chunk),
            )
            yield chunk
            remaining -= frames


def generated_stems(
    *,
    sample_rate: int = 8_000,
    channels: int = 1,
    frame_count: int = 8,
    vocal_sample: float = 0.25,
) -> dict[AppStemKind, GeneratedAudioSource]:
    return {
        kind: GeneratedAudioSource(
            sample_rate=sample_rate,
            channels=channels,
            frame_count=frame_count,
            sample=vocal_sample if kind is AppStemKind.VOCALS else 0.0,
        )
        for kind in APP_STEM_KINDS
    }


def valid_settings() -> EffectiveSeparatorSettings:
    return EffectiveSeparatorSettings(
        segment=None,
        overlap=0.25,
        shifts=1,
        device="cuda:0",
        precision=SeparatorPrecision.FLOAT32,
        retain_native=True,
    )


def valid_provenance() -> SeparatorProvenance:
    return SeparatorProvenance(
        candidate="demucs",
        implementation_version="0.1.0",
        model_identifier="htdemucs_6s",
        model_sha256="a" * 64,
        code_revision="working-tree",
    )


def valid_artifacts() -> tuple[AppStemArtifact, ...]:
    native_sources = {
        AppStemKind.VOCALS: ("vocals",),
        AppStemKind.DRUMS: ("drums",),
        AppStemKind.BASS: ("bass",),
        AppStemKind.GUITAR: ("guitar",),
        AppStemKind.OTHER: ("other", "piano"),
    }
    return tuple(
        AppStemArtifact(
            stem_kind=kind,
            artifact_filename=f"{kind.value}.wav",
            candidate_native_sources=native_sources[kind],
        )
        for kind in APP_STEM_KINDS
    )


def valid_result() -> SeparationResult:
    report = validate_separation_audio(
        GeneratedAudioSource(sample=0.25),
        generated_stems(),
        chunk_frames=3,
    )
    return SeparationResult(
        source_sha256="b" * 64,
        provenance=valid_provenance(),
        settings=valid_settings(),
        stems=valid_artifacts(),
        validation=report,
        retained_native_artifact_filenames=("piano.native.wav",),
    )


def _replace_stem(
    stems: dict[AppStemKind, GeneratedAudioSource],
    kind: AppStemKind,
    replacement: GeneratedAudioSource,
) -> dict[AppStemKind, GeneratedAudioSource]:
    return {**stems, kind: replacement}


def _assert_validation_error(
    code: str,
    original: AudioSource,
    stems: dict[AppStemKind, AudioSource],
    *,
    tolerances: AudioValidationTolerances | None = None,
) -> None:
    with pytest.raises(AudioValidationError) as caught:
        validate_separation_audio(
            original,
            stems,
            tolerances=tolerances,
            chunk_frames=2,
        )

    assert caught.value.error.code == code
    assert caught.value.error.retryable is False


def _write_pcm16_wave(
    path: Path,
    samples: Sequence[int],
    *,
    sample_rate: int = 8_000,
    channels: int = 1,
    sample_width: int = 2,
) -> None:
    encoded = array("h", samples)
    if sys.byteorder != "little":
        encoded.byteswap()
    payload = encoded.tobytes()
    if sample_width == 1:
        payload = bytes((sample + 128) % 256 for sample in samples)

    with wave.open(str(path), "wb") as output:
        output.setnchannels(channels)
        output.setsampwidth(sample_width)
        output.setframerate(sample_rate)
        output.writeframes(payload)


def test_separation_result_has_exactly_five_app_stems_and_signal_facts() -> None:
    result = valid_result()

    assert result.schema_version == "1.0.0"
    assert tuple(artifact.stem_kind for artifact in result.stems) == APP_STEM_KINDS
    assert tuple(facts.stem_kind for facts in result.validation.stems) == (
        APP_STEM_KINDS
    )
    assert result.validation.passed is True
    assert result.validation.reconstruction.relative_rms == 0.0


@pytest.mark.parametrize("missing_kind", APP_STEM_KINDS)
def test_separation_result_rejects_a_missing_app_stem(
    missing_kind: AppStemKind,
) -> None:
    with pytest.raises(ValidationError, match="exactly one artifact"):
        SeparationResult(
            source_sha256="b" * 64,
            provenance=valid_provenance(),
            settings=valid_settings(),
            stems=tuple(
                stem for stem in valid_artifacts() if stem.stem_kind is not missing_kind
            ),
            validation=valid_result().validation,
        )


def test_separation_result_rejects_duplicate_stem_kind() -> None:
    artifacts = list(valid_artifacts())
    artifacts[-1] = AppStemArtifact(
        stem_kind=AppStemKind.GUITAR,
        artifact_filename="second-guitar.wav",
        candidate_native_sources=("second-guitar",),
    )

    with pytest.raises(ValidationError, match="exactly one artifact"):
        SeparationResult(
            source_sha256="b" * 64,
            provenance=valid_provenance(),
            settings=valid_settings(),
            stems=tuple(artifacts),
            validation=valid_result().validation,
        )


def test_artifact_filenames_are_case_insensitively_unique() -> None:
    artifacts = list(valid_artifacts())
    artifacts[1] = AppStemArtifact(
        stem_kind=AppStemKind.DRUMS,
        artifact_filename="VOCALS.WAV",
        candidate_native_sources=("drums",),
    )

    with pytest.raises(ValidationError, match="case-insensitively unique"):
        SeparationResult(
            source_sha256="b" * 64,
            provenance=valid_provenance(),
            settings=valid_settings(),
            stems=tuple(artifacts),
            validation=valid_result().validation,
        )


@pytest.mark.parametrize(
    "filename",
    ["nested/vocals.wav", r"nested\vocals.wav", "../vocals.wav", "CON.wav"],
)
def test_app_stem_artifact_requires_a_direct_child_portable_filename(
    filename: str,
) -> None:
    with pytest.raises(ValidationError, match="artifact_filename"):
        AppStemArtifact(
            stem_kind=AppStemKind.VOCALS,
            artifact_filename=filename,
            candidate_native_sources=("vocals",),
        )


def test_retained_native_filenames_share_the_case_insensitive_namespace() -> None:
    with pytest.raises(ValidationError, match="case-insensitively unique"):
        SeparationResult(
            source_sha256="b" * 64,
            provenance=valid_provenance(),
            settings=valid_settings(),
            stems=valid_artifacts(),
            validation=valid_result().validation,
            retained_native_artifact_filenames=("GUITAR.WAV",),
        )


def test_retained_native_files_require_retain_native_setting() -> None:
    settings = valid_settings().model_copy(update={"retain_native": False})

    with pytest.raises(ValidationError, match="retain_native"):
        SeparationResult(
            source_sha256="b" * 64,
            provenance=valid_provenance(),
            settings=settings,
            stems=valid_artifacts(),
            validation=valid_result().validation,
            retained_native_artifact_filenames=("piano.native.wav",),
        )


def test_piano_can_map_to_other() -> None:
    artifact = AppStemArtifact(
        stem_kind=AppStemKind.OTHER,
        artifact_filename="other.wav",
        candidate_native_sources=("piano",),
    )

    assert artifact.candidate_native_sources == ("piano",)


@pytest.mark.parametrize(
    "stem_kind",
    [
        AppStemKind.VOCALS,
        AppStemKind.DRUMS,
        AppStemKind.BASS,
        AppStemKind.GUITAR,
    ],
)
def test_piano_cannot_map_to_a_non_other_stem(stem_kind: AppStemKind) -> None:
    with pytest.raises(ValidationError, match="piano.*other"):
        AppStemArtifact(
            stem_kind=stem_kind,
            artifact_filename=f"{stem_kind.value}.wav",
            candidate_native_sources=("Piano",),
        )


@pytest.mark.parametrize(
    "update",
    [
        {"segment": 0.0},
        {"overlap": -0.01},
        {"overlap": 1.0},
        {"shifts": 0},
        {"device": "   "},
        {"precision": "int8"},
    ],
)
def test_effective_settings_reject_invalid_values(update: dict[str, object]) -> None:
    data = valid_settings().model_dump(mode="python")
    data.update(update)

    with pytest.raises(ValidationError):
        EffectiveSeparatorSettings.model_validate(data)


def test_model_construct_cannot_bypass_nested_boundary_validation() -> None:
    unsafe_settings = EffectiveSeparatorSettings.model_construct(
        segment=None,
        overlap=2.0,
        shifts=1,
        device="cuda:0",
        precision=SeparatorPrecision.FLOAT32,
        retain_native=True,
    )

    with pytest.raises(ValidationError, match="overlap"):
        SeparationResult(
            source_sha256="b" * 64,
            provenance=valid_provenance(),
            settings=unsafe_settings,
            stems=valid_artifacts(),
            validation=valid_result().validation,
        )


def test_model_construct_cannot_bypass_top_level_boundary_validation() -> None:
    valid = valid_result()
    unsafe = SeparationResult.model_construct(
        **{
            **valid.model_dump(mode="python"),
            "stems": valid.stems[:-1],
        }
    )

    with pytest.raises(ValidationError, match="exactly one artifact"):
        validate_separation_result(unsafe)


@pytest.mark.parametrize(
    "samples",
    [
        [0, 0, 0, 0],
        [1, -1, 1, -1],
    ],
    ids=["zero", "near-zero"],
)
def test_pcm16_wav_validation_accepts_zero_and_near_zero_reconstruction(
    tmp_path: Path,
    samples: list[int],
) -> None:
    original_path = tmp_path / "original.wav"
    _write_pcm16_wave(original_path, samples)
    stem_sources: dict[AppStemKind, Pcm16WaveSource] = {}
    for kind in APP_STEM_KINDS:
        path = tmp_path / f"{kind.value}.wav"
        _write_pcm16_wave(
            path,
            samples if kind is AppStemKind.VOCALS else [0] * len(samples),
        )
        stem_sources[kind] = Pcm16WaveSource(path)

    report = validate_separation_audio(
        Pcm16WaveSource(original_path),
        stem_sources,
        chunk_frames=2,
    )

    assert report.passed is True
    assert report.source.frame_count == len(samples)
    assert report.reconstruction.relative_rms == 0.0
    assert report.reconstruction.compared_frame_count == len(samples)


def test_pcm16_wav_adapter_rejects_unsupported_sample_width(tmp_path: Path) -> None:
    path = tmp_path / "eight-bit.wav"
    _write_pcm16_wave(path, [0, 1, -1], sample_width=1)

    with pytest.raises(AudioValidationError) as caught:
        Pcm16WaveSource(path)

    assert caught.value.error.code == "audio.unsupported_wav_encoding"


def test_validator_rejects_missing_stem() -> None:
    stems = generated_stems()
    del stems[AppStemKind.OTHER]

    _assert_validation_error(
        "audio.invalid_stem_set",
        GeneratedAudioSource(sample=0.25),
        stems,
    )


def test_validator_rejects_sample_rate_mismatch() -> None:
    stems = _replace_stem(
        generated_stems(),
        AppStemKind.BASS,
        GeneratedAudioSource(sample_rate=44_100),
    )

    _assert_validation_error(
        "audio.sample_rate_mismatch",
        GeneratedAudioSource(sample=0.25),
        stems,
    )


def test_validator_rejects_channel_mismatch() -> None:
    stems = _replace_stem(
        generated_stems(),
        AppStemKind.DRUMS,
        GeneratedAudioSource(channels=2),
    )

    _assert_validation_error(
        "audio.channel_mismatch",
        GeneratedAudioSource(sample=0.25),
        stems,
    )


def test_validator_enforces_frame_count_tolerance() -> None:
    stems = _replace_stem(
        generated_stems(),
        AppStemKind.GUITAR,
        GeneratedAudioSource(frame_count=7),
    )

    _assert_validation_error(
        "audio.frame_count_mismatch",
        GeneratedAudioSource(sample=0.25),
        stems,
        tolerances=AudioValidationTolerances(duration_seconds=1.0),
    )


def test_validator_enforces_duration_tolerance() -> None:
    stems = _replace_stem(
        generated_stems(),
        AppStemKind.GUITAR,
        GeneratedAudioSource(frame_count=7),
    )

    _assert_validation_error(
        "audio.duration_mismatch",
        GeneratedAudioSource(sample=0.25),
        stems,
        tolerances=AudioValidationTolerances(
            frame_count=1,
            duration_seconds=0.0,
        ),
    )


def test_validator_rejects_non_finite_samples() -> None:
    stems = _replace_stem(
        generated_stems(frame_count=1),
        AppStemKind.VOCALS,
        GeneratedAudioSource(frame_count=1, chunks=((math.nan,),)),
    )

    _assert_validation_error(
        "audio.non_finite_sample",
        GeneratedAudioSource(frame_count=1),
        stems,
    )


def test_validator_rejects_chunks_not_aligned_to_channels() -> None:
    stems = _replace_stem(
        generated_stems(channels=2, frame_count=1, vocal_sample=0.0),
        AppStemKind.BASS,
        GeneratedAudioSource(channels=2, frame_count=1, chunks=((0.0,),)),
    )

    _assert_validation_error(
        "audio.misaligned_chunk",
        GeneratedAudioSource(channels=2, frame_count=1),
        stems,
    )


def test_validator_rejects_reconstruction_over_relative_rms_tolerance() -> None:
    _assert_validation_error(
        "audio.reconstruction_mismatch",
        GeneratedAudioSource(sample=0.25),
        generated_stems(vocal_sample=0.0),
    )


def test_validator_rejects_declared_frame_count_that_differs_from_stream() -> None:
    stems = _replace_stem(
        generated_stems(frame_count=2, vocal_sample=0.0),
        AppStemKind.OTHER,
        GeneratedAudioSource(frame_count=2, chunks=((0.0,),)),
    )

    _assert_validation_error(
        "audio.declared_frame_count_mismatch",
        GeneratedAudioSource(frame_count=2),
        stems,
    )


def test_validator_requests_and_retains_only_bounded_chunks() -> None:
    original = GeneratedAudioSource(frame_count=11, sample=0.25)
    stems = generated_stems(frame_count=11)

    report = validate_separation_audio(
        original,
        stems,
        chunk_frames=3,
    )

    all_sources = (original, *stems.values())
    assert report.reconstruction.compared_frame_count == 11
    assert all(source.requested_chunk_frames == [3] for source in all_sources)
    assert all(
        source.largest_yielded_sample_count <= 3 * source.channels
        for source in all_sources
    )


def test_validation_report_and_result_are_frozen_and_strict() -> None:
    result = valid_result()

    with pytest.raises(ValidationError, match="extra"):
        type(result.validation).model_validate(
            {
                **result.validation.model_dump(mode="python"),
                "extra": "not allowed",
            }
        )
    with pytest.raises(ValidationError, match="frozen"):
        result.source_sha256 = "c" * 64  # type: ignore[misc]
