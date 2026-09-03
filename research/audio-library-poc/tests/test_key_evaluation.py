"""Smoke tests for the key-evaluation module."""

from __future__ import annotations

from pathlib import Path

import pytest

from audio_library_poc.key_analysis import (
    EffectiveKeyAnalyzerSettings,
    KeyAnalysisResult,
    KeyAnalyzerProvenance,
    KeyEstimate,
    KeySourceFacts,
)
from audio_library_poc.key_evaluation import (
    evaluate,
    key_result_to_estimate,
    load_reference_key,
)
from audio_library_poc.models import TonalMode

SOURCE_SHA = "a" * 64


def _valid_key_result(tonic_pc: int, mode: TonalMode) -> KeyAnalysisResult:
    estimates: list[KeyEstimate] = []
    for pc in range(12):
        for m in (TonalMode.MAJOR, TonalMode.MINOR):
            is_top = pc == tonic_pc and m is mode
            score = (
                0.9
                if is_top
                else 0.5 - 0.01 * (pc * 2 + (0 if m is TonalMode.MAJOR else 1))
            )
            estimates.append(KeyEstimate(tonic_pc=pc, mode=m, score=score))
    estimates.sort(key=lambda e: e.score, reverse=True)
    return KeyAnalysisResult(
        source_sha256=SOURCE_SHA,
        provenance=KeyAnalyzerProvenance(
            candidate="hpcp",
            implementation_version="1.0.0",
            code_revision="test",
        ),
        settings=EffectiveKeyAnalyzerSettings(
            sample_rate=22050,
            hop_length=2048,
            n_chroma=12,
            profile="krumhansl_kessler",
        ),
        source=KeySourceFacts(
            sample_rate=44100,
            channels=2,
            frame_count=44100,
            duration_seconds=1.0,
            peak_absolute_sample=0.5,
        ),
        estimates=tuple(estimates),
        top_estimate=estimates[0],
    )


def test_load_isophonics_style_key_lab_picks_dominant(tmp_path: Path) -> None:
    lab = tmp_path / "ref.lab"
    lab.write_text(
        "\n".join(
            [
                "0.000\t1.010\tSilence",
                "1.010\t70.673\tKey\tD:minor",
                "70.673\t76.430\tKey\tD",
                "76.430\t111.167\tKey\tD:minor",
                "111.167\t260.627\tKey\tD:minor",
            ]
        )
        + "\n",
        encoding="utf-8",
    )
    dominant, duration = load_reference_key(lab)
    assert dominant == "D minor"
    assert duration == pytest.approx(260.627, rel=1e-3)


def test_key_result_to_estimate_formats_mir_eval_style() -> None:
    major = _valid_key_result(tonic_pc=7, mode=TonalMode.MAJOR)
    minor = _valid_key_result(tonic_pc=9, mode=TonalMode.MINOR)
    assert key_result_to_estimate(major) == "G major"
    assert key_result_to_estimate(minor) == "A minor"


def test_evaluate_scores_1_when_top_matches_reference() -> None:
    result = _valid_key_result(tonic_pc=2, mode=TonalMode.MINOR)
    score = evaluate(
        reference_label="D minor",
        reference_duration_seconds=260.0,
        result=result,
        candidate_id="hpcp",
    )
    assert score.score == pytest.approx(1.0)
    assert score.top_label == "D minor"


def test_evaluate_gives_parallel_key_partial_credit() -> None:
    # mir_eval assigns 0.2 to parallel major/minor (D minor vs D major).
    result = _valid_key_result(tonic_pc=2, mode=TonalMode.MAJOR)
    score = evaluate(
        reference_label="D minor",
        reference_duration_seconds=260.0,
        result=result,
        candidate_id="hpcp",
    )
    assert 0.0 < score.score < 1.0
    assert score.top_label == "D major"
