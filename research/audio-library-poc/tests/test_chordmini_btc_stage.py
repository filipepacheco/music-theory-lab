"""Tests for the ChordMini BTC stage bridge, label normalization, and contracts."""

from __future__ import annotations

import hashlib
from pathlib import Path

import pytest
from pydantic import ValidationError

from audio_library_poc.cache import hash_config, stage_cache_key
from audio_library_poc.chord_analysis import (
    ChordAnalysisResult,
    ChordAnalyzerProvenance,
    ChordCoverage,
    ChordLabel,
    ChordSegment,
    ChordSourceFacts,
    EffectiveChordAnalyzerSettings,
    summarize_coverage,
)
from audio_library_poc.chordmini_btc_stage import (
    CHORDMINI_BTC_CANDIDATE_ID,
    CHORDMINI_BTC_IMPLEMENTATION_VERSION,
    CHORDMINI_BTC_STAGE_KIND,
    ChordMiniBtcStageConfig,
    ChordMiniBtcStageExecutor,
    build_chordmini_metrics,
    build_segments,
    normalize_chordmini_label,
)
from audio_library_poc.execution import ExpectedStageFailure
from audio_library_poc.models import StageIdentity, StageSpecification
from audio_library_poc.separation import SeparatorPrecision

MODEL_IDENTIFIER = "pinned/chordmini_btc:v1"
MODEL_SHA256 = "b" * 64


def _build_source(workspace: Path, *, contents: bytes = b"AUDIO") -> tuple[str, str]:
    originals = workspace / "originals"
    originals.mkdir(parents=True, exist_ok=True)
    file_path = originals / "track.wav"
    file_path.write_bytes(contents)
    return "originals/track.wav", hashlib.sha256(contents).hexdigest()


def _specification(
    *,
    source_relative_path: str = "originals/track.wav",
    checkpoint_relative_path: str = "models/chordmini-btc-model-best.pth",
    model_identifier: str | None = MODEL_IDENTIFIER,
    model_sha256: str | None = MODEL_SHA256,
    extra_config: dict[str, object] | None = None,
) -> StageSpecification:
    config: dict[str, object] = {
        "source_relative_path": source_relative_path,
        "checkpoint_relative_path": checkpoint_relative_path,
        "device": "cuda",
        "precision": "float16",
        "sliding_window_overlap": 0.5,
        "min_segment_seconds": 0.0,
    }
    if extra_config is not None:
        config.update(extra_config)
    return StageSpecification(
        stage_kind=CHORDMINI_BTC_STAGE_KIND,
        implementation_version="1.0.0",
        config=config,
        model_identifier=model_identifier,
        model_sha256=model_sha256,
    )


def _identity(spec: StageSpecification, input_sha256: str) -> StageIdentity:
    return StageIdentity(
        stage_kind=spec.stage_kind,
        input_sha256=input_sha256,
        implementation_version=spec.implementation_version,
        config_sha256=hash_config(spec.config),
        output_schema_version=spec.output_schema_version,
        model_identifier=spec.model_identifier,
        model_sha256=spec.model_sha256,
        code_revision="test-revision",
    )


def _execute(
    executor: ChordMiniBtcStageExecutor,
    *,
    specification: StageSpecification,
    input_sha256: str,
    tmp_path: Path,
):
    identity = _identity(specification, input_sha256)
    return executor.execute(
        specification=specification,
        identity=identity,
        cache_key=stage_cache_key(identity),
        attempt=1,
        staging_directory=tmp_path / "staging",
    )


def test_config_rejects_absolute_paths() -> None:
    with pytest.raises(ValidationError):
        ChordMiniBtcStageConfig(
            source_relative_path="/absolute/track.wav",
            checkpoint_relative_path="models/x.pth",
        )


