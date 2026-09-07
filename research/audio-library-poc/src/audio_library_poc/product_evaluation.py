"""Metrics for the normalized chord labels consumed by Biblioteca.

This module deliberately does not replace :mod:`chord_evaluation`.  The
existing mir_eval figures score raw, post-smoothing ``candidate_label`` values
and remain useful historical diagnostics.  These functions score the separate
four-label product contract (major, minor, unknown, no_chord) and make every
duration denominator explicit.
"""

from __future__ import annotations

from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from math import ceil, floor, isfinite
from random import Random

from audio_library_poc.chord_analysis import ChordLabel, ChordSegment
from audio_library_poc.key_analysis import KeyAnalysisResult, peak_margin
from audio_library_poc.models import TonalMode

_ROOTS = {
    "C": 0,
    "B#": 0,
    "C#": 1,
    "DB": 1,
    "D": 2,
    "D#": 3,
    "EB": 3,
    "E": 4,
    "FB": 4,
    "F": 5,
    "E#": 5,
    "F#": 6,
    "GB": 6,
    "G": 7,
    "G#": 8,
    "AB": 8,
    "A": 9,
    "A#": 10,
    "BB": 10,
    "B": 11,
    "CB": 11,
}


@dataclass(frozen=True)
class ReferenceChord:
    """One reference label after the documented product reduction."""

    kind: str  # harmonic, no_chord, unsupported
    root_pc: int | None = None
    label: ChordLabel | None = None
    reduced_richer: bool = False


@dataclass(frozen=True)
class AcceptedChordScore:
    """Duration counts and ratios for one excerpt or an aggregate.

    ``accepted_label_precision`` has accepted harmonic duration as its
    denominator; coverage and overall agreement have valid harmonic reference
    duration as their denominator.  A ``None`` ratio means its denominator is
    zero, never a hidden zero score.
    """

    reference_harmonic_seconds: float
    reference_no_chord_seconds: float
    excluded_reference_seconds: float
    richer_reference_reduced_seconds: float
    correct_accepted_harmonic_seconds: float
    accepted_harmonic_seconds: float
    unknown_on_harmonic_seconds: float
    no_chord_on_harmonic_seconds: float
    correct_no_chord_seconds: float
    unknown_on_no_chord_seconds: float
    harmonic_prediction_on_no_chord_seconds: float

    def __post_init__(self) -> None:
        values = [getattr(self, field) for field in _COUNT_FIELDS]
        if any(not isfinite(value) or value < 0 for value in values):
            raise ValueError("chord duration counts must be finite and non-negative")
        if self.correct_accepted_harmonic_seconds > self.accepted_harmonic_seconds:
            raise ValueError(
                "correct accepted duration cannot exceed accepted duration"
            )
        harmonic_parts = (
            self.accepted_harmonic_seconds
            + self.unknown_on_harmonic_seconds
            + self.no_chord_on_harmonic_seconds
        )
        no_chord_parts = (
            self.correct_no_chord_seconds
            + self.unknown_on_no_chord_seconds
            + self.harmonic_prediction_on_no_chord_seconds
        )
        if not _same_duration(harmonic_parts, self.reference_harmonic_seconds):
            raise ValueError(
                "harmonic duration counts must conserve reference duration"
            )
        if not _same_duration(no_chord_parts, self.reference_no_chord_seconds):
            raise ValueError(
                "no-chord duration counts must conserve reference duration"
            )

    @property
    def accepted_label_precision(self) -> float | None:
        return _ratio(
            self.correct_accepted_harmonic_seconds, self.accepted_harmonic_seconds
        )

    @property
    def harmonic_coverage(self) -> float | None:
        return _ratio(self.accepted_harmonic_seconds, self.reference_harmonic_seconds)

    @property
    def overall_harmonic_agreement(self) -> float | None:
        return _ratio(
            self.correct_accepted_harmonic_seconds, self.reference_harmonic_seconds
        )

    @property
    def no_chord_recall(self) -> float | None:
        return _ratio(self.correct_no_chord_seconds, self.reference_no_chord_seconds)

    def as_dict(self) -> dict[str, float | None]:
        """JSON-safe counts, ratios, and their named denominators."""

        accepted_duration = self.accepted_harmonic_seconds
        harmonic_duration = self.reference_harmonic_seconds
        return {
            "reference_harmonic_seconds": self.reference_harmonic_seconds,
            "reference_no_chord_seconds": self.reference_no_chord_seconds,
            "excluded_reference_seconds": self.excluded_reference_seconds,
            "richer_reference_reduced_seconds": self.richer_reference_reduced_seconds,
            "correct_accepted_harmonic_seconds": self.correct_accepted_harmonic_seconds,
            "accepted_harmonic_seconds": self.accepted_harmonic_seconds,
            "unknown_on_harmonic_seconds": self.unknown_on_harmonic_seconds,
            "no_chord_on_harmonic_seconds": self.no_chord_on_harmonic_seconds,
            "correct_no_chord_seconds": self.correct_no_chord_seconds,
            "unknown_on_no_chord_seconds": self.unknown_on_no_chord_seconds,
            "harmonic_prediction_on_no_chord_seconds": (
                self.harmonic_prediction_on_no_chord_seconds
            ),
            "accepted_label_precision": self.accepted_label_precision,
            "accepted_label_precision_denominator_seconds": accepted_duration,
            "harmonic_coverage": self.harmonic_coverage,
            "harmonic_coverage_denominator_seconds": harmonic_duration,
            "overall_harmonic_agreement": self.overall_harmonic_agreement,
            "overall_harmonic_agreement_denominator_seconds": harmonic_duration,
            "no_chord_recall": self.no_chord_recall,
            "no_chord_recall_denominator_seconds": self.reference_no_chord_seconds,
        }


