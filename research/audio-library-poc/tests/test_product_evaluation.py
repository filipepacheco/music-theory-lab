"""Hand-computable tests for normalized Biblioteca harmony metrics."""

from __future__ import annotations

import pytest

from audio_library_poc.chord_analysis import ChordLabel, ChordSegment
from audio_library_poc.key_analysis import (
    EffectiveKeyAnalyzerSettings,
    KeyAnalysisResult,
    KeyAnalyzerProvenance,
    KeyEstimate,
    KeySourceFacts,
)
from audio_library_poc.models import TonalMode
from audio_library_poc.product_evaluation import (
    aggregate_accepted_chord_scores,
    evaluate_accepted_chords,
    evaluate_key_ranking,
    macro_accepted_chord_metrics,
    normalize_reference_chord,
)


def _segment(start: float, end: float, label: ChordLabel, root: int | None = None):
    return ChordSegment(
        start_seconds=start,
        end_seconds=end,
        label=label,
        root_pc=root,
        candidate_label="fixture",
    )


def test_perfect_accepted_output_has_all_harmonic_ratios() -> None:
    score = evaluate_accepted_chords(
        [(0.0, 2.0)], ["C"], [_segment(0.0, 2.0, ChordLabel.MAJOR, 0)]
    )
    assert score.correct_accepted_harmonic_seconds == 2.0
    assert score.accepted_label_precision == 1.0
    assert score.harmonic_coverage == 1.0
    assert score.overall_harmonic_agreement == 1.0


def test_right_root_wrong_quality_is_covered_but_not_correct() -> None:
    score = evaluate_accepted_chords(
        [(0.0, 2.0)], ["D:min"], [_segment(0.0, 2.0, ChordLabel.MAJOR, 2)]
    )
    assert score.accepted_harmonic_seconds == 2.0
    assert score.correct_accepted_harmonic_seconds == 0.0
    assert score.accepted_label_precision == 0.0
    assert score.harmonic_coverage == 1.0


def test_unknown_and_estimate_gaps_are_uncovered() -> None:
    score = evaluate_accepted_chords(
        [(0.0, 4.0)], ["C"], [_segment(0.0, 2.0, ChordLabel.UNKNOWN)]
    )
    assert score.reference_harmonic_seconds == 4.0
    assert score.unknown_on_harmonic_seconds == 4.0
    assert score.accepted_harmonic_seconds == 0.0
    assert score.accepted_label_precision is None
    assert score.harmonic_coverage == 0.0


def test_no_chord_reference_is_scored_separately() -> None:
    score = evaluate_accepted_chords(
        [(0.0, 1.0), (1.0, 2.0)],
        ["N", "C"],
        [
            _segment(0.0, 1.0, ChordLabel.NO_CHORD),
            _segment(1.0, 2.0, ChordLabel.NO_CHORD),
        ],
    )
    assert score.no_chord_recall == 1.0
    assert score.no_chord_on_harmonic_seconds == 1.0
    assert score.overall_harmonic_agreement == 0.0


def test_mixed_coverage_and_unequal_lengths_have_explicit_denominators() -> None:
    score = evaluate_accepted_chords(
        [(0.0, 4.0)],
        ["C"],
        [
            _segment(0.0, 1.0, ChordLabel.MAJOR, 0),
            _segment(1.0, 2.0, ChordLabel.UNKNOWN),
        ],
    )
    assert score.correct_accepted_harmonic_seconds == 1.0
    assert score.accepted_harmonic_seconds == 1.0
    assert score.unknown_on_harmonic_seconds == 3.0
    assert score.accepted_label_precision == 1.0
    assert score.harmonic_coverage == 0.25
    assert score.overall_harmonic_agreement == 0.25


@pytest.mark.parametrize("label", ["C:sus4", "D:dim", "E:aug", "X", "garbled"])
def test_unsupported_references_are_excluded(label: str) -> None:
    score = evaluate_accepted_chords(
        [(0.0, 2.0)], [label], [_segment(0.0, 2.0, ChordLabel.MAJOR, 0)]
    )
    assert score.excluded_reference_seconds == 2.0
    assert score.reference_harmonic_seconds == 0.0


def test_richer_major_minor_reductions_and_x_n_are_distinct() -> None:
    assert normalize_reference_chord("C:maj7").reduced_richer
    assert normalize_reference_chord("A:min9").label is ChordLabel.MINOR
    assert normalize_reference_chord("N").kind == "no_chord"
    assert normalize_reference_chord("X").kind == "unsupported"


def test_overlapping_or_nonfinite_estimates_fail_before_scoring() -> None:
    with pytest.raises(ValueError, match="overlap"):
        evaluate_accepted_chords(
            [(0.0, 2.0)],
            ["C"],
            [
                _segment(0.0, 1.5, ChordLabel.MAJOR, 0),
                _segment(1.0, 2.0, ChordLabel.MAJOR, 0),
            ],
        )


def test_duration_weighted_and_macro_outputs_are_not_conflated() -> None:
    perfect = evaluate_accepted_chords(
        [(0.0, 9.0)], ["C"], [_segment(0.0, 9.0, ChordLabel.MAJOR, 0)]
    )
    wrong = evaluate_accepted_chords(
        [(0.0, 1.0)], ["C"], [_segment(0.0, 1.0, ChordLabel.MAJOR, 2)]
    )
    assert (
        aggregate_accepted_chord_scores([perfect, wrong]).overall_harmonic_agreement
        == 0.9
    )
    macro = macro_accepted_chord_metrics([perfect, wrong])
    assert macro["overall_harmonic_agreement"] == 0.5
    assert macro["overall_harmonic_agreement_contributor_count"] == 2


def test_key_top_ranking_and_margin_are_exposed_without_probability_claim() -> None:
    estimates = [
        KeyEstimate(tonic_pc=0, mode=TonalMode.MAJOR, score=0.9),
        KeyEstimate(tonic_pc=7, mode=TonalMode.MAJOR, score=0.8),
    ]
    for tonic in range(12):
        for mode in (TonalMode.MAJOR, TonalMode.MINOR):
            if (tonic, mode) not in {(0, TonalMode.MAJOR), (7, TonalMode.MAJOR)}:
                estimates.append(KeyEstimate(tonic_pc=tonic, mode=mode, score=-0.5))
    result = KeyAnalysisResult(
        source_sha256="a" * 64,
        provenance=KeyAnalyzerProvenance(
            candidate="hpcp", implementation_version="1", code_revision="test"
        ),
        settings=EffectiveKeyAnalyzerSettings(
            sample_rate=1, hop_length=1, n_chroma=12, profile="krumhansl_kessler"
        ),
        source=KeySourceFacts(
            sample_rate=1,
            channels=1,
            frame_count=1,
            duration_seconds=1,
            peak_absolute_sample=0,
        ),
        estimates=tuple(estimates),
        top_estimate=estimates[0],
    )
    score = evaluate_key_ranking("G major", result)
    assert score.reference_rank == 2
    assert not score.top1_correct
    assert score.top3_correct
    assert score.top1_margin == pytest.approx(0.1)