def test_config_defaults() -> None:
    cfg = ChordMiniBtcStageConfig(
        source_relative_path="originals/track.wav",
        checkpoint_relative_path="models/chordmini-btc-model-best.pth",
    )
    assert cfg.device == "cuda"
    assert cfg.precision is SeparatorPrecision.FLOAT16
    assert cfg.sliding_window_overlap == 0.5
    assert cfg.min_segment_seconds == 0.0


def test_config_rejects_overlap_out_of_range() -> None:
    with pytest.raises(ValidationError):
        ChordMiniBtcStageConfig(
            source_relative_path="originals/track.wav",
            checkpoint_relative_path="models/x.pth",
            sliding_window_overlap=1.0,
        )


def test_stage_kind_and_identity_constants() -> None:
    assert CHORDMINI_BTC_STAGE_KIND == "chord.chordmini_btc"
    assert CHORDMINI_BTC_CANDIDATE_ID == "chordmini_btc"
    assert CHORDMINI_BTC_IMPLEMENTATION_VERSION == "1.0.0"


def test_normalize_labels_covers_expected_families() -> None:
    assert normalize_chordmini_label("C") == (ChordLabel.MAJOR, 0)
    assert normalize_chordmini_label("F#") == (ChordLabel.MAJOR, 6)
    assert normalize_chordmini_label("Bb") == (ChordLabel.MAJOR, 10)
    assert normalize_chordmini_label("A:min") == (ChordLabel.MINOR, 9)
    assert normalize_chordmini_label("N") == (ChordLabel.NO_CHORD, None)
    assert normalize_chordmini_label("X") == (ChordLabel.NO_CHORD, None)
    assert normalize_chordmini_label("C:7") == (ChordLabel.UNKNOWN, None)
    assert normalize_chordmini_label("D:hdim7") == (ChordLabel.UNKNOWN, None)
    assert normalize_chordmini_label("E:sus4") == (ChordLabel.UNKNOWN, None)
    assert normalize_chordmini_label("F:maj7") == (ChordLabel.UNKNOWN, None)
    assert normalize_chordmini_label("garbled_root:min") == (
        ChordLabel.UNKNOWN,
        None,
    )


def test_build_segments_merges_and_stretches() -> None:
    # 10 frames × 0.1 s = 1.0 s. First 3 frames are D, next 5 are F#, last 2 are N.
    idx_to_chord = {0: "N", 1: "D", 2: "F#"}
    predictions = [1, 1, 1, 2, 2, 2, 2, 2, 0, 0]
    segments = build_segments(
        predictions=predictions,
        idx_to_chord=idx_to_chord,
        frame_duration=0.1,
        duration_seconds=1.0,
        min_segment_seconds=0.0,
    )
    assert [s.label for s in segments] == [
        ChordLabel.MAJOR,
        ChordLabel.MAJOR,
        ChordLabel.NO_CHORD,
    ]
    assert [s.root_pc for s in segments] == [2, 6, None]
    assert segments[0].start_seconds == pytest.approx(0.0)
    assert segments[0].end_seconds == pytest.approx(0.3)
    assert segments[1].start_seconds == pytest.approx(0.3)
    assert segments[1].end_seconds == pytest.approx(0.8)
    assert segments[2].start_seconds == pytest.approx(0.8)
    # tail stretched to the source duration
    assert segments[2].end_seconds == pytest.approx(1.0)


def test_build_segments_absorbs_short_flicker() -> None:
    # C -> single frame of A#:min flicker -> C. min_segment 0.2 s absorbs it.
    idx_to_chord = {0: "N", 1: "C", 2: "A#:min"}
    predictions = [1, 1, 1, 1, 1, 2, 1, 1, 1, 1]
    segments = build_segments(
        predictions=predictions,
        idx_to_chord=idx_to_chord,
        frame_duration=0.1,
        duration_seconds=1.0,
        min_segment_seconds=0.2,
    )
    # The single-frame A#:min segment is absorbed into the preceding C.
    assert len(segments) == 2
    assert segments[0].label is ChordLabel.MAJOR
    assert segments[0].root_pc == 0
    assert segments[1].label is ChordLabel.MAJOR
    assert segments[1].root_pc == 0
    # The whole [0, 1.0) is covered.
    assert segments[0].start_seconds == pytest.approx(0.0)
    assert segments[-1].end_seconds == pytest.approx(1.0)


