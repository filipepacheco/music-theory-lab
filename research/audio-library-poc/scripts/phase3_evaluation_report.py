"""Render raw harmony diagnostics from one frozen evaluation manifest.

This intentionally does not discover directories or select a "latest" result.
It verifies every selected envelope and artifact before scoring. Product-output
metrics belong to Phase 2 and are not calculated here.
"""

from __future__ import annotations

import argparse
import sys
from collections import defaultdict
from datetime import UTC, datetime
from pathlib import Path

import numpy as np

from audio_library_poc.chord_analysis import ChordAnalysisResult
from audio_library_poc.chord_evaluation import chord_result_to_estimate
from audio_library_poc.chord_evaluation import evaluate as evaluate_chord
from audio_library_poc.evaluation_manifest import (
    AnnotationKind,
    EvaluationDisposition,
    EvaluationManifest,
    EvaluationSplit,
    ResolvedAnnotation,
    ResolvedArtifact,
    load_evaluation_manifest,
    resolve_manifest_annotations,
    resolve_manifest_artifacts,
)
from audio_library_poc.key_analysis import KeyAnalysisResult
from audio_library_poc.key_evaluation import evaluate as evaluate_key


def render_report(
    manifest: EvaluationManifest,
    artifacts: tuple[ResolvedArtifact, ...],
    annotations: tuple[ResolvedAnnotation, ...],
    *,
    split: EvaluationSplit | None = None,
    generated_at: datetime | None = None,
) -> str:
    """Render selected raw-model diagnostics without changing selection."""

    stamp = (generated_at or datetime.now(UTC)).isoformat(timespec="seconds")
    tracks = [
        track for track in manifest.tracks if split is None or track.split is split
    ]
    selected_ids = {track.recording_id for track in tracks}
    lines = [
        "# Frozen harmony evaluation report",
        "",
        f"Generated: {stamp}",
        f"Manifest: `{manifest.manifest_id}` (schema {manifest.schema_version})",
        "Selection: explicit successful envelopes and hash-verified artifacts.",
        "Metrics: historical raw candidate labels only; no product acceptance metrics.",
        f"Split: {split.value if split else 'all frozen recordings'}",
        "",
    ]
    by_track_kind: dict[tuple[str, AnnotationKind], list[ResolvedArtifact]] = (
        defaultdict(list)
    )
    for artifact in artifacts:
        if artifact.track.recording_id in selected_ids:
            kind = _annotation_kind_for_artifact(artifact)
            if kind is not None:
                by_track_kind[(artifact.track.recording_id, kind)].append(artifact)

    active_annotations = [
        annotation
        for annotation in annotations
        if annotation.track.recording_id in selected_ids
    ]
    if not active_annotations:
        lines.extend(["No included, resolved annotations in this split.", ""])
    for annotation in active_annotations:
        _render_annotation(lines, annotation, by_track_kind)

    quarantined = [
        (track.recording_id, annotation)
        for track in tracks
        for annotation in track.annotations
        if annotation.disposition is EvaluationDisposition.QUARANTINED
    ]
    if quarantined:
        lines.extend(["## Quarantined references", ""])
        for recording_id, annotation in quarantined:
            lines.append(
                f"- `{recording_id}` / `{annotation.annotation_id}`: "
                f"{annotation.quarantine_reason}"
            )
        lines.append("")
    return "\n".join(lines) + "\n"


def _render_annotation(
    lines: list[str],
    annotation: ResolvedAnnotation,
    artifacts: dict[tuple[str, AnnotationKind], list[ResolvedArtifact]],
) -> None:
    track = annotation.track
    reference = annotation.annotation
    lines.extend(
        [
            f"## {track.recording_id} — {reference.annotation_id}",
            "",
            f"Split: `{track.split.value}`. Reference: {reference.source} "
            f"(version `{reference.version}`).",
            f"Scored interval count: {len(annotation.intervals)}.",
            "",
        ]
    )
    candidates = artifacts.get((track.recording_id, reference.kind), [])
    if not candidates:
        lines.extend(["No selected compatible artifacts.", ""])
        return
    if reference.kind is AnnotationKind.CHORD:
        _render_chords(lines, annotation, candidates)
    else:
        _render_keys(lines, annotation, candidates)


def _render_chords(
    lines: list[str],
    annotation: ResolvedAnnotation,
    artifacts: list[ResolvedArtifact],
) -> None:
    reference_intervals, reference_labels = _project_intervals(
        [(row.start_seconds, row.end_seconds) for row in annotation.intervals],
        [row.label for row in annotation.intervals],
        annotation.track.excerpts,
    )
    lines.extend(
        [
            "Raw chord metrics (mir_eval, duration-weighted 0–1):",
            "",
            "| Candidate/config | root | majmin | mirex | selected cache |",
            "|---|---:|---:|---:|:---:|",
        ]
    )
    for item in artifacts:
        if not isinstance(item.result, ChordAnalysisResult):
            continue
        estimate_intervals, estimate_labels = chord_result_to_estimate(item.result)
        estimate_intervals, estimate_labels = _project_intervals(
            estimate_intervals.tolist(),
            estimate_labels,
            annotation.track.excerpts,
        )
        score = evaluate_chord(
            reference_intervals,
            reference_labels,
            estimate_intervals,
            estimate_labels,
            reference_label=annotation.annotation.annotation_id,
            candidate_id=item.selection.candidate_id,
        )
        lines.append(
            f"| {item.selection.candidate_id}/{item.selection.config_id} | "
            f"{score.scores['root']:.3f} | {score.scores['majmin']:.3f} | "
            f"{score.scores['mirex']:.3f} | `{item.selection.cache_key[:12]}` |"
        )
    lines.append("")


