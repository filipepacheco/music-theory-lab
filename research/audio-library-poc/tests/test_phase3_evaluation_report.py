"""Private-output boundary tests for the Phase 3 diagnostics report."""

from __future__ import annotations

import importlib.util
from pathlib import Path

import pytest


def test_phase3_report_output_is_restricted_to_workspace_reports(
    tmp_path: Path,
) -> None:
    module = _load_script_module()
    workspace = tmp_path / "workspace"
    reports = workspace / "reports"
    reports.mkdir(parents=True)

    assert module._private_report_path(workspace, reports / "score.md") == (
        reports / "score.md"
    )
    for output in (
        workspace / "public" / "score.md",
        workspace / "library" / "score.md",
        tmp_path / "outside" / "score.md",
    ):
        with pytest.raises(ValueError, match="workspace/reports"):
            module._private_report_path(workspace, output)


def _load_script_module():
    path = Path(__file__).parents[1] / "scripts" / "phase3_evaluation_report.py"
    specification = importlib.util.spec_from_file_location("phase3_report_script", path)
    assert specification and specification.loader
    module = importlib.util.module_from_spec(specification)
    specification.loader.exec_module(module)
    return module
