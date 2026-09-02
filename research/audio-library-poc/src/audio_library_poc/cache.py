"""Deterministic identities for stage configuration and results."""

from __future__ import annotations

import hashlib
import json
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from audio_library_poc.models import StageIdentity


def hash_config(config: dict[str, Any]) -> str:
    canonical = json.dumps(
        config,
        allow_nan=False,
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")
    return hashlib.sha256(canonical).hexdigest()


def stage_cache_key(
    identity: StageIdentity,
) -> str:
    material = json.dumps(
        identity.model_dump(mode="json"),
        allow_nan=False,
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")
    return hashlib.sha256(material).hexdigest()
