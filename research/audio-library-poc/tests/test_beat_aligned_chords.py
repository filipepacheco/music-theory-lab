"""Tests for the beat-aligned chord regions module and its report script."""

from __future__ import annotations

import importlib.util
import json
import sys
from datetime import UTC, datetime
from pathlib import Path

import pytest

from audio_library_poc.beat_aligned_chords import (
    align_chords_to_beats,
    collapse_short_regions,
    relative_root_of,
    roman_numeral,
)
from audio_library_poc.beat_analysis import (
    BeatAnalysisResult,
    BeatAnalyzerProvenance,
    BeatEstimate,
    BeatSourceFacts,
    EffectiveBeatAnalyzerSettings,
)
from audio_library_poc.chord_analysis import (
    ChordAnalysisResult,
    ChordAnalyzerProvenance,
    ChordCoverage,
    ChordLabel,
    ChordSegment,
    ChordSourceFacts,
    EffectiveChordAnalyzerSettings,
)
from audio_library_poc.key_analysis import (
    EffectiveKeyAnalyzerSettings,
    KeyAnalysisResult,
    KeyAnalyzerProvenance,
    KeyEstimate,
    KeySourceFacts,
)
from audio_library_poc.models import TonalMode
from audio_library_poc.separation import SeparatorPrecision

PACKAGE_ROOT = Path(__file__).parents[1]
SCRIPT_PATH = PACKAGE_ROOT / "scripts" / "beat_aligned_chords_report.py"


def _load_script():
    spec = importlib.util.spec_from_file_location(
        "beat_aligned_chords_report", SCRIPT_PATH
    )
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    sys.modules["beat_aligned_chords_report"] = module
    spec.loader.exec_module(module)
    return module


report_script = _load_script()


SOURCE_SHA = "a" * 64


def _beats(times_and_downbeats: list[tuple[float, bool]]) -> BeatAnalysisResult:
    beats = tuple(
        BeatEstimate(time_seconds=t, is_downbeat=d) for t, d in times_and_downbeats
    )
    return BeatAnalysisResult(
        source_sha256=SOURCE_SHA,
        provenance=BeatAnalyzerProvenance(
            candidate="beat_this",
            implementation_version="1.0.0",
            model_identifier="pinned/x",
            model_sha256="b" * 64,
            code_revision="test",
        ),
        settings=EffectiveBeatAnalyzerSettings(
            device="cuda",
            precision=SeparatorPrecision.FLOAT16,
            use_dbn=False,
        ),
        source=BeatSourceFacts(
            sample_rate=44100,
            channels=2,
            frame_count=int(times_and_downbeats[-1][0] * 44100) + 1000,
            duration_seconds=times_and_downbeats[-1][0] + 1.0,
            peak_absolute_sample=0.5,
        ),
        beats=beats,
        downbeat_count=sum(1 for _, d in times_and_downbeats if d),
        tempo_median_bpm=120.0,
    )


def _chords(segments: list[ChordSegment]) -> ChordAnalysisResult:
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


def _key(tonic_pc: int, mode: TonalMode) -> KeyAnalysisResult:
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


# --- pure helper tests ---------------------------------------------------


def test_relative_root_wraps_within_octave() -> None:
    assert relative_root_of(chord_root_pc=2, key_tonic_pc=2) == 0
    assert relative_root_of(chord_root_pc=7, key_tonic_pc=2) == 5  # IV in D key
    assert relative_root_of(chord_root_pc=0, key_tonic_pc=2) == 10  # bVII


def test_roman_numeral_diatonic_major_key() -> None:
    # In C major (tonic 0): C=I, Dm=ii, Em=iii, F=IV, G=V, Am=vi, Bo=vii°.
    # We handle only major/minor chord modes; roman_numeral returns the
    # numeral case+accidental.
    assert roman_numeral(0, ChordLabel.MAJOR, TonalMode.MAJOR) == "I"
    assert roman_numeral(2, ChordLabel.MINOR, TonalMode.MAJOR) == "ii"
    assert roman_numeral(4, ChordLabel.MINOR, TonalMode.MAJOR) == "iii"
    assert roman_numeral(5, ChordLabel.MAJOR, TonalMode.MAJOR) == "IV"
    assert roman_numeral(7, ChordLabel.MAJOR, TonalMode.MAJOR) == "V"
    assert roman_numeral(9, ChordLabel.MINOR, TonalMode.MAJOR) == "vi"


def test_roman_numeral_diatonic_minor_key() -> None:
    # In A minor (tonic 9): Am=i, Bo=ii°, C=bIII, Dm=iv, Em=v, F=bVI, G=bVII.
    assert roman_numeral(0, ChordLabel.MINOR, TonalMode.MINOR) == "i"
    assert roman_numeral(3, ChordLabel.MAJOR, TonalMode.MINOR) == "III"
    assert roman_numeral(5, ChordLabel.MINOR, TonalMode.MINOR) == "iv"
    assert roman_numeral(7, ChordLabel.MAJOR, TonalMode.MINOR) == "V"
    assert roman_numeral(8, ChordLabel.MAJOR, TonalMode.MINOR) == "VI"
    assert roman_numeral(10, ChordLabel.MAJOR, TonalMode.MINOR) == "VII"


