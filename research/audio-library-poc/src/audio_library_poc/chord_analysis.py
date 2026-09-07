"""Versioned contracts for Phase 3 chord analysis output.

Kept separate from ``separation.py`` and ``beat_analysis.py`` for the same
reason those two are separate: chord recognition has its own vocabulary
(``root_pc``, ``quality``, ``label``) that never mixes with stem separation
or beat-tracking output.

Vocabulary policy (per the architecture doc's Phase 3 anti-pattern guards):

- Every accepted segment is normalized to major / minor.
- Segments the model is confident are silent map to ``no_chord``.
- Segments the model recognized as something else (7ths, sus, augmented,
  half-diminished, and the model's own explicit no-chord token) are folded
  into ``unknown`` so downstream consumers can treat abstention explicitly
  rather than falsely reading a triad.

The applied quality-normalization thresholds are recorded on the result
under ``normalization`` so a future run with different thresholds gets a
distinct cache identity via ``config_sha256``.
"""

from __future__ import annotations

from enum import StrEnum
from typing import Literal, Self

from pydantic import (
    ConfigDict,
    Field,
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
from audio_library_poc.separation import SeparatorPrecision


class FrozenChordModel(ContractModel):
    """Immutable base for the committed chord contracts."""

    model_config = ConfigDict(frozen=True, revalidate_instances="always")


class ChordLabel(StrEnum):
    """Normalized chord vocabulary."""

    MAJOR = "major"
    MINOR = "minor"
    UNKNOWN = "unknown"
    NO_CHORD = "no_chord"


class ChordSegment(FrozenChordModel):
    """One contiguous stretch of the source labelled with one chord.

    ``start_seconds`` and ``end_seconds`` are inclusive-of-start,
    exclusive-of-end. ``root_pc`` is 0-11 (C=0) when ``label`` is major or
    minor; it must be absent for ``unknown`` and ``no_chord`` per the
    architecture doc's "do not hide uncertainty" guard. ``candidate_label``
    is the raw label the model emitted before normalization — useful for
    debugging quality-normalization rules.
    """

    start_seconds: float = Field(ge=0)
    end_seconds: float = Field(gt=0)
    label: ChordLabel
    root_pc: int | None = Field(default=None, ge=0, le=11)
    candidate_label: str = Field(min_length=1)
    confidence: float | None = Field(default=None, ge=0, le=1)

    @model_validator(mode="after")
    def validate_segment(self) -> Self:
        if self.end_seconds <= self.start_seconds:
            raise ValueError("end_seconds must be strictly greater than start_seconds")
        pitched = self.label in {ChordLabel.MAJOR, ChordLabel.MINOR}
        if pitched and self.root_pc is None:
            raise ValueError("root_pc is required for major and minor labels")
        if not pitched and self.root_pc is not None:
            raise ValueError("root_pc must be absent for unknown and no_chord labels")
        return self


class ChordSourceFacts(FrozenChordModel):
    """Facts about the source audio the analyzer read."""

    sample_rate: int = Field(gt=0)
    channels: int = Field(gt=0)
    frame_count: int = Field(ge=0)
    duration_seconds: float = Field(ge=0)
    peak_absolute_sample: float = Field(ge=0)


class ChordAnalyzerProvenance(FrozenChordModel):
    """Adapter and pinned-model identity used for one chord analysis."""

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


class EffectiveChordAnalyzerSettings(FrozenChordModel):
    """Resolved runtime settings a real analyzer used."""

    device: str = Field(min_length=1, max_length=128)
    precision: SeparatorPrecision
    frame_duration_seconds: float = Field(gt=0)
    sample_rate: int = Field(gt=0)
    hop_length: int = Field(gt=0)
    seq_len: int = Field(gt=0)

    @field_validator("device")
    @classmethod
    def validate_device(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("device must not be blank")
        return value


class ChordCoverage(FrozenChordModel):
    """Fraction-of-duration counters per normalized label."""

    major_seconds: float = Field(ge=0)
    minor_seconds: float = Field(ge=0)
    unknown_seconds: float = Field(ge=0)
    no_chord_seconds: float = Field(ge=0)


class ChordFrameEvidence(FrozenChordModel):
    """Private, replayable frame evidence before product abstention."""

    frame_index: int = Field(ge=0)
    overlap_votes: int = Field(ge=1)
    raw_argmax_index: int = Field(ge=0)
    raw_top_logit: float
    raw_runner_up_index: int = Field(ge=0)
    raw_runner_up_logit: float
    post_logit_smoothing_argmax_index: int = Field(ge=0)
    post_categorical_index: int = Field(ge=0)
    categorical_votes: int = Field(ge=1)

    @model_validator(mode="after")
    def validate_ranked_logits(self) -> Self:
        if self.raw_argmax_index == self.raw_runner_up_index:
            raise ValueError("raw top-two class indices must be distinct")
        if self.raw_top_logit < self.raw_runner_up_logit:
            raise ValueError("raw top logit must not be below its runner-up")
        return self


class ChordFrameEvidenceSettings(FrozenChordModel):
    """Effective frame-decision settings, recorded without free-form fields."""

    device: str = Field(min_length=1, max_length=128)
    effective_precision: SeparatorPrecision
    sample_rate: int = Field(gt=0)
    hop_length: int = Field(gt=0)
    seq_len: int = Field(gt=0)
    frame_duration_seconds: float = Field(gt=0)
    frame_timing: Literal[
        "legacy_rounded_config",
        "exact_hop_length_divided_by_sample_rate",
    ]
    feature_transform: Literal["log(abs(cqt)+1e-6).T"]
    normalization_strategy: Literal[
        "normalize_full_cqt_then_zero_pad",
        "raw_pad_then_normalize",
    ]
    overlap: float = Field(ge=0, lt=0.95)
    window_hop_frames: int = Field(gt=0)
    overlap_aggregation: Literal["mean_logits"]
    logit_smoothing_kernel: int = Field(ge=1, le=101)
    logit_smoothing_gaussian: bool
    categorical_smoothing_window: int = Field(ge=1, le=101)
    checkpoint_source: str | None = Field(default=None, min_length=1, max_length=2048)
    checkpoint_terms_reference: str | None = Field(
        default=None,
        min_length=1,
        max_length=2048,
    )

    @field_validator("device")
    @classmethod
    def validate_device(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("device must not be blank")
        return value

    @field_validator("logit_smoothing_kernel", "categorical_smoothing_window")
    @classmethod
    def validate_odd_smoothing_window(cls, value: int) -> int:
        if value % 2 == 0:
            raise ValueError("smoothing windows must be odd")
        return value

    @model_validator(mode="after")
    def validate_checkpoint_provenance_pair(self) -> Self:
        if (self.checkpoint_source is None) != (
            self.checkpoint_terms_reference is None
        ):
            raise ValueError(
                "checkpoint source and checkpoint terms must be recorded together"
            )
        return self


class ChordFrameEvidenceArtifact(FrozenChordModel):
    """Versioned artifact bound to the exact producing stage identity."""

    schema_version: Literal["1.0.0"] = "1.0.0"
    candidate: Identifier
    implementation_version: VersionString
    config_sha256: Sha256
    source_sha256: Sha256
    model_sha256: Sha256
    code_revision: CodeRevision
    frame_duration_seconds: float = Field(gt=0)
    effective_settings: ChordFrameEvidenceSettings
    frames: tuple[ChordFrameEvidence, ...] = Field(min_length=1)

    @model_validator(mode="after")
    def validate_ordered_frames(self) -> Self:
        if (
            self.frame_duration_seconds
            != self.effective_settings.frame_duration_seconds
        ):
            raise ValueError(
                "frame_duration_seconds must match effective settings timing"
            )
        for index, frame in enumerate(self.frames):
            if frame.frame_index != index:
                raise ValueError("frame evidence indices must be contiguous from zero")
        return self


class ChordAnalysisResult(FrozenChordModel):
    """Portable, versioned description of one accepted chord analysis.

    ``segments`` must be non-empty and strictly ordered by ``start_seconds``
    with no gaps or overlaps: consecutive segments must satisfy
    ``prev.end_seconds == curr.start_seconds`` (within 1 ms). The full
    ``[0, source.duration_seconds]`` span is covered; when the analyzer
    detected nothing it emits a single ``unknown`` or ``no_chord`` segment
    spanning the whole track.
    """

    schema_version: Literal["1.0.0"] = "1.0.0"
    source_sha256: Sha256
    provenance: ChordAnalyzerProvenance
    settings: EffectiveChordAnalyzerSettings
    source: ChordSourceFacts
    segments: tuple[ChordSegment, ...] = Field(min_length=1)
    coverage: ChordCoverage
    warnings: tuple[str, ...] = ()

    @field_validator("warnings")
    @classmethod
    def validate_warnings(cls, value: tuple[str, ...]) -> tuple[str, ...]:
        if any(not warning.strip() for warning in value):
            raise ValueError("warnings must not contain blank values")
        return value

    @model_validator(mode="after")
    def validate_result(self) -> Self:
        tolerance = 1e-3
        for index in range(1, len(self.segments)):
            prev = self.segments[index - 1]
            curr = self.segments[index]
            if curr.start_seconds < prev.end_seconds - tolerance:
                raise ValueError(f"segments[{index}] overlaps segments[{index - 1}]")
            if curr.start_seconds > prev.end_seconds + tolerance:
                raise ValueError(
                    f"segments[{index}] leaves a gap after segments[{index - 1}]"
                )
        first_start = self.segments[0].start_seconds
        if first_start > tolerance:
            raise ValueError("first segment must start at or near 0 seconds")
        if self.source.duration_seconds > 0:
            last_end = self.segments[-1].end_seconds
            if last_end < self.source.duration_seconds - tolerance:
                raise ValueError("last segment must cover through the source duration")
        return self


def summarize_coverage(
    segments: tuple[ChordSegment, ...] | list[ChordSegment],
) -> ChordCoverage:
    """Sum segment durations per normalized label."""

    per_label = {label: 0.0 for label in ChordLabel}
    for segment in segments:
        per_label[segment.label] += segment.end_seconds - segment.start_seconds
    return ChordCoverage(
        major_seconds=per_label[ChordLabel.MAJOR],
        minor_seconds=per_label[ChordLabel.MINOR],
        unknown_seconds=per_label[ChordLabel.UNKNOWN],
        no_chord_seconds=per_label[ChordLabel.NO_CHORD],
    )
