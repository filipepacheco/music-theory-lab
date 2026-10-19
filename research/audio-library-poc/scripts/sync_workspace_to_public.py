from __future__ import annotations

import argparse
import json
import shutil
import sys
import time
from collections import defaultdict
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import yaml

from audio_library_poc.beat_analysis import BeatAnalysisResult
from audio_library_poc.beat_input_quality import BeatInputQualityDecision
from audio_library_poc.chord_analysis import ChordAnalysisResult
from audio_library_poc.key_analysis import KeyAnalysisResult
from audio_library_poc.manifest import resolve_source_path
from audio_library_poc.metadata import hash_file
from audio_library_poc.section_analysis import SectionAnalysisResult
from audio_library_poc.structural_segmentation import (
    SectionDecision,
    StructuralSegmentationResult,
)
from audio_library_poc.track_intake import INTAKE_TRACKS_MANIFEST

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
    "quality.beat_input": (
        "beat-input-quality-decision.json",
        BeatInputQualityDecision,
    ),
    "key.hpcp": ("key-analysis-result.json", KeyAnalysisResult),
    "section.librosa_segment": (
        "section-analysis-result.json",
        SectionAnalysisResult,
    ),
    "section.mcfee_ellis_laplacian": (
        "structural-segmentation-result.json",
        StructuralSegmentationResult,
    ),
}

_REQUIRED_STAGES = ("chord.chordmini_btc", "beat.beat_this", "key.hpcp")


@dataclass(frozen=True)
class TrackAnalyses:
    source_sha256: str
    chord: ChordAnalysisResult
    beat: BeatAnalysisResult
    key: KeyAnalysisResult
    beat_quality: BeatInputQualityDecision | None = None
    beat_quality_sha256: str | None = None
    section: SectionAnalysisResult | None = None
    structural_segmentation: StructuralSegmentationResult | None = None


def _version_key(value: Any) -> tuple[int, ...]:

    try:
        return tuple(int(part) for part in str(value or "").split("."))
    except ValueError:
        return ()


def collect_analyses(workspace: Path) -> dict[str, TrackAnalyses]:

    per_source: dict[str, dict[str, tuple[tuple[int, ...], Any, str]]] = defaultdict(
        dict
    )
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
                version = _version_key(
                    (envelope.get("identity") or {}).get("implementation_version")
                )
                previous = per_source[result.source_sha256].get(stage_dir.name)
                if previous is None or version >= previous[0]:
                    per_source[result.source_sha256][stage_dir.name] = (
                        version,
                        result,
                        hash_file(artifact_path),
                    )
    complete: dict[str, TrackAnalyses] = {}
    for source_sha256, versioned in per_source.items():
        per_stage = {kind: result for kind, (_, result, _) in versioned.items()}
        chord = per_stage.get("chord.chordmini_btc")
        beat = per_stage.get("beat.beat_this")
        key = per_stage.get("key.hpcp")
        if chord is None or beat is None or key is None:
            continue
        quality = per_stage.get("quality.beat_input")
        if quality is not None and not _quality_matches_beat(
            quality, beat, versioned["beat.beat_this"][2]
        ):
            quality = None
        complete[source_sha256] = TrackAnalyses(
            source_sha256=source_sha256,
            chord=chord,
            beat=beat,
            key=key,
            beat_quality=quality,
            beat_quality_sha256=(
                versioned["quality.beat_input"][2] if quality is not None else None
            ),
            section=per_stage.get("section.librosa_segment"),
            structural_segmentation=per_stage.get("section.mcfee_ellis_laplacian"),
        )
    return complete


def _quality_matches_beat(
    quality: BeatInputQualityDecision,
    beat: BeatAnalysisResult,
    beat_artifact_sha256: str,
) -> bool:
    identity = quality.beat_result_identity
    provenance = beat.provenance
    return (
        quality.source_sha256 == beat.source_sha256
        and identity.result_sha256 == beat_artifact_sha256
        and identity.analyzer_candidate == provenance.candidate
        and identity.analyzer_implementation_version
        == provenance.implementation_version
        and identity.model_identifier == provenance.model_identifier
        and identity.model_sha256 == provenance.model_sha256
        and identity.code_revision == provenance.code_revision
    )


