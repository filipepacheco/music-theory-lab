"""Command-line entry point for the offline checkpoint fetcher.

Kept separate from ``audio_library_poc.cli`` so the ``audio-library-poc``
command stays fully offline. Invoke with the same virtualenv:

    .venv\\Scripts\\python.exe scripts/fetch_checkpoints.py \\
        --manifest workspace/checkpoints.local.yaml \\
        --target workspace/models

Downloads are hash-verified before being placed at the target path. A
mismatch raises without touching any existing file.
"""

from __future__ import annotations

import argparse
import json
import sys
from collections.abc import Sequence
from pathlib import Path
from typing import Any, TextIO

from pydantic import ValidationError

from audio_library_poc.checkpoints import (
    CheckpointHashMismatchError,
    CheckpointNetworkError,
    fetch_all,
    load_checkpoint_manifest,
)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="fetch_checkpoints",
        description="Fetch pinned separator checkpoints into a target directory.",
    )
    parser.add_argument("--manifest", required=True, type=Path)
    parser.add_argument("--target", required=True, type=Path)
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    arguments = build_parser().parse_args(argv)

    try:
        manifest = load_checkpoint_manifest(arguments.manifest)
    except FileNotFoundError:
        return _emit_error(
            "manifest.not_found",
            f"checkpoint manifest not found: {arguments.manifest}",
            stream=sys.stderr,
        )
    except ValidationError as exc:
        return _emit_error(
            "manifest.invalid",
            "checkpoint manifest failed validation",
            details={"error_count": exc.error_count()},
            stream=sys.stderr,
        )

    try:
        reports = fetch_all(manifest, arguments.target)
    except CheckpointHashMismatchError as exc:
        return _emit_error(
            "checkpoint.hash_mismatch",
            str(exc),
            details={
                "candidate_id": exc.candidate_id,
                "expected": exc.expected,
                "actual": exc.actual,
                "target_path": str(exc.target_path),
            },
            stream=sys.stderr,
        )
    except CheckpointNetworkError as exc:
        return _emit_error(
            "checkpoint.network_error",
            f"checkpoint download failed: {exc.reason}",
            details={"reason": str(exc.reason)},
            stream=sys.stderr,
        )

    _emit_json(
        {
            "command": "fetch-checkpoints",
            "manifest_id": manifest.manifest_id,
            "target": str(arguments.target),
            "fetched": [
                {
                    "candidate_id": report.candidate_id,
                    "target_path": str(report.target_path),
                    "outcome": report.outcome.value,
                    "sha256": report.sha256,
                    "bytes_written": report.bytes_written,
                }
                for report in reports
            ],
            "ok": True,
        }
    )
    return 0


def _emit_error(
    code: str,
    message: str,
    *,
    details: dict[str, Any] | None = None,
    stream: TextIO,
) -> int:
    _emit_json(
        {
            "error": {
                "code": code,
                "message": message,
                "retryable": False,
                "details": details or {},
            },
            "ok": False,
        },
        stream=stream,
    )
    return 1


def _emit_json(value: Any, *, stream: TextIO | None = None) -> None:
    stream = stream if stream is not None else sys.stdout
    stream.write(json.dumps(value, indent=2, sort_keys=True))
    stream.write("\n")
    stream.flush()


if __name__ == "__main__":
    raise SystemExit(main())
