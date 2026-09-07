"""Manifest-authoritative JSON and Markdown reports for product metrics."""

from __future__ import annotations

from collections import defaultdict
from datetime import UTC, datetime
from hashlib import sha256
from random import Random
from typing import Any, Literal

from pydantic import Field

from audio_library_poc.chord_analysis import ChordAnalysisResult
from audio_library_poc.evaluation_manifest import (
    AnnotationKind,
    EvaluationManifest,
    EvaluationSplit,
    ResolvedAnnotation,
    ResolvedArtifact,
)
from audio_library_poc.io import canonical_json_bytes
from audio_library_poc.key_analysis import KeyAnalysisResult
from audio_library_poc.models import ContractModel
from audio_library_poc.product_evaluation import (
    AcceptedChordScore,
    aggregate_accepted_chord_scores,
    bootstrap_recording_intervals,
    evaluate_accepted_chords,
    evaluate_key_ranking,
    macro_accepted_chord_metrics,
)


class ProductEvaluationReport(ContractModel):
    """Portable report contract; source audio remains only in private inputs."""

    schema_version: Literal["1.0.0"] = "1.0.0"
    generated_at: str
    manifest: dict[str, Any]
    definitions: dict[str, str]
    samples: dict[str, Any]
    chord_scores: list[dict[str, Any]] = Field(default_factory=list)
    key_scores: list[dict[str, Any]] = Field(default_factory=list)
    aggregates: dict[str, Any] = Field(default_factory=dict)
    warnings: list[str] = Field(default_factory=list)


def build_product_report(
    manifest: EvaluationManifest,
    artifacts: tuple[ResolvedArtifact, ...],
    annotations: tuple[ResolvedAnnotation, ...],
    *,
    split: EvaluationSplit | None = None,
    generated_at: datetime | None = None,
    bootstrap_replicates: int = 2000,
    manifest_sha256: str | None = None,
) -> ProductEvaluationReport:
    """Score only resolved, hash-verified manifest selections and excerpts."""

    if bootstrap_replicates < 1:
        raise ValueError("bootstrap_replicates must be positive")
    selected_tracks = [
        track for track in manifest.tracks if split is None or track.split is split
    ]
    selected_ids = {track.recording_id for track in selected_tracks}
    selected_annotations = [
        item for item in annotations if item.track.recording_id in selected_ids
    ]
    artifacts_by_track_kind: dict[
        tuple[str, AnnotationKind], list[ResolvedArtifact]
    ] = defaultdict(list)
    for item in artifacts:
        if item.track.recording_id not in selected_ids:
            continue
        kind = _artifact_annotation_kind(item)
        if kind is not None:
            artifacts_by_track_kind[(item.track.recording_id, kind)].append(item)

    chord_scores: list[dict[str, Any]] = []
    key_scores: list[dict[str, Any]] = []
    warnings: list[str] = []
    for annotation in selected_annotations:
        candidates = artifacts_by_track_kind.get(
            (annotation.track.recording_id, annotation.annotation.kind), []
        )
        if not candidates:
            annotation_id = annotation.annotation.annotation_id
            warnings.append(
                f"{annotation.track.recording_id}/{annotation_id} "
                "has no selected compatible artifact"
            )
            continue
        for excerpt in annotation.track.excerpts:
            intervals = [
                (row.start_seconds, row.end_seconds)
                for row in annotation.intervals
                if row.start_seconds < excerpt.end_seconds
                and row.end_seconds > excerpt.start_seconds
            ]
            labels = [
                row.label
                for row in annotation.intervals
                if row.start_seconds < excerpt.end_seconds
                and row.end_seconds > excerpt.start_seconds
            ]
            if not intervals:
                warnings.append(
                    f"{annotation.track.recording_id}/{excerpt.excerpt_id}/"
                    f"{annotation.annotation.annotation_id} has no reference interval"
                )
                continue
            if annotation.annotation.kind is AnnotationKind.CHORD:
                for item in candidates:
                    if not isinstance(item.result, ChordAnalysisResult):
                        continue
                    score = evaluate_accepted_chords(
                        intervals, labels, item.result.segments
                    )
                    chord_scores.append(
                        _chord_row(annotation, excerpt.excerpt_id, item, score)
                    )
            else:
                reference = _dominant_key(intervals, labels)
                if reference is None:
                    warnings.append(
                        f"{annotation.track.recording_id}/{excerpt.excerpt_id}/"
                        f"{annotation.annotation.annotation_id} has no supported key"
                    )
                    continue
                for item in candidates:
                    if not isinstance(item.result, KeyAnalysisResult):
                        continue
                    try:
                        score = evaluate_key_ranking(reference, item.result)
                    except ValueError:
                        warnings.append(
                            f"{annotation.track.recording_id}/{excerpt.excerpt_id}/"
                            f"{annotation.annotation.annotation_id} has unsupported "
                            f"key reference {reference!r}"
                        )
                        continue
                    key_scores.append(
                        _key_row(annotation, excerpt.excerpt_id, item, score)
                    )

    aggregates = _build_aggregates(chord_scores, bootstrap_replicates)
    key_aggregates = _build_key_aggregates(key_scores, bootstrap_replicates)
    if len({row["recording_id"] for row in chord_scores}) < 5 and chord_scores:
        warnings.append(
            "bootstrap intervals resample recordings, but fewer than five "
            "recordings were scored; treat intervals as unstable"
        )
    if any(row["metrics"]["excluded_reference_seconds"] for row in chord_scores):
        warnings.append(
            "unsupported reference chord duration is excluded from harmonic "
            "denominators and reported separately"
        )
    return ProductEvaluationReport(
        generated_at=(generated_at or datetime.now(UTC)).isoformat(timespec="seconds"),
        manifest={
            "manifest_id": manifest.manifest_id,
            "manifest_content_sha256": manifest_sha256
            or sha256(canonical_json_bytes(manifest)).hexdigest(),
            "schema_version": manifest.schema_version,
            "split": split.value if split else "all",
            "split_policy": manifest.split_policy,
            "pilot_disclosure": manifest.pilot_disclosure,
            "recording_ids": sorted(selected_ids),
            "original_sha256": {
                track.recording_id: track.original.sha256 for track in selected_tracks
            },
        },
        definitions=_DEFINITIONS,
        samples={
            "selected_recording_count": len(selected_ids),
            "scored_chord_recording_count": len(
                {row["recording_id"] for row in chord_scores}
            ),
            "scored_chord_excerpt_count": len(
                {
                    (row["recording_id"], row["excerpt_id"], row["annotation_id"])
                    for row in chord_scores
                }
            ),
            "chord_candidate_row_count": len(chord_scores),
            "scored_key_recording_count": len(
                {row["recording_id"] for row in key_scores}
            ),
            "scored_key_excerpt_count": len(
                {
                    (row["recording_id"], row["excerpt_id"], row["annotation_id"])
                    for row in key_scores
                }
            ),
            "key_candidate_row_count": len(key_scores),
            "bootstrap_unit": "recording",
            "bootstrap_replicates": bootstrap_replicates,
        },
        chord_scores=chord_scores,
        key_scores=key_scores,
        aggregates={"chords": aggregates, "keys": key_aggregates},
        warnings=warnings,
    )


