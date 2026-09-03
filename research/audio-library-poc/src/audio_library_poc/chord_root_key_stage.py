"""Chord-root-weighted key stage.

Motivation: HPCP + Krumhansl-Kessler on the raw CQT chromagram (see
``hpcp_key_stage.py``) reads Karma Police as D major because it just
weights pitch-class abundance, and Karma Police dwells much longer on
G / D chord tones than on A minor tones. A better prior for key is
"which chord ROOTS the song visits, weighted by chord duration". This
stage builds that profile from an existing ChordAnalysisResult on disk
and correlates it against the same 24 Krumhansl-Kessler templates
``key.hpcp`` uses — so the two stages share their result contract
(``KeyAnalysisResult``) and can be compared directly.

No new dep: numpy is already in the [inference] extras. No audio
loading — the input is a JSON file, not a WAV.

Cache identity note: ``input_sha256`` is the audio's SHA-256 (same as
every other key stage). The chord analysis path lives in config, so
``config_sha256`` invalidates the cache when the caller points at a
different chord run. The bridge verifies that
``ChordAnalysisResult.source_sha256 == input_sha256`` so a
cross-wired pipeline (chord for one track + key stage claiming
another) fails immediately.
"""

from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any

import numpy as np
from pydantic import Field, ValidationError, field_validator

from audio_library_poc.chord_analysis import (
    ChordAnalysisResult,
    ChordLabel,
    ChordSegment,
)
from audio_library_poc.execution import (
    ExpectedStageFailure,
    StagedArtifact,
    StageOutput,
)
from audio_library_poc.io import atomic_write_json
from audio_library_poc.key_analysis import (
    EffectiveKeyAnalyzerSettings,
    KeyAnalysisResult,
    KeyAnalyzerProvenance,
    KeyEstimate,
    KeySourceFacts,
)
from audio_library_poc.metadata import hash_file
from audio_library_poc.models import (
    ContractModel,
    Metrics,
    StageIdentity,
    StageSpecification,
    TypedError,
)
from audio_library_poc.paths import validate_workspace_relative_path

CHORD_ROOT_KEY_STAGE_KIND = "key.chord_root_profile"
CHORD_ROOT_KEY_CANDIDATE_ID = "chord_root_profile"
CHORD_ROOT_KEY_IMPLEMENTATION_VERSION = "1.0.0"
_RESULT_ARTIFACT_FILENAME = "key-analysis-result.json"

# Reuse Krumhansl-Kessler profiles — same reference values ``key.hpcp``
# uses, kept local so this module has no dep on librosa.
_KRUMHANSL_KESSLER_MAJOR = np.array(
    [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88],
    dtype=np.float64,
)
_KRUMHANSL_KESSLER_MINOR = np.array(
    [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17],
    dtype=np.float64,
)


class ChordRootKeyStageConfig(ContractModel):
    """Config surface for the key.chord_root_profile stage.

    ``chord_analysis_relative_path`` points at a chord-analysis-result.json
    the caller has already produced. The stage does no audio decoding —
    it only reads that JSON and derives a pitch-class profile from its
    segments. Every workspace-relative path is validated.

    ``third_weight`` / ``fifth_weight`` control whether the chord's
    other diatonic tones contribute to the profile too. Root-only
    weighting (both zero) mirrors the pure "chord root evidence" idea;
    adding a small third/fifth weight makes the profile closer to how
    ears infer key from chord voicings. Both default to 0.0 so the
    first-pass behavior is fully explainable by chord-root evidence
    alone.
    """

    chord_analysis_relative_path: str = Field(min_length=1)
    third_weight: float = Field(default=0.0, ge=0, le=3.0)
    fifth_weight: float = Field(default=0.0, ge=0, le=3.0)

    @field_validator("chord_analysis_relative_path")
    @classmethod
    def validate_chord_path(cls, value: str) -> str:
        return validate_workspace_relative_path(value)


