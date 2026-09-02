"""Source hashing and ffprobe-backed metadata extraction."""

from __future__ import annotations

import hashlib
import json
import re
import subprocess
from collections.abc import Callable, Sequence
from pathlib import Path

from pydantic import ValidationError

from audio_library_poc.models import (
    AudioFormatFacts,
    AudioStreamFacts,
    CanonicalMetadata,
    DuplicateContent,
    FfprobePayload,
    MetadataOrigin,
    MetadataOrigins,
    MetadataResult,
    SourceInspectionReport,
    TypedError,
)

ProcessRunner = Callable[..., subprocess.CompletedProcess[str]]


class PocRuntimeError(RuntimeError):
    """Runtime failure with a serializable error contract."""

    def __init__(self, error: TypedError) -> None:
        super().__init__(error.message)
        self.error = error


def hash_file(path: Path, *, chunk_size: int = 1024 * 1024) -> str:
    """Return a SHA-256 digest without loading the source into memory."""

    if chunk_size < 1:
        raise ValueError("chunk_size must be positive")

    digest = hashlib.sha256()
    with Path(path).open("rb") as source:
        for chunk in iter(lambda: source.read(chunk_size), b""):
            digest.update(chunk)
    return digest.hexdigest()


def run_ffprobe(
    path: Path,
    *,
    executable: str = "ffprobe",
    runner: ProcessRunner = subprocess.run,
) -> FfprobePayload:
    """Run ffprobe without a shell and validate its JSON boundary."""

    argv = [
        executable,
        "-v",
        "error",
        "-show_format",
        "-show_streams",
        "-of",
        "json",
        str(path),
    ]
    try:
        completed = runner(
            argv,
            capture_output=True,
            text=True,
            encoding="utf-8",
            check=False,
            shell=False,
            timeout=60,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise PocRuntimeError(
            TypedError(
                code="ffprobe.execution",
                message=f"ffprobe could not inspect {path.name}",
                retryable=True,
                details={"exception_type": type(exc).__name__},
            )
        ) from exc

    if completed.returncode != 0:
        raise PocRuntimeError(
            TypedError(
                code="ffprobe.failed",
                message=f"ffprobe rejected {path.name}",
                retryable=False,
                details={
                    "returncode": completed.returncode,
                    "stderr": (completed.stderr or "").strip(),
                },
            )
        )

    try:
        raw_payload = json.loads(completed.stdout)
        return FfprobePayload.model_validate(raw_payload)
    except (json.JSONDecodeError, ValidationError, TypeError) as exc:
        raise PocRuntimeError(
            TypedError(
                code="ffprobe.invalid_output",
                message=f"ffprobe returned invalid JSON for {path.name}",
                retryable=False,
                details={"exception_type": type(exc).__name__},
            )
        ) from exc


def inspect_source(
    path: Path,
    *,
    executable: str = "ffprobe",
    runner: ProcessRunner = subprocess.run,
) -> MetadataResult:
    source = Path(path)
    source_sha256 = hash_file(source)
    payload = run_ffprobe(source, executable=executable, runner=runner)
    return metadata_from_probe(source, source_sha256, payload)


def inspect_sources(
    paths: Sequence[Path],
    *,
    executable: str = "ffprobe",
    runner: ProcessRunner = subprocess.run,
) -> SourceInspectionReport:
    """Inspect unique content once and report duplicate source paths."""

    sources = [Path(path) for path in paths]
    digests = [hash_file(source) for source in sources]
    first_source_by_hash: dict[str, Path] = {}
    probe_by_hash: dict[str, FfprobePayload] = {}
    paths_by_hash: dict[str, list[str]] = {}
    results: list[MetadataResult] = []

    for source, source_sha256 in zip(sources, digests, strict=True):
        paths_by_hash.setdefault(source_sha256, []).append(str(source))
        first_source = first_source_by_hash.get(source_sha256)
        if first_source is None:
            first_source_by_hash[source_sha256] = source
            probe_by_hash[source_sha256] = run_ffprobe(
                source,
                executable=executable,
                runner=runner,
            )

        results.append(
            metadata_from_probe(
                source,
                source_sha256,
                probe_by_hash[source_sha256],
                duplicate_of_source_path=(
                    str(first_source) if first_source is not None else None
                ),
            )
        )

    duplicates = [
        DuplicateContent(sha256=digest, source_paths=grouped_paths)
        for digest, grouped_paths in paths_by_hash.items()
        if len(grouped_paths) > 1
    ]
    return SourceInspectionReport(results=results, duplicates=duplicates)


def metadata_from_probe(
    source: Path,
    source_sha256: str,
    payload: FfprobePayload,
    *,
    duplicate_of_source_path: str | None = None,
) -> MetadataResult:
    title = _find_tag(payload, ("title",))
    artist = _find_tag(payload, ("artist",))
    album = _find_tag(payload, ("album",))
    year_text = _find_tag(
        payload,
        ("date", "year", "originaldate", "original_date"),
    )
    genre_text = _find_tag(payload, ("genre",))

    filename_artist, filename_title = _filename_fields(source)
    canonical_title, title_origin = _with_filename_fallback(title, filename_title)
    canonical_artist, artist_origin = _with_filename_fallback(
        artist,
        filename_artist,
    )
    year = _parse_year(year_text)
    genres = _parse_genres(genre_text)

    return MetadataResult(
        source_path=str(source),
        source_sha256=source_sha256,
        duplicate_of_source_path=duplicate_of_source_path,
        canonical=CanonicalMetadata(
            title=canonical_title,
            artist=canonical_artist,
            album=album,
            year=year,
            genres=genres,
        ),
        origins=MetadataOrigins(
            title=title_origin,
            artist=artist_origin,
            album=_embedded_or_missing(album),
            year=_embedded_or_missing(year),
            genres=_embedded_or_missing(genres),
        ),
        format=AudioFormatFacts(
            format_name=payload.format.format_name,
            format_long_name=payload.format.format_long_name,
            duration_seconds=_optional_float(payload.format.duration),
            size_bytes=_optional_int(payload.format.size),
            bit_rate=_optional_int(payload.format.bit_rate),
        ),
        streams=[
            AudioStreamFacts(
                index=stream.index,
                codec_type=stream.codec_type,
                codec_name=stream.codec_name,
                sample_rate=_optional_int(stream.sample_rate),
                channels=stream.channels,
            )
            for stream in payload.streams
        ],
        raw_format_tags=payload.format.tags,
        raw_stream_tags=[stream.tags for stream in payload.streams],
    )


def _tag_sources(payload: FfprobePayload) -> Sequence[dict[str, object]]:
    return [payload.format.tags, *(stream.tags for stream in payload.streams)]


def _find_tag(payload: FfprobePayload, names: tuple[str, ...]) -> str | None:
    wanted = set(names)
    for tags in _tag_sources(payload):
        for key, value in tags.items():
            if key.casefold() not in wanted or value is None:
                continue
            text = str(value).strip()
            if text:
                return text
    return None


def _filename_fields(path: Path) -> tuple[str | None, str | None]:
    parts = path.stem.split(" - ")
    if len(parts) != 2:
        return None, None
    artist, title = (part.strip() for part in parts)
    if not artist or not title:
        return None, None
    return artist, title


def _with_filename_fallback(
    embedded: str | None,
    inferred: str | None,
) -> tuple[str | None, MetadataOrigin]:
    if embedded is not None:
        return embedded, MetadataOrigin.EMBEDDED
    if inferred is not None:
        return inferred, MetadataOrigin.FILENAME
    return None, MetadataOrigin.MISSING


def _embedded_or_missing(value: object | None) -> MetadataOrigin:
    return MetadataOrigin.EMBEDDED if value is not None else MetadataOrigin.MISSING


def _parse_year(value: str | None) -> int | None:
    if value is None:
        return None
    match = re.search(r"\b(1\d{3}|20\d{2}|2100)\b", value)
    return int(match.group(1)) if match else None


def _parse_genres(value: str | None) -> list[str] | None:
    if value is None:
        return None
    genres = [part.strip() for part in re.split(r"[;,]", value) if part.strip()]
    return list(dict.fromkeys(genres)) or None


def _optional_float(value: str | int | float | None) -> float | None:
    try:
        return float(value) if value is not None else None
    except (TypeError, ValueError):
        return None


def _optional_int(value: str | int | None) -> int | None:
    try:
        return int(value) if value is not None else None
    except (TypeError, ValueError):
        return None