def render_product_markdown(report: ProductEvaluationReport) -> str:
    """Render the same portable report data for human inspection."""

    manifest = report.manifest
    lines = [
        "# Frozen harmony product evaluation",
        "",
        f"Generated: {report.generated_at}",
        f"Manifest: `{manifest['manifest_id']}` (schema {manifest['schema_version']})",
        f"Split: {manifest['split']}; recording-level selection.",
        "Selection: manifest-declared, successful, hash-verified artifacts only.",
        "",
        "## Metric denominators",
        "",
        (
            "- Accepted-label precision = correct accepted harmonic duration / "
            "accepted harmonic duration."
        ),
        (
            "- Harmonic coverage = accepted harmonic duration / valid "
            "major-or-minor reference duration."
        ),
        (
            "- Overall harmonic agreement = correct accepted harmonic duration / "
            "valid major-or-minor reference duration."
        ),
        "- No-chord recall = correct no-chord duration / no-chord reference duration.",
        (
            "- `unknown` and `no_chord` on harmonic references are uncovered; "
            "`X` is never silently treated as `N`."
        ),
        "",
        "## Accepted chord output by excerpt",
        "",
    ]
    header = (
        "| Recording/excerpt | Candidate/config | Correct s | Accepted s | "
        "Harmonic ref s | Precision | Coverage | Agreement | False N s | "
        "Unknown harm s | N ref s | N recall | Unknown on N s | Harmonic on N s | "
        "Excluded s |"
    )
    lines.extend(
        [
            header,
            "|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
        ]
    )
    for row in report.chord_scores:
        metrics = dict(row["metrics"])
        metrics["accepted_label_precision"] = _display(
            metrics["accepted_label_precision"]
        )
        metrics["harmonic_coverage"] = _display(metrics["harmonic_coverage"])
        metrics["overall_harmonic_agreement"] = _display(
            metrics["overall_harmonic_agreement"]
        )
        metrics["no_chord_recall"] = _display(metrics["no_chord_recall"])
        lines.append(
            "| {recording_id}/{excerpt_id} | {candidate_id}/{config_id} | "
            "{correct_accepted_harmonic_seconds:.3f} | "
            "{accepted_harmonic_seconds:.3f} | {reference_harmonic_seconds:.3f} | "
            "{accepted_label_precision} | {harmonic_coverage} | "
            "{overall_harmonic_agreement} | {no_chord_on_harmonic_seconds:.3f} | "
            "{unknown_on_harmonic_seconds:.3f} | "
            "{reference_no_chord_seconds:.3f} | {no_chord_recall} | "
            "{unknown_on_no_chord_seconds:.3f} | "
            "{harmonic_prediction_on_no_chord_seconds:.3f} | "
            "{excluded_reference_seconds:.3f} |".format(
                **row,
                **metrics,
            )
        )
    if not report.chord_scores:
        lines.append(
            "| No scored chord excerpts | — | — | — | — | — | — | — | — | — | "
            "— | — | — | — | — |"
        )
    lines.extend(["", "## Key ranking by excerpt", ""])
    lines.extend(
        [
            (
                "| Recording/excerpt | Candidate/config | Reference | Top | "
                "Top-1 | Top-3 | Rank | Margin |"
            ),
            "|---|---|---|---|---:|---:|---:|---:|",
        ]
    )
    for row in report.key_scores:
        lines.append(
            f"| {row['recording_id']}/{row['excerpt_id']} | "
            f"{row['candidate_id']}/{row['config_id']} | {row['reference_label']} | "
            f"{row['top_label']} | {str(row['top1_correct']).lower()} | "
            f"{str(row['top3_correct']).lower()} | {row['reference_rank']} | "
            f"{row['top1_margin']:.4f} |"
        )
    if not report.key_scores:
        lines.append("| No scored key excerpts | — | — | — | — | — | — | — |")
    lines.extend(["", "## Corpus chord aggregates", ""])
    for group, aggregate in report.aggregates["chords"].items():
        weighted = aggregate["duration_weighted"]
        macro = aggregate["macro_recording"]
        lines.extend(
            [
                f"### {group}",
                "",
                (
                    f"Recordings: {aggregate['recording_count']}; "
                    f"excerpts: {aggregate['excerpt_count']}."
                ),
                _aggregate_markdown(weighted, macro),
                f"Recording-bootstrap 95% agreement interval: "
                f"{_interval(aggregate['bootstrap']['overall_harmonic_agreement'])}.",
                "",
            ]
        )
    lines.extend(["## Corpus key aggregates", ""])
    for group, aggregate in report.aggregates["keys"].items():
        lines.extend(
            [
                f"### {group}",
                "",
                f"Recordings: {aggregate['recording_count']}; excerpts: "
                f"{aggregate['excerpt_count']}.",
                f"Top-1: {_display(aggregate['top1_rate'])}; "
                f"top-3: {_display(aggregate['top3_rate'])}; "
                f"mean margin: {_display(aggregate['mean_top1_margin'])}.",
                f"Recording-bootstrap 95% top-1 interval: "
                f"{_interval(aggregate['bootstrap_top1'])}.",
                f"Recording-bootstrap 95% top-3 interval: "
                f"{_interval(aggregate['bootstrap_top3'])}; mean-margin interval: "
                f"{_interval(aggregate['bootstrap_margin'])}.",
                "",
            ]
        )
    if report.warnings:
        lines.extend(["## Warnings", ""])
        lines.extend(f"- {warning}" for warning in report.warnings)
        lines.append("")
    return "\n".join(lines)


