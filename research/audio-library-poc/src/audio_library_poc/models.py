"""Versioned data contracts for the standalone POC."""

from __future__ import annotations

from enum import StrEnum
from typing import Annotated, Literal, Self

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    JsonValue,
    StringConstraints,
    field_validator,
    model_validator,
)

from audio_library_poc.paths import validate_workspace_relative_path

Sha256 = Annotated[str, StringConstraints(pattern=r"^[0-9a-f]{64}$")]
Identifier = Annotated[
    str,
    StringConstraints(
        min_length=1,
        max_length=128,
        pattern=r"^[a-z0-9]+(?:[._-][a-z0-9]+)*$",
    ),
]
VersionString = Annotated[str, StringConstraints(min_length=1, max_length=128)]
CodeRevision = Annotated[str, StringConstraints(min_length=1, max_length=256)]


class ContractModel(BaseModel):
    """Strict base for committed, versioned contracts."""

    model_config = ConfigDict(
        extra="forbid",
        allow_inf_nan=False,
        revalidate_instances="always",
    )


class ExcerptRole(StrEnum):
    SPARSE = "sparse"
    DENSE = "dense"
    INSTRUMENTAL_SOLO = "instrumental_solo"
    TRANSITION = "transition"


class AnnotationProvenance(ContractModel):
    source: str = Field(min_length=1)
    notes: str | None = None


class TonalMode(StrEnum):
    MAJOR = "major"
    MINOR = "minor"


class KeyAnnotation(ContractModel):
    tonic_pc: int = Field(ge=0, le=11)
    mode: TonalMode
    provenance: AnnotationProvenance


class ChordLabel(StrEnum):
    MAJOR = "major"
    MINOR = "minor"
    UNKNOWN = "unknown"
    NO_CHORD = "no_chord"


class ChordAnnotation(ContractModel):
    start_seconds: float = Field(ge=0)
    end_seconds: float = Field(gt=0)
    label: ChordLabel
    root_pc: int | None = Field(default=None, ge=0, le=11)
    confidence: float | None = Field(default=None, ge=0, le=1)
    provenance: AnnotationProvenance

    @model_validator(mode="after")
    def validate_chord_claim(self) -> Self:
        if self.end_seconds <= self.start_seconds:
            raise ValueError("end_seconds must be greater than start_seconds")
        pitched = self.label in {ChordLabel.MAJOR, ChordLabel.MINOR}
        if pitched and self.root_pc is None:
            raise ValueError("root_pc is required for major or minor chords")
        if not pitched and self.root_pc is not None:
            raise ValueError("root_pc must be absent for unknown or no_chord")
        return self


class BeatAnnotation(ContractModel):
    time_seconds: float = Field(ge=0)
    confidence: float | None = Field(default=None, ge=0, le=1)
    provenance: AnnotationProvenance


class MelodySource(StrEnum):
    VOCALS = "vocals"
    BASS = "bass"
    GUITAR = "guitar"


class MelodyAnnotation(ContractModel):
    source: MelodySource
    time_seconds: float = Field(ge=0)
    midi_pitch: int = Field(ge=0, le=127)
    confidence: float | None = Field(default=None, ge=0, le=1)
    provenance: AnnotationProvenance


class ExcerptAnnotation(ContractModel):
    excerpt_id: Identifier
    start_seconds: float = Field(ge=0)
    end_seconds: float = Field(gt=0)
    role: ExcerptRole
    trusted_key: KeyAnnotation | None = None
    chords: list[ChordAnnotation] = Field(default_factory=list)
    beats: list[BeatAnnotation] = Field(default_factory=list)
    melodies: list[MelodyAnnotation] = Field(default_factory=list)
    notes: str | None = None

    @model_validator(mode="after")
    def validate_bounds(self) -> Self:
        if self.end_seconds <= self.start_seconds:
            raise ValueError("end_seconds must be greater than start_seconds")

        for index, chord in enumerate(self.chords):
            if chord.start_seconds < self.start_seconds:
                raise ValueError(
                    f"chords[{index}].start_seconds must be within excerpt bounds"
                )
            if chord.end_seconds > self.end_seconds:
                raise ValueError(
                    f"chords[{index}].end_seconds must be within excerpt bounds"
                )

        for index, beat in enumerate(self.beats):
            if not self.start_seconds <= beat.time_seconds <= self.end_seconds:
                raise ValueError(
                    f"beats[{index}].time_seconds must be within inclusive "
                    "excerpt bounds"
                )

        for index, melody in enumerate(self.melodies):
            if not self.start_seconds <= melody.time_seconds <= self.end_seconds:
                raise ValueError(
                    f"melodies[{index}].time_seconds must be within inclusive "
                    "excerpt bounds"
                )
        return self