def test_summarize_coverage_sums_per_label() -> None:
    segments = (
        ChordSegment(
            start_seconds=0.0,
            end_seconds=1.0,
            label=ChordLabel.MAJOR,
            root_pc=0,
            candidate_label="C",
        ),
        ChordSegment(
            start_seconds=1.0,
            end_seconds=2.5,
            label=ChordLabel.MINOR,
            root_pc=9,
            candidate_label="A:min",
        ),
        ChordSegment(
            start_seconds=2.5,
            end_seconds=3.0,
            label=ChordLabel.UNKNOWN,
            root_pc=None,
            candidate_label="D:hdim7",
        ),
        ChordSegment(
            start_seconds=3.0,
            end_seconds=4.0,
            label=ChordLabel.NO_CHORD,
            root_pc=None,
            candidate_label="N",
        ),
    )
    coverage = summarize_coverage(segments)
    assert coverage.major_seconds == pytest.approx(1.0)
    assert coverage.minor_seconds == pytest.approx(1.5)
    assert coverage.unknown_seconds == pytest.approx(0.5)
    assert coverage.no_chord_seconds == pytest.approx(1.0)


def test_chord_analysis_result_rejects_overlap() -> None:
    provenance = ChordAnalyzerProvenance(
        candidate="chordmini_btc",
        implementation_version="1.0.0",
        model_identifier="pinned/x",
        model_sha256="b" * 64,
        code_revision="test",
    )
    settings = EffectiveChordAnalyzerSettings(
        device="cuda",
        precision=SeparatorPrecision.FLOAT16,
        frame_duration_seconds=0.09288,
        sample_rate=22050,
        hop_length=2048,
        seq_len=108,
    )
    source = ChordSourceFacts(
        sample_rate=44100,
        channels=2,
        frame_count=88200,
        duration_seconds=2.0,
        peak_absolute_sample=0.5,
    )
    with pytest.raises(ValidationError):
        ChordAnalysisResult(
            source_sha256="a" * 64,
            provenance=provenance,
            settings=settings,
            source=source,
            segments=(
                ChordSegment(
                    start_seconds=0.0,
                    end_seconds=1.5,
                    label=ChordLabel.MAJOR,
                    root_pc=0,
                    candidate_label="C",
                ),
                ChordSegment(
                    start_seconds=1.0,  # overlaps the previous segment
                    end_seconds=2.0,
                    label=ChordLabel.MINOR,
                    root_pc=9,
                    candidate_label="A:min",
                ),
            ),
            coverage=ChordCoverage(
                major_seconds=1.5,
                minor_seconds=1.0,
                unknown_seconds=0.0,
                no_chord_seconds=0.0,
            ),
        )


def test_chord_analysis_result_rejects_gaps() -> None:
    provenance = ChordAnalyzerProvenance(
        candidate="chordmini_btc",
        implementation_version="1.0.0",
        model_identifier="pinned/x",
        model_sha256="b" * 64,
        code_revision="test",
    )
    settings = EffectiveChordAnalyzerSettings(
        device="cuda",
        precision=SeparatorPrecision.FLOAT16,
        frame_duration_seconds=0.09288,
        sample_rate=22050,
        hop_length=2048,
        seq_len=108,
    )
    source = ChordSourceFacts(
        sample_rate=44100,
        channels=2,
        frame_count=88200,
        duration_seconds=2.0,
        peak_absolute_sample=0.5,
    )
    with pytest.raises(ValidationError):
        ChordAnalysisResult(
            source_sha256="a" * 64,
            provenance=provenance,
            settings=settings,
            source=source,
            segments=(
                ChordSegment(
                    start_seconds=0.0,
                    end_seconds=0.5,
                    label=ChordLabel.MAJOR,
                    root_pc=0,
                    candidate_label="C",
                ),
                ChordSegment(
                    start_seconds=1.0,  # 0.5s gap
                    end_seconds=2.0,
                    label=ChordLabel.MINOR,
                    root_pc=9,
                    candidate_label="A:min",
                ),
            ),
            coverage=ChordCoverage(
                major_seconds=0.5,
                minor_seconds=1.0,
                unknown_seconds=0.0,
                no_chord_seconds=0.0,
            ),
        )


