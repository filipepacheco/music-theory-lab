"""Versioned contracts for separator output and synthetic validation."""

from __future__ import annotations

import math
from enum import StrEnum
from typing import Annotated, Literal, Self

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StrictBool,
    StringConstraints,
    field_validator,
    model_validator,
)

from audio_library_poc.models import (
    CodeRevision,
    ContractModel,
    Identifier,
    Sha256,
    VersionString,
)
from audio_library_poc.paths import validate_portable_filename

CandidateNativeSourceName = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=128),
]


class FrozenContractModel(ContractModel):
    """Immutable contract base that also revalidates existing model instances."""

    model_config = ConfigDict(frozen=True, revalidate_instances="always")


class AppStemKind(StrEnum):
    """The application-level stem vocabulary, independent of any candidate."""

    VOCALS = "vocals"
    DRUMS = "drums"
    BASS = "bass"
    GUITAR = "guitar"
    OTHER = "other"


APP_STEM_KINDS: tuple[AppStemKind, ...] = tuple(AppStemKind)
_APP_STEM_KIND_SET = frozenset(APP_STEM_KINDS)


class SeparatorPrecision(StrEnum):
    FLOAT32 = "float32"
    FLOAT16 = "float16"
    BFLOAT16 = "bfloat16"


class SeparatorProvenance(FrozenContractModel):
    """Candidate adapter and immutable model identity used for one result."""

    candidate: Identifier
    implementation_version: VersionString
    model_identifier: str = Field(min_length=1, max_length=512)
    model_sha256: Sha256
    code_revision: CodeRevision

    @field_validator("model_identifier")
    @classmethod
    def validate_model_identifier(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("model_identifier must not be blank")
        return value


class EffectiveSeparatorSettings(FrozenContractModel):
    """Resolved settings, including values selected by candidate defaults."""

    segment: float | None = Field(gt=0)
    overlap: float = Field(ge=0, lt=1)
    shifts: int = Field(ge=1)
    device: str = Field(min_length=1, max_length=128)
    precision: SeparatorPrecision
    retain_native: StrictBool

    @field_validator("device")
    @classmethod
    def validate_device(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("device must not be blank")
        return value


class AppStemArtifact(FrozenContractModel):
    """One canonical app stem and the candidate-native sources mapped into it."""

    stem_kind: AppStemKind
    artifact_filename: str = Field(min_length=1)
    candidate_native_sources: tuple[CandidateNativeSourceName, ...] = Field(
        min_length=1
    )

    @field_validator("artifact_filename")
    @classmethod
    def validate_artifact_filename(cls, value: str) -> str:
        return validate_portable_filename(value)

    @model_validator(mode="after")
    def validate_native_sources(self) -> Self:
        normalized = [source.casefold() for source in self.candidate_native_sources]
        if len(normalized) != len(set(normalized)):
            raise ValueError(
                "candidate_native_sources must be case-insensitively unique"
            )
        if "piano" in normalized and self.stem_kind is not AppStemKind.OTHER:
            raise ValueError("candidate-native piano must map to the other app stem")
        return self


class AudioValidationTolerances(FrozenContractModel):
    """All numeric acceptance thresholds used by streaming validation."""

    frame_count: int = Field(default=0, ge=0)
    duration_seconds: float = Field(default=0.0, ge=0)
    reconstruction_relative_rms: float = Field(default=1e-6, ge=0)
    relative_rms_floor: float = Field(default=1e-12, gt=0)


class AudioSignalFacts(FrozenContractModel):
    sample_rate: int = Field(gt=0)
    channels: int = Field(gt=0)
    frame_count: int = Field(ge=0)
    duration_seconds: float = Field(ge=0)
    peak_absolute_sample: float = Field(ge=0)

    @model_validator(mode="after")
    def validate_duration(self) -> Self:
        expected = self.frame_count / self.sample_rate
        if not math.isclose(
            self.duration_seconds,
            expected,
            rel_tol=0.0,
            abs_tol=1e-12,
        ):
            raise ValueError(
                "duration_seconds must equal frame_count divided by sample_rate"
            )
        return self


class AppStemSignalFacts(FrozenContractModel):
    stem_kind: AppStemKind
    signal: AudioSignalFacts


class ReconstructionMetric(FrozenContractModel):
    method: Literal["relative_rms"] = "relative_rms"
    source_rms: float = Field(ge=0)
    error_rms: float = Field(ge=0)
    relative_rms: float = Field(ge=0)
    compared_frame_count: int = Field(ge=0)
    compared_sample_count: int = Field(ge=0)


class SeparationValidationReport(FrozenContractModel):
    """Strict successful report nested into the committed separation result."""

    schema_version: Literal["1.0.0"] = "1.0.0"
    passed: Literal[True] = True
    chunk_frames: int = Field(gt=0)
    tolerances: AudioValidationTolerances
    source: AudioSignalFacts
    stems: tuple[AppStemSignalFacts, ...]
    reconstruction: ReconstructionMetric
    warnings: tuple[str, ...] = ()

    @field_validator("warnings")
    @classmethod
    def validate_warnings(cls, value: tuple[str, ...]) -> tuple[str, ...]:
        if any(not warning.strip() for warning in value):
            raise ValueError("warnings must not contain blank values")
        return value

    @model_validator(mode="after")
    def validate_stem_facts(self) -> Self:
        kinds = [stem.stem_kind for stem in self.stems]
        if len(kinds) != len(APP_STEM_KINDS) or set(kinds) != _APP_STEM_KIND_SET:
            raise ValueError("stems must contain exactly one fact for each app stem")
        return self


class SeparationResult(FrozenContractModel):
    """Portable, versioned description of one accepted separator output."""

    schema_version: Literal["1.0.0"] = "1.0.0"
    source_sha256: Sha256
    provenance: SeparatorProvenance
    settings: EffectiveSeparatorSettings
    stems: tuple[AppStemArtifact, ...]
    validation: SeparationValidationReport
    retained_native_artifact_filenames: tuple[str, ...] = ()

    @field_validator("retained_native_artifact_filenames")
    @classmethod
    def validate_retained_filenames(cls, value: tuple[str, ...]) -> tuple[str, ...]:
        return tuple(validate_portable_filename(filename) for filename in value)

    @model_validator(mode="after")
    def validate_result(self) -> Self:
        stem_kinds = [stem.stem_kind for stem in self.stems]
        if (
            len(stem_kinds) != len(APP_STEM_KINDS)
            or set(stem_kinds) != _APP_STEM_KIND_SET
        ):
            raise ValueError(
                "stems must contain exactly one artifact for each app stem"
            )

        validation_kinds = {stem.stem_kind for stem in self.validation.stems}
        if validation_kinds != set(stem_kinds):
            raise ValueError("validation facts must match the app stem artifacts")

        native_sources = [
            source.casefold()
            for stem in self.stems
            for source in stem.candidate_native_sources
        ]
        if len(native_sources) != len(set(native_sources)):
            raise ValueError(
                "candidate-native source names must be case-insensitively unique "
                "across app stems"
            )

        filenames = [stem.artifact_filename for stem in self.stems]
        filenames.extend(self.retained_native_artifact_filenames)
        normalized_filenames = [filename.casefold() for filename in filenames]
        if len(normalized_filenames) != len(set(normalized_filenames)):
            raise ValueError("artifact filenames must be case-insensitively unique")

        if self.retained_native_artifact_filenames and not self.settings.retain_native:
            raise ValueError(
                "retained native artifact filenames require retain_native=true"
            )
        return self


def validate_separation_result(value: object) -> SeparationResult:
    """Revalidate untrusted input, including objects built with ``model_construct``."""

    if isinstance(value, BaseModel):
        value = {
            field_name: getattr(value, field_name)
            for field_name in SeparationResult.model_fields
            if hasattr(value, field_name)
        }
    return SeparationResult.model_validate(value)