class TrackAnnotation(ContractModel):
    title: str | None = None
    artist: str | None = None
    trusted_key: KeyAnnotation | None = None
    excerpts: list[ExcerptAnnotation] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_unique_excerpt_ids(self) -> Self:
        excerpt_ids = [excerpt.excerpt_id for excerpt in self.excerpts]
        if len(excerpt_ids) != len(set(excerpt_ids)):
            raise ValueError("excerpt_id values must be unique within a track")
        return self


class CorpusTrack(ContractModel):
    track_id: Identifier
    source_path: str = Field(min_length=1)
    expected_sha256: Sha256
    annotation: TrackAnnotation = Field(default_factory=TrackAnnotation)


class CorpusManifest(ContractModel):
    schema_version: Literal["1.0.0"] = "1.0.0"
    corpus_id: Identifier
    tracks: list[CorpusTrack] = Field(min_length=1)

    @model_validator(mode="after")
    def validate_unique_tracks(self) -> Self:
        track_ids = [track.track_id for track in self.tracks]
        if len(track_ids) != len(set(track_ids)):
            raise ValueError("track_id values must be unique")

        content_hashes = [track.expected_sha256 for track in self.tracks]
        if len(content_hashes) != len(set(content_hashes)):
            raise ValueError("expected_sha256 values must be unique")
        return self


class StageSpecification(ContractModel):
    stage_kind: Identifier
    implementation_version: VersionString
    output_schema_version: VersionString = "1.0.0"
    config: dict[str, JsonValue] = Field(default_factory=dict)
    model_identifier: str | None = None
    model_sha256: Sha256 | None = None
    max_attempts: int = Field(default=3, ge=1, le=100)


class PipelineManifest(ContractModel):
    schema_version: Literal["1.0.0"] = "1.0.0"
    pipeline_id: Identifier
    code_revision: CodeRevision
    stages: list[StageSpecification] = Field(min_length=1)

    @model_validator(mode="after")
    def validate_unique_stage_kinds(self) -> Self:
        kinds = [stage.stage_kind for stage in self.stages]
        if len(kinds) != len(set(kinds)):
            raise ValueError("stage_kind values must be unique")
        return self


class StageIdentity(ContractModel):
    """All output-defining provenance for one deterministic stage run."""

    stage_kind: Identifier
    input_sha256: Sha256
    implementation_version: VersionString
    config_sha256: Sha256
    output_schema_version: VersionString
    model_identifier: str | None = None
    model_sha256: Sha256 | None = None
    code_revision: CodeRevision


class ArtifactReference(ContractModel):
    artifact_kind: Identifier
    path: str = Field(min_length=1)
    sha256: Sha256
    size_bytes: int = Field(ge=0)
    media_type: str | None = None
    durable: bool = False

    @field_validator("path")
    @classmethod
    def validate_portable_path(cls, value: str) -> str:
        return validate_workspace_relative_path(value)


class TypedError(ContractModel):
    code: Identifier
    message: str = Field(min_length=1)
    retryable: bool
    details: dict[str, JsonValue] = Field(default_factory=dict)


class Metrics(ContractModel):
    duration_seconds: float = Field(default=0.0, ge=0)
    counters: dict[str, int] = Field(default_factory=dict)
    measurements: dict[str, float] = Field(default_factory=dict)
    warnings: list[str] = Field(default_factory=list)


class StageStatus(StrEnum):
    QUEUED = "queued"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED_RETRYABLE = "failed_retryable"
    FAILED_TERMINAL = "failed_terminal"
    PAUSED = "paused"
    CANCELLED = "cancelled"


CanonicalStageStatus = Literal[
    StageStatus.SUCCEEDED,
    StageStatus.FAILED_RETRYABLE,
    StageStatus.FAILED_TERMINAL,
    StageStatus.PAUSED,
    StageStatus.CANCELLED,
]


