from __future__ import annotations

from pathlib import Path

from audio_library_poc.execution import ExpectedStageFailure
from audio_library_poc.models import TypedError


def resolve_workspace(source_path: Path, source_relative_path: str) -> Path:

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
