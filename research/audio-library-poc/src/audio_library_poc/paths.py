"""Portable path contracts shared by execution and persisted models."""

from __future__ import annotations

from pathlib import PurePosixPath, PureWindowsPath

_WINDOWS_INVALID_CHARACTERS = frozenset('<>"|?*')
_WINDOWS_RESERVED_DEVICE_BASENAMES = frozenset(
    {
        "CON",
        "PRN",
        "AUX",
        "NUL",
        *(f"COM{number}" for number in range(1, 10)),
        *(f"LPT{number}" for number in range(1, 10)),
        *(f"COM{superscript}" for superscript in "¹²³"),
        *(f"LPT{superscript}" for superscript in "¹²³"),
    }
)


def validate_portable_path_component(value: str) -> str:
    """Return one portable path component or raise ``ValueError``."""

    if not isinstance(value, str) or not value or value in {".", ".."}:
        raise ValueError("path component must be a non-empty filename")

    posix_path = PurePosixPath(value)
    windows_path = PureWindowsPath(value)
    if posix_path.is_absolute() or windows_path.is_absolute() or windows_path.drive:
        raise ValueError("path component must not be an absolute or drive path")
    if any(character in value for character in ("/", "\\")):
        raise ValueError("path component must not contain path separators")
    if ":" in value:
        raise ValueError("path component must not contain a colon")
    if any(character in _WINDOWS_INVALID_CHARACTERS for character in value):
        raise ValueError("path component contains a Windows-invalid character")
    if any(ord(character) <= 0x1F for character in value):
        raise ValueError("path component must not contain control characters")
    if value.endswith((".", " ")):
        raise ValueError("path component must not end with a dot or space")

    device_basename = value.split(".", maxsplit=1)[0].upper()
    if device_basename in _WINDOWS_RESERVED_DEVICE_BASENAMES:
        raise ValueError("path component basename is reserved on Windows")
    return value


def validate_portable_filename(value: str) -> str:
    """Return a portable single filename, rejecting every path form."""

    return validate_portable_path_component(value)


def validate_workspace_relative_path(value: str) -> str:
    """Return a normalized portable path relative to a workspace root."""

    if not isinstance(value, str) or not value:
        raise ValueError("path must be a non-empty workspace-relative path")

    windows_path = PureWindowsPath(value)
    normalized = value.replace("\\", "/")
    if (
        normalized.startswith("/")
        or PurePosixPath(normalized).is_absolute()
        or windows_path.is_absolute()
        or bool(windows_path.drive)
    ):
        raise ValueError("path must be relative to the workspace")

    components = normalized.split("/")
    if any(not component for component in components):
        raise ValueError("path must not contain empty components")

    for component in components:
        try:
            validate_portable_path_component(component)
        except ValueError as error:
            raise ValueError(
                f"path contains an invalid component {component!r}: {error}"
            ) from error
    return "/".join(components)