def _render_keys(
    lines: list[str],
    annotation: ResolvedAnnotation,
    artifacts: list[ResolvedArtifact],
) -> None:
    reference_label, duration = _dominant_key(annotation)
    lines.extend(
        [
            "Raw key metric (mir_eval weighted score):",
            "",
            "| Candidate/config | Reference | Top | Score | selected cache |",
            "|---|:---:|:---:|---:|:---:|",
        ]
    )
    for item in artifacts:
        if not isinstance(item.result, KeyAnalysisResult):
            continue
        score = evaluate_key(
            reference_label,
            duration,
            item.result,
            candidate_id=item.selection.candidate_id,
        )
        lines.append(
            f"| {item.selection.candidate_id}/{item.selection.config_id} | "
            f"{reference_label} | {score.top_label} | {score.score:.3f} | "
            f"`{item.selection.cache_key[:12]}` |"
        )
    lines.append("")


def _dominant_key(annotation: ResolvedAnnotation) -> tuple[str, float]:
    durations: dict[str, float] = defaultdict(float)
    for row in annotation.intervals:
        if row.label not in {"Silence", "Modulation"}:
            durations[row.label] += row.end_seconds - row.start_seconds
    if not durations:
        raise ValueError(f"{annotation.annotation.annotation_id} has no key label")
    label = max(durations, key=durations.__getitem__)
    return _normalize_key(label), sum(durations.values())


def _normalize_key(label: str) -> str:
    if ":" not in label:
        return f"{label} major"
    root, quality = label.split(":", 1)
    normalized = quality.strip().lower()
    if normalized in {"major", "maj"}:
        normalized = "major"
    elif normalized in {"minor", "min"}:
        normalized = "minor"
    return f"{root} {normalized}"


def _annotation_kind_for_artifact(item: ResolvedArtifact) -> AnnotationKind | None:
    if item.selection.artifact_kind == "chord.analysis_result":
        return AnnotationKind.CHORD
    if item.selection.artifact_kind == "key.analysis_result":
        return AnnotationKind.KEY
    return None


def _project_intervals(
    intervals: list[tuple[float, float]] | list[list[float]],
    labels: list[str],
    excerpts: tuple,
) -> tuple[np.ndarray, list[str]]:
    """Clip intervals to the frozen excerpts and concatenate their timeline."""

    projected: list[tuple[float, float]] = []
    projected_labels: list[str] = []
    output_start = 0.0
    for excerpt in excerpts:
        for (start, end), label in zip(intervals, labels, strict=True):
            clipped_start = max(start, excerpt.start_seconds)
            clipped_end = min(end, excerpt.end_seconds)
            if clipped_end > clipped_start:
                projected.append(
                    (
                        output_start + clipped_start - excerpt.start_seconds,
                        output_start + clipped_end - excerpt.start_seconds,
                    )
                )
                projected_labels.append(label)
        output_start += excerpt.end_seconds - excerpt.start_seconds
    return np.array(projected, dtype=np.float64), projected_labels


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="phase3_evaluation_report",
        description="Render raw diagnostics from a frozen evaluation manifest.",
    )
    parser.add_argument("--workspace", required=True, type=Path)
    parser.add_argument("--manifest", required=True, type=Path)
    parser.add_argument(
        "--split",
        choices=[split.value for split in EvaluationSplit],
        default=None,
    )
    parser.add_argument("--out", type=Path, default=None)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    manifest = load_evaluation_manifest(args.manifest)
    artifacts = resolve_manifest_artifacts(manifest, args.workspace)
    annotations = resolve_manifest_annotations(manifest, args.workspace)
    split = EvaluationSplit(args.split) if args.split else None
    report = render_report(manifest, artifacts, annotations, split=split)
    if args.out is None:
        sys.stdout.write(report)
    else:
        output = _private_report_path(args.workspace, args.out)
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(report, encoding="utf-8")
    return 0


def _private_report_path(workspace: Path, output: Path) -> Path:
    """Keep raw diagnostics in the private workspace reports directory."""

    reports_root = (workspace.resolve() / "reports").resolve()
    target = output.resolve()
    if not target.is_relative_to(reports_root):
        raise ValueError("evaluation reports must be written under workspace/reports")
    return target


if __name__ == "__main__":
    raise SystemExit(main())
