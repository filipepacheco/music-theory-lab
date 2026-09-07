"""Tests for scripts/sync_workspace_to_public.py."""

from __future__ import annotations

import importlib.util
import json
import sys
from datetime import UTC, datetime
from pathlib import Path

import pytest
import yaml

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
from audio_library_poc.section_analysis import (
    EffectiveSectionAnalyzerSettings,
    SectionAnalysisResult,
    SectionAnalyzerProvenance,
    SectionSegment,
    SectionSourceFacts,
)
from audio_library_poc.separation import SeparatorPrecision
from audio_library_poc.track_intake import INTAKE_TRACKS_MANIFEST

PACKAGE_ROOT = Path(__file__).parents[1]
SCRIPT_PATH = PACKAGE_ROOT / "scripts" / "sync_workspace_to_public.py"

SOURCE_SHA_A = "a" * 64
SOURCE_SHA_B = "b" * 64
MODEL_SHA = "c" * 64


def _load_script():
    spec = importlib.util.spec_from_file_location(
        "sync_workspace_to_public", SCRIPT_PATH
    )
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    sys.modules["sync_workspace_to_public"] = module
    spec.loader.exec_module(module)
    return module


sync_module = _load_script()


def _chord_result(source_sha: str, duration: float = 8.0) -> ChordAnalysisResult:
    segments = (
        ChordSegment(
            start_seconds=0.0,
            end_seconds=duration / 2,
            label=ChordLabel.MAJOR,
            root_pc=0,
            candidate_label="C",
        ),
        ChordSegment(
            start_seconds=duration / 2,
            end_seconds=duration,
            label=ChordLabel.MINOR,
            root_pc=9,
            candidate_label="A:min",
        ),
    )
    return ChordAnalysisResult(
        source_sha256=source_sha,
        provenance=ChordAnalyzerProvenance(
            candidate="chordmini_btc",
            implementation_version="1.0.0",
            model_identifier="pinned/x",
            model_sha256=MODEL_SHA,
            code_revision="test",
        ),
        settings=EffectiveChordAnalyzerSettings(
            device="cpu",
            precision=SeparatorPrecision.FLOAT32,
            frame_duration_seconds=0.09288,
            sample_rate=22050,
            hop_length=2048,
            seq_len=108,
        ),
        source=ChordSourceFacts(
            sample_rate=44100,
            channels=2,
            frame_count=int(duration * 44100),
            duration_seconds=duration,
            peak_absolute_sample=0.5,
        ),
        segments=segments,
        coverage=ChordCoverage(
            major_seconds=duration / 2,
            minor_seconds=duration / 2,
            unknown_seconds=0.0,
            no_chord_seconds=0.0,
        ),
    )


def _beat_result(source_sha: str, duration: float = 8.0) -> BeatAnalysisResult:
    # Eight quarter-note beats: 0.5s .. 4.0s at 120 bpm-ish spacing.
    times = [0.5 * (i + 1) for i in range(8)]
    beats = tuple(
        BeatEstimate(time_seconds=t, is_downbeat=(i % 4 == 0))
        for i, t in enumerate(times)
    )
    return BeatAnalysisResult(
        source_sha256=source_sha,
        provenance=BeatAnalyzerProvenance(
            candidate="beat_this",
            implementation_version="1.1.0",
            model_identifier="beat_this/final0",
            model_sha256=MODEL_SHA,
            code_revision="test",
        ),
        settings=EffectiveBeatAnalyzerSettings(
            device="cpu",
            precision=SeparatorPrecision.FLOAT32,
            use_dbn=False,
        ),
        source=BeatSourceFacts(
            sample_rate=44100,
            channels=2,
            frame_count=int(duration * 44100),
            duration_seconds=duration,
            peak_absolute_sample=0.5,
        ),
        beats=beats,
        downbeat_count=sum(1 for b in beats if b.is_downbeat),
        tempo_median_bpm=120.0,
    )


