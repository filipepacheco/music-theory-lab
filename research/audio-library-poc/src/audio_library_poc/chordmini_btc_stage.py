"""Bridge that runs the vendored ChordMini BTC chord recognizer.

Mirrors ``BeatThisStageExecutor`` and ``SeparatorStageExecutor``: validate
config, require model identity, resolve the source audio inside the
workspace, hash-verify it against ``input_sha256``, then call the runtime.
The runtime returns a strict ``ChordAnalysisResult`` and matching metrics.

The ChordMini BTC model is vendored under
``audio_library_poc.vendor.chordmini.model``; see that package's README for
provenance and license.
"""

from __future__ import annotations

from pathlib import Path

from pydantic import Field, ValidationError, field_validator

from audio_library_poc.chord_analysis import (
    ChordAnalysisResult,
    ChordLabel,
    ChordSegment,
    summarize_coverage,
)
from audio_library_poc.execution import (
    ExpectedStageFailure,
    StagedArtifact,
    StageOutput,
)
from audio_library_poc.io import atomic_write_json
from audio_library_poc.metadata import hash_file
from audio_library_poc.models import (
    ContractModel,
    Metrics,
    StageIdentity,
    StageSpecification,
    TypedError,
)
from audio_library_poc.paths import validate_workspace_relative_path
from audio_library_poc.separation import SeparatorPrecision

CHORDMINI_BTC_STAGE_KIND = "chord.chordmini_btc"
CHORDMINI_BTC_CANDIDATE_ID = "chordmini_btc"
CHORDMINI_BTC_IMPLEMENTATION_VERSION = "1.0.0"
_RESULT_ARTIFACT_FILENAME = "chord-analysis-result.json"

_ROOT_TO_PITCH_CLASS: dict[str, int] = {
    "C": 0,
    "C#": 1,
    "Db": 1,
    "D": 2,
    "D#": 3,
    "Eb": 3,
    "E": 4,
    "F": 5,
    "F#": 6,
    "Gb": 6,
    "G": 7,
    "G#": 8,
    "Ab": 8,
    "A": 9,
    "A#": 10,
    "Bb": 10,
    "B": 11,
    "Cb": 11,
}