def _chord_row(
    annotation, excerpt_id: str, item: ResolvedArtifact, score: AcceptedChordScore
) -> dict[str, Any]:
    return {
        "recording_id": annotation.track.recording_id,
        "excerpt_id": excerpt_id,
        "annotation_id": annotation.annotation.annotation_id,
        "annotation_sha256": annotation.annotation.sha256,
        "annotation_version": annotation.annotation.version,
        **_selection_fields(item),
        "metrics": score.as_dict(),
    }


def _key_row(
    annotation, excerpt_id: str, item: ResolvedArtifact, score
) -> dict[str, Any]:
    return {
        "recording_id": annotation.track.recording_id,
        "excerpt_id": excerpt_id,
        "annotation_id": annotation.annotation.annotation_id,
        "annotation_sha256": annotation.annotation.sha256,
        "annotation_version": annotation.annotation.version,
        **_selection_fields(item),
        "reference_label": score.reference_label,
        "top_label": score.top_label,
        "reference_rank": score.reference_rank,
        "top1_correct": score.top1_correct,
        "top3_correct": score.top3_correct,
        "top1_score": score.top1_score,
        "top2_score": score.top2_score,
        "top1_margin": score.top1_margin,
        "score_interpretation": "raw profile score; not a calibrated probability",
    }


