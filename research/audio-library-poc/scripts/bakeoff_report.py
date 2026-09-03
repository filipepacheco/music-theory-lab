"""Render a Markdown bakeoff report from workspace/runs/.

Walks the workspace runs tree, keeps every stage-result envelope whose
status is ``succeeded`` and whose ``stage_kind`` starts with ``separator.``,
loads the paired ``SeparationResult`` JSON, and prints a per-track +
aggregate comparison to stdout (or ``--out`` if given). Standard library
only so the offline harness stays torch-free.

Invocation:

    .venv\\Scripts\\python.exe scripts/bakeoff_report.py \\
        --workspace workspace \\
        --out workspace/reports/bakeoff.md
"""

from __future__ import annotations

import argparse
import json
import statistics
import sys
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class BakeoffRun:
    """One (separator, track) datapoint the report consumes."""

    run_id: str
    stage_kind: str
    candidate_id: str
    source_relative_path: str
    duration_seconds: float
    wall_seconds: float
    reconstruction_relative_rms: float
    source_peak_absolute_sample: float
    reconstruction_source_rms: float
    reconstruction_error_rms: float
    chunk_frames: int
    stem_peaks: dict[str, float]
    stem_sizes_bytes: dict[str, int]


def collect_runs(workspace: Path) -> list[BakeoffRun]:
    """Return one BakeoffRun per succeeded separator stage under workspace/runs/."""

    runs_root = workspace / "runs"
    if not runs_root.is_dir():
        return []
    collected: list[BakeoffRun] = []
    for run_dir in sorted(runs_root.iterdir()):
        if not run_dir.is_dir():
            continue
        stages_root = run_dir / "stages"
        if not stages_root.is_dir():
            continue
        for stage_dir in sorted(stages_root.iterdir()):
            if not stage_dir.name.startswith("separator."):
                continue
            results_dir = stage_dir / "results"
            if not results_dir.is_dir():
                continue
            for envelope_path in sorted(results_dir.glob("*.json")):
                run = _load_run(run_dir.name, stage_dir, envelope_path)
                if run is not None:
                    collected.append(run)
    return collected


