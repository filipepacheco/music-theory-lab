"""Versioned contracts for Phase 3 section-boundary output.

Kept separate from ``chord_analysis.py`` and ``beat_analysis.py`` for the
same reason those two are separate: section segmentation has its own
vocabulary (letter labels for repeating parts) that never mixes with chord
recognition or beat tracking.

The librosa-based baseline is a pure algorithm (chroma + Laplacian /
agglomerative clustering), so ``model_identifier`` and ``model_sha256`` are
absent from provenance by design — the HPCP key stage follows the same
pattern.
"""

from __future__ import annotations

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


class FrozenSectionModel(ContractModel):
    """Immutable base for the committed section contracts."""

    model_config = ConfigDict(frozen=True, revalidate_instances="always")


class SectionSegment(FrozenSectionModel):
    """One contiguous section of the source with a repeat-group label.

    ``start_seconds`` and ``end_seconds`` are inclusive-of-start,
    exclusive-of-end. ``label`` is a letter tag (A, B, C, ...) that groups
    segments the detector considers similar — two segments sharing the same
    label are the analyzer's best guess at the same repeated part (e.g. two
    choruses). Labels carry no semantic meaning; downstream consumers
    should treat them as opaque cluster ids.
    """

    start_seconds: float = Field(ge=0)
    end_seconds: float = Field(gt=0)
    label: str = Field(min_length=1, max_length=8, pattern=r"^[A-Z][0-9A-Z]*$")

    @model_validator(mode="after")
    def validate_segment(self) -> Self:
        if self.end_seconds <= self.start_seconds:
            raise ValueError("end_seconds must be strictly greater than start_seconds")
        return self


class SectionSourceFacts(FrozenSectionModel):
    """Facts about the source audio the analyzer read."""

    sample_rate: int = Field(gt=0)
    channels: int = Field(gt=0)
    frame_count: int = Field(ge=0)
    duration_seconds: float = Field(ge=0)
    peak_absolute_sample: float = Field(ge=0)


class SectionAnalyzerProvenance(FrozenSectionModel):
    """Adapter identity used for one section analysis.

    No pinned checkpoint — the librosa-segment baseline is a pure algorithm,
    so ``model_identifier`` and ``model_sha256`` are absent by design.
    """

    candidate: Identifier
    implementation_version: VersionString
    code_revision: CodeRevision


class EffectiveSectionAnalyzerSettings(FrozenSectionModel):
    """Resolved runtime settings a real analyzer used."""

    sample_rate: int = Field(gt=0)
    hop_length: int = Field(gt=0)
    feature: Literal["chroma_cqt"]
    n_segments: int = Field(gt=0, le=64)


class SectionAnalysisResult(FrozenSectionModel):
    """Portable, versioned description of one accepted section analysis.

    ``sections`` must be non-empty and strictly ordered by ``start_seconds``
    with no gaps or overlaps: consecutive segments must satisfy
    ``prev.end_seconds == curr.start_seconds`` (within 1 ms). The full
    ``[0, source.duration_seconds]`` span is covered; when the analyzer
    detected no interior boundaries it emits a single segment labelled
    ``"A"`` spanning the whole track.
    """

    schema_version: Literal["1.0.0"] = "1.0.0"
    source_sha256: Sha256
    provenance: SectionAnalyzerProvenance
    settings: EffectiveSectionAnalyzerSettings
    source: SectionSourceFacts
    sections: tuple[SectionSegment, ...] = Field(min_length=1)
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
        for index in range(1, len(self.sections)):
            prev = self.sections[index - 1]
            curr = self.sections[index]
            if curr.start_seconds < prev.end_seconds - tolerance:
                raise ValueError(f"sections[{index}] overlaps sections[{index - 1}]")
            if curr.start_seconds > prev.end_seconds + tolerance:
                raise ValueError(
                    f"sections[{index}] leaves a gap after sections[{index - 1}]"
                )
        first_start = self.sections[0].start_seconds
        if first_start > tolerance:
            raise ValueError("first section must start at or near 0 seconds")
        if self.source.duration_seconds > 0:
            last_end = self.sections[-1].end_seconds
            if last_end < self.source.duration_seconds - tolerance:
                raise ValueError("last section must cover through the source duration")
        return self


def coverage_seconds(
    sections: tuple[SectionSegment, ...] | list[SectionSegment],
) -> float:
    """Sum the durations of every section. Used by the coverage-to-duration test."""

    total = 0.0
    for section in sections:
        total += section.end_seconds - section.start_seconds
    return total