@dataclass(frozen=True)
class KeyRankingScore:
    """Rank-based key evidence; analyzer scores are not probabilities."""

    reference_label: str
    top_label: str
    reference_rank: int | None
    top1_correct: bool
    top3_correct: bool
    top1_score: float
    top2_score: float
    top1_margin: float


def normalize_reference_chord(label: str) -> ReferenceChord:
    """Reduce a MIREX-style reference label to the product vocabulary.

    Rooted major/minor extensions are intentionally reduced because Biblioteca
    can only display a triad.  Suspended, diminished, augmented and malformed
    labels remain unsupported exclusions.  ``X`` is *not* treated as silence:
    only the MIREX ``N`` token means no chord.
    """

    raw = label.strip()
    if raw == "N":
        return ReferenceChord("no_chord")
    if not raw or raw == "X":
        return ReferenceChord("unsupported")
    root_name, separator, quality = raw.partition(":")
    root = _ROOTS.get(root_name.strip().upper())
    if root is None:
        return ReferenceChord("unsupported")
    if not separator:
        return ReferenceChord("harmonic", root, ChordLabel.MAJOR)
    quality = quality.strip().lower().replace(" ", "")
    if quality in {"maj", "major"}:
        return ReferenceChord("harmonic", root, ChordLabel.MAJOR)
    if quality in {"min", "minor"}:
        return ReferenceChord("harmonic", root, ChordLabel.MINOR)
    if quality.startswith("min") and not quality.startswith(("minmaj", "min/")):
        return ReferenceChord("harmonic", root, ChordLabel.MINOR, True)
    if quality.startswith(("maj", "major", "add", "7", "9", "11", "13")):
        return ReferenceChord("harmonic", root, ChordLabel.MAJOR, True)
    return ReferenceChord("unsupported")