def _key_result(
    source_sha: str, tonic_pc: int, mode: TonalMode, duration: float = 8.0
) -> KeyAnalysisResult:
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
        source_sha256=source_sha,
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
            frame_count=int(duration * 44100),
            duration_seconds=duration,
            peak_absolute_sample=0.5,
        ),
        estimates=tuple(estimates),
        top_estimate=estimates[0],
    )


def _write_stage_result(
    workspace: Path,
    run_id: str,
    stage_kind: str,
    cache_key: str,
    artifact_name: str,
    artifact_payload: str,
    implementation_version: str = "1.0.0",
) -> None:
    stage_root = workspace / "runs" / run_id / "stages" / stage_kind
    envelope = {
        "status": "succeeded",
        "cache_key": cache_key,
        "attempts": 1,
        "identity": {"implementation_version": implementation_version},
    }
    results_dir = stage_root / "results"
    results_dir.mkdir(parents=True, exist_ok=True)
    (results_dir / f"{cache_key}.json").write_text(
        json.dumps(envelope), encoding="utf-8"
    )
    artifact_dir = stage_root / "artifacts" / cache_key
    artifact_dir.mkdir(parents=True, exist_ok=True)
    (artifact_dir / artifact_name).write_text(artifact_payload, encoding="utf-8")


def _seed_full_triple(
    workspace: Path,
    source_sha: str,
    tonic_pc: int,
    mode: TonalMode,
) -> None:
    _write_stage_result(
        workspace,
        f"run-{source_sha[:6]}",
        "chord.chordmini_btc",
        f"chord-{source_sha[:6]}",
        "chord-analysis-result.json",
        _chord_result(source_sha).model_dump_json(),
    )
    _write_stage_result(
        workspace,
        f"run-{source_sha[:6]}",
        "beat.beat_this",
        f"beat-{source_sha[:6]}",
        "beat-analysis-result.json",
        _beat_result(source_sha).model_dump_json(),
    )
    _write_stage_result(
        workspace,
        f"run-{source_sha[:6]}",
        "key.hpcp",
        f"key-{source_sha[:6]}",
        "key-analysis-result.json",
        _key_result(source_sha, tonic_pc, mode).model_dump_json(),
    )


def _write_corpus(workspace: Path, entries: list[dict]) -> None:
    payload = {"schema_version": "1.0.0", "tracks": entries}
    (workspace / "corpus.local.yaml").write_text(
        yaml.safe_dump(payload, sort_keys=False), encoding="utf-8"
    )


def _write_intake_manifest(workspace: Path, entries: list[dict]) -> None:
    payload = {"schema_version": "1.0.0", "tracks": entries}
    (workspace / INTAKE_TRACKS_MANIFEST).write_text(
        yaml.safe_dump(payload, sort_keys=False), encoding="utf-8"
    )


def test_collect_analyses_returns_only_complete_triples(tmp_path: Path) -> None:
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    # Track A has all three; track B is missing key.
    _seed_full_triple(workspace, SOURCE_SHA_A, tonic_pc=0, mode=TonalMode.MAJOR)
    _write_stage_result(
        workspace,
        "run-partial",
        "chord.chordmini_btc",
        "chord-partial",
        "chord-analysis-result.json",
        _chord_result(SOURCE_SHA_B).model_dump_json(),
    )
    _write_stage_result(
        workspace,
        "run-partial",
        "beat.beat_this",
        "beat-partial",
        "beat-analysis-result.json",
        _beat_result(SOURCE_SHA_B).model_dump_json(),
    )

    analyses = sync_module.collect_analyses(workspace)
    assert set(analyses.keys()) == {SOURCE_SHA_A}


def test_collect_analyses_skips_failed_envelopes(tmp_path: Path) -> None:
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    stage_root = workspace / "runs" / "r" / "stages" / "chord.chordmini_btc"
    results_dir = stage_root / "results"
    results_dir.mkdir(parents=True, exist_ok=True)
    (results_dir / "cache-A.json").write_text(
        json.dumps({"status": "failed", "cache_key": "cache-A"}), encoding="utf-8"
    )
    artifact_dir = stage_root / "artifacts" / "cache-A"
    artifact_dir.mkdir(parents=True, exist_ok=True)
    (artifact_dir / "chord-analysis-result.json").write_text(
        _chord_result(SOURCE_SHA_A).model_dump_json(), encoding="utf-8"
    )

    assert sync_module.collect_analyses(workspace) == {}


