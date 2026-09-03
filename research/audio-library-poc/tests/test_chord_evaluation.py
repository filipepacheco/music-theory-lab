"""Smoke tests for the chord-evaluation module."""

from __future__ import annotations

from pathlib import Path

import pytest

from audio_library_poc.chord_analysis import (
    ChordAnalysisResult,
    ChordAnalyzerProvenance,
    ChordCoverage,
    ChordLabel,
    ChordSegment,
    ChordSourceFacts,
    EffectiveChordAnalyzerSettings,
)
from audio_library_poc.chord_evaluation import (
    chord_result_to_estimate,
    evaluate,
    load_reference_lab,
)
from audio_library_poc.separation import SeparatorPrecision

SOURCE_SHA = "a" * 64


def _write_lab(path: Path, rows: list[tuple[float, float, str]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    lines = [f"{start:.6f} {end:.6f} {label}" for start, end, label in rows]
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def _chord_result(segments: list[ChordSegment]) -> ChordAnalysisResult:
    total = segments[-1].end_seconds
    per_label = {label: 0.0 for label in ChordLabel}
    for seg in segments:
        per_label[seg.label] += seg.end_seconds - seg.start_seconds
    return ChordAnalysisResult(
        source_sha256=SOURCE_SHA,
        provenance=ChordAnalyzerProvenance(
            candidate="chordmini_btc",
            implementation_version="1.0.0",
            model_identifier="pinned/x",
            model_sha256="c" * 64,
            code_revision="test",
        ),
        settings=EffectiveChordAnalyzerSettings(
            device="cuda",
            precision=SeparatorPrecision.FLOAT16,
            frame_duration_seconds=0.09288,
            sample_rate=22050,
            hop_length=2048,
            seq_len=108,
        ),
        source=ChordSourceFacts(
            sample_rate=44100,
            channels=2,
            frame_count=int(total * 44100),
            duration_seconds=total,
            peak_absolute_sample=0.5,
        ),
        segments=tuple(segments),
        coverage=ChordCoverage(
            major_seconds=per_label[ChordLabel.MAJOR],
            minor_seconds=per_label[ChordLabel.MINOR],
            unknown_seconds=per_label[ChordLabel.UNKNOWN],
            no_chord_seconds=per_label[ChordLabel.NO_CHORD],
        ),
    )


def test_load_reference_lab_reads_isophonics_style(tmp_path: Path) -> None:
    lab = tmp_path / "ref.lab"
    _write_lab(
        lab,
        [
            (0.0, 1.5, "C"),
            (1.5, 3.0, "A:min"),
            (3.0, 4.0, "N"),
        ],
    )
    intervals, labels = load_reference_lab(lab)
    assert intervals.shape == (3, 2)
    assert labels == ["C", "A:min", "N"]


def test_perfect_match_scores_1_on_every_metric(tmp_path: Path) -> None:
    lab = tmp_path / "ref.lab"
    _write_lab(
        lab,
        [
            (0.0, 4.0, "C"),
            (4.0, 8.0, "A:min"),
        ],
    )
    ref_intervals, ref_labels = load_reference_lab(lab)

    result = _chord_result(
        [
            ChordSegment(
                start_seconds=0.0,
                end_seconds=4.0,
                label=ChordLabel.MAJOR,
                root_pc=0,
                candidate_label="C",
            ),
            ChordSegment(
                start_seconds=4.0,
                end_seconds=8.0,
                label=ChordLabel.MINOR,
                root_pc=9,
                candidate_label="A:min",
            ),
        ]
    )
    est_intervals, est_labels = chord_result_to_estimate(result)
    scores = evaluate(
        ref_intervals,
        ref_labels,
        est_intervals,
        est_labels,
        reference_label="test",
        candidate_id="unit",
    )
    for metric in ("root", "majmin", "thirds", "triads", "mirex"):
        assert scores.scores[metric] == pytest.approx(1.0), metric
    assert scores.reference_segment_count == 2
    assert scores.estimate_segment_count == 2


def test_root_correct_but_quality_wrong_drops_majmin(tmp_path: Path) -> None:
    lab = tmp_path / "ref.lab"
    _write_lab(lab, [(0.0, 4.0, "D:min")])
    ref_intervals, ref_labels = load_reference_lab(lab)

    # Estimate says "D" (major) — same root, wrong quality.
    result = _chord_result(
        [
            ChordSegment(
                start_seconds=0.0,
                end_seconds=4.0,
                label=ChordLabel.MAJOR,
                root_pc=2,
                candidate_label="D",
            )
        ]
    )
    est_intervals, est_labels = chord_result_to_estimate(result)
    scores = evaluate(ref_intervals, ref_labels, est_intervals, est_labels)
    assert scores.scores["root"] == pytest.approx(1.0)
    # Quality-aware metrics must be zero when the third is wrong.
    assert scores.scores["majmin"] == pytest.approx(0.0)
    assert scores.scores["thirds"] == pytest.approx(0.0)
