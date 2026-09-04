"""Publish analysis results from workspace/runs/ into the React app's public/library/.

Walks workspace/runs/ for succeeded chord + key + beat + BS-RoFormer stages,
groups them by ``source_sha256`` (i.e. per source track), and writes:

- ``public/library/index.json``: the top-level track list the app reads on
  boot (title, artist, duration, detected key/tempo, per-track detail URLs).
- ``public/library/tracks/<sha256_prefix>/chord-analysis-result.json``,
  ``beat-analysis-result.json``, ``key-analysis-result.json``: per-track
  analysis JSONs the app fetches on demand when a track is selected.

Design constraints for the app's benefit:

- Idempotent: rewrites the same files if inputs unchanged; per-file writes
  are atomic (staging + os.replace) so partial writes never surface.
- No stems yet — WAVs are large and their serving story deserves its own
  slice. Only the analysis JSONs (kilobyte-sized) get copied.
- Uses ``source_sha256`` as the stable directory key, prefixed to the first
  12 hex chars for shorter URLs. Collisions extremely unlikely at this
  prefix length for a personal library.
- No cloud, no upload, no backend runtime — the React app reads static
  assets served by Vite. Zero JavaScript runtime dependency.

Invocation:

    .venv\\Scripts\\python.exe scripts/sync_workspace_to_public.py \\
        --workspace workspace \\
        --public ../../public
"""

from __future__ import annotations

import argparse
import json
import shutil
import sys
from collections import defaultdict
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import yaml

from audio_library_poc.beat_analysis import BeatAnalysisResult
from audio_library_poc.chord_analysis import ChordAnalysisResult
from audio_library_poc.key_analysis import KeyAnalysisResult
from audio_library_poc.section_analysis import SectionAnalysisResult

_PITCH_CLASS_NAMES = (
    "C",
    "C#",
    "D",
    "D#",
    "E",
    "F",
    "F#",
    "G",
    "G#",
    "A",
    "A#",
    "B",
)

_STAGE_TO_ARTIFACT = {
    "chord.chordmini_btc": ("chord-analysis-result.json", ChordAnalysisResult),
    "beat.beat_this": ("beat-analysis-result.json", BeatAnalysisResult),
    "key.hpcp": ("key-analysis-result.json", KeyAnalysisResult),
    "section.librosa_segment": (
        "section-analysis-result.json",
        SectionAnalysisResult,
    ),
}

# Chord + beat + key must all be present for a track to appear in the index;
# section analysis is optional and ships alongside when it exists.
_REQUIRED_STAGES = ("chord.chordmini_btc", "beat.beat_this", "key.hpcp")


@dataclass(frozen=True)
class TrackAnalyses:
    """Analysis JSONs a track carries — chord/beat/key required, section optional."""

    source_sha256: str
    chord: ChordAnalysisResult
    beat: BeatAnalysisResult
    key: KeyAnalysisResult
    section: SectionAnalysisResult | None = None


def collect_analyses(workspace: Path) -> dict[str, TrackAnalyses]:
    """Group succeeded analysis stages by source_sha256; keep only complete triples."""

    per_source: dict[str, dict[str, Any]] = defaultdict(dict)
    runs_root = workspace / "runs"
    if not runs_root.is_dir():
        return {}
    for run_dir in sorted(runs_root.iterdir()):
        stages_root = run_dir / "stages"
        if not stages_root.is_dir():
            continue
        for stage_dir in sorted(stages_root.iterdir()):
            entry = _STAGE_TO_ARTIFACT.get(stage_dir.name)
            if entry is None:
                continue
            artifact_name, model_cls = entry
            results_dir = stage_dir / "results"
            if not results_dir.is_dir():
                continue
            for envelope_path in sorted(results_dir.glob("*.json")):
                envelope = _load_json(envelope_path)
                if envelope is None or envelope.get("status") != "succeeded":
                    continue
                cache_key = envelope.get("cache_key")
                if not cache_key:
                    continue
                artifact_path = stage_dir / "artifacts" / cache_key / artifact_name
                if not artifact_path.is_file():
                    continue
                result = _load_pydantic(artifact_path, model_cls)
                if result is None:
                    continue
                per_source[result.source_sha256][stage_dir.name] = result
    complete: dict[str, TrackAnalyses] = {}
    for source_sha256, per_stage in per_source.items():
        chord = per_stage.get("chord.chordmini_btc")
        beat = per_stage.get("beat.beat_this")
        key = per_stage.get("key.hpcp")
        if chord is None or beat is None or key is None:
            continue
        complete[source_sha256] = TrackAnalyses(
            source_sha256=source_sha256,
            chord=chord,
            beat=beat,
            key=key,
            section=per_stage.get("section.librosa_segment"),
        )
    return complete