def _load_run(
    run_id: str,
    stage_dir: Path,
    envelope_path: Path,
) -> BakeoffRun | None:
    try:
        envelope = json.loads(envelope_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    if envelope.get("status") != "succeeded":
        return None
    cache_key = envelope.get("cache_key")
    if not cache_key:
        return None
    artifact_dir = stage_dir / "artifacts" / cache_key
    sep_result_path = artifact_dir / "separation-result.json"
    if not sep_result_path.is_file():
        return None
    try:
        sep_result = json.loads(sep_result_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    validation = sep_result.get("validation", {})
    source_facts = validation.get("source", {})
    reconstruction = validation.get("reconstruction", {})
    stems = validation.get("stems", [])
    stem_peaks = {
        entry["stem_kind"]: float(entry["signal"]["peak_absolute_sample"])
        for entry in stems
    }
    stem_sizes: dict[str, int] = {}
    for artifact in envelope.get("artifacts", []):
        kind = str(artifact.get("artifact_kind", ""))
        if kind.startswith("separator.stem."):
            stem_sizes[kind[len("separator.stem.") :]] = int(
                artifact.get("size_bytes", 0)
            )
    identity = envelope.get("identity", {})
    return BakeoffRun(
        run_id=run_id,
        stage_kind=identity.get("stage_kind", stage_dir.name),
        candidate_id=str(sep_result.get("provenance", {}).get("candidate", "")),
        source_relative_path=str(
            _extract_source_relative_path(sep_result, artifact_dir)
        ),
        duration_seconds=float(source_facts.get("duration_seconds", 0.0)),
        wall_seconds=float(envelope.get("metrics", {}).get("duration_seconds", 0.0)),
        reconstruction_relative_rms=float(reconstruction.get("relative_rms", 0.0)),
        source_peak_absolute_sample=float(
            source_facts.get("peak_absolute_sample", 0.0)
        ),
        reconstruction_source_rms=float(reconstruction.get("source_rms", 0.0)),
        reconstruction_error_rms=float(reconstruction.get("error_rms", 0.0)),
        chunk_frames=int(validation.get("chunk_frames", 0)),
        stem_peaks=stem_peaks,
        stem_sizes_bytes=stem_sizes,
    )


def _extract_source_relative_path(
    sep_result: dict[str, Any], artifact_dir: Path
) -> str:
    # The separator config isn't nested in SeparationResult; the run_id folder
    # name is derived from the pipeline yaml the user drove. Use source_sha256
    # as the machine-readable fallback and let the report label rows by run_id.
    return str(sep_result.get("source_sha256", ""))


def group_by_track(runs: Iterable[BakeoffRun]) -> dict[str, list[BakeoffRun]]:
    """Group runs by ``source_relative_path`` so per-track comparisons align."""

    tracks: dict[str, list[BakeoffRun]] = {}
    for run in runs:
        tracks.setdefault(run.source_relative_path, []).append(run)
    return tracks


def render_report(
    runs: list[BakeoffRun], *, generated_at: datetime | None = None
) -> str:
    """Return a Markdown document comparing every (candidate, track) datapoint."""

    if not runs:
        return (
            "# Bakeoff report\n\n"
            "No succeeded separator runs found under workspace/runs/.\n"
        )

    stamp = (generated_at or datetime.now(UTC)).isoformat(timespec="seconds")
    lines: list[str] = [
        "# Bakeoff report",
        "",
        f"Generated: {stamp}",
        f"Runs: {len(runs)}",
        f"Candidates: {', '.join(sorted({r.candidate_id for r in runs}))}",
        "",
    ]

    tracks = group_by_track(runs)
    lines.append("## Per-track comparison")
    lines.append("")
    for source_sha256, track_runs in sorted(tracks.items()):
        track_runs_sorted = sorted(track_runs, key=lambda r: r.candidate_id)
        heading = track_runs_sorted[0].run_id
        duration = track_runs_sorted[0].duration_seconds
        lines.append(f"### `{heading}`  (source_sha256 `{source_sha256[:12]}…`)")
        lines.append("")
        lines.append(f"Source duration: {duration:.2f} s")
        lines.append("")
        lines.append(
            "| Candidate | Wall (s) | Real-time × | Reconstruction rel RMS | "
            "Source peak | Chunk frames |"
        )
        lines.append("|---|---:|---:|---:|---:|---:|")
        for run in track_runs_sorted:
            real_time = (
                (run.duration_seconds / run.wall_seconds) if run.wall_seconds else 0.0
            )
            lines.append(
                f"| {run.candidate_id} "
                f"| {run.wall_seconds:.2f} "
                f"| {real_time:.1f} "
                f"| {run.reconstruction_relative_rms:.4f} "
                f"| {run.source_peak_absolute_sample:.3f} "
                f"| {run.chunk_frames} |"
            )
        lines.append("")
        lines.append("Per-stem peaks (max |sample|):")
        lines.append("")
        stem_kinds = sorted({s for run in track_runs_sorted for s in run.stem_peaks})
        header = "| Candidate | " + " | ".join(stem_kinds) + " |"
        rule = "|---|" + "|".join("---:" for _ in stem_kinds) + "|"
        lines.append(header)
        lines.append(rule)
        for run in track_runs_sorted:
            cells = " | ".join(
                f"{run.stem_peaks.get(stem, 0.0):.3f}" for stem in stem_kinds
            )
            lines.append(f"| {run.candidate_id} | {cells} |")
        lines.append("")

    aggregates = _aggregate(runs)
    if len(aggregates) >= 2:
        lines.append("## Aggregate (mean across all tracks)")
        lines.append("")
        candidates_sorted = sorted(aggregates)
        lines.append("| Metric | " + " | ".join(candidates_sorted) + " |")
        lines.append("|---|" + "|".join("---:" for _ in candidates_sorted) + "|")
        for metric_label, metric_key, fmt in (
            ("Wall (s)", "wall_seconds", "{:.2f}"),
            ("Real-time × source", "real_time_ratio", "{:.1f}"),
            ("Reconstruction rel RMS", "reconstruction_relative_rms", "{:.4f}"),
            ("Source peak (max)", "source_peak_absolute_sample", "{:.3f}"),
        ):
            cells = " | ".join(
                fmt.format(aggregates[candidate][metric_key])
                for candidate in candidates_sorted
            )
            lines.append(f"| {metric_label} | {cells} |")
        lines.append("")

    return "\n".join(lines) + "\n"


def _aggregate(runs: Iterable[BakeoffRun]) -> dict[str, dict[str, float]]:
    buckets: dict[str, list[BakeoffRun]] = {}
    for run in runs:
        buckets.setdefault(run.candidate_id, []).append(run)
    aggregates: dict[str, dict[str, float]] = {}
    for candidate, entries in buckets.items():
        walls = [r.wall_seconds for r in entries if r.wall_seconds > 0]
        real_times = [
            r.duration_seconds / r.wall_seconds for r in entries if r.wall_seconds > 0
        ]
        aggregates[candidate] = {
            "wall_seconds": statistics.mean(walls) if walls else 0.0,
            "real_time_ratio": statistics.mean(real_times) if real_times else 0.0,
            "reconstruction_relative_rms": statistics.mean(
                r.reconstruction_relative_rms for r in entries
            ),
            "source_peak_absolute_sample": max(
                (r.source_peak_absolute_sample for r in entries), default=0.0
            ),
        }
    return aggregates


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="bakeoff_report",
        description="Render a Markdown bakeoff report from workspace/runs/.",
    )
    parser.add_argument("--workspace", required=True, type=Path)
    parser.add_argument(
        "--out",
        type=Path,
        default=None,
        help="Write to this path instead of stdout.",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    runs = collect_runs(args.workspace)
    report = render_report(runs)
    if args.out is not None:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(report, encoding="utf-8")
    else:
        sys.stdout.write(report)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