class ChordRootKeyStageExecutor:
    """StageExecutor for the key.chord_root_profile stage kind."""

    def __init__(self, workspace: Path) -> None:
        self.workspace = Path(workspace).resolve()

    def execute(
        self,
        *,
        specification: StageSpecification,
        identity: StageIdentity,
        cache_key: str,
        attempt: int,
        staging_directory: Path,
    ) -> StageOutput:
        if attempt < 1:
            raise ValueError("attempt must be positive")

        config = _validate_config(specification)
        chord_result = _load_chord_analysis(
            self.workspace, config.chord_analysis_relative_path
        )
        _verify_chord_source_matches_input(chord_result, identity.input_sha256)

        started = time.time()
        profile = build_pitch_class_profile(
            chord_result.segments,
            third_weight=config.third_weight,
            fifth_weight=config.fifth_weight,
        )
        estimates = score_all_keys_from_profile(profile)
        wall_seconds = time.time() - started

        top_estimate = estimates[0]
        settings = EffectiveKeyAnalyzerSettings(
            sample_rate=chord_result.settings.sample_rate,
            hop_length=chord_result.settings.hop_length,
            n_chroma=12,
            profile="krumhansl_kessler",
        )
        result = KeyAnalysisResult(
            source_sha256=identity.input_sha256,
            provenance=KeyAnalyzerProvenance(
                candidate=CHORD_ROOT_KEY_CANDIDATE_ID,
                implementation_version=CHORD_ROOT_KEY_IMPLEMENTATION_VERSION,
                code_revision=identity.code_revision,
            ),
            settings=settings,
            source=KeySourceFacts(
                sample_rate=chord_result.source.sample_rate,
                channels=chord_result.source.channels,
                frame_count=chord_result.source.frame_count,
                duration_seconds=chord_result.source.duration_seconds,
                peak_absolute_sample=chord_result.source.peak_absolute_sample,
            ),
            estimates=tuple(estimates),
            top_estimate=top_estimate,
        )
        _validate_result(result, identity=identity)
        atomic_write_json(staging_directory / _RESULT_ARTIFACT_FILENAME, result)

        metrics = Metrics(
            duration_seconds=wall_seconds,
            counters={
                "chord_segments_read": len(chord_result.segments),
            },
            measurements={
                "top_score": top_estimate.score,
                "peak_margin": max(0.0, top_estimate.score - estimates[1].score),
                "profile_mass": float(profile.sum()),
            },
        )
        return StageOutput(
            artifacts=(
                StagedArtifact(
                    artifact_name=_RESULT_ARTIFACT_FILENAME,
                    artifact_kind="key.analysis_result",
                    media_type="application/json",
                    durable=True,
                ),
            ),
            metrics=metrics,
        )


def build_pitch_class_profile(
    segments: tuple[ChordSegment, ...] | list[ChordSegment],
    *,
    third_weight: float = 0.0,
    fifth_weight: float = 0.0,
) -> np.ndarray:
    """Sum each major/minor chord's duration into a 12-bin pitch-class profile.

    Root gets full weight (1.0 × duration). Third and fifth (relative to
    chord quality) get their configured weights × duration. Non-pitched
    labels (``unknown``, ``no_chord``) contribute nothing.
    """

    profile = np.zeros(12, dtype=np.float64)
    for segment in segments:
        if segment.label not in (ChordLabel.MAJOR, ChordLabel.MINOR):
            continue
        assert segment.root_pc is not None
        duration = max(0.0, segment.end_seconds - segment.start_seconds)
        if duration == 0:
            continue
        profile[segment.root_pc] += duration
        if third_weight > 0:
            third_offset = 4 if segment.label is ChordLabel.MAJOR else 3
            profile[(segment.root_pc + third_offset) % 12] += third_weight * duration
        if fifth_weight > 0:
            profile[(segment.root_pc + 7) % 12] += fifth_weight * duration
    return profile


def score_all_keys_from_profile(profile: np.ndarray) -> list[KeyEstimate]:
    """Correlate a 12-bin profile with all 24 Krumhansl-Kessler templates."""

    from audio_library_poc.models import TonalMode  # local to keep top scope small

    scores: list[KeyEstimate] = []
    for tonic_pc in range(12):
        major_template = np.roll(_KRUMHANSL_KESSLER_MAJOR, tonic_pc)
        minor_template = np.roll(_KRUMHANSL_KESSLER_MINOR, tonic_pc)
        scores.append(
            KeyEstimate(
                tonic_pc=tonic_pc,
                mode=TonalMode.MAJOR,
                score=_pearson_correlation(profile, major_template),
            )
        )
        scores.append(
            KeyEstimate(
                tonic_pc=tonic_pc,
                mode=TonalMode.MINOR,
                score=_pearson_correlation(profile, minor_template),
            )
        )
    scores.sort(key=lambda estimate: estimate.score, reverse=True)
    return scores


