"""Deterministic structured events for local POC runs."""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Literal

from pydantic import Field, JsonValue

from audio_library_poc.models import (
    ContractModel,
    Identifier,
    Sha256,
    StageStatus,
    TypedError,
)


class RunEvent(ContractModel):
    """One stable JSON Lines record emitted at a stage boundary."""

    schema_version: Literal["1.0.0"] = "1.0.0"
    event_name: Identifier
    stage_kind: Identifier
    attempt: int = Field(ge=0)
    status: StageStatus
    cache_key: Sha256
    fields: dict[str, JsonValue] = Field(default_factory=dict)
    error: TypedError | None = None


class JsonlEventLog:
    """Append validated run events without wall-clock-dependent fields."""

    def __init__(self, path: Path) -> None:
        self.path = Path(path)

    def emit(
        self,
        *,
        event_name: str,
        stage_kind: str,
        attempt: int,
        status: StageStatus,
        cache_key: str,
        fields: dict[str, JsonValue] | None = None,
        error: TypedError | None = None,
    ) -> RunEvent:
        event = RunEvent(
            event_name=event_name,
            stage_kind=stage_kind,
            attempt=attempt,
            status=status,
            cache_key=cache_key,
            fields=fields or {},
            error=error,
        )
        payload = (
            json.dumps(
                event.model_dump(mode="json", exclude_none=True),
                allow_nan=False,
                ensure_ascii=False,
                separators=(",", ":"),
                sort_keys=True,
            ).encode("utf-8")
            + b"\n"
        )

        self.path.parent.mkdir(parents=True, exist_ok=True)
        descriptor = os.open(
            self.path,
            os.O_APPEND | os.O_CREAT | os.O_WRONLY | os.O_BINARY,
            0o600,
        )
        try:
            written = os.write(descriptor, payload)
            if written != len(payload):
                raise OSError("event log write was incomplete")
            os.fsync(descriptor)
        finally:
            os.close(descriptor)
        return event


def read_events(path: Path) -> list[RunEvent]:
    """Read complete event records, ignoring a torn final append."""

    source = Path(path)
    if not source.exists():
        return []

    payload = source.read_bytes()
    if not payload:
        return []

    lines = payload.splitlines()
    if not payload.endswith(b"\n"):
        lines = lines[:-1]
    return [RunEvent.model_validate_json(line) for line in lines if line]