class ChordMiniBtcStageConfig(ContractModel):
    """Config surface for the chord.chordmini_btc stage.

    Only two required paths — the vendored model class is imported directly
    from ``audio_library_poc.vendor.chordmini.model``, no config yaml needs
    to be resolved from the workspace.

    ``sliding_window_overlap`` in [0, 0.95) enables overlap-averaging of
    consecutive seq_len windows. 0 means non-overlapping (fastest). 0.5 is a
    reasonable default; ChordMini's own CLI defaults to 0.5 as well.
    """

    source_relative_path: str = Field(min_length=1)
    checkpoint_relative_path: str = Field(min_length=1)
    device: str = Field(default="cuda", min_length=1, max_length=128)
    precision: SeparatorPrecision = SeparatorPrecision.FLOAT16
    sliding_window_overlap: float = Field(default=0.5, ge=0, lt=0.95)
    min_segment_seconds: float = Field(default=0.0, ge=0)

    @field_validator("source_relative_path", "checkpoint_relative_path")
    @classmethod
    def validate_workspace_path(cls, value: str) -> str:
        return validate_workspace_relative_path(value)

    @field_validator("device")
    @classmethod
    def validate_device(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("device must not be blank")
        return value


class ChordMiniBtcStageExecutor:
    """StageExecutor for the chord.chordmini_btc stage kind."""

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
        _require_model_identity(specification)
        source_path = _resolve_source(self.workspace, config.source_relative_path)
        _verify_source_hash(source_path, identity.input_sha256)

        staging = Path(staging_directory)
        staging.mkdir(parents=True, exist_ok=True)

        from audio_library_poc._chordmini_btc_runtime import run_chordmini_btc_inference

        result, metrics = run_chordmini_btc_inference(
            workspace=self.workspace,
            source_path=source_path,
            config=config,
            identity=identity,
        )
        _validate_result(result, identity=identity)
        atomic_write_json(staging / _RESULT_ARTIFACT_FILENAME, result)

        return StageOutput(
            artifacts=(
                StagedArtifact(
                    artifact_name=_RESULT_ARTIFACT_FILENAME,
                    artifact_kind="chord.analysis_result",
                    media_type="application/json",
                    durable=True,
                ),
            ),
            metrics=metrics,
        )


def normalize_chordmini_label(raw_label: str) -> tuple[ChordLabel, int | None]:
    """Fold ChordMini's 170-token vocabulary into (major, minor, unknown, no_chord).

    - Root-only labels ("C", "D", "F#") map to (MAJOR, pitch_class).
    - "<root>:min" maps to (MINOR, pitch_class).
    - "N" and "X" map to (NO_CHORD, None) — ChordMini emits both as its
      explicit no-chord tokens.
    - Everything else (7ths, sus, aug, dim, hdim, min6, maj6, min7, maj7,
      minmaj7, dim7, sus2, sus4) maps to (UNKNOWN, None) — the caller can
      choose whether to promote or drop these later.
    """

    label = raw_label.strip()
    if label in {"N", "X"}:
        return ChordLabel.NO_CHORD, None
    if ":" not in label:
        pitch_class = _ROOT_TO_PITCH_CLASS.get(label)
        if pitch_class is None:
            return ChordLabel.UNKNOWN, None
        return ChordLabel.MAJOR, pitch_class
    root, quality = label.split(":", 1)
    pitch_class = _ROOT_TO_PITCH_CLASS.get(root)
    if pitch_class is None:
        return ChordLabel.UNKNOWN, None
    if quality == "min":
        return ChordLabel.MINOR, pitch_class
    return ChordLabel.UNKNOWN, None


def build_segments(
    predictions: list[int],
    idx_to_chord: dict[int, str],
    frame_duration: float,
    duration_seconds: float,
    *,
    min_segment_seconds: float = 0.0,
) -> list[ChordSegment]:
    """Turn a per-frame prediction stream into merged, gap-free ChordSegments.

    Consecutive frames with the same predicted index are merged. Segments
    shorter than ``min_segment_seconds`` are absorbed into the previous
    segment. The last segment is stretched to cover through
    ``duration_seconds`` exactly so downstream consumers do not have to
    handle sub-frame gaps.
    """

    if not predictions:
        return [
            ChordSegment(
                start_seconds=0.0,
                end_seconds=max(duration_seconds, frame_duration),
                label=ChordLabel.UNKNOWN,
                root_pc=None,
                candidate_label="X",
            )
        ]

    raw: list[tuple[float, float, str]] = []
    start_frame = 0
    for i in range(1, len(predictions)):
        if predictions[i] != predictions[i - 1]:
            raw.append(
                (
                    start_frame * frame_duration,
                    i * frame_duration,
                    idx_to_chord[int(predictions[i - 1])],
                )
            )
            start_frame = i
    raw.append(
        (
            start_frame * frame_duration,
            len(predictions) * frame_duration,
            idx_to_chord[int(predictions[-1])],
        )
    )

    merged: list[tuple[float, float, str]] = []
    for start, end, raw_label in raw:
        if merged and (end - start) < min_segment_seconds:
            prev_start, _prev_end, prev_label = merged[-1]
            merged[-1] = (prev_start, end, prev_label)
        else:
            merged.append((start, end, raw_label))

    # Stretch last segment to exactly source duration so downstream contracts
    # never see a sub-frame gap at the tail.
    if merged and duration_seconds > merged[-1][1]:
        s, _, lbl = merged[-1]
        merged[-1] = (s, duration_seconds, lbl)

    segments: list[ChordSegment] = []
    for start, end, raw_label in merged:
        label, root_pc = normalize_chordmini_label(raw_label)
        segments.append(
            ChordSegment(
                start_seconds=start,
                end_seconds=end,
                label=label,
                root_pc=root_pc,
                candidate_label=raw_label,
            )
        )
    return segments


def build_chordmini_metrics(
    *,
    wall_seconds: float,
    frame_count: int,
    segment_count: int,
    coverage,
) -> Metrics:
    """Shared metrics shape the runtime returns and tests assert against."""

    return Metrics(
        duration_seconds=wall_seconds,
        counters={
            "frames_processed": frame_count,
            "segments_emitted": segment_count,
        },
        measurements={
            "coverage_major_seconds": coverage.major_seconds,
            "coverage_minor_seconds": coverage.minor_seconds,
            "coverage_unknown_seconds": coverage.unknown_seconds,
            "coverage_no_chord_seconds": coverage.no_chord_seconds,
        },
    )


def _validate_config(specification: StageSpecification) -> ChordMiniBtcStageConfig:
    try:
        return ChordMiniBtcStageConfig.model_validate(specification.config)
    except ValidationError as exc:
        raise ExpectedStageFailure(
            TypedError(
                code="chord.invalid_config",
                message="chord.chordmini_btc stage configuration is invalid",
                retryable=False,
                details={
                    "candidate_id": CHORDMINI_BTC_CANDIDATE_ID,
                    "exception_type": type(exc).__name__,
                    "error_count": exc.error_count(),
                },
            )
        ) from exc


def _require_model_identity(specification: StageSpecification) -> None:
    if not specification.model_identifier or not specification.model_sha256:
        raise ExpectedStageFailure(
            TypedError(
                code="chord.missing_model_identity",
                message=(
                    "chord.chordmini_btc stages require model_identifier and "
                    "model_sha256 so cache identity captures the pinned checkpoint"
                ),
                retryable=False,
            )
        )


def _resolve_source(workspace: Path, source_relative_path: str) -> Path:
    candidate = (workspace / Path(source_relative_path)).resolve()
    if not candidate.is_relative_to(workspace):
        raise ExpectedStageFailure(
            TypedError(
                code="chord.source_outside_workspace",
                message="chord source audio must be inside the workspace",
                retryable=False,
                details={"source_relative_path": source_relative_path},
            )
        )
    if not candidate.is_file():
        raise ExpectedStageFailure(
            TypedError(
                code="chord.source_missing",
                message="chord source audio file is missing",
                retryable=False,
                details={"source_relative_path": source_relative_path},
            )
        )
    return candidate


def _verify_source_hash(source_path: Path, declared_sha256: str) -> None:
    actual = hash_file(source_path)
    if actual != declared_sha256:
        raise ExpectedStageFailure(
            TypedError(
                code="chord.source_hash_mismatch",
                message="chord source audio hash does not match input_sha256",
                retryable=False,
                details={"declared": declared_sha256, "actual": actual},
            )
        )


def _validate_result(result: ChordAnalysisResult, *, identity: StageIdentity) -> None:
    if result.source_sha256 != identity.input_sha256:
        raise ExpectedStageFailure(
            TypedError(
                code="chord.result_source_mismatch",
                message="ChordAnalysisResult.source_sha256 must match input_sha256",
                retryable=False,
            )
        )
    provenance = result.provenance
    if (
        provenance.model_identifier != identity.model_identifier
        or provenance.model_sha256 != identity.model_sha256
        or provenance.implementation_version != identity.implementation_version
        or provenance.code_revision != identity.code_revision
    ):
        raise ExpectedStageFailure(
            TypedError(
                code="chord.provenance_mismatch",
                message=(
                    "ChordAnalysisResult.provenance must match the committed "
                    "stage identity"
                ),
                retryable=False,
            )
        )


# Re-export a couple of pure helpers so tests can exercise them directly.
__all__ = (
    "CHORDMINI_BTC_STAGE_KIND",
    "CHORDMINI_BTC_CANDIDATE_ID",
    "CHORDMINI_BTC_IMPLEMENTATION_VERSION",
    "ChordMiniBtcStageConfig",
    "ChordMiniBtcStageExecutor",
    "build_chordmini_metrics",
    "build_segments",
    "normalize_chordmini_label",
    "summarize_coverage",
)