def test_collect_analyses_handles_missing_runs_dir(tmp_path: Path) -> None:
    workspace = tmp_path / "workspace-empty"
    workspace.mkdir()
    assert sync_module.collect_analyses(workspace) == {}


def test_load_track_metadata_maps_by_sha(tmp_path: Path) -> None:
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    _write_corpus(
        workspace,
        [
            {
                "track_id": "beatles-come-together",
                "expected_sha256": SOURCE_SHA_A,
                "annotation": {"title": "Come Together", "artist": "The Beatles"},
            },
            {
                # No annotation → still indexed with track_id, missing title/artist.
                "track_id": "unknown-song",
                "expected_sha256": SOURCE_SHA_B,
            },
        ],
    )
    meta = sync_module.load_track_metadata(workspace)
    assert meta[SOURCE_SHA_A]["title"] == "Come Together"
    assert meta[SOURCE_SHA_A]["artist"] == "The Beatles"
    assert meta[SOURCE_SHA_B]["title"] is None
    assert meta[SOURCE_SHA_B]["artist"] is None


def test_build_index_projects_expected_fields(tmp_path: Path) -> None:
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    _seed_full_triple(workspace, SOURCE_SHA_A, tonic_pc=2, mode=TonalMode.MINOR)
    _write_corpus(
        workspace,
        [
            {
                "track_id": "beatles-come-together",
                "expected_sha256": SOURCE_SHA_A,
                "annotation": {"title": "Come Together", "artist": "The Beatles"},
            }
        ],
    )
    analyses = sync_module.collect_analyses(workspace)
    meta = sync_module.load_track_metadata(workspace)
    fixed = datetime(2026, 9, 3, 12, 0, 0, tzinfo=UTC)
    index = sync_module.build_index(analyses, meta, generated_at=fixed)

    assert index["schema_version"] == "1.0.0"
    assert index["track_count"] == 1
    assert index["generated_at"].startswith("2026-09-03T12:00:00")

    (track,) = index["tracks"]
    assert track["source_sha256"] == SOURCE_SHA_A
    assert track["sha256_prefix"] == SOURCE_SHA_A[:12]
    assert track["title"] == "Come Together"
    assert track["artist"] == "The Beatles"
    assert track["duration_seconds"] == pytest.approx(8.0)
    assert track["detected_key"]["tonic_name"] == "D"
    assert track["detected_key"]["mode"] == "minor"
    assert track["detected_key"]["tonic_pc"] == 2
    assert track["detected_tempo_bpm"] == pytest.approx(120.0)
    assert track["beat_count"] == 8
    assert track["downbeat_count"] == 2
    assert track["chord_segment_count"] == 2
    assert track["detail_directory"] == f"tracks/{SOURCE_SHA_A[:12]}"


def test_build_index_defaults_missing_corpus_meta(tmp_path: Path) -> None:
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    _seed_full_triple(workspace, SOURCE_SHA_B, tonic_pc=7, mode=TonalMode.MAJOR)
    analyses = sync_module.collect_analyses(workspace)
    index = sync_module.build_index(analyses, {})
    (track,) = index["tracks"]
    assert track["title"] == "Untitled"
    assert track["artist"] == "Unknown"
    assert track["detected_key"]["tonic_name"] == "G"


