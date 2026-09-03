"""Score every Phase 3 chord + key run against ground-truth annotations.

Reads ``workspace/annotations/annotations.local.yaml`` for the mapping
from audio source_sha256 → reference .lab file(s), walks the analysis
results under ``workspace/runs/``, and emits a Markdown report of
mir_eval-standard scores per (track, candidate).

Standard library + mir_eval + yaml (already in the [inference] extras).

Invocation:

    .venv\\Scripts\\python.exe scripts/phase3_evaluation_report.py \\
        --workspace workspace \\
        --out workspace/reports/phase3_evaluation.md
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import defaultdict
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import yaml

from audio_library_poc.chord_analysis import ChordAnalysisResult
from audio_library_poc.chord_evaluation import (
    chord_result_to_estimate,
    load_reference_lab,
)
from audio_library_poc.chord_evaluation import (
    evaluate as evaluate_chord,
)
from audio_library_poc.key_analysis import KeyAnalysisResult
from audio_library_poc.key_evaluation import (
    evaluate as evaluate_key,
)
from audio_library_poc.key_evaluation import (
    load_reference_key,
)

_CHORD_STAGE_KINDS = ("chord.chordmini_btc",)
_KEY_STAGE_KINDS = ("key.hpcp", "key.chord_root_profile")


@dataclass(frozen=True)
class AnnotationEntry:
    source_sha256: str
    title: str
    reference: str
    chord_lab: Path | None
    key_lab: Path | None


def load_annotations(workspace: Path) -> list[AnnotationEntry]:
    manifest_path = workspace / "annotations" / "annotations.local.yaml"
    if not manifest_path.is_file():
        return []
    raw = yaml.safe_load(manifest_path.read_text(encoding="utf-8"))
    entries: list[AnnotationEntry] = []
    for entry in raw.get("annotations", []):
        chord_lab = entry.get("chord_lab")
        key_lab = entry.get("key_lab")
        entries.append(
            AnnotationEntry(
                source_sha256=str(entry["source_sha256"]),
                title=str(entry.get("title", entry["source_sha256"][:12])),
                reference=str(entry.get("reference", "unknown")),
                chord_lab=(workspace / "annotations" / chord_lab)
                if chord_lab
                else None,
                key_lab=(workspace / "annotations" / key_lab) if key_lab else None,
            )
        )
    return entries


def collect_results(
    workspace: Path,
) -> tuple[
    dict[str, list[tuple[str, ChordAnalysisResult]]],
    dict[str, list[tuple[str, KeyAnalysisResult]]],
]:
    """Group succeeded chord + key stage results by source_sha256."""

    chord_by_source: dict[str, list[tuple[str, ChordAnalysisResult]]] = defaultdict(
        list
    )
    key_by_source: dict[str, list[tuple[str, KeyAnalysisResult]]] = defaultdict(list)
    runs_root = workspace / "runs"
    if not runs_root.is_dir():
        return chord_by_source, key_by_source
    for run_dir in sorted(runs_root.iterdir()):
        stages_root = run_dir / "stages"
        if not stages_root.is_dir():
            continue
        for stage_dir in sorted(stages_root.iterdir()):
            kind = stage_dir.name
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
                if kind in _CHORD_STAGE_KINDS:
                    art = (
                        stage_dir
                        / "artifacts"
                        / cache_key
                        / "chord-analysis-result.json"
                    )
                    result = _load_pydantic(art, ChordAnalysisResult)
                    if result is not None:
                        chord_by_source[result.source_sha256].append((kind, result))
                elif kind in _KEY_STAGE_KINDS:
                    art = (
                        stage_dir / "artifacts" / cache_key / "key-analysis-result.json"
                    )
                    result = _load_pydantic(art, KeyAnalysisResult)
                    if result is not None:
                        key_by_source[result.source_sha256].append((kind, result))
    return chord_by_source, key_by_source


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


def render_report(
    annotations: list[AnnotationEntry],
    chord_by_source: dict[str, list[tuple[str, ChordAnalysisResult]]],
    key_by_source: dict[str, list[tuple[str, KeyAnalysisResult]]],
    *,
    generated_at: datetime | None = None,
) -> str:
    stamp = (generated_at or datetime.now(UTC)).isoformat(timespec="seconds")
    lines: list[str] = [
        "# Phase 3 evaluation report",
        "",
        f"Generated: {stamp}",
        f"Annotated tracks: {len(annotations)}",
        "",
    ]

    if not annotations:
        lines.append(
            "No entries in `workspace/annotations/annotations.local.yaml`. "
            "Add at least one track with a chord and/or key ground-truth "
            "label to generate scores.\n"
        )
        return "\n".join(lines) + "\n"

    for ann in annotations:
        _render_annotation(lines, ann, chord_by_source, key_by_source)

    _render_aggregate(lines, annotations, chord_by_source, key_by_source)
    return "\n".join(lines) + "\n"


def _render_annotation(
    lines: list[str],
    ann: AnnotationEntry,
    chord_by_source: dict[str, list[tuple[str, ChordAnalysisResult]]],
    key_by_source: dict[str, list[tuple[str, KeyAnalysisResult]]],
) -> None:
    lines.append(f"### {ann.title}")
    lines.append("")
    lines.append(
        f"Reference: {ann.reference}. source_sha256 `{ann.source_sha256[:12]}…`."
    )
    lines.append("")

    if ann.chord_lab is not None and ann.chord_lab.is_file():
        ref_intervals, ref_labels = load_reference_lab(ann.chord_lab)
        chord_results = chord_by_source.get(ann.source_sha256, [])
        if not chord_results:
            lines.append("Chord: no candidate results on disk.")
        else:
            lines.append("**Chord metrics** (mir_eval, weighted 0-1):")
            lines.append("")
            lines.append(
                "| Candidate | root | majmin | majmin_inv | thirds | triads | "
                "sevenths | mirex | segments (ref → est) |"
            )
            lines.append("|---|---:|---:|---:|---:|---:|---:|---:|:---:|")
            for candidate_id, result in chord_results:
                est_intervals, est_labels = chord_result_to_estimate(result)
                scores = evaluate_chord(
                    ref_intervals,
                    ref_labels,
                    est_intervals,
                    est_labels,
                    reference_label=ann.reference,
                    candidate_id=candidate_id,
                )
                cells = " | ".join(
                    f"{scores.scores.get(name, 0.0):.3f}"
                    for name in (
                        "root",
                        "majmin",
                        "majmin_inv",
                        "thirds",
                        "triads",
                        "sevenths",
                        "mirex",
                    )
                )
                lines.append(
                    f"| {candidate_id} | {cells} | "
                    f"{scores.reference_segment_count} → "
                    f"{scores.estimate_segment_count} |"
                )
            lines.append("")
    else:
        lines.append("No chord reference on disk.")
        lines.append("")

    if ann.key_lab is not None and ann.key_lab.is_file():
        ref_label, ref_duration = load_reference_key(ann.key_lab)
        key_results = key_by_source.get(ann.source_sha256, [])
        if not key_results:
            lines.append("Key: no candidate results on disk.")
        else:
            lines.append(
                f"**Key metric** (mir_eval, weighted score 0-1). "
                f"Reference: `{ref_label}` ({ref_duration:.1f} s)."
            )
            lines.append("")
            lines.append("| Candidate | Top | Score |")
            lines.append("|---|:---:|---:|")
            for candidate_id, result in key_results:
                score = evaluate_key(
                    ref_label,
                    ref_duration,
                    result,
                    candidate_id=candidate_id,
                )
                lines.append(
                    f"| {candidate_id} | {score.top_label} | {score.score:.3f} |"
                )
            lines.append("")
    else:
        lines.append("No key reference on disk.")
        lines.append("")


def _render_aggregate(
    lines: list[str],
    annotations: list[AnnotationEntry],
    chord_by_source: dict[str, list[tuple[str, ChordAnalysisResult]]],
    key_by_source: dict[str, list[tuple[str, KeyAnalysisResult]]],
) -> None:
    # Only meaningful when we have more than one annotated track.
    if len(annotations) < 2:
        return
    lines.append("### Aggregate (mean across annotated tracks)")
    lines.append("")

    chord_agg: dict[str, dict[str, list[float]]] = defaultdict(
        lambda: defaultdict(list)
    )
    for ann in annotations:
        if ann.chord_lab is None or not ann.chord_lab.is_file():
            continue
        ref_intervals, ref_labels = load_reference_lab(ann.chord_lab)
        for candidate_id, result in chord_by_source.get(ann.source_sha256, []):
            est_intervals, est_labels = chord_result_to_estimate(result)
            scores = evaluate_chord(
                ref_intervals,
                ref_labels,
                est_intervals,
                est_labels,
                reference_label=ann.reference,
                candidate_id=candidate_id,
            )
            for name, value in scores.scores.items():
                chord_agg[candidate_id][name].append(value)

    if chord_agg:
        lines.append("Chord means:")
        lines.append("")
        metric_names = sorted({m for d in chord_agg.values() for m in d})
        header = "| Candidate | " + " | ".join(metric_names) + " |"
        rule = "|---|" + "|".join("---:" for _ in metric_names) + "|"
        lines.append(header)
        lines.append(rule)
        for candidate_id, per_metric in chord_agg.items():
            cells: list[str] = []
            for m in metric_names:
                values = per_metric.get(m, [0])
                mean = sum(values) / max(1, len(values))
                cells.append(f"{mean:.3f}")
            lines.append(f"| {candidate_id} | {' | '.join(cells)} |")
        lines.append("")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="phase3_evaluation_report",
        description="Score Phase 3 chord + key runs against ground truth.",
    )
    parser.add_argument("--workspace", required=True, type=Path)
    parser.add_argument("--out", type=Path, default=None)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    annotations = load_annotations(args.workspace)
    chord_by_source, key_by_source = collect_results(args.workspace)
    report = render_report(annotations, chord_by_source, key_by_source)
    if args.out is not None:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(report, encoding="utf-8")
    else:
        sys.stdout.write(report)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())


# Silence unused-import lint noise: Any is re-exported for callers.
_ = Any
