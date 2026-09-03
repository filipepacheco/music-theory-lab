"""Score a ChordAnalysisResult against a reference chord annotation (.lab).

Uses mir_eval.chord.evaluate for standard MIREX-style scores (root,
majmin, thirds, mirex). Reference files are the Isophonics / MIREX-style
``start end label`` whitespace-delimited three-column format that
mir_eval.io.load_labeled_intervals understands directly.

Both sides of the comparison need labels in mir_eval's chord grammar
(``C``, ``C:min``, ``D:7``, ``N`` for no chord). ChordMini BTC's
``candidate_label`` field already uses this grammar, so we feed those
strings straight through — no intermediate normalization to
major/minor/unknown/no_chord, which would lose the useful signal
mir_eval's ``mirex`` metric needs to score sevenths correctly.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import mir_eval
import numpy as np

from audio_library_poc.chord_analysis import ChordAnalysisResult

_METRICS_TO_KEEP: tuple[str, ...] = (
    "root",
    "majmin",
    "majmin_inv",
    "thirds",
    "triads",
    "sevenths",
    "mirex",
)


@dataclass(frozen=True)
class ChordEvaluationScores:
    """One track × one candidate scoring against one reference."""

    reference_label: str
    candidate_id: str
    scores: dict[str, float]
    total_seconds: float
    reference_segment_count: int
    estimate_segment_count: int


def load_reference_lab(path: Path) -> tuple[np.ndarray, list[str]]:
    """Read an Isophonics-style .lab file into mir_eval-shaped intervals + labels.

    Returns ``(intervals, labels)`` where ``intervals`` is a numpy array of
    shape ``(N, 2)`` and ``labels`` is a list of chord label strings.
    """

    intervals, labels = mir_eval.io.load_labeled_intervals(str(path))
    return intervals, list(labels)


def chord_result_to_estimate(
    result: ChordAnalysisResult,
) -> tuple[np.ndarray, list[str]]:
    """Turn a ChordAnalysisResult into the (intervals, labels) shape mir_eval wants.

    Uses each segment's ``candidate_label`` (the raw string the model
    emitted) so mir_eval's fine-grained comparators (``sevenths``, etc.)
    can score full-vocabulary predictions instead of our normalized
    major/minor/unknown/no_chord folding.
    """

    intervals = np.array(
        [(segment.start_seconds, segment.end_seconds) for segment in result.segments],
        dtype=np.float64,
    )
    labels = [segment.candidate_label for segment in result.segments]
    return intervals, labels


def evaluate(
    reference_intervals: np.ndarray,
    reference_labels: list[str],
    estimate_intervals: np.ndarray,
    estimate_labels: list[str],
    *,
    reference_label: str = "reference",
    candidate_id: str = "candidate",
) -> ChordEvaluationScores:
    """Run mir_eval.chord.evaluate and keep the metrics we actually report."""

    all_scores = mir_eval.chord.evaluate(
        reference_intervals,
        reference_labels,
        estimate_intervals,
        estimate_labels,
    )
    kept = {
        name: float(all_scores[name]) for name in _METRICS_TO_KEEP if name in all_scores
    }
    total_seconds = float(reference_intervals[-1, 1] - reference_intervals[0, 0])
    return ChordEvaluationScores(
        reference_label=reference_label,
        candidate_id=candidate_id,
        scores=kept,
        total_seconds=total_seconds,
        reference_segment_count=len(reference_labels),
        estimate_segment_count=len(estimate_labels),
    )


__all__ = (
    "ChordEvaluationScores",
    "chord_result_to_estimate",
    "evaluate",
    "load_reference_lab",
)