def test_sync_writes_index_and_per_track_details(tmp_path: Path) -> None:
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    public = tmp_path / "public"
    _seed_full_triple(workspace, SOURCE_SHA_A, tonic_pc=0, mode=TonalMode.MAJOR)
    _write_corpus(
        workspace,
        [
            {
                "track_id": "beatles-come-together",
                "expected_sha256": SOURCE_SHA_A,
                "annotation": {"title": "Come Together", "artist": "The Beatles"},
            }
        ],
    )

    index_path, detail_files, _ = sync_module.sync(workspace, public)

    assert index_path == public / "library" / "index.json"
    index = json.loads(index_path.read_text(encoding="utf-8"))
    assert index["track_count"] == 1

    prefix = SOURCE_SHA_A[:12]
    track_dir = public / "library" / "tracks" / prefix
    assert (track_dir / "chord-analysis-result.json").is_file()
    assert (track_dir / "beat-analysis-result.json").is_file()
    assert (track_dir / "key-analysis-result.json").is_file()
    assert len(detail_files) == 3

    # Per-track JSONs must round-trip through the frozen Pydantic contracts.
    ChordAnalysisResult.model_validate_json(
        (track_dir / "chord-analysis-result.json").read_text(encoding="utf-8")
    )
    BeatAnalysisResult.model_validate_json(
        (track_dir / "beat-analysis-result.json").read_text(encoding="utf-8")
    )
    KeyAnalysisResult.model_validate_json(
        (track_dir / "key-analysis-result.json").read_text(encoding="utf-8")
    )


def test_sync_is_idempotent(tmp_path: Path) -> None:
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    public = tmp_path / "public"
    _seed_full_triple(workspace, SOURCE_SHA_A, tonic_pc=0, mode=TonalMode.MAJOR)

    index_path, _, _ = sync_module.sync(workspace, public)
    first_bytes = index_path.read_bytes()
    first_mtime = index_path.stat().st_mtime_ns

    # A second run with unchanged inputs produces byte-identical output.
    sync_module.sync(workspace, public)
    assert index_path.read_bytes() == first_bytes
    # mtime may change (atomic rename), but content must not.
    assert index_path.stat().st_mtime_ns >= first_mtime


def test_sync_skips_incomplete_tracks(tmp_path: Path) -> None:
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    public = tmp_path / "public"
    # Only chord — no beat, no key.
    _write_stage_result(
        workspace,
        "run-lonely",
        "chord.chordmini_btc",
        "chord-lonely",
        "chord-analysis-result.json",
        _chord_result(SOURCE_SHA_A).model_dump_json(),
    )

    index_path, detail_files, _ = sync_module.sync(workspace, public)
    index = json.loads(index_path.read_text(encoding="utf-8"))
    assert index["track_count"] == 0
    assert detail_files == []
    assert not (public / "library" / "tracks" / SOURCE_SHA_A[:12]).exists()


def test_sync_copy_audio_copies_source_when_present(tmp_path: Path) -> None:
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    public = tmp_path / "public"
    _seed_full_triple(workspace, SOURCE_SHA_A, tonic_pc=0, mode=TonalMode.MAJOR)

    # Relative source paths resolve against the manifest's own directory, so
    # a corpus at workspace/corpus.local.yaml points into workspace/originals.
    audio_source = workspace / "originals" / "come-together.mp3"
    audio_source.parent.mkdir(parents=True, exist_ok=True)
    audio_source.write_bytes(b"ID3 fake mp3 bytes")

    _write_corpus(
        workspace,
        [
            {
                "track_id": "beatles-come-together",
                "source_path": "originals/come-together.mp3",
                "expected_sha256": SOURCE_SHA_A,
                "annotation": {"title": "Come Together", "artist": "The Beatles"},
            }
        ],
    )

    _, _, audio_files = sync_module.sync(workspace, public, copy_audio=True)

    prefix = SOURCE_SHA_A[:12]
    dest = public / "library" / "tracks" / prefix / "source.mp3"
    assert dest.is_file()
    assert dest.read_bytes() == b"ID3 fake mp3 bytes"
    assert audio_files == [dest]


def test_sync_copy_audio_skipped_when_flag_off(tmp_path: Path) -> None:
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    public = tmp_path / "public"
    _seed_full_triple(workspace, SOURCE_SHA_A, tonic_pc=0, mode=TonalMode.MAJOR)
    audio_source = workspace / "originals" / "come-together.mp3"
    audio_source.parent.mkdir(parents=True, exist_ok=True)
    audio_source.write_bytes(b"ID3 fake mp3 bytes")
    _write_corpus(
        workspace,
        [
            {
                "track_id": "beatles-come-together",
                "source_path": "originals/come-together.mp3",
                "expected_sha256": SOURCE_SHA_A,
            }
        ],
    )

    _, _, audio_files = sync_module.sync(workspace, public)

    prefix = SOURCE_SHA_A[:12]
    assert audio_files == []
    assert not (public / "library" / "tracks" / prefix / "source.mp3").exists()


