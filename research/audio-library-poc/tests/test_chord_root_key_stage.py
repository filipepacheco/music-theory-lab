"""Tests for the chord-root-weighted key-detection stage."""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
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
)
from audio_library_poc.chord_root_key_stage import (
    CHORD_ROOT_KEY_CANDIDATE_ID,
    CHORD_ROOT_KEY_IMPLEMENTATION_VERSION,
    CHORD_ROOT_KEY_STAGE_KIND,
    ChordRootKeyStageConfig,
    ChordRootKeyStageExecutor,
    build_pitch_class_profile,
    score_all_keys_from_profile,
)
from audio_library_poc.execution import ExpectedStageFailure
from audio_library_poc.io import atomic_write_json
from audio_library_poc.key_analysis import KeyAnalysisResult
from audio_library_poc.models import StageIdentity, StageSpecification, TonalMode
from audio_library_poc.separation import SeparatorPrecision

SOURCE_SHA = "a" * 64


def _chord_result_with(segments: list[ChordSegment]) -> ChordAnalysisResult:
    if not segments:
        raise ValueError("need at least one segment for the fixture")
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


def _specification(
    *,
    chord_analysis_relative_path: str = "runs/x/chord-analysis-result.json",
    extra_config: dict[str, object] | None = None,
) -> StageSpecification:
    config: dict[str, object] = {
        "chord_analysis_relative_path": chord_analysis_relative_path,
    }
    if extra_config is not None:
        config.update(extra_config)
    return StageSpecification(
        stage_kind=CHORD_ROOT_KEY_STAGE_KIND,
        implementation_version="1.0.0",
        config=config,
    )


def _identity(spec: StageSpecification, input_sha256: str) -> StageIdentity:
    return StageIdentity(
        stage_kind=spec.stage_kind,
        input_sha256=input_sha256,
        implementation_version=spec.implementation_version,
        config_sha256=hash_config(spec.config),
        output_schema_version=spec.output_schema_version,
        model_identifier=None,
        model_sha256=None,
        code_revision="test-revision",
    )