def evaluate_accepted_chords(
    reference_intervals: Sequence[tuple[float, float]],
    reference_labels: Sequence[str],
    estimate_segments: Sequence[ChordSegment],
) -> AcceptedChordScore:
    """Score normalized product labels over explicit overlapping intervals."""

    if len(reference_intervals) != len(reference_labels):
        raise ValueError("reference intervals and labels must have equal length")
    references = [
        (float(start), float(end), raw_label)
        for (start, end), raw_label in zip(
            reference_intervals, reference_labels, strict=True
        )
    ]
    _validate_intervals([(start, end) for start, end, _ in references], "reference")
    _validate_intervals(
        [(segment.start_seconds, segment.end_seconds) for segment in estimate_segments],
        "estimate",
    )
    counts = dict.fromkeys(_COUNT_FIELDS, 0.0)
    for start, end, raw_label in references:
        reference = normalize_reference_chord(raw_label)
        cursor = start
        for segment in estimate_segments:
            if segment.end_seconds <= cursor:
                continue
            if segment.start_seconds >= end:
                break
            overlap_start = max(cursor, segment.start_seconds)
            overlap_end = min(end, segment.end_seconds)
            if overlap_start > cursor:
                _accumulate_prediction(
                    counts, overlap_start - cursor, reference, ChordLabel.UNKNOWN, None
                )
            if overlap_end > overlap_start:
                _accumulate_prediction(
                    counts,
                    overlap_end - overlap_start,
                    reference,
                    segment.label,
                    segment.root_pc,
                )
                cursor = overlap_end
            if cursor >= end:
                break
        if cursor < end:
            _accumulate_prediction(
                counts, end - cursor, reference, ChordLabel.UNKNOWN, None
            )
    return AcceptedChordScore(**counts)


def aggregate_accepted_chord_scores(
    scores: Iterable[AcceptedChordScore],
) -> AcceptedChordScore:
    """Sum durations first, then calculate corpus ratios from the full totals."""

    counts = dict.fromkeys(_COUNT_FIELDS, 0.0)
    for score in scores:
        for field in _COUNT_FIELDS:
            counts[field] += getattr(score, field)
    return AcceptedChordScore(**counts)


def macro_accepted_chord_metrics(
    scores: Iterable[AcceptedChordScore],
) -> dict[str, float | int | None]:
    """Equal-recording mean of ratios, omitting undefined denominators."""

    values = list(scores)
    output: dict[str, float | int | None] = {}
    for name in _RATIO_NAMES:
        observed = [getattr(score, name) for score in values]
        numeric = [value for value in observed if value is not None]
        output[name] = sum(numeric) / len(numeric) if numeric else None
        output[f"{name}_contributor_count"] = len(numeric)
        output[f"{name}_undefined_count"] = len(observed) - len(numeric)
    return output


def bootstrap_recording_intervals(
    recording_scores: Sequence[AcceptedChordScore],
    *,
    replicates: int = 2000,
    seed: int = 0,
) -> dict[str, dict[str, float | int | None]]:
    """Percentile intervals from recording-level resampling, never excerpts."""

    if replicates < 1:
        raise ValueError("replicates must be positive")
    sample_size = len(recording_scores)
    output: dict[str, dict[str, float | int | None]] = {}
    if not sample_size:
        return {
            name: {
                "lower": None,
                "upper": None,
                "replicates": replicates,
                "recordings": 0,
            }
            for name in _RATIO_NAMES
        }
    rng = Random(seed)
    samples = {name: [] for name in _RATIO_NAMES}
    for _ in range(replicates):
        draw = [
            recording_scores[rng.randrange(sample_size)] for _ in range(sample_size)
        ]
        aggregate = aggregate_accepted_chord_scores(draw)
        for name in _RATIO_NAMES:
            value = getattr(aggregate, name)
            if value is not None:
                samples[name].append(value)
    for name, values in samples.items():
        values.sort()
        output[name] = {
            "lower": _percentile(values, 0.025),
            "upper": _percentile(values, 0.975),
            "replicates": replicates,
            "recordings": sample_size,
        }
    return output


def evaluate_key_ranking(
    reference_label: str, result: KeyAnalysisResult
) -> KeyRankingScore:
    """Evaluate top-1/top-3 membership and expose the raw peak margin."""

    reference = _parse_key(reference_label)
    rank = next(
        (
            index + 1
            for index, estimate in enumerate(result.estimates)
            if (estimate.tonic_pc, estimate.mode) == reference
        ),
        None,
    )
    top = result.top_estimate
    return KeyRankingScore(
        reference_label=reference_label,
        top_label=_key_label(top.tonic_pc, top.mode),
        reference_rank=rank,
        top1_correct=rank == 1,
        top3_correct=rank is not None and rank <= 3,
        top1_score=float(top.score),
        top2_score=float(result.estimates[1].score),
        top1_margin=peak_margin(result),
    )


