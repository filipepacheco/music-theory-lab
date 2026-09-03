"""Versioned contracts for Phase 3 key-detection output.

One transparent HPCP/profile baseline per the Phase 3 plan. The
architecture doc specifies "retains scores for all 24 major/minor
candidates" — the result carries all 24 scores sorted best-first so
downstream consumers can compute top-k, calibrate confidence, or
inspect the second-best candidate directly.
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
    TonalMode,
    VersionString,
)


class FrozenKeyModel(ContractModel):
    """Immutable base for the committed key contracts."""

    model_config = ConfigDict(frozen=True, revalidate_instances="always")


class KeyEstimate(FrozenKeyModel):
    """One (tonic_pc, mode, score) candidate.

    ``score`` is the raw correlation score against the tonal profile — not
    a probability. Callers should treat top-k ordering as authoritative and
    only use score differences for a confidence heuristic (e.g., top-1
    minus top-2 as a "peak margin").
    """

    tonic_pc: int = Field(ge=0, le=11)
    mode: TonalMode
    score: float = Field(ge=-1.0, le=1.0)


class KeySourceFacts(FrozenKeyModel):
    """Facts about the source audio the analyzer read."""

    sample_rate: int = Field(gt=0)
    channels: int = Field(gt=0)
    frame_count: int = Field(ge=0)
    duration_seconds: float = Field(ge=0)
    peak_absolute_sample: float = Field(ge=0)


class KeyAnalyzerProvenance(FrozenKeyModel):
    """Adapter identity used for one key analysis. No pinned checkpoint —
    the HPCP baseline is a pure algorithm, so ``model_identifier`` and
    ``model_sha256`` are absent by design."""

    candidate: Identifier
    implementation_version: VersionString
    code_revision: CodeRevision


class EffectiveKeyAnalyzerSettings(FrozenKeyModel):
    """Resolved runtime settings the analyzer used."""

    sample_rate: int = Field(gt=0)
    hop_length: int = Field(gt=0)
    n_chroma: int = Field(gt=0)
    profile: Literal["krumhansl_kessler"]


class KeyAnalysisResult(FrozenKeyModel):
    """Portable, versioned description of one accepted key analysis.

    ``estimates`` carries all 24 candidates ordered best-first by ``score``.
    ``top_estimate`` is a convenience redundant with ``estimates[0]``;
    the validator enforces this equality so a corrupted result surfaces
    immediately.
    """

    schema_version: Literal["1.0.0"] = "1.0.0"
    source_sha256: Sha256
    provenance: KeyAnalyzerProvenance
    settings: EffectiveKeyAnalyzerSettings
    source: KeySourceFacts
    estimates: tuple[KeyEstimate, ...] = Field(min_length=24, max_length=24)
    top_estimate: KeyEstimate
    warnings: tuple[str, ...] = ()

    @field_validator("warnings")
    @classmethod
    def validate_warnings(cls, value: tuple[str, ...]) -> tuple[str, ...]:
        if any(not warning.strip() for warning in value):
            raise ValueError("warnings must not contain blank values")
        return value

    @model_validator(mode="after")
    def validate_result(self) -> Self:
        seen: set[tuple[int, TonalMode]] = set()
        for estimate in self.estimates:
            key = (estimate.tonic_pc, estimate.mode)
            if key in seen:
                raise ValueError(
                    "estimates must cover each (tonic_pc, mode) exactly once"
                )
            seen.add(key)
        if len(seen) != 24:
            raise ValueError("estimates must span all 24 (tonic_pc, mode) combinations")
        for index in range(1, len(self.estimates)):
            if self.estimates[index].score > self.estimates[index - 1].score:
                raise ValueError(
                    "estimates must be sorted by score descending (best first)"
                )
        if (
            self.top_estimate.tonic_pc != self.estimates[0].tonic_pc
            or self.top_estimate.mode != self.estimates[0].mode
            or self.top_estimate.score != self.estimates[0].score
        ):
            raise ValueError("top_estimate must equal estimates[0]")
        return self


def peak_margin(result: KeyAnalysisResult) -> float:
    """Convenience: top-1 score minus top-2 score. Larger = more confident."""

    return float(result.estimates[0].score - result.estimates[1].score)