class StageResultEnvelope(ContractModel):
    schema_version: Literal["2.0.0"] = "2.0.0"
    identity: StageIdentity
    cache_key: Sha256
    status: CanonicalStageStatus
    attempt: int = Field(ge=0)
    artifacts: list[ArtifactReference] = Field(default_factory=list)
    metrics: Metrics = Field(default_factory=Metrics)
    error: TypedError | None = None

    @property
    def stage_kind(self) -> str:
        return self.identity.stage_kind

    @property
    def input_sha256(self) -> str:
        return self.identity.input_sha256

    @property
    def implementation_version(self) -> str:
        return self.identity.implementation_version

    @property
    def config_sha256(self) -> str:
        return self.identity.config_sha256

    @property
    def output_schema_version(self) -> str:
        return self.identity.output_schema_version

    @property
    def model_identifier(self) -> str | None:
        return self.identity.model_identifier

    @property
    def model_sha256(self) -> str | None:
        return self.identity.model_sha256

    @property
    def code_revision(self) -> str:
        return self.identity.code_revision

    @model_validator(mode="after")
    def validate_error_semantics(self) -> Self:
        from audio_library_poc.cache import stage_cache_key

        if self.cache_key != stage_cache_key(self.identity):
            raise ValueError("cache_key must match identity")

        failed_statuses = {
            StageStatus.FAILED_RETRYABLE,
            StageStatus.FAILED_TERMINAL,
        }
        committed_attempt_statuses = failed_statuses | {StageStatus.SUCCEEDED}
        if self.status in committed_attempt_statuses and self.attempt < 1:
            raise ValueError(
                "attempt must be at least 1 for a committed attempt result"
            )

        metrics_attempts = self.metrics.counters.get("attempts")
        if metrics_attempts is not None and metrics_attempts != self.attempt:
            raise ValueError("metrics.counters.attempts must match attempt")

        if self.status == StageStatus.SUCCEEDED and not self.artifacts:
            raise ValueError("a succeeded stage result requires at least one artifact")
        artifact_free_statuses = failed_statuses | {
            StageStatus.PAUSED,
            StageStatus.CANCELLED,
        }
        if self.status in artifact_free_statuses and self.artifacts:
            raise ValueError(
                f"{self.status.value} stage results must not contain artifacts"
            )

        if self.status in failed_statuses and self.error is None:
            raise ValueError("error is required for a failed stage result")
        if self.status not in failed_statuses and self.error is not None:
            raise ValueError(
                "error must be absent for a non-failed canonical stage result"
            )
        if self.error is not None:
            if self.status == StageStatus.FAILED_RETRYABLE and not self.error.retryable:
                raise ValueError("failed_retryable requires a retryable error")
            if self.status == StageStatus.FAILED_TERMINAL and self.error.retryable:
                raise ValueError("failed_terminal requires a non-retryable error")
        return self


class MetadataOrigin(StrEnum):
    EMBEDDED = "embedded"
    FILENAME = "filename"
    MISSING = "missing"


class CanonicalMetadata(ContractModel):
    title: str | None = None
    artist: str | None = None
    album: str | None = None
    year: int | None = Field(default=None, ge=1000, le=2100)
    genres: list[str] | None = None


class MetadataOrigins(ContractModel):
    title: MetadataOrigin
    artist: MetadataOrigin
    album: MetadataOrigin
    year: MetadataOrigin
    genres: MetadataOrigin


class AudioFormatFacts(ContractModel):
    format_name: str | None = None
    format_long_name: str | None = None
    duration_seconds: float | None = Field(default=None, ge=0)
    size_bytes: int | None = Field(default=None, ge=0)
    bit_rate: int | None = Field(default=None, ge=0)


class AudioStreamFacts(ContractModel):
    index: int = Field(ge=0)
    codec_type: str | None = None
    codec_name: str | None = None
    sample_rate: int | None = Field(default=None, ge=0)
    channels: int | None = Field(default=None, ge=0)


class MetadataResult(ContractModel):
    schema_version: Literal["1.0.0"] = "1.0.0"
    source_path: str = Field(min_length=1)
    source_sha256: Sha256
    duplicate_of_source_path: str | None = None
    canonical: CanonicalMetadata
    origins: MetadataOrigins
    format: AudioFormatFacts
    streams: list[AudioStreamFacts] = Field(default_factory=list)
    raw_format_tags: dict[str, JsonValue] = Field(default_factory=dict)
    raw_stream_tags: list[dict[str, JsonValue]] = Field(default_factory=list)


class FfprobeModel(BaseModel):
    """Tolerant boundary model for version-dependent ffprobe fields."""

    model_config = ConfigDict(extra="allow")


class FfprobeFormat(FfprobeModel):
    filename: str | None = None
    format_name: str | None = None
    format_long_name: str | None = None
    duration: str | int | float | None = None
    size: str | int | None = None
    bit_rate: str | int | None = None
    tags: dict[str, JsonValue] = Field(default_factory=dict)


class FfprobeStream(FfprobeModel):
    index: int = Field(ge=0)
    codec_type: str | None = None
    codec_name: str | None = None
    sample_rate: str | int | None = None
    channels: int | None = Field(default=None, ge=0)
    tags: dict[str, JsonValue] = Field(default_factory=dict)


class FfprobePayload(FfprobeModel):
    format: FfprobeFormat
    streams: list[FfprobeStream] = Field(default_factory=list)


class DuplicateContent(ContractModel):
    sha256: Sha256
    source_paths: list[str] = Field(min_length=2)


class SourceInspectionReport(ContractModel):
    schema_version: Literal["1.0.0"] = "1.0.0"
    results: list[MetadataResult]
    duplicates: list[DuplicateContent] = Field(default_factory=list)