def _pearson_correlation(a: np.ndarray, b: np.ndarray) -> float:
    a = np.asarray(a, dtype=np.float64)
    b = np.asarray(b, dtype=np.float64)
    if a.std() == 0 or b.std() == 0:
        return 0.0
    correlation = float(np.corrcoef(a, b)[0, 1])
    return max(-1.0, min(1.0, correlation))


def _validate_config(specification: StageSpecification) -> ChordRootKeyStageConfig:
    try:
        return ChordRootKeyStageConfig.model_validate(specification.config)
    except ValidationError as exc:
        raise ExpectedStageFailure(
            TypedError(
                code="key.invalid_config",
                message="key.chord_root_profile stage configuration is invalid",
                retryable=False,
                details={
                    "candidate_id": CHORD_ROOT_KEY_CANDIDATE_ID,
                    "exception_type": type(exc).__name__,
                    "error_count": exc.error_count(),
                },
            )
        ) from exc


def _load_chord_analysis(
    workspace: Path, chord_analysis_relative_path: str
) -> ChordAnalysisResult:
    candidate = (workspace / Path(chord_analysis_relative_path)).resolve()
    if not candidate.is_relative_to(workspace):
        raise ExpectedStageFailure(
            TypedError(
                code="key.chord_analysis_outside_workspace",
                message="chord analysis path must resolve inside the workspace",
                retryable=False,
                details={"relative_path": chord_analysis_relative_path},
            )
        )
    if not candidate.is_file():
        raise ExpectedStageFailure(
            TypedError(
                code="key.chord_analysis_missing",
                message="chord analysis JSON is missing",
                retryable=False,
                details={"relative_path": chord_analysis_relative_path},
            )
        )
    try:
        raw = json.loads(candidate.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ExpectedStageFailure(
            TypedError(
                code="key.chord_analysis_unreadable",
                message="chord analysis JSON could not be parsed",
                retryable=False,
                details={"relative_path": chord_analysis_relative_path},
            )
        ) from exc
    try:
        return ChordAnalysisResult.model_validate(raw)
    except ValidationError as exc:
        raise ExpectedStageFailure(
            TypedError(
                code="key.chord_analysis_invalid",
                message="chord analysis JSON failed contract validation",
                retryable=False,
                details={
                    "relative_path": chord_analysis_relative_path,
                    "error_count": exc.error_count(),
                },
            )
        ) from exc


def _verify_chord_source_matches_input(
    chord_result: ChordAnalysisResult,
    declared_sha256: str,
) -> None:
    if chord_result.source_sha256 != declared_sha256:
        raise ExpectedStageFailure(
            TypedError(
                code="key.chord_analysis_source_mismatch",
                message=(
                    "ChordAnalysisResult.source_sha256 must equal the stage "
                    "input_sha256; you probably pointed at a chord result for a "
                    "different track"
                ),
                retryable=False,
                details={
                    "declared": declared_sha256,
                    "chord_source_sha256": chord_result.source_sha256,
                },
            )
        )


def _validate_result(result: KeyAnalysisResult, *, identity: StageIdentity) -> None:
    if result.source_sha256 != identity.input_sha256:
        raise ExpectedStageFailure(
            TypedError(
                code="key.result_source_mismatch",
                message="KeyAnalysisResult.source_sha256 must match input_sha256",
                retryable=False,
            )
        )
    provenance = result.provenance
    if (
        provenance.implementation_version != identity.implementation_version
        or provenance.code_revision != identity.code_revision
    ):
        raise ExpectedStageFailure(
            TypedError(
                code="key.provenance_mismatch",
                message=(
                    "KeyAnalysisResult.provenance must match the committed "
                    "stage identity"
                ),
                retryable=False,
            )
        )


# Silence unused-import lint noise: hash_file is re-exported for tests.
_ = hash_file
_ = Any


__all__ = (
    "CHORD_ROOT_KEY_CANDIDATE_ID",
    "CHORD_ROOT_KEY_IMPLEMENTATION_VERSION",
    "CHORD_ROOT_KEY_STAGE_KIND",
    "ChordRootKeyStageConfig",
    "ChordRootKeyStageExecutor",
    "build_pitch_class_profile",
    "score_all_keys_from_profile",
)