def _selection_fields(item: ResolvedArtifact) -> dict[str, Any]:
    return {
        "candidate_id": item.selection.candidate_id,
        "config_id": item.selection.config_id,
        "run_id": item.selection.run_id,
        "cache_key": item.selection.cache_key,
        "envelope_path_sha256": sha256(canonical_json_bytes(item.envelope)).hexdigest(),
        "artifact_sha256": item.selection.artifact_sha256,
        "artifact_schema_version": item.selection.artifact_schema_version,
        "config_sha256": item.selection.identity.config_sha256,
        "identity": item.selection.identity.model_dump(mode="json"),
    }


def _build_aggregates(rows: list[dict[str, Any]], replicates: int) -> dict[str, Any]:
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        grouped[f"{row['candidate_id']}/{row['config_id']}"].append(row)
    output: dict[str, Any] = {}
    for key, group_rows in grouped.items():
        by_recording: dict[str, list[AcceptedChordScore]] = defaultdict(list)
        for row in group_rows:
            score = AcceptedChordScore(
                **{field: row["metrics"][field] for field in _COUNT_FIELDS}
            )
            by_recording[row["recording_id"]].append(score)
        recording_scores = [
            aggregate_accepted_chord_scores(scores) for scores in by_recording.values()
        ]
        weighted = aggregate_accepted_chord_scores(recording_scores)
        output[key] = {
            "recording_count": len(recording_scores),
            "excerpt_count": len(
                {
                    (row["recording_id"], row["excerpt_id"], row["annotation_id"])
                    for row in group_rows
                }
            ),
            "duration_weighted": weighted.as_dict(),
            "macro_recording": macro_accepted_chord_metrics(recording_scores),
            "recordings": [
                {
                    "recording_id": recording_id,
                    "metrics": aggregate_accepted_chord_scores(scores).as_dict(),
                }
                for recording_id, scores in sorted(by_recording.items())
            ],
            "bootstrap": bootstrap_recording_intervals(
                recording_scores, replicates=replicates
            ),
        }
    return output


def _build_key_aggregates(
    rows: list[dict[str, Any]], replicates: int
) -> dict[str, Any]:
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        grouped[f"{row['candidate_id']}/{row['config_id']}"].append(row)
    output: dict[str, Any] = {}
    for group, group_rows in grouped.items():
        by_recording: dict[str, list[dict[str, Any]]] = defaultdict(list)
        for row in group_rows:
            by_recording[row["recording_id"]].append(row)
        recording_values = [
            _key_recording_values(recording_rows)
            for recording_rows in by_recording.values()
        ]
        output[group] = {
            "recording_count": len(recording_values),
            "excerpt_count": len(
                {
                    (row["recording_id"], row["excerpt_id"], row["annotation_id"])
                    for row in group_rows
                }
            ),
            "top1_rate": _mean([value["top1_rate"] for value in recording_values]),
            "top3_rate": _mean([value["top3_rate"] for value in recording_values]),
            "mean_top1_margin": _mean(
                [value["mean_top1_margin"] for value in recording_values]
            ),
            "bootstrap_top1": _bootstrap_key(recording_values, replicates, "top1_rate"),
            "bootstrap_top3": _bootstrap_key(recording_values, replicates, "top3_rate"),
            "bootstrap_margin": _bootstrap_key(
                recording_values, replicates, "mean_top1_margin"
            ),
        }
    return output


def _key_recording_values(rows: list[dict[str, Any]]) -> dict[str, float]:
    return {
        "top1_rate": sum(row["top1_correct"] for row in rows) / len(rows),
        "top3_rate": sum(row["top3_correct"] for row in rows) / len(rows),
        "mean_top1_margin": sum(row["top1_margin"] for row in rows) / len(rows),
    }


def _bootstrap_key(
    values: list[dict[str, float]], replicates: int, metric: str
) -> dict[str, float | int | None]:
    if not values:
        return {"lower": None, "upper": None, "replicates": replicates, "recordings": 0}
    random = Random(0)
    samples = []
    for _ in range(replicates):
        sample = [values[random.randrange(len(values))][metric] for _ in values]
        samples.append(sum(sample) / len(sample))
    samples.sort()
    return {
        "lower": samples[int((len(samples) - 1) * 0.025)],
        "upper": samples[int((len(samples) - 1) * 0.975)],
        "replicates": replicates,
        "recordings": len(values),
    }