_METADATA_MANIFESTS = ("corpus.local.yaml", INTAKE_TRACKS_MANIFEST)


def load_track_metadata(workspace: Path) -> dict[str, dict[str, Any]]:

    entries: dict[str, dict[str, Any]] = {}
    for name in _METADATA_MANIFESTS:
        manifest_path = workspace / name
        if not manifest_path.is_file():
            continue
        raw = yaml.safe_load(manifest_path.read_text(encoding="utf-8")) or {}
        for track in raw.get("tracks", []) or []:
            sha256 = str(track.get("expected_sha256", ""))
            if not sha256:
                continue
            annotation = track.get("annotation") or {}
            source_path = track.get("source_path")
            entries[sha256] = {
                "title": annotation.get("title"),
                "artist": annotation.get("artist"),
                "track_id": track.get("track_id"),
                "source_path": (
                    resolve_source_path(manifest_path, source_path)
                    if source_path
                    else None
                ),
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
            "has_sections": True,
            "section_origin": _section_origin(bundle),
            "review_required": _section_origin(bundle) == "fallback",
            "detail_directory": f"tracks/{sha256[:12]}",
        }
        entry["section_count"] = len(_section_export(bundle)["sections"])
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
    copy_audio: bool = False,
) -> tuple[Path, list[Path], list[Path]]:

    analyses = collect_analyses(workspace)
    track_meta = load_track_metadata(workspace)
    index_payload = build_index(analyses, track_meta, generated_at=generated_at)

    library_root = public / "library"
    tracks_root = library_root / "tracks"
    library_root.mkdir(parents=True, exist_ok=True)
    tracks_root.mkdir(parents=True, exist_ok=True)

    detail_files: list[Path] = []
    audio_files: list[Path] = []
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
        if bundle.beat_quality is not None:
            detail_files.append(
                _atomic_write_json(
                    track_dir / "beat-input-quality-decision.json",
                    bundle.beat_quality.model_dump(mode="json"),
                )
            )
        detail_files.append(
            _atomic_write_json(
                track_dir / "section-analysis-result.json",
                _section_export(bundle),
            )
        )
        if copy_audio:
            audio_path = _copy_audio_source(track_meta.get(sha256, {}), track_dir)
            if audio_path is not None:
                audio_files.append(audio_path)
    index_path = _atomic_write_json(library_root / "index.json", index_payload)
    return index_path, detail_files, audio_files


def _section_origin(bundle: TrackAnalyses) -> str:
    if bundle.structural_segmentation is not None:
        structural = _eligible_structural_result(bundle)
        if structural is not None and structural.decision is SectionDecision.ACCEPTED:
            return "automatic"
        return "fallback"
    return "automatic" if _eligible_legacy_result(bundle) is not None else "fallback"


def _eligible_structural_result(
    bundle: TrackAnalyses,
) -> StructuralSegmentationResult | None:
    structural = bundle.structural_segmentation
    quality = bundle.beat_quality
    if (
        structural is None
        or quality is None
        or not quality.publication_allowed
        or structural.beat_result_sha256 != quality.beat_result_identity.result_sha256
        or structural.beat_quality_decision_sha256 != bundle.beat_quality_sha256
    ):
        return None
    return structural


def _eligible_legacy_result(bundle: TrackAnalyses) -> SectionAnalysisResult | None:
    section = bundle.section
    quality = bundle.beat_quality
    if (
        section is None
        or quality is None
        or not quality.publication_allowed
        or section.beat_result_sha256 != quality.beat_result_identity.result_sha256
        or section.beat_quality_decision_sha256 != bundle.beat_quality_sha256
    ):
        return None
    return section


