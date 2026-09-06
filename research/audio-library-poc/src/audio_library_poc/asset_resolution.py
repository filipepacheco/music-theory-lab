"""Workspace-relative model-asset resolution, free of inference imports.

These helpers live outside the ``_*_runtime`` modules so that the
torch-free adapters and stages can reject a missing or escaping checkpoint
*before* importing torch, librosa or soundfile.

That ordering is the contract the ``…_reports_missing_checkpoint_before_
touching_torch`` and ``…checkpoint_missing_yields_typed_failure`` tests
assert, and it is what keeps the offline harness runnable with only the
``dev`` extra installed. Resolving inside the runtime instead raises
``ModuleNotFoundError`` from the heavy import before the typed failure can
be produced.

Each caller supplies its own error-code prefix and display name so the
typed errors stay exactly what they were when this logic was private to
each runtime.
"""

from __future__ import annotations

from pathlib import Path

from audio_library_poc.execution import ExpectedStageFailure
from audio_library_poc.models import TypedError


def resolve_workspace(source_path: Path, source_relative_path: str) -> Path:
    """Recover the workspace root from the bridge-resolved ``source_path``.

    The bridge resolved ``workspace / source_relative_path`` into
    ``source_path``. Stripping the relative components from the tail gives
    back the workspace root without threading it through the request.
    """

    relative_parts = Path(source_relative_path).as_posix().split("/")
    root = source_path
    for _ in relative_parts:
        root = root.parent
    return root


def resolve_workspace_asset(
    workspace: Path,
    relative_path: str,
    *,
    code_prefix: str,
    label: str,
    outside_message: str,
    missing_message: str,
) -> Path:
    """Resolve ``relative_path`` under ``workspace`` or raise a typed failure.

    Raises ``{code_prefix}.{label}_outside_workspace`` when the path escapes
    the workspace, and ``{code_prefix}.{label}_missing`` when nothing is
    there. Both carry ``details['relative_path']``.
    """

    candidate = (workspace / Path(relative_path)).resolve()
    if not candidate.is_relative_to(workspace):
        raise ExpectedStageFailure(
            TypedError(
                code=f"{code_prefix}.{label}_outside_workspace",
                message=outside_message,
                retryable=False,
                details={"relative_path": relative_path},
            )
        )
    if not candidate.is_file():
        raise ExpectedStageFailure(
            TypedError(
                code=f"{code_prefix}.{label}_missing",
                message=missing_message,
                retryable=False,
                details={"relative_path": relative_path},
            )
        )
    return candidate