def test_invalid_config_yields_typed_failure(tmp_path: Path) -> None:
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    source_relative, source_sha256 = _build_source(workspace)
    executor = ChordMiniBtcStageExecutor(workspace)
    specification = _specification(
        source_relative_path=source_relative,
        extra_config={"sliding_window_overlap": 2.0},
    )

    with pytest.raises(ExpectedStageFailure) as captured:
        _execute(
            executor,
            specification=specification,
            input_sha256=source_sha256,
            tmp_path=tmp_path,
        )

    assert captured.value.error.code == "chord.invalid_config"


def test_missing_model_identity_yields_typed_failure(tmp_path: Path) -> None:
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    source_relative, source_sha256 = _build_source(workspace)
    executor = ChordMiniBtcStageExecutor(workspace)
    specification = _specification(
        source_relative_path=source_relative,
        model_identifier=None,
        model_sha256=None,
    )

    with pytest.raises(ExpectedStageFailure) as captured:
        _execute(
            executor,
            specification=specification,
            input_sha256=source_sha256,
            tmp_path=tmp_path,
        )

    assert captured.value.error.code == "chord.missing_model_identity"


def test_source_missing_yields_typed_failure(tmp_path: Path) -> None:
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    executor = ChordMiniBtcStageExecutor(workspace)
    specification = _specification()

    with pytest.raises(ExpectedStageFailure) as captured:
        _execute(
            executor,
            specification=specification,
            input_sha256="a" * 64,
            tmp_path=tmp_path,
        )

    assert captured.value.error.code == "chord.source_missing"


def test_source_hash_mismatch_yields_typed_failure(tmp_path: Path) -> None:
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    source_relative, _real_sha256 = _build_source(workspace, contents=b"REAL")
    executor = ChordMiniBtcStageExecutor(workspace)
    specification = _specification(source_relative_path=source_relative)

    with pytest.raises(ExpectedStageFailure) as captured:
        _execute(
            executor,
            specification=specification,
            input_sha256="0" * 64,
            tmp_path=tmp_path,
        )

    assert captured.value.error.code == "chord.source_hash_mismatch"


def test_checkpoint_missing_yields_typed_failure(tmp_path: Path) -> None:
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    source_relative, source_sha256 = _build_source(workspace)
    executor = ChordMiniBtcStageExecutor(workspace)
    specification = _specification(source_relative_path=source_relative)

    with pytest.raises(ExpectedStageFailure) as captured:
        _execute(
            executor,
            specification=specification,
            input_sha256=source_sha256,
            tmp_path=tmp_path,
        )

    assert captured.value.error.code == "chord.checkpoint_missing"
    assert captured.value.error.details["relative_path"] == (
        "models/chordmini-btc-model-best.pth"
    )


def test_build_metrics_shape() -> None:
    coverage = ChordCoverage(
        major_seconds=100.0,
        minor_seconds=50.0,
        unknown_seconds=10.0,
        no_chord_seconds=5.0,
    )
    metrics = build_chordmini_metrics(
        wall_seconds=1.5,
        frame_count=2800,
        segment_count=42,
        coverage=coverage,
    )
    assert metrics.duration_seconds == pytest.approx(1.5)
    assert metrics.counters == {"frames_processed": 2800, "segments_emitted": 42}
    assert metrics.measurements["coverage_major_seconds"] == pytest.approx(100.0)
    assert metrics.measurements["coverage_minor_seconds"] == pytest.approx(50.0)
