"""Write Phase 2 normalized-output reports from a frozen private manifest."""

from __future__ import annotations

import argparse
from pathlib import Path

from audio_library_poc.evaluation_manifest import (
    EvaluationSplit,
    load_evaluation_manifest,
    resolve_manifest_annotations,
    resolve_manifest_artifacts,
)
from audio_library_poc.io import atomic_write_json
from audio_library_poc.metadata import hash_file
from audio_library_poc.product_evaluation_report import (
    build_product_report,
    render_product_markdown,
)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="product_evaluation_report",
        description="Write normalized harmony metrics from frozen selected inputs.",
    )
    parser.add_argument("--workspace", required=True, type=Path)
    parser.add_argument("--manifest", required=True, type=Path)
    parser.add_argument(
        "--split", choices=[value.value for value in EvaluationSplit], default=None
    )
    parser.add_argument("--markdown-out", required=True, type=Path)
    parser.add_argument("--json-out", required=True, type=Path)
    parser.add_argument("--bootstrap-replicates", type=int, default=2000)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    manifest = load_evaluation_manifest(args.manifest)
    artifacts = resolve_manifest_artifacts(manifest, args.workspace)
    annotations = resolve_manifest_annotations(manifest, args.workspace)
    split = EvaluationSplit(args.split) if args.split else None
    report = build_product_report(
        manifest,
        artifacts,
        annotations,
        split=split,
        bootstrap_replicates=args.bootstrap_replicates,
        manifest_sha256=hash_file(args.manifest),
    )
    markdown_out = _private_report_path(args.workspace, args.markdown_out)
    json_out = _private_report_path(args.workspace, args.json_out)
    markdown_out.parent.mkdir(parents=True, exist_ok=True)
    markdown_out.write_text(render_product_markdown(report), encoding="utf-8")
    atomic_write_json(json_out, report)
    return 0


def _private_report_path(workspace: Path, output: Path) -> Path:
    """Keep reports under the private workspace; never permit public exports."""

    reports_root = (workspace.resolve() / "reports").resolve()
    target = output.resolve()
    if not target.is_relative_to(reports_root):
        raise ValueError("evaluation reports must be written under workspace/reports")
    return target


if __name__ == "__main__":
    raise SystemExit(main())