def test_sync_copy_audio_ignores_missing_source(tmp_path: Path) -> None:
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    public = tmp_path / "public"
    _seed_full_triple(workspace, SOURCE_SHA_A, tonic_pc=0, mode=TonalMode.MAJOR)
    _write_corpus(
        workspace,
        [
            {
                "track_id": "beatles-come-together",
                "source_path": "originals/come-together.mp3",
                "expected_sha256": SOURCE_SHA_A,
            }
        ],
    )

    _, _, audio_files = sync_module.sync(workspace, public, copy_audio=True)

    assert audio_files == []


def test_sync_copy_audio_removes_stale_extension(tmp_path: Path) -> None:
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    public = tmp_path / "public"
    _seed_full_triple(workspace, SOURCE_SHA_A, tonic_pc=0, mode=TonalMode.MAJOR)

    # A previous run left a .wav in the destination; the fresh corpus points
    # at an .mp3 and we expect the .wav to be swept.
    prefix = SOURCE_SHA_A[:12]
    stale = public / "library" / "tracks" / prefix / "source.wav"
    stale.parent.mkdir(parents=True, exist_ok=True)
    stale.write_bytes(b"old wav")

    audio_source = workspace / "originals" / "come-together.mp3"
    audio_source.parent.mkdir(parents=True, exist_ok=True)
    audio_source.write_bytes(b"new mp3")
    _write_corpus(
        workspace,
        [
            {
                "track_id": "beatles-come-together",
                "source_path": "originals/come-together.mp3",
                "expected_sha256": SOURCE_SHA_A,
            }
        ],
    )

    _, _, audio_files = sync_module.sync(workspace, public, copy_audio=True)

    assert (
        public / "library" / "tracks" / prefix / "source.mp3"
    ).read_bytes() == b"new mp3"
    assert not stale.exists()
    assert len(audio_files) == 1


def _section_result(source_sha: str, duration: float = 8.0) -> SectionAnalysisResult:
    sections = (
        SectionSegment(start_seconds=0.0, end_seconds=duration / 3, label="A"),
        SectionSegment(
            start_seconds=duration / 3,
            end_seconds=2 * duration / 3,
            label="B",
        ),
        SectionSegment(
            start_seconds=2 * duration / 3,
            end_seconds=duration,
            label="A",
        ),
    )
    return SectionAnalysisResult(
        source_sha256=source_sha,
        provenance=SectionAnalyzerProvenance(
            candidate="librosa_segment",
            implementation_version="1.0.0",
            code_revision="test",
        ),
        settings=EffectiveSectionAnalyzerSettings(
            sample_rate=22050,
            hop_length=2048,
            feature="chroma_cqt",
            n_segments=7,
        ),
        source=SectionSourceFacts(
            sample_rate=44100,
            channels=2,
            frame_count=int(duration * 44100),
            duration_seconds=duration,
            peak_absolute_sample=0.5,
        ),
        sections=sections,
    )


def _seed_section(workspace: Path, source_sha: str) -> None:
    _write_stage_result(
        workspace,
        f"run-{source_sha[:6]}-sec",
        "section.librosa_segment",
        f"section-{source_sha[:6]}",
        "section-analysis-result.json",
        _section_result(source_sha).model_dump_json(),
    )


