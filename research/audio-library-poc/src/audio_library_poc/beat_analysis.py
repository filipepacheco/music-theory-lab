"""Versioned contracts for Phase 3 beat analysis output.

Kept separate from ``separation.py`` on purpose: beat analysis has its own
contract vocabulary (``beats``, ``downbeats``, ``tempo``) that never mixes
with stem-separation output. The two contracts share ``SeparatorPrecision``
from ``separation.py`` because the precision-selection surface is identical
across GPU-inference stages.
"""

from __future__ import annotations

from typing import Literal, Self

from pydantic import (
    ConfigDict,
    Field,
    StrictBool,
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


class FrozenBeatModel(ContractModel):
    """Immutable base for the committed beat contracts."""

    model_config = ConfigDict(frozen=True, revalidate_instances="always")


class BeatEstimate(FrozenBeatModel):
    """One beat position and whether it is a downbeat.

    Downbeats are a subset of beats; the analyzer emits one ``BeatEstimate``
    per detected beat with ``is_downbeat=true`` for the ones marked as bar
    starts. Positions are in seconds from the source origin.
    """

    time_seconds: float = Field(ge=0)
    is_downbeat: StrictBool


class BeatSourceFacts(FrozenBeatModel):
    """Facts about the source audio the analyzer read."""

    sample_rate: int = Field(gt=0)
    channels: int = Field(gt=0)
    frame_count: int = Field(ge=0)
    duration_seconds: float = Field(ge=0)
    peak_absolute_sample: float = Field(ge=0)


class BeatAnalyzerProvenance(FrozenBeatModel):
    """Adapter and pinned-model identity used for one beat analysis."""

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


class EffectiveBeatAnalyzerSettings(FrozenBeatModel):
    """Resolved runtime settings that a real analyzer used."""

    device: str = Field(min_length=1, max_length=128)
    precision: SeparatorPrecision
    use_dbn: StrictBool

    @field_validator("device")
    @classmethod
    def validate_device(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("device must not be blank")
        return value


class BeatAnalysisResult(FrozenBeatModel):
    """Portable, versioned description of one accepted beat analysis.

    ``beats`` must be non-empty and sorted strictly increasing by
    ``time_seconds``. ``downbeat_count`` is a redundant convenience derived
    from the flag on each beat; the model validator enforces the invariant.
    ``tempo_median_bpm`` is the median of 60/interbeat_seconds across all
    adjacent beat pairs; 0.0 when fewer than two beats are present.
    """

    schema_version: Literal["1.0.0"] = "1.0.0"
    source_sha256: Sha256
    provenance: BeatAnalyzerProvenance
    settings: EffectiveBeatAnalyzerSettings
    source: BeatSourceFacts
    beats: tuple[BeatEstimate, ...] = Field(min_length=1)
    downbeat_count: int = Field(ge=0)
    tempo_median_bpm: float = Field(ge=0)
    warnings: tuple[str, ...] = ()

    @field_validator("warnings")
    @classmethod
    def validate_warnings(cls, value: tuple[str, ...]) -> tuple[str, ...]:
        if any(not warning.strip() for warning in value):
            raise ValueError("warnings must not contain blank values")
        return value

    @model_validator(mode="after")
    def validate_result(self) -> Self:
        for i in range(1, len(self.beats)):
            if self.beats[i].time_seconds <= self.beats[i - 1].time_seconds:
                raise ValueError(
                    "beats must be strictly monotonically increasing in time"
                )
        actual_downbeats = sum(1 for beat in self.beats if beat.is_downbeat)
        if actual_downbeats != self.downbeat_count:
            raise ValueError(
                "downbeat_count must equal the number of beats flagged as downbeats"
            )
        if self.source.duration_seconds > 0:
            last_beat = self.beats[-1].time_seconds
            if last_beat > self.source.duration_seconds + 1e-3:
                raise ValueError("beats must fall within the source duration")
        return self
