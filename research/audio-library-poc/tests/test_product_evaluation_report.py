"""Product report integration and private-output boundary tests."""

from __future__ import annotations

import importlib.util
from datetime import UTC, datetime
from pathlib import Path

import pytest
from test_evaluation_manifest import _prepared_manifest

from audio_library_poc.evaluation_manifest import (
    resolve_manifest_annotations,
    resolve_manifest_artifacts,
)
from audio_library_poc.product_evaluation_report import (
    _bootstrap_key,
    build_product_report,
    render_product_markdown,
)


def test_product_report_keeps_hashes_and_normalized_metrics_private(
    tmp_path: Path,
) -> None:
    manifest, workspace, _ = _prepared_manifest(tmp_path)
    report = build_product_report(
        manifest,
        resolve_manifest_artifacts(manifest, workspace),
        resolve_manifest_annotations(manifest, workspace),
        generated_at=datetime(2026, 1, 1, tzinfo=UTC),
        bootstrap_replicates=10,
        manifest_sha256="f" * 64,
    )

    assert report.manifest["manifest_content_sha256"] == "f" * 64
    assert report.samples["scored_chord_excerpt_count"] == 1
    row = report.chord_scores[0]
    assert row["run_id"] == "one-run"
    assert row["cache_key"]
    assert row["config_sha256"] == "c" * 64
    assert row["metrics"]["richer_reference_reduced_seconds"] == 2.0
    assert row["metrics"]["overall_harmonic_agreement"] == 1.0
    assert "workspace" not in str(report.model_dump(mode="json"))
    assert "uncalibrated" in report.definitions["accepted_output"]
    markdown = render_product_markdown(report)
    assert "No-chord recall" in markdown
    assert "Unknown on N s" in markdown
    assert "Macro contributors/undefined" in markdown
    lines = markdown.splitlines()
    header_index = next(
        index
        for index, line in enumerate(lines)
        if line.startswith("| Recording/excerpt")
    )
    assert lines[header_index].count("|") == 16
    assert lines[header_index + 1].count("|") == 16


def test_markdown_empty_chord_fallback_has_the_table_column_count(
    tmp_path: Path,
) -> None:
    manifest, workspace, _ = _prepared_manifest(tmp_path)
    report = build_product_report(
        manifest,
        resolve_manifest_artifacts(manifest, workspace),
        resolve_manifest_annotations(manifest, workspace),
        bootstrap_replicates=1,
    ).model_copy(update={"chord_scores": []})
    fallback = next(
        line
        for line in render_product_markdown(report).splitlines()
        if line.startswith("| No scored chord excerpts")
    )
    assert fallback.count("|") == 16


def test_key_bootstrap_reports_top3_and_raw_margin_intervals() -> None:
    values = [
        {"top1_rate": 0.0, "top3_rate": 1.0, "mean_top1_margin": 0.1},
        {"top1_rate": 1.0, "top3_rate": 1.0, "mean_top1_margin": 0.3},
    ]
    top3 = _bootstrap_key(values, 20, "top3_rate")
    margin = _bootstrap_key(values, 20, "mean_top1_margin")
    assert top3["lower"] == top3["upper"] == 1.0
    assert 0.1 <= margin["lower"] <= margin["upper"] <= 0.3


def test_product_report_rejects_nonpositive_bootstrap_replicates(
    tmp_path: Path,
) -> None:
    manifest, workspace, _ = _prepared_manifest(tmp_path)
    with pytest.raises(ValueError, match="bootstrap_replicates"):
        build_product_report(
            manifest,
            resolve_manifest_artifacts(manifest, workspace),
            resolve_manifest_annotations(manifest, workspace),
            bootstrap_replicates=0,
        )


def test_report_output_path_rejects_public_or_non_report_targets(
    tmp_path: Path,
) -> None:
    module = _load_script_module()
    workspace = tmp_path / "workspace"
    reports = workspace / "reports"
    reports.mkdir(parents=True)

    assert module._private_report_path(workspace, reports / "score.json") == (
        reports / "score.json"
    )
    with pytest.raises(ValueError, match="workspace/reports"):
        module._private_report_path(workspace, tmp_path / "public" / "score.json")


def _load_script_module():
    path = Path(__file__).parents[1] / "scripts" / "product_evaluation_report.py"
    specification = importlib.util.spec_from_file_location(
        "product_report_script", path
    )
    assert specification and specification.loader
    module = importlib.util.module_from_spec(specification)
    specification.loader.exec_module(module)
    return module