def test_sync_writes_section_json_when_present(tmp_path: Path) -> None:
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    public = tmp_path / "public"
    _seed_full_triple(workspace, SOURCE_SHA_A, tonic_pc=0, mode=TonalMode.MAJOR)
    _seed_section(workspace, SOURCE_SHA_A)

    index_path, detail_files, _ = sync_module.sync(workspace, public)

    prefix = SOURCE_SHA_A[:12]
    section_path = (
        public / "library" / "tracks" / prefix / "section-analysis-result.json"
    )
    assert section_path.is_file()
    # Round-trip through the frozen Pydantic contract.
    SectionAnalysisResult.model_validate_json(section_path.read_text(encoding="utf-8"))
    # The section file joins the existing three detail files.
    assert section_path in detail_files
    assert len(detail_files) == 4

    index = json.loads(index_path.read_text(encoding="utf-8"))
    (track,) = index["tracks"]
    assert track["has_sections"] is True
    assert track["section_count"] == 3


def test_sync_omits_section_json_when_absent(tmp_path: Path) -> None:
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    public = tmp_path / "public"
    # Full chord/beat/key triple but no section stage — track still ships.
    _seed_full_triple(workspace, SOURCE_SHA_A, tonic_pc=0, mode=TonalMode.MAJOR)

    index_path, detail_files, _ = sync_module.sync(workspace, public)

    prefix = SOURCE_SHA_A[:12]
    section_path = (
        public / "library" / "tracks" / prefix / "section-analysis-result.json"
    )
    assert not section_path.exists()
    assert len(detail_files) == 3

    index = json.loads(index_path.read_text(encoding="utf-8"))
    (track,) = index["tracks"]
    assert track["has_sections"] is False
    assert "section_count" not in track


def test_sync_skips_orphan_section_without_required_triple(tmp_path: Path) -> None:
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    public = tmp_path / "public"
    # A lone section result with no chord/beat/key — the triple guard
    # excludes the track entirely; no section JSON should be written.
    _seed_section(workspace, SOURCE_SHA_A)

    index_path, detail_files, _ = sync_module.sync(workspace, public)
    index = json.loads(index_path.read_text(encoding="utf-8"))

    assert index["track_count"] == 0
    assert detail_files == []
    assert not (public / "library" / "tracks" / SOURCE_SHA_A[:12]).exists()


def test_collect_analyses_attaches_section_when_present(tmp_path: Path) -> None:
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    _seed_full_triple(workspace, SOURCE_SHA_A, tonic_pc=0, mode=TonalMode.MAJOR)
    _seed_section(workspace, SOURCE_SHA_A)

    analyses = sync_module.collect_analyses(workspace)
    bundle = analyses[SOURCE_SHA_A]
    assert bundle.section is not None
    assert len(bundle.section.sections) == 3


def test_collect_analyses_section_absent_when_only_triple(tmp_path: Path) -> None:
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    _seed_full_triple(workspace, SOURCE_SHA_A, tonic_pc=0, mode=TonalMode.MAJOR)

    analyses = sync_module.collect_analyses(workspace)
    assert analyses[SOURCE_SHA_A].section is None


def teardown_module(_module) -> None:
    sys.modules.pop("sync_workspace_to_public", None)