def _section_export(bundle: TrackAnalyses) -> dict[str, Any]:
    structural = _eligible_structural_result(bundle)
    quality = bundle.beat_quality
    if structural is not None:
        payload = structural.model_dump(mode="json")
        payload.update(
            {
                "origin": (
                    "automatic"
                    if structural.decision is SectionDecision.ACCEPTED
                    else "fallback"
                ),
                "review_required": structural.decision is SectionDecision.FALLBACK,
                "fallback_reason_codes": [
                    str(reason) for reason in structural.reason_codes
                ],
                "settings": structural.resolved_parameters.model_dump(mode="json"),
            }
        )
        return payload
    legacy = _eligible_legacy_result(bundle)
    if bundle.structural_segmentation is None and legacy is not None:
        payload = legacy.model_dump(mode="json")
        payload.update(
            {
                "origin": "automatic",
                "review_required": False,
                "fallback_reason_codes": [],
            }
        )
        return payload

    if quality is not None and quality.fatal_reason_codes:
        reasons = [str(reason) for reason in quality.fatal_reason_codes]
    elif quality is not None and quality.publication_allowed:
        reasons = ["section.analysis_unavailable"]
    else:
        reasons = ["beat.gate_uncalibrated"]
    duration = bundle.chord.source.duration_seconds
    return {
        "schema_version": "1.0.0",
        "source_sha256": bundle.source_sha256,
        "origin": "fallback",
        "review_required": True,
        "fallback_reason_codes": reasons,
        "sections": [
            {
                "start_seconds": 0.0,
                "end_seconds": duration,
                "label": "Parte 1",
            }
        ],
        "settings": None,
        "warnings": [],
    }


def _copy_audio_source(
    meta: dict[str, Any],
    track_dir: Path,
) -> Path | None:

    source_path = meta.get("source_path")
    if source_path is None or not source_path.is_file():
        return None
    ext = source_path.suffix.lower() or ".bin"
    destination = track_dir / f"source{ext}"
    for existing in track_dir.glob("source.*"):
        if existing != destination:
            existing.unlink()
    if _same_file_contents(source_path, destination):
        return destination
    staging = destination.with_suffix(destination.suffix + ".part")
    shutil.copyfile(source_path, staging)
    _replace_with_retry(staging, destination)
    return destination


def _same_file_contents(source: Path, destination: Path) -> bool:

    if not destination.is_file():
        return False
    if source.stat().st_size != destination.stat().st_size:
        return False
    return hash_file(source) == hash_file(destination)


def _load_json(path: Path) -> dict | None:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None


def _load_pydantic(path: Path, model_cls):
    try:
        return model_cls.model_validate_json(path.read_text(encoding="utf-8"))
    except Exception:
        return None


#: How long to keep retrying a replace Windows refuses, and how long to wait
#: between tries. Long enough to outlast a watcher's or scanner's open handle,
#: short enough not to hang a publish on a genuinely locked file.
_REPLACE_ATTEMPTS = 10
_REPLACE_BACKOFF_SECONDS = 0.1


def _atomic_write_json(path: Path, payload: Any) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    staging = path.with_suffix(path.suffix + ".part")
    staging.write_text(
        json.dumps(payload, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    _replace_with_retry(staging, path)
    return path


def _replace_with_retry(staging: Path, path: Path) -> None:

    denied: PermissionError | None = None
    for attempt in range(_REPLACE_ATTEMPTS):
        try:
            staging.replace(path)
            return
        except PermissionError as exc:
            denied = exc
            if attempt < _REPLACE_ATTEMPTS - 1:
                time.sleep(_REPLACE_BACKOFF_SECONDS)

    try:
        with open(path, "wb") as handle:
            handle.write(staging.read_bytes())
    except OSError:
        staging.unlink(missing_ok=True)
        if denied is not None:
            raise denied from None
        raise
    staging.unlink(missing_ok=True)


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
    parser.add_argument(
        "--copy-audio",
        action="store_true",
        help=(
            "Also copy each corpus track's source_path into "
            "public/library/tracks/<prefix>/source<ext>. The destination is "
            "gitignored so copyrighted audio stays out of the repo."
        ),
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    index_path, detail_files, audio_files = sync(
        args.workspace, args.public, copy_audio=args.copy_audio
    )
    summary = {
        "command": "sync-workspace-to-public",
        "index_path": str(index_path),
        "track_detail_files": len(detail_files),
        "audio_files": len(audio_files),
        "ok": True,
    }
    sys.stdout.write(json.dumps(summary, indent=2, sort_keys=True))
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