def _execute(
    executor: ChordRootKeyStageExecutor,
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


# --- pure profile tests --------------------------------------------------


def test_build_profile_root_only_weighting() -> None:
    segments = [
        ChordSegment(
            start_seconds=0.0,
            end_seconds=10.0,
            label=ChordLabel.MINOR,
            root_pc=9,  # Am
            candidate_label="A:min",
        ),
        ChordSegment(
            start_seconds=10.0,
            end_seconds=15.0,
            label=ChordLabel.MAJOR,
            root_pc=0,  # C
            candidate_label="C",
        ),
        ChordSegment(
            start_seconds=15.0,
            end_seconds=20.0,
            label=ChordLabel.NO_CHORD,
            root_pc=None,
            candidate_label="N",
        ),
    ]
    profile = build_pitch_class_profile(segments)
    # A minor for 10 s, C major for 5 s, no_chord contributes nothing.
    assert profile[9] == pytest.approx(10.0)  # A
    assert profile[0] == pytest.approx(5.0)  # C
    assert profile[3] == pytest.approx(0.0)  # third-of-A is zero (root-only)
    assert profile[4] == pytest.approx(0.0)  # third-of-C is zero (root-only)
    assert profile.sum() == pytest.approx(15.0)


def test_build_profile_with_third_and_fifth_weights() -> None:
    segments = [
        ChordSegment(
            start_seconds=0.0,
            end_seconds=10.0,
            label=ChordLabel.MAJOR,
            root_pc=0,  # C major: C, E, G
            candidate_label="C",
        ),
    ]
    profile = build_pitch_class_profile(segments, third_weight=0.5, fifth_weight=0.3)
    assert profile[0] == pytest.approx(10.0)  # root C
    assert profile[4] == pytest.approx(5.0)  # E (third of C major, offset +4)
    assert profile[7] == pytest.approx(3.0)  # G (fifth, offset +7)


def test_build_profile_minor_third_offset() -> None:
    segments = [
        ChordSegment(
            start_seconds=0.0,
            end_seconds=10.0,
            label=ChordLabel.MINOR,
            root_pc=9,  # A minor: A, C, E
            candidate_label="A:min",
        ),
    ]
    profile = build_pitch_class_profile(segments, third_weight=1.0)
    assert profile[9] == pytest.approx(10.0)  # A
    # Minor third of A is C (offset +3).
    assert profile[0] == pytest.approx(10.0)
    # Major third of A would have been C# (+4) — should be zero.
    assert profile[1] == pytest.approx(0.0)


def test_score_all_keys_returns_24_sorted_estimates() -> None:
    # A "profile" clearly favoring A minor: heavy weight on A, C, E.
    profile = np.zeros(12, dtype=np.float64)
    profile[9] = 5.0  # A
    profile[0] = 3.0  # C
    profile[4] = 3.0  # E
    estimates = score_all_keys_from_profile(profile)
    assert len(estimates) == 24
    seen = {(e.tonic_pc, e.mode) for e in estimates}
    assert len(seen) == 24
    # Ordered descending.
    for i in range(1, 24):
        assert estimates[i].score <= estimates[i - 1].score
    # Top pick should be A-something (major or minor). A minor is the
    # strongest given this profile weighting.
    assert estimates[0].tonic_pc == 9
    assert estimates[0].mode is TonalMode.MINOR


# --- config + bridge failure tests --------------------------------------


def test_config_rejects_absolute_chord_path() -> None:
    with pytest.raises(ValidationError):
        ChordRootKeyStageConfig(chord_analysis_relative_path="/abs/path.json")


def test_config_rejects_out_of_range_weights() -> None:
    with pytest.raises(ValidationError):
        ChordRootKeyStageConfig(
            chord_analysis_relative_path="a/b.json",
            third_weight=-0.1,
        )
    with pytest.raises(ValidationError):
        ChordRootKeyStageConfig(
            chord_analysis_relative_path="a/b.json",
            fifth_weight=99.0,
        )


def test_stage_constants() -> None:
    assert CHORD_ROOT_KEY_STAGE_KIND == "key.chord_root_profile"
    assert CHORD_ROOT_KEY_CANDIDATE_ID == "chord_root_profile"
    assert CHORD_ROOT_KEY_IMPLEMENTATION_VERSION == "1.0.0"


def test_chord_analysis_missing_yields_typed_failure(tmp_path: Path) -> None:
    executor = ChordRootKeyStageExecutor(tmp_path)
    specification = _specification()
    with pytest.raises(ExpectedStageFailure) as captured:
        _execute(
            executor,
            specification=specification,
            input_sha256=SOURCE_SHA,
            tmp_path=tmp_path,
        )
    assert captured.value.error.code == "key.chord_analysis_missing"


def test_chord_analysis_source_mismatch_yields_typed_failure(tmp_path: Path) -> None:
    chord_path = tmp_path / "runs" / "x" / "chord-analysis-result.json"
    chord_path.parent.mkdir(parents=True)
    chord_result = _chord_result_with(
        [
            ChordSegment(
                start_seconds=0.0,
                end_seconds=5.0,
                label=ChordLabel.MAJOR,
                root_pc=0,
                candidate_label="C",
            )
        ]
    )
    chord_path.write_text(json.dumps(chord_result.model_dump(mode="json")))

    executor = ChordRootKeyStageExecutor(tmp_path)
    specification = _specification(
        chord_analysis_relative_path="runs/x/chord-analysis-result.json"
    )
    with pytest.raises(ExpectedStageFailure) as captured:
        _execute(
            executor,
            specification=specification,
            input_sha256="0" * 64,  # doesn't match SOURCE_SHA inside chord JSON
            tmp_path=tmp_path,
        )
    assert captured.value.error.code == "key.chord_analysis_source_mismatch"


def test_chord_analysis_invalid_yields_typed_failure(tmp_path: Path) -> None:
    chord_path = tmp_path / "runs" / "x" / "chord-analysis-result.json"
    chord_path.parent.mkdir(parents=True)
    chord_path.write_text("{'not': 'a chord result'}")  # invalid JSON body

    executor = ChordRootKeyStageExecutor(tmp_path)
    specification = _specification(
        chord_analysis_relative_path="runs/x/chord-analysis-result.json"
    )
    with pytest.raises(ExpectedStageFailure) as captured:
        _execute(
            executor,
            specification=specification,
            input_sha256=SOURCE_SHA,
            tmp_path=tmp_path,
        )
    assert captured.value.error.code == "key.chord_analysis_unreadable"


def test_stage_end_to_end_produces_valid_key_result(tmp_path: Path) -> None:
    chord_path = tmp_path / "runs" / "x" / "chord-analysis-result.json"
    chord_path.parent.mkdir(parents=True)
    chord_result = _chord_result_with(
        [
            ChordSegment(
                start_seconds=0.0,
                end_seconds=40.0,
                label=ChordLabel.MINOR,
                root_pc=9,  # Am
                candidate_label="A:min",
            ),
            ChordSegment(
                start_seconds=40.0,
                end_seconds=60.0,
                label=ChordLabel.MAJOR,
                root_pc=0,  # C
                candidate_label="C",
            ),
            ChordSegment(
                start_seconds=60.0,
                end_seconds=80.0,
                label=ChordLabel.MAJOR,
                root_pc=5,  # F
                candidate_label="F",
            ),
            ChordSegment(
                start_seconds=80.0,
                end_seconds=100.0,
                label=ChordLabel.MAJOR,
                root_pc=7,  # G
                candidate_label="G",
            ),
        ]
    )
    atomic_write_json(chord_path, chord_result)

    executor = ChordRootKeyStageExecutor(tmp_path)
    specification = _specification(
        chord_analysis_relative_path="runs/x/chord-analysis-result.json"
    )
    output = _execute(
        executor,
        specification=specification,
        input_sha256=SOURCE_SHA,
        tmp_path=tmp_path,
    )

    # StageOutput carried the JSON artifact.
    assert output.artifacts[0].artifact_name == "key-analysis-result.json"
    # Read back and re-validate.
    published = tmp_path / "staging" / "key-analysis-result.json"
    result = KeyAnalysisResult.model_validate_json(
        published.read_text(encoding="utf-8")
    )
    # Profile (Am 40, C 20, F 20, G 20) should nominate an A-based key at the top.
    assert result.top_estimate.tonic_pc == 9
    assert result.top_estimate.mode is TonalMode.MINOR
