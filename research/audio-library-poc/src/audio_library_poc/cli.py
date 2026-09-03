"""Public command-line interface for the standalone audio-library POC."""

from __future__ import annotations

import argparse
import sys
from collections.abc import Sequence
from pathlib import Path
from typing import Any, TextIO

import yaml
from pydantic import TypeAdapter, ValidationError

from audio_library_poc.execution import StageInterruption
from audio_library_poc.io import atomic_write_json, canonical_json_bytes
from audio_library_poc.manifest import (
    ManifestEncodingError,
    load_corpus_manifest,
    load_pipeline_manifest,
)
from audio_library_poc.metadata import PocRuntimeError, inspect_sources
from audio_library_poc.models import (
    CorpusManifest,
    Identifier,
    PipelineManifest,
    Sha256,
    StageResultEnvelope,
    StageStatus,
    TypedError,
)
from audio_library_poc.orchestrator import StageOrchestrator
from audio_library_poc.schemas import export_json_schemas
from audio_library_poc.stage_dispatch import build_stage_dispatcher

EXIT_SUCCESS = 0
EXIT_USAGE = 2
EXIT_RUNTIME = 3
EXIT_STAGE_FAILED = 4

RUN_ID_ADAPTER = TypeAdapter(Identifier)
INPUT_SHA256_ADAPTER = TypeAdapter(Sha256)


class CliUsageError(ValueError):
    """Invalid command-line input that should be rendered as JSON."""


class CliInputValidationError(Exception):
    """Expected user-input validation failure with safe issue details."""

    def __init__(self, issues: list[dict[str, Any]]) -> None:
        self.issues = issues
        super().__init__("input failed schema validation")

    @classmethod
    def from_pydantic(
        cls,
        error: ValidationError,
        *,
        location_prefix: Sequence[str | int] = (),
    ) -> CliInputValidationError:
        issues: list[dict[str, Any]] = []
        for issue in error.errors(
            include_url=False,
            include_context=False,
            include_input=False,
        ):
            location = [
                component if isinstance(component, (str, int)) else str(component)
                for component in issue["loc"]
            ]
            issues.append(
                {
                    "location": [*location_prefix, *location],
                    "message": str(issue["msg"]),
                    "type": str(issue["type"]),
                }
            )
        return cls(issues)


class JsonArgumentParser(argparse.ArgumentParser):
    """Argument parser whose expected errors are handled by ``main``."""

    def error(self, message: str) -> None:
        raise CliUsageError(message)


def build_parser() -> argparse.ArgumentParser:
    parser = JsonArgumentParser(
        prog="audio-library-poc",
        description="Deterministic audio-library POC harness.",
    )
    commands = parser.add_subparsers(dest="command", required=True)

    validate = commands.add_parser(
        "validate-corpus",
        help="Load and validate a corpus manifest.",
    )
    validate.add_argument("manifest", type=Path)
    validate.set_defaults(handler=_validate_corpus)

    inspect = commands.add_parser(
        "inspect",
        help="Hash and inspect audio sources with ffprobe.",
    )
    inspect.add_argument("sources", nargs="+", type=Path)
    inspect.add_argument("--output", required=True, type=Path)
    inspect.add_argument("--ffprobe", default="ffprobe", metavar="EXECUTABLE")
    inspect.set_defaults(handler=_inspect_sources)

    schemas = commands.add_parser(
        "export-schemas",
        help="Export deterministic JSON Schemas.",
    )
    schemas.add_argument("--output", required=True, type=Path)
    schemas.set_defaults(handler=_export_schemas)

    run_fake = commands.add_parser(
        "run-fake",
        help="Run all fake pipeline stages sequentially.",
    )
    run_fake.add_argument("--pipeline", required=True, type=Path)
    run_fake.add_argument("--workspace", required=True, type=Path)
    run_fake.add_argument("--run-id", required=True)
    run_fake.add_argument("--input-sha256", required=True)
    _add_run_control_flags(run_fake)
    run_fake.set_defaults(handler=_run_fake)

    run = commands.add_parser(
        "run",
        help=(
            "Run all pipeline stages sequentially, dispatching each to its "
            "registered executor."
        ),
    )
    run.add_argument("--pipeline", required=True, type=Path)
    run.add_argument("--workspace", required=True, type=Path)
    run.add_argument("--run-id", required=True)
    run.add_argument("--input-sha256", required=True)
    _add_run_control_flags(run)
    run.set_defaults(handler=_run)
    return parser