def _aggregate_markdown(weighted: dict[str, Any], macro: dict[str, Any]) -> str:
    return (
        "Weighted precision/coverage/agreement/no-chord recall: "
        f"{_display(weighted['accepted_label_precision'])}/"
        f"{_display(weighted['harmonic_coverage'])}/"
        f"{_display(weighted['overall_harmonic_agreement'])}/"
        f"{_display(weighted['no_chord_recall'])}. "
        "Weighted unknown-on-no-chord/harmonic-on-no-chord seconds: "
        f"{weighted['unknown_on_no_chord_seconds']:.3f}/"
        f"{weighted['harmonic_prediction_on_no_chord_seconds']:.3f}. "
        "Macro precision/coverage/agreement/no-chord recall: "
        f"{_display(macro['accepted_label_precision'])}/"
        f"{_display(macro['harmonic_coverage'])}/"
        f"{_display(macro['overall_harmonic_agreement'])}/"
        f"{_display(macro['no_chord_recall'])}. "
        "Macro contributors/undefined precision/coverage/agreement/no-chord: "
        f"{macro['accepted_label_precision_contributor_count']}/"
        f"{macro['accepted_label_precision_undefined_count']}, "
        f"{macro['harmonic_coverage_contributor_count']}/"
        f"{macro['harmonic_coverage_undefined_count']}, "
        f"{macro['overall_harmonic_agreement_contributor_count']}/"
        f"{macro['overall_harmonic_agreement_undefined_count']}, "
        f"{macro['no_chord_recall_contributor_count']}/"
        f"{macro['no_chord_recall_undefined_count']}. "
        f"Excluded/reduced reference seconds: "
        f"{weighted['excluded_reference_seconds']:.3f}/"
        f"{weighted['richer_reference_reduced_seconds']:.3f}."
    )


def _artifact_annotation_kind(item: ResolvedArtifact) -> AnnotationKind | None:
    if item.selection.artifact_kind == "chord.analysis_result":
        return AnnotationKind.CHORD
    if item.selection.artifact_kind == "key.analysis_result":
        return AnnotationKind.KEY
    return None


def _dominant_key(intervals, labels: list[str]) -> str | None:
    durations: dict[str, float] = defaultdict(float)
    for (start, end), label in zip(intervals, labels, strict=True):
        if label not in {"Silence", "Modulation"}:
            durations[_normalize_key(label)] += end - start
    return max(durations, key=durations.__getitem__) if durations else None


def _normalize_key(label: str) -> str:
    raw = label.strip()
    if ":" not in raw:
        return f"{raw} major"
    root, mode = raw.split(":", 1)
    normalized = mode.strip().lower()
    if normalized == "maj":
        normalized = "major"
    if normalized == "min":
        normalized = "minor"
    return f"{root} {normalized}"


def _display(value: float | None) -> str:
    return "—" if value is None else f"{value:.3f}"


def _interval(value: dict[str, Any]) -> str:
    return f"[{_display(value['lower'])}, {_display(value['upper'])}]"


def _mean(values: list[float]) -> float | None:
    return sum(values) / len(values) if values else None


_COUNT_FIELDS = (
    "reference_harmonic_seconds",
    "reference_no_chord_seconds",
    "excluded_reference_seconds",
    "richer_reference_reduced_seconds",
    "correct_accepted_harmonic_seconds",
    "accepted_harmonic_seconds",
    "unknown_on_harmonic_seconds",
    "no_chord_on_harmonic_seconds",
    "correct_no_chord_seconds",
    "unknown_on_no_chord_seconds",
    "harmonic_prediction_on_no_chord_seconds",
)
_DEFINITIONS = {
    "raw_diagnostic": (
        "Existing mir_eval candidate_label scores are post-smoothing historical "
        "diagnostics, not product metrics."
    ),
    "accepted_output": (
        "Biblioteca consumes uncalibrated normalized major, minor, unknown, and "
        "no_chord labels; no confidence threshold is applied in this report."
    ),
    "unknown_vs_no_chord": (
        "X is unknown/unsupported evidence, while N is the explicit no-chord token."
    ),
    "richer_reference": (
        "Rooted major/minor extensions are reduced to a triad and their duration "
        "is reported; unsupported qualities are excluded."
    ),
    "key_scores": (
        "Key top scores and margins are raw profile similarities, not calibrated "
        "probabilities."
    ),
}

__all__ = ("ProductEvaluationReport", "build_product_report", "render_product_markdown")