def test_roman_numeral_borrowed_gets_accidental() -> None:
    # bII in C major (chord root Db=1), major quality → "bII"
    assert roman_numeral(1, ChordLabel.MAJOR, TonalMode.MAJOR) == "bII"
    # Sharp iv in C major (chord root F#=6), minor quality → "#iv"
    assert roman_numeral(6, ChordLabel.MINOR, TonalMode.MAJOR) == "#iv"


def test_roman_numeral_rejects_non_pitched_chord_mode() -> None:
    with pytest.raises(ValueError):
        roman_numeral(0, ChordLabel.NO_CHORD, TonalMode.MAJOR)


# --- alignment tests -----------------------------------------------------


def test_align_matches_start_and_end_to_nearest_beat() -> None:
    beats = _beats([(0.0, True), (0.5, False), (1.0, False), (1.5, False), (2.0, True)])
    segments = [
        ChordSegment(
            start_seconds=0.0,
            end_seconds=0.9,
            label=ChordLabel.MAJOR,
            root_pc=0,
            candidate_label="C",
        ),
        ChordSegment(
            start_seconds=0.9,
            end_seconds=2.0,
            label=ChordLabel.MINOR,
            root_pc=9,
            candidate_label="A:min",
        ),
    ]
    chords = _chords(segments)
    key = _key(tonic_pc=0, mode=TonalMode.MAJOR)

    regions = align_chords_to_beats(chords, beats, key)

    assert len(regions) == 2
    # First segment: 0.0s -> beat 0, 0.9s -> beat 2 (1.0s is closer than 0.5s).
    assert regions[0].start_beat_index == 0
    assert regions[0].end_beat_index == 2
    assert regions[0].beat_span == 2
    assert regions[0].chord_display == "C"
    assert regions[0].roman_numeral == "I"
    # Second segment: 0.9s -> beat 2, 2.0s -> beat 4.
    assert regions[1].start_beat_index == 2
    assert regions[1].end_beat_index == 4
    assert regions[1].beat_span == 2
    assert regions[1].chord_display == "Am"
    assert regions[1].roman_numeral == "vi"


def test_align_rejects_mismatched_source_sha256() -> None:
    beats = _beats([(0.0, True), (1.0, False)])
    segments = [
        ChordSegment(
            start_seconds=0.0,
            end_seconds=1.0,
            label=ChordLabel.MAJOR,
            root_pc=0,
            candidate_label="C",
        )
    ]
    chords = _chords(segments)
    key = _key(tonic_pc=0, mode=TonalMode.MAJOR)

    # Fake a mismatched hash on the beats result.
    tampered = beats.model_copy(update={"source_sha256": "1" * 64})
    with pytest.raises(ValueError, match="different source_sha256"):
        align_chords_to_beats(chords, tampered, key)


def test_align_yields_none_numeral_for_no_chord_and_unknown() -> None:
    beats = _beats([(0.0, True), (0.5, False), (1.0, False), (1.5, False), (2.0, True)])
    segments = [
        ChordSegment(
            start_seconds=0.0,
            end_seconds=1.0,
            label=ChordLabel.NO_CHORD,
            root_pc=None,
            candidate_label="N",
        ),
        ChordSegment(
            start_seconds=1.0,
            end_seconds=2.0,
            label=ChordLabel.UNKNOWN,
            root_pc=None,
            candidate_label="D:hdim7",
        ),
    ]
    chords = _chords(segments)
    key = _key(tonic_pc=2, mode=TonalMode.MINOR)

    regions = align_chords_to_beats(chords, beats, key)
    assert [r.roman_numeral for r in regions] == [None, None]
    assert [r.chord_display for r in regions] == ["N", "?"]


def test_collapse_short_regions_folds_flicker_into_previous() -> None:
    beats = _beats(
        [
            (0.0, True),
            (1.0, False),
            (2.0, False),
            (3.0, True),
            (4.0, False),
            (5.0, False),
            (6.0, False),
            (7.0, True),
            (8.0, False),
        ]
    )
    segments = [
        ChordSegment(
            start_seconds=0.0,
            end_seconds=2.9,
            label=ChordLabel.MAJOR,
            root_pc=7,  # G
            candidate_label="G",
        ),
        ChordSegment(
            start_seconds=2.9,
            end_seconds=3.1,  # sub-beat D flicker
            label=ChordLabel.MAJOR,
            root_pc=2,  # D
            candidate_label="D",
        ),
        ChordSegment(
            start_seconds=3.1,
            end_seconds=8.0,  # long C region afterwards
            label=ChordLabel.MAJOR,
            root_pc=0,  # C
            candidate_label="C",
        ),
    ]
    chords = _chords(segments)
    key = _key(tonic_pc=7, mode=TonalMode.MAJOR)
    regions = align_chords_to_beats(chords, beats, key)
    assert len(regions) == 3
    # After collapse with min_beat_span=2, the sub-beat D flicker folds
    # back into the preceding G. The subsequent long C stays distinct.
    collapsed = collapse_short_regions(regions, min_beat_span=2)
    assert len(collapsed) == 2
    assert collapsed[0].chord_display == "G"
    assert collapsed[1].chord_display == "C"