def _add_run_control_flags(subparser: argparse.ArgumentParser) -> None:
    control = subparser.add_mutually_exclusive_group()
    control.add_argument(
        "--pause",
        action="store_true",
        help="Persist a pause request before the next stage boundary.",
    )
    control.add_argument(
        "--cancel",
        action="store_true",
        help="Persist a cancellation request before the next stage boundary.",
    )
    control.add_argument(
        "--resume",
        action="store_true",
        help="Clear a persisted pause or cancellation request before running.",
    )


def main(argv: Sequence[str] | None = None) -> int:
    """Run the CLI and return a process-compatible exit status."""

    try:
        arguments = build_parser().parse_args(argv)
        handler = arguments.handler
        return int(handler(arguments))
    except CliUsageError as exc:
        return _emit_error(
            TypedError(
                code="cli.usage",
                message=str(exc),
                retryable=False,
            ),
            EXIT_USAGE,
        )
    except ManifestEncodingError as exc:
        return _emit_error(
            TypedError(
                code="manifest.encoding",
                message="manifest must be encoded as UTF-8",
                retryable=False,
                details={"filename": str(exc.path)},
            ),
            EXIT_USAGE,
        )
    except PocRuntimeError as exc:
        return _emit_error(exc.error, EXIT_RUNTIME)
    except StageInterruption as exc:
        return _emit_error(
            TypedError(
                code="stage.interrupted",
                message=str(exc),
                retryable=True,
            ),
            EXIT_RUNTIME,
        )
    except CliInputValidationError as exc:
        return _emit_error(
            TypedError(
                code="validation.invalid",
                message="input failed schema validation",
                retryable=False,
                details={"issues": exc.issues},
            ),
            EXIT_USAGE,
        )
    except yaml.YAMLError as exc:
        return _emit_error(
            TypedError(
                code="manifest.yaml",
                message="manifest is not valid safe YAML",
                retryable=False,
                details={"exception_type": type(exc).__name__},
            ),
            EXIT_USAGE,
        )
    except FileNotFoundError as exc:
        return _emit_error(
            TypedError(
                code="filesystem.not_found",
                message="required file was not found",
                retryable=False,
                details={"filename": str(exc.filename or "")},
            ),
            EXIT_RUNTIME,
        )
    except OSError as exc:
        return _emit_error(
            TypedError(
                code="filesystem.io",
                message="filesystem operation failed",
                retryable=True,
                details={
                    "errno": exc.errno,
                    "exception_type": type(exc).__name__,
                },
            ),
            EXIT_RUNTIME,
        )


def _validate_corpus(arguments: argparse.Namespace) -> int:
    manifest = _load_corpus_input(arguments.manifest)
    _emit_json(
        {
            "command": "validate-corpus",
            "corpus_id": manifest.corpus_id,
            "excerpt_count": sum(
                len(track.annotation.excerpts) for track in manifest.tracks
            ),
            "ok": True,
            "schema_version": manifest.schema_version,
            "track_count": len(manifest.tracks),
            "track_ids": [track.track_id for track in manifest.tracks],
        }
    )
    return EXIT_SUCCESS


def _inspect_sources(arguments: argparse.Namespace) -> int:
    report = inspect_sources(arguments.sources, executable=arguments.ffprobe)
    atomic_write_json(arguments.output, report)
    _emit_json(
        {
            "command": "inspect",
            "duplicate_group_count": len(report.duplicates),
            "ok": True,
            "output": str(arguments.output),
            "source_count": len(report.results),
        }
    )
    return EXIT_SUCCESS


def _export_schemas(arguments: argparse.Namespace) -> int:
    written = export_json_schemas(arguments.output)
    _emit_json(
        {
            "command": "export-schemas",
            "files": [path.name for path in written],
            "ok": True,
            "output": str(arguments.output),
            "schema_count": len(written),
        }
    )
    return EXIT_SUCCESS


def _run_fake(arguments: argparse.Namespace) -> int:
    return _execute_pipeline(arguments, command="run-fake", use_dispatcher=False)