def _accumulate_prediction(
    counts: dict[str, float],
    overlap: float,
    reference: ReferenceChord,
    label: ChordLabel,
    root_pc: int | None,
) -> None:
    if reference.kind == "unsupported":
        counts["excluded_reference_seconds"] += overlap
        return
    if reference.kind == "no_chord":
        counts["reference_no_chord_seconds"] += overlap
        if label is ChordLabel.NO_CHORD:
            counts["correct_no_chord_seconds"] += overlap
        elif label is ChordLabel.UNKNOWN:
            counts["unknown_on_no_chord_seconds"] += overlap
        else:
            counts["harmonic_prediction_on_no_chord_seconds"] += overlap
        return
    counts["reference_harmonic_seconds"] += overlap
    if reference.reduced_richer:
        counts["richer_reference_reduced_seconds"] += overlap
    if label in {ChordLabel.MAJOR, ChordLabel.MINOR}:
        counts["accepted_harmonic_seconds"] += overlap
        if label is reference.label and root_pc == reference.root_pc:
            counts["correct_accepted_harmonic_seconds"] += overlap
    elif label is ChordLabel.UNKNOWN:
        counts["unknown_on_harmonic_seconds"] += overlap
    else:
        counts["no_chord_on_harmonic_seconds"] += overlap


def _parse_key(label: str) -> tuple[int, TonalMode]:
    normalized = label.strip().replace(":", " ")
    parts = normalized.split()
    if len(parts) != 2:
        raise ValueError(f"unsupported key reference: {label!r}")
    root = _ROOTS.get(parts[0].upper())
    mode = {
        "major": TonalMode.MAJOR,
        "maj": TonalMode.MAJOR,
        "minor": TonalMode.MINOR,
        "min": TonalMode.MINOR,
    }.get(parts[1].lower())
    if root is None or mode is None:
        raise ValueError(f"unsupported key reference: {label!r}")
    return root, mode


def _key_label(tonic_pc: int, mode: TonalMode) -> str:
    names = ("C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B")
    return f"{names[tonic_pc]} {mode.value}"


def _ratio(numerator: float, denominator: float) -> float | None:
    return numerator / denominator if denominator else None


def _same_duration(left: float, right: float) -> bool:
    return abs(left - right) <= 1e-6 * max(1.0, left, right)


def _validate_intervals(intervals: Sequence[tuple[float, float]], label: str) -> None:
    """Reject invalid/meaningfully overlapping spans before duration scoring."""

    previous_end: float | None = None
    tolerance = 1e-6
    for start, end in intervals:
        if not isfinite(start) or not isfinite(end) or end <= start:
            raise ValueError(f"{label} intervals must be finite and increasing")
        if previous_end is not None and start < previous_end - tolerance:
            raise ValueError(f"{label} intervals overlap")
        previous_end = max(previous_end or start, end)


def _percentile(values: list[float], fraction: float) -> float | None:
    if not values:
        return None
    index = (len(values) - 1) * fraction
    low, high = floor(index), ceil(index)
    if low == high:
        return values[low]
    return values[low] + (values[high] - values[low]) * (index - low)


_COUNT_FIELDS = (
    "reference_harmonic_seconds",
    "reference_no_chord_seconds",
    "excluded_reference_seconds",
    "richer_reference_reduced_seconds",
    "correct_accepted_harmonic_seconds",
    "accepted_harmonic_seconds",
    "unknown_on_harmonic_seconds",
    "no_chord_on_harmonic_seconds",
    "correct_no_chord_seconds",
    "unknown_on_no_chord_seconds",
    "harmonic_prediction_on_no_chord_seconds",
)
_RATIO_NAMES = (
    "accepted_label_precision",
    "harmonic_coverage",
    "overall_harmonic_agreement",
    "no_chord_recall",
)

__all__ = (
    "AcceptedChordScore",
    "KeyRankingScore",
    "aggregate_accepted_chord_scores",
    "bootstrap_recording_intervals",
    "evaluate_accepted_chords",
    "evaluate_key_ranking",
    "macro_accepted_chord_metrics",
    "normalize_reference_chord",
)