class TestAtomicWritePublish:
    """Publishing while the dev server watches public/ used to lose the run.

    On Windows a process holding the destination open without
    FILE_SHARE_DELETE makes os.replace raise PermissionError. Every stage
    would succeed and the results would be discarded at the final rename.
    """

    def test_retries_a_transient_permission_error(
        self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        target = tmp_path / "out.json"
        calls = {"n": 0}
        real_replace = Path.replace

        def flaky(self: Path, other) -> Path:  # type: ignore[no-untyped-def]
            calls["n"] += 1
            if calls["n"] < 3:
                raise PermissionError(5, "Access is denied")
            return real_replace(self, other)

        monkeypatch.setattr(Path, "replace", flaky)
        monkeypatch.setattr(sync_module, "_REPLACE_BACKOFF_SECONDS", 0)

        sync_module._atomic_write_json(target, {"ok": True})

        assert json.loads(target.read_text(encoding="utf-8")) == {"ok": True}
        assert calls["n"] == 3

    def test_overwrites_in_place_when_rename_stays_denied(
        self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        # Exactly what Vite's handle on public/ does: writes allowed, the
        # delete that a rename needs is not.
        target = tmp_path / "out.json"
        target.write_text('{"stale": true}', encoding="utf-8")

        def always_denied(self: Path, other) -> Path:  # type: ignore[no-untyped-def]
            raise PermissionError(5, "Access is denied")

        monkeypatch.setattr(Path, "replace", always_denied)
        monkeypatch.setattr(sync_module, "_REPLACE_BACKOFF_SECONDS", 0)

        sync_module._atomic_write_json(target, {"fresh": True})

        assert json.loads(target.read_text(encoding="utf-8")) == {"fresh": True}
        assert [p.name for p in tmp_path.iterdir()] == ["out.json"]

    def test_raises_the_original_denial_when_nothing_works(
        self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        # A directory in the destination's place fails the in-place write too,
        # standing in for a handle that denies writes as well.
        target = tmp_path / "out.json"
        target.mkdir()

        def always_denied(self: Path, other) -> Path:  # type: ignore[no-untyped-def]
            raise PermissionError(5, "Access is denied")

        monkeypatch.setattr(Path, "replace", always_denied)
        monkeypatch.setattr(sync_module, "_REPLACE_BACKOFF_SECONDS", 0)

        with pytest.raises(OSError):
            sync_module._atomic_write_json(target, {"ok": True})

        # No .part left behind for the next run to trip over.
        assert [p.name for p in tmp_path.iterdir()] == ["out.json"]


def test_load_track_metadata_reads_uploaded_tracks(tmp_path: Path) -> None:
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    _write_intake_manifest(
        workspace,
        [
            {
                "track_id": "here-comes-your-man",
                "source_path": "originals/here-comes-your-man.mp3",
                "expected_sha256": SOURCE_SHA_A,
                "annotation": {"title": "Here Comes Your Man", "artist": "Pixies"},
            }
        ],
    )
    meta = sync_module.load_track_metadata(workspace)
    assert meta[SOURCE_SHA_A]["title"] == "Here Comes Your Man"
    assert meta[SOURCE_SHA_A]["artist"] == "Pixies"
    assert (
        meta[SOURCE_SHA_A]["source_path"]
        == (workspace / "originals" / "here-comes-your-man.mp3").resolve()
    )


def test_load_track_metadata_prefers_the_intake_row(tmp_path: Path) -> None:
    # Someone re-uploaded a corpus track and typed their own title; that is a
    # more recent, explicit statement than the corpus annotation, and only
    # display fields are at stake -- trusted_key is never read here.
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    _write_corpus(
        workspace,
        [
            {
                "track_id": "beatles-come-together",
                "expected_sha256": SOURCE_SHA_A,
                "annotation": {
                    "title": "Come Together - Remastered 2009",
                    "artist": "The Beatles",
                },
            }
        ],
    )
    _write_intake_manifest(
        workspace,
        [
            {
                "track_id": "come-together",
                "source_path": "originals/come-together.mp3",
                "expected_sha256": SOURCE_SHA_A,
                "annotation": {"title": "Come Together", "artist": "Beatles"},
            }
        ],
    )
    meta = sync_module.load_track_metadata(workspace)
    assert meta[SOURCE_SHA_A]["title"] == "Come Together"


def test_sync_copies_audio_for_an_uploaded_track(tmp_path: Path) -> None:
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    public = tmp_path / "public"
    _seed_full_triple(workspace, SOURCE_SHA_A, tonic_pc=0, mode=TonalMode.MAJOR)
    audio_source = workspace / "originals" / "here-comes-your-man.mp3"
    audio_source.parent.mkdir(parents=True, exist_ok=True)
    audio_source.write_bytes(b"ID3 uploaded bytes")
    _write_intake_manifest(
        workspace,
        [
            {
                "track_id": "here-comes-your-man",
                "source_path": "originals/here-comes-your-man.mp3",
                "expected_sha256": SOURCE_SHA_A,
                "annotation": {"title": "Here Comes Your Man", "artist": "Pixies"},
            }
        ],
    )

    index_path, _, audio_files = sync_module.sync(workspace, public, copy_audio=True)

    dest = public / "library" / "tracks" / SOURCE_SHA_A[:12] / "source.mp3"
    assert audio_files == [dest]
    assert dest.read_bytes() == b"ID3 uploaded bytes"
    (track,) = json.loads(index_path.read_text(encoding="utf-8"))["tracks"]
    assert track["title"] == "Here Comes Your Man"
    assert track["artist"] == "Pixies"


def test_sync_copy_audio_leaves_an_unchanged_file_alone(tmp_path: Path) -> None:
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    public = tmp_path / "public"
    _seed_full_triple(workspace, SOURCE_SHA_A, tonic_pc=0, mode=TonalMode.MAJOR)
    audio_source = workspace / "originals" / "come-together.mp3"
    audio_source.parent.mkdir(parents=True, exist_ok=True)
    audio_source.write_bytes(b"ID3 fake mp3 bytes")
    _write_corpus(
        workspace,
        [
            {
                "track_id": "beatles-come-together",
                "source_path": "originals/come-together.mp3",
                "expected_sha256": SOURCE_SHA_A,
                "annotation": {"title": "Come Together", "artist": "The Beatles"},
            }
        ],
    )

    sync_module.sync(workspace, public, copy_audio=True)
    dest = public / "library" / "tracks" / SOURCE_SHA_A[:12] / "source.mp3"
    untouched = dest.stat().st_mtime_ns

    _, _, audio_files = sync_module.sync(workspace, public, copy_audio=True)

    assert audio_files == [dest]
    assert dest.stat().st_mtime_ns == untouched


def test_sync_copy_audio_rewrites_a_changed_file(tmp_path: Path) -> None:
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    public = tmp_path / "public"
    _seed_full_triple(workspace, SOURCE_SHA_A, tonic_pc=0, mode=TonalMode.MAJOR)
    audio_source = workspace / "originals" / "come-together.mp3"
    audio_source.parent.mkdir(parents=True, exist_ok=True)
    audio_source.write_bytes(b"ID3 fake mp3 bytes")
    _write_corpus(
        workspace,
        [
            {
                "track_id": "beatles-come-together",
                "source_path": "originals/come-together.mp3",
                "expected_sha256": SOURCE_SHA_A,
                "annotation": {"title": "Come Together", "artist": "The Beatles"},
            }
        ],
    )
    sync_module.sync(workspace, public, copy_audio=True)

    audio_source.write_bytes(b"ID3 a different master entirely")
    sync_module.sync(workspace, public, copy_audio=True)

    dest = public / "library" / "tracks" / SOURCE_SHA_A[:12] / "source.mp3"
    assert dest.read_bytes() == b"ID3 a different master entirely"


def test_collect_analyses_prefers_the_newest_implementation_version(
    tmp_path: Path,
) -> None:
    # Both results are for the same source and both succeeded; only the
    # version separates them. Ordering by run id or cache key would publish
    # whichever string sorted last, so the cache keys here are chosen to make
    # the stale result win under that rule.
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    _seed_full_triple(workspace, SOURCE_SHA_A, tonic_pc=0, mode=TonalMode.MAJOR)
    _write_stage_result(
        workspace,
        "aaa-newer-run",
        "chord.chordmini_btc",
        "aaa-newer-chord",
        "chord-analysis-result.json",
        _chord_result(SOURCE_SHA_A, duration=12.0).model_dump_json(),
        implementation_version="1.1.0",
    )
    _write_stage_result(
        workspace,
        "zzz-older-run",
        "chord.chordmini_btc",
        "zzz-older-chord",
        "chord-analysis-result.json",
        _chord_result(SOURCE_SHA_A, duration=4.0).model_dump_json(),
        implementation_version="1.0.0",
    )

    analyses = sync_module.collect_analyses(workspace)

    assert analyses[SOURCE_SHA_A].chord.source.duration_seconds == 12.0


def test_version_key_sorts_an_unparseable_version_lowest() -> None:
    assert sync_module._version_key("1.1.0") > sync_module._version_key("1.0.0")
    assert sync_module._version_key("1.10.0") > sync_module._version_key("1.9.0")
    assert sync_module._version_key(None) < sync_module._version_key("0.0.1")
    assert sync_module._version_key("not-a-version") < sync_module._version_key("0.0.1")
