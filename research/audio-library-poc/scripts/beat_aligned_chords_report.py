"""Render a Markdown report of beat-aligned chord progressions.

Walks workspace/runs/ for every source that has all three Phase 3
outputs on disk — a succeeded ``beat.beat_this`` stage, a succeeded
``chord.chordmini_btc`` stage, and a succeeded ``key.hpcp`` stage — and
emits one section per track showing the beat-aligned progression with
Roman-numeral degrees relative to the detected key.

Standard library + the pydantic contracts we already have, so no new
runtime dep.

Invocation:

    .venv\\Scripts\\python.exe scripts/beat_aligned_chords_report.py \\
        --workspace workspace \\
        --out workspace/reports/beat_aligned_chords.md \\
        --min-beat-span 4
"""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from audio_library_poc.beat_aligned_chords import (
    AlignedChordRegion,
    align_chords_to_beats,
    collapse_short_regions,
)
from audio_library_poc.beat_analysis import BeatAnalysisResult
from audio_library_poc.chord_analysis import ChordAnalysisResult
from audio_library_poc.key_analysis import KeyAnalysisResult

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

_STAGE_KIND_TO_ARTIFACT = {
    "beat.beat_this": "beat-analysis-result.json",
    "chord.chordmini_btc": "chord-analysis-result.json",
    "key.hpcp": "key-analysis-result.json",
}


@dataclass(frozen=True)
class TrackBundle:
    """The three results a track needs before it can be aligned."""

    source_sha256: str
    run_ids: dict[str, str]  # stage_kind -> run_id
    beats: BeatAnalysisResult
    chords: ChordAnalysisResult
    key: KeyAnalysisResult


def collect_bundles(workspace: Path) -> list[TrackBundle]:
    """Group succeeded runs by source_sha256; keep only fully-covered triples."""

    per_source: dict[str, dict[str, tuple[str, Any]]] = {}
    runs_root = workspace / "runs"
    if not runs_root.is_dir():
        return []
    for run_dir in sorted(runs_root.iterdir()):
        if not run_dir.is_dir():
            continue
        stages_root = run_dir / "stages"
        if not stages_root.is_dir():
            continue
        for stage_dir in sorted(stages_root.iterdir()):
            stage_kind = stage_dir.name
            artifact_name = _STAGE_KIND_TO_ARTIFACT.get(stage_kind)
            if artifact_name is None:
                continue
            results_dir = stage_dir / "results"
            if not results_dir.is_dir():
                continue
            for envelope_path in sorted(results_dir.glob("*.json")):
                try:
                    envelope = json.loads(envelope_path.read_text(encoding="utf-8"))
                except (OSError, json.JSONDecodeError):
                    continue
                if envelope.get("status") != "succeeded":
                    continue
                cache_key = envelope.get("cache_key")
                if not cache_key:
                    continue
                artifact_path = stage_dir / "artifacts" / cache_key / artifact_name
                if not artifact_path.is_file():
                    continue
                result = _load_result(stage_kind, artifact_path)
                if result is None:
                    continue
                bucket = per_source.setdefault(result.source_sha256, {})
                bucket[stage_kind] = (run_dir.name, result)

    bundles: list[TrackBundle] = []
    for source_sha256, per_stage in per_source.items():
        if (
            not {"beat.beat_this", "chord.chordmini_btc", "key.hpcp"}
            <= per_stage.keys()
        ):
            continue
        bundles.append(
            TrackBundle(
                source_sha256=source_sha256,
                run_ids={kind: run_id for kind, (run_id, _) in per_stage.items()},
                beats=per_stage["beat.beat_this"][1],
                chords=per_stage["chord.chordmini_btc"][1],
                key=per_stage["key.hpcp"][1],
            )
        )
    bundles.sort(key=lambda bundle: bundle.source_sha256)
    return bundles


def render_report(
    bundles: list[TrackBundle],
    *,
    min_beat_span: int = 1,
    generated_at: datetime | None = None,
) -> str:
    stamp = (generated_at or datetime.now(UTC)).isoformat(timespec="seconds")
    if not bundles:
        return (
            "# Beat-aligned chord report\n\n"
            f"Generated: {stamp}\n\n"
            "No source has all three of beat.beat_this + chord.chordmini_btc + "
            "key.hpcp succeeded under workspace/runs/.\n"
        )
    lines: list[str] = [
        "# Beat-aligned chord report",
        "",
        f"Generated: {stamp}",
        f"Bundles: {len(bundles)}  (min_beat_span={min_beat_span})",
        "",
    ]
    for bundle in bundles:
        regions = align_chords_to_beats(bundle.chords, bundle.beats, bundle.key)
        if min_beat_span > 1:
            regions = collapse_short_regions(regions, min_beat_span=min_beat_span)
        _render_bundle(lines, bundle, regions)
    return "\n".join(lines) + "\n"


def _render_bundle(
    lines: list[str],
    bundle: TrackBundle,
    regions: list[AlignedChordRegion],
) -> None:
    top_key = bundle.key.top_estimate
    key_label = f"{_PITCH_CLASS_NAMES[top_key.tonic_pc]} {top_key.mode.value}"
    run_id = bundle.run_ids.get("chord.chordmini_btc") or bundle.source_sha256[:12]
    lines.append(f"### `{run_id}`  (source_sha256 `{bundle.source_sha256[:12]}…`)")
    lines.append("")
    lines.append(
        f"Detected key: **{key_label}** "
        f"(score={top_key.score:.3f}, {len(bundle.beats.beats)} beats, "
        f"{bundle.chords.settings.frame_duration_seconds:.4f}s/frame)"
    )
    lines.append("")
    lines.append("| Beat range | Beats | Time (s) | Chord | Rel. root | Numeral |")
    lines.append("|---:|---:|:---|:---:|---:|:---:|")
    for region in regions:
        beat_range = f"{region.start_beat_index}-{region.end_beat_index}"
        time_range = (
            f"{region.snapped_start_seconds:6.2f}-{region.snapped_end_seconds:6.2f}"
        )
        rel_root = (
            "-" if region.relative_root_pc is None else f"+{region.relative_root_pc}"
        )
        numeral = region.roman_numeral or "-"
        lines.append(
            f"| {beat_range} "
            f"| {region.beat_span} "
            f"| {time_range} "
            f"| {region.chord_display} "
            f"| {rel_root} "
            f"| {numeral} |"
        )
    lines.append("")


def _load_result(stage_kind: str, path: Path) -> Any | None:
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    try:
        if stage_kind == "beat.beat_this":
            return BeatAnalysisResult.model_validate(raw)
        if stage_kind == "chord.chordmini_btc":
            return ChordAnalysisResult.model_validate(raw)
        if stage_kind == "key.hpcp":
            return KeyAnalysisResult.model_validate(raw)
    except Exception:  # noqa: BLE001
        return None
    return None


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="beat_aligned_chords_report",
        description=(
            "Render a Markdown report of beat-aligned chord progressions "
            "from workspace/runs/."
        ),
    )
    parser.add_argument("--workspace", required=True, type=Path)
    parser.add_argument(
        "--out",
        type=Path,
        default=None,
        help="Write to this path instead of stdout.",
    )
    parser.add_argument(
        "--min-beat-span",
        type=int,
        default=1,
        help=(
            "Absorb regions shorter than this many beats into the previous "
            "region. 4 is a reasonable bar-level view."
        ),
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    bundles = collect_bundles(args.workspace)
    report = render_report(bundles, min_beat_span=max(1, args.min_beat_span))
    if args.out is not None:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(report, encoding="utf-8")
    else:
        sys.stdout.write(report)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