def test_report_script_handles_empty_workspace(tmp_path: Path) -> None:
    workspace = tmp_path / "workspace"
    (workspace / "runs").mkdir(parents=True)

    bundles = report_script.collect_bundles(workspace)
    report = report_script.render_report(
        bundles,
        generated_at=datetime(2026, 9, 3, 12, 0, 0, tzinfo=UTC),
    )
    assert bundles == []
    assert "No source has all three" in report


def _write_bundle_on_disk(workspace: Path, source_sha256: str) -> None:
    """Create a minimal workspace/runs/ tree with all three succeeded stages."""

    beats = _beats([(0.0, True), (1.0, False), (2.0, False), (3.0, True)])
    beats = beats.model_copy(update={"source_sha256": source_sha256})
    segments = [
        ChordSegment(
            start_seconds=0.0,
            end_seconds=2.0,
            label=ChordLabel.MAJOR,
            root_pc=0,
            candidate_label="C",
        ),
        ChordSegment(
            start_seconds=2.0,
            end_seconds=4.0,
            label=ChordLabel.MINOR,
            root_pc=9,
            candidate_label="A:min",
        ),
    ]
    chords = _chords(segments).model_copy(update={"source_sha256": source_sha256})
    key = _key(tonic_pc=0, mode=TonalMode.MAJOR).model_copy(
        update={"source_sha256": source_sha256}
    )

    for stage_kind, run_id, artifact_name, payload in (
        (
            "beat.beat_this",
            "run-beat",
            "beat-analysis-result.json",
            beats.model_dump(mode="json"),
        ),
        (
            "chord.chordmini_btc",
            "run-chord",
            "chord-analysis-result.json",
            chords.model_dump(mode="json"),
        ),
        (
            "key.hpcp",
            "run-key",
            "key-analysis-result.json",
            key.model_dump(mode="json"),
        ),
    ):
        cache_key = "f" * 64
        stage_dir = workspace / "runs" / run_id / "stages" / stage_kind
        (stage_dir / "results").mkdir(parents=True)
        (stage_dir / "artifacts" / cache_key).mkdir(parents=True)
        envelope = {
            "schema_version": "2.0.0",
            "cache_key": cache_key,
            "status": "succeeded",
            "attempt": 1,
            "identity": {
                "stage_kind": stage_kind,
                "input_sha256": "1" * 64,
                "implementation_version": "1.0.0",
                "config_sha256": "2" * 64,
                "output_schema_version": "1.0.0",
                "model_identifier": None,
                "model_sha256": None,
                "code_revision": "test",
            },
            "artifacts": [
                {
                    "artifact_kind": f"{stage_kind}.result",
                    "path": (
                        f"runs/{run_id}/stages/{stage_kind}/"
                        f"artifacts/{cache_key}/{artifact_name}"
                    ),
                    "sha256": "3" * 64,
                    "size_bytes": 1,
                    "media_type": "application/json",
                    "durable": True,
                }
            ],
            "metrics": {
                "duration_seconds": 1.0,
                "counters": {"attempts": 1},
                "measurements": {},
                "warnings": [],
            },
            "error": None,
        }
        (stage_dir / "results" / f"{cache_key}.json").write_text(
            json.dumps(envelope), encoding="utf-8"
        )
        (stage_dir / "artifacts" / cache_key / artifact_name).write_text(
            json.dumps(payload), encoding="utf-8"
        )


def test_report_script_renders_track_when_all_three_present(tmp_path: Path) -> None:
    workspace = tmp_path / "workspace"
    _write_bundle_on_disk(workspace, source_sha256="a" * 64)

    bundles = report_script.collect_bundles(workspace)
    assert len(bundles) == 1
    report = report_script.render_report(
        bundles,
        min_beat_span=1,
        generated_at=datetime(2026, 9, 3, 12, 0, 0, tzinfo=UTC),
    )
    assert "Beat-aligned chord report" in report
    assert "Bundles: 1" in report
    assert "Detected key: **C major**" in report
    assert "| Beat range | Beats | Time (s) | Chord | Rel. root | Numeral |" in report
    # The two segments should surface as C (I) and Am (vi).
    assert "| C " in report
    assert "| Am " in report
    assert "| I " in report
    assert "| vi " in report


def test_report_script_main_writes_to_out_file(tmp_path: Path) -> None:
    workspace = tmp_path / "workspace"
    _write_bundle_on_disk(workspace, source_sha256="a" * 64)
    out_path = tmp_path / "report.md"

    exit_code = report_script.main(
        ["--workspace", str(workspace), "--out", str(out_path)]
    )
    assert exit_code == 0
    text = out_path.read_text(encoding="utf-8")
    assert "Beat-aligned chord report" in text


def teardown_module(_module) -> None:
    sys.modules.pop("beat_aligned_chords_report", None)