def _run(arguments: argparse.Namespace) -> int:
    return _execute_pipeline(arguments, command="run", use_dispatcher=True)


def _execute_pipeline(
    arguments: argparse.Namespace,
    *,
    command: str,
    use_dispatcher: bool,
) -> int:
    pipeline = _load_pipeline_input(arguments.pipeline)
    run_id = _validate_cli_value(
        RUN_ID_ADAPTER,
        arguments.run_id,
        location="run_id",
    )
    input_sha256 = _validate_cli_value(
        INPUT_SHA256_ADAPTER,
        arguments.input_sha256,
        location="input_sha256",
    )
    if use_dispatcher:
        orchestrator = StageOrchestrator(
            arguments.workspace,
            dispatcher=build_stage_dispatcher(arguments.workspace),
        )
    else:
        orchestrator = StageOrchestrator(arguments.workspace)
    if arguments.pause:
        orchestrator.request_pause(run_id)
    elif arguments.cancel:
        orchestrator.request_cancel(run_id)
    elif arguments.resume:
        orchestrator.clear_control(run_id)

    results: list[StageResultEnvelope] = []
    for specification in pipeline.stages:
        result = orchestrator.run_stage(
            run_id=run_id,
            specification=specification,
            input_sha256=input_sha256,
            code_revision=pipeline.code_revision,
        )
        results.append(result)
        if result.status is not StageStatus.SUCCEEDED:
            break
        if not result.artifacts:
            raise PocRuntimeError(
                TypedError(
                    code="stage.missing_artifact",
                    message=(
                        f"successful stage {result.stage_kind} published no artifact"
                    ),
                    retryable=False,
                )
            )
        input_sha256 = result.artifacts[0].sha256

    final_status = results[-1].status
    _emit_json(
        {
            "command": command,
            "completed": len(results) == len(pipeline.stages)
            and final_status is StageStatus.SUCCEEDED,
            "ok": final_status
            in {
                StageStatus.SUCCEEDED,
                StageStatus.PAUSED,
                StageStatus.CANCELLED,
            },
            "pipeline_id": pipeline.pipeline_id,
            "run_id": run_id,
            "stage_count": len(results),
            "stages": [_stage_summary(result) for result in results],
            "status": final_status.value,
        }
    )
    if final_status in {
        StageStatus.FAILED_RETRYABLE,
        StageStatus.FAILED_TERMINAL,
    }:
        return EXIT_STAGE_FAILED
    return EXIT_SUCCESS


def _stage_summary(result: StageResultEnvelope) -> dict[str, Any]:
    return {
        "artifacts": [
            artifact.model_dump(mode="json") for artifact in result.artifacts
        ],
        "attempts": result.attempt,
        "cache_key": result.cache_key,
        "error": (
            result.error.model_dump(mode="json") if result.error is not None else None
        ),
        "input_sha256": result.input_sha256,
        "stage_kind": result.stage_kind,
        "status": result.status.value,
    }


def _load_corpus_input(path: Path) -> CorpusManifest:
    try:
        return load_corpus_manifest(path)
    except ValidationError as exc:
        raise CliInputValidationError.from_pydantic(exc) from exc


def _load_pipeline_input(path: Path) -> PipelineManifest:
    try:
        return load_pipeline_manifest(path)
    except ValidationError as exc:
        raise CliInputValidationError.from_pydantic(exc) from exc


def _validate_cli_value(
    adapter: TypeAdapter[str],
    value: str,
    *,
    location: str,
) -> str:
    try:
        return adapter.validate_python(value)
    except ValidationError as exc:
        raise CliInputValidationError.from_pydantic(
            exc,
            location_prefix=(location,),
        ) from exc


def _emit_error(error: TypedError, exit_status: int) -> int:
    _emit_json(
        {
            "error": error.model_dump(mode="json"),
            "ok": False,
        },
        stream=sys.stderr,
    )
    return exit_status


def _emit_json(value: Any, *, stream: TextIO | None = None) -> None:
    if stream is None:
        stream = sys.stdout
    stream.write(canonical_json_bytes(value).decode())
    stream.flush()


if __name__ == "__main__":
    raise SystemExit(main())