def load_corpus_titles(workspace: Path) -> dict[str, dict[str, Any]]:
    """Return per-source_sha256 metadata pulled from the corpus manifest.

    Missing corpus → empty dict; the app just gets less friendly display.
    """

    manifest_path = workspace / "corpus.local.yaml"
    if not manifest_path.is_file():
        return {}
    raw = yaml.safe_load(manifest_path.read_text(encoding="utf-8"))
    entries: dict[str, dict[str, Any]] = {}
    for track in raw.get("tracks", []):
        sha256 = str(track.get("expected_sha256", ""))
        if not sha256:
            continue
        annotation = track.get("annotation") or {}
        entries[sha256] = {
            "title": annotation.get("title"),
            "artist": annotation.get("artist"),
            "track_id": track.get("track_id"),
        }
    return entries


def build_index(
    analyses: dict[str, TrackAnalyses],
    corpus_meta: dict[str, dict[str, Any]],
    *,
    generated_at: datetime | None = None,
) -> dict[str, Any]:
    stamp = (generated_at or datetime.now(UTC)).isoformat(timespec="seconds")
    tracks: list[dict[str, Any]] = []
    for sha256, bundle in sorted(analyses.items()):
        meta = corpus_meta.get(sha256, {})
        top = bundle.key.top_estimate
        entry: dict[str, Any] = {
            "source_sha256": sha256,
            "sha256_prefix": sha256[:12],
            "title": meta.get("title") or "Untitled",
            "artist": meta.get("artist") or "Unknown",
            "duration_seconds": bundle.chord.source.duration_seconds,
            "detected_key": {
                "tonic_pc": top.tonic_pc,
                "tonic_name": _PITCH_CLASS_NAMES[top.tonic_pc],
                "mode": top.mode.value,
                "confidence_score": top.score,
            },
            "detected_tempo_bpm": bundle.beat.tempo_median_bpm,
            "beat_count": len(bundle.beat.beats),
            "downbeat_count": bundle.beat.downbeat_count,
            "chord_segment_count": len(bundle.chord.segments),
            "has_sections": bundle.section is not None,
            "detail_directory": f"tracks/{sha256[:12]}",
        }
        if bundle.section is not None:
            entry["section_count"] = len(bundle.section.sections)
        tracks.append(entry)
    return {
        "schema_version": "1.0.0",
        "generated_at": stamp,
        "track_count": len(tracks),
        "tracks": tracks,
    }


def sync(
    workspace: Path,
    public: Path,
    *,
    generated_at: datetime | None = None,
) -> tuple[Path, list[Path]]:
    """Write the library manifest + per-track detail files. Returns (index, details)."""

    analyses = collect_analyses(workspace)
    corpus_meta = load_corpus_titles(workspace)
    index_payload = build_index(analyses, corpus_meta, generated_at=generated_at)

    library_root = public / "library"
    tracks_root = library_root / "tracks"
    library_root.mkdir(parents=True, exist_ok=True)
    tracks_root.mkdir(parents=True, exist_ok=True)

    detail_files: list[Path] = []
    for sha256, bundle in analyses.items():
        prefix = sha256[:12]
        track_dir = tracks_root / prefix
        track_dir.mkdir(parents=True, exist_ok=True)
        detail_files.append(
            _atomic_write_json(
                track_dir / "chord-analysis-result.json",
                bundle.chord.model_dump(mode="json"),
            )
        )
        detail_files.append(
            _atomic_write_json(
                track_dir / "beat-analysis-result.json",
                bundle.beat.model_dump(mode="json"),
            )
        )
        detail_files.append(
            _atomic_write_json(
                track_dir / "key-analysis-result.json",
                bundle.key.model_dump(mode="json"),
            )
        )
        if bundle.section is not None:
            detail_files.append(
                _atomic_write_json(
                    track_dir / "section-analysis-result.json",
                    bundle.section.model_dump(mode="json"),
                )
            )
    index_path = _atomic_write_json(library_root / "index.json", index_payload)
    return index_path, detail_files


def _load_json(path: Path) -> dict | None:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None


def _load_pydantic(path: Path, model_cls):
    try:
        return model_cls.model_validate_json(path.read_text(encoding="utf-8"))
    except Exception:  # noqa: BLE001
        return None


def _atomic_write_json(path: Path, payload: Any) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    staging = path.with_suffix(path.suffix + ".part")
    staging.write_text(
        json.dumps(payload, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    staging.replace(path)
    return path


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="sync_workspace_to_public",
        description=(
            "Publish audio-library-poc analysis results into the React app's "
            "public/library/ for the Biblioteca module to read."
        ),
    )
    parser.add_argument("--workspace", required=True, type=Path)
    parser.add_argument(
        "--public",
        required=True,
        type=Path,
        help="Path to the React app's public/ directory.",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    index_path, detail_files = sync(args.workspace, args.public)
    summary = {
        "command": "sync-workspace-to-public",
        "index_path": str(index_path),
        "track_detail_files": len(detail_files),
        "ok": True,
    }
    sys.stdout.write(json.dumps(summary, indent=2, sort_keys=True))
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
