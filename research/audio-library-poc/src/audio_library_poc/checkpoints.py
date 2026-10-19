from __future__ import annotations

import hashlib
import shutil
import ssl
import urllib.error
import urllib.request
import uuid
from collections.abc import Callable
from dataclasses import dataclass
from enum import StrEnum
from pathlib import Path
from typing import Literal, Self

import yaml
from pydantic import AnyHttpUrl, Field, StrictBool, model_validator

from audio_library_poc.metadata import hash_file
from audio_library_poc.models import ContractModel, Identifier, Sha256
from audio_library_poc.paths import validate_portable_filename

UrlOpener = Callable[[urllib.request.Request, float], object]

DEFAULT_CHUNK_SIZE = 1024 * 1024
DEFAULT_TIMEOUT_SECONDS = 60


class CheckpointEntry(ContractModel):
    """One pinned checkpoint the workspace must materialize before inference."""

    candidate_id: Identifier
    url: AnyHttpUrl
    target_filename: str = Field(min_length=1)
    expected_sha256: Sha256 | None = None
    require_https: StrictBool = True

    @model_validator(mode="after")
    def validate_filename_and_scheme(self) -> Self:
        validate_portable_filename(self.target_filename)
        if self.require_https and self.url.scheme != "https":
            raise ValueError(
                "checkpoint url must use https; set require_https=false to allow http"
            )
        return self


class CheckpointManifest(ContractModel):
    """Pinned checkpoint set for one deployment or bakeoff round."""

    schema_version: Literal["1.0.0"] = "1.0.0"
    manifest_id: Identifier
    checkpoints: list[CheckpointEntry] = Field(min_length=1)

    @model_validator(mode="after")
    def validate_unique_entries(self) -> Self:
        candidate_ids = [entry.candidate_id for entry in self.checkpoints]
        if len(candidate_ids) != len(set(candidate_ids)):
            raise ValueError("candidate_id values must be unique")
        target_filenames = [entry.target_filename for entry in self.checkpoints]
        normalized = [name.casefold() for name in target_filenames]
        if len(normalized) != len(set(normalized)):
            raise ValueError("target_filename values must be case-insensitively unique")
        return self


class FetchOutcome(StrEnum):
    SKIPPED = "skipped"
    DOWNLOADED = "downloaded"


@dataclass(frozen=True)
class FetchReport:
    candidate_id: str
    target_path: Path
    outcome: FetchOutcome
    sha256: str
    bytes_written: int


def load_checkpoint_manifest(path: Path) -> CheckpointManifest:

    raw = Path(path).read_bytes().decode("utf-8")
    document = yaml.safe_load(raw)
    return CheckpointManifest.model_validate(document)


def fetch_checkpoint(
    entry: CheckpointEntry,
    target_directory: Path,
    *,
    opener: UrlOpener | None = None,
    chunk_size: int = DEFAULT_CHUNK_SIZE,
    timeout_seconds: float = DEFAULT_TIMEOUT_SECONDS,
) -> FetchReport:

    if chunk_size < 1:
        raise ValueError("chunk_size must be positive")

    target_directory = Path(target_directory)
    target_directory.mkdir(parents=True, exist_ok=True)
    target_path = target_directory / entry.target_filename

    if target_path.exists():
        existing_hash = hash_file(target_path, chunk_size=chunk_size)
        if entry.expected_sha256 is not None:
            if existing_hash == entry.expected_sha256:
                return FetchReport(
                    candidate_id=entry.candidate_id,
                    target_path=target_path,
                    outcome=FetchOutcome.SKIPPED,
                    sha256=existing_hash,
                    bytes_written=target_path.stat().st_size,
                )
            raise CheckpointHashMismatchError(
                candidate_id=entry.candidate_id,
                target_path=target_path,
                expected=entry.expected_sha256,
                actual=existing_hash,
            )
        return FetchReport(
            candidate_id=entry.candidate_id,
            target_path=target_path,
            outcome=FetchOutcome.SKIPPED,
            sha256=existing_hash,
            bytes_written=target_path.stat().st_size,
        )

    staging_path = (
        target_directory / f".{entry.target_filename}.{uuid.uuid4().hex}.part"
    )
    digest = hashlib.sha256()
    bytes_written = 0
    try:
        request = urllib.request.Request(str(entry.url), method="GET")
        response_ctx = (
            opener(request, timeout_seconds)
            if opener is not None
            else _default_urlopen(request, timeout_seconds)
        )
        with response_ctx as response:
            with staging_path.open("wb") as sink:
                while True:
                    chunk = response.read(chunk_size)
                    if not chunk:
                        break
                    digest.update(chunk)
                    sink.write(chunk)
                    bytes_written += len(chunk)
        actual_sha256 = digest.hexdigest()
        if entry.expected_sha256 is not None and actual_sha256 != entry.expected_sha256:
            raise CheckpointHashMismatchError(
                candidate_id=entry.candidate_id,
                target_path=target_path,
                expected=entry.expected_sha256,
                actual=actual_sha256,
            )
        staging_path.replace(target_path)
    except BaseException:
        _cleanup(staging_path)
        raise
    return FetchReport(
        candidate_id=entry.candidate_id,
        target_path=target_path,
        outcome=FetchOutcome.DOWNLOADED,
        sha256=actual_sha256,
        bytes_written=bytes_written,
    )


def fetch_all(
    manifest: CheckpointManifest,
    target_directory: Path,
    *,
    opener: UrlOpener | None = None,
) -> list[FetchReport]:

    return [
        fetch_checkpoint(entry, target_directory, opener=opener)
        for entry in manifest.checkpoints
    ]


def _default_urlopen(request: urllib.request.Request, timeout_seconds: float):
    context = ssl.create_default_context() if request.type == "https" else None
    if context is not None:
        return urllib.request.urlopen(  # noqa: S310
            request,
            timeout=timeout_seconds,
            context=context,
        )
    return urllib.request.urlopen(  # noqa: S310
        request,
        timeout=timeout_seconds,
    )


def _cleanup(path: Path) -> None:
    try:
        if path.is_dir() and not path.is_symlink():
            shutil.rmtree(path, ignore_errors=True)
        else:
            path.unlink(missing_ok=True)
    except OSError:
        pass


class CheckpointHashMismatchError(RuntimeError):
    def __init__(
        self,
        *,
        candidate_id: str,
        target_path: Path,
        expected: str,
        actual: str,
    ) -> None:
        super().__init__(
            f"checkpoint {candidate_id!r} at {target_path} hashed {actual!r}, "
            f"expected {expected!r}"
        )
        self.candidate_id = candidate_id
        self.target_path = target_path
        self.expected = expected
        self.actual = actual


class CheckpointFetchError(RuntimeError):
    def __init__(self, *, candidate_id: str, cause: BaseException) -> None:
        super().__init__(f"failed to fetch checkpoint {candidate_id!r}: {cause}")
        self.candidate_id = candidate_id
        self.cause = cause


CheckpointNetworkError = urllib.error.URLError
