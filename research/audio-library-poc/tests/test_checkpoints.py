"""Tests for the checkpoint manifest, fetcher, and CLI wrapper script."""

from __future__ import annotations

import hashlib
import json
import subprocess
import sys
import textwrap
from pathlib import Path

import pytest
from pydantic import ValidationError

from audio_library_poc.checkpoints import (
    CheckpointEntry,
    CheckpointHashMismatchError,
    CheckpointManifest,
    FetchOutcome,
    fetch_checkpoint,
    load_checkpoint_manifest,
)

PACKAGE_ROOT = Path(__file__).parents[1]
SCRIPT_PATH = PACKAGE_ROOT / "scripts" / "fetch_checkpoints.py"


def _valid_entry(**overrides) -> CheckpointEntry:
    values = {
        "candidate_id": "example",
        "url": "https://example.invalid/pinned/model.ckpt",
        "target_filename": "model.ckpt",
        "expected_sha256": None,
    }
    values.update(overrides)
    return CheckpointEntry.model_validate(values)


def _make_opener(payload: bytes):
    def opener(request, timeout):
        class _Response:
            def __enter__(self_inner):
                return self_inner

            def __exit__(self_inner, exc_type, exc, tb):
                return False

            def read(self_inner, chunk_size):
                nonlocal payload
                if not payload:
                    return b""
                head, payload = payload[:chunk_size], payload[chunk_size:]
                return head

        return _Response()

    return opener


def test_committed_example_manifest_validates() -> None:
    manifest = load_checkpoint_manifest(PACKAGE_ROOT / "checkpoints.example.yaml")

    assert manifest.manifest_id == "example-phase-2-checkpoints"
    assert [entry.candidate_id for entry in manifest.checkpoints] == [
        "bs_roformer",
        "demucs_htdemucs_6s",
    ]
    for entry in manifest.checkpoints:
        assert entry.expected_sha256 is None
        assert entry.url.scheme == "https"


def test_manifest_rejects_duplicate_candidate_ids() -> None:
    with pytest.raises(ValidationError):
        CheckpointManifest.model_validate(
            {
                "manifest_id": "dup",
                "checkpoints": [
                    {
                        "candidate_id": "example",
                        "url": "https://example.invalid/a.ckpt",
                        "target_filename": "a.ckpt",
                    },
                    {
                        "candidate_id": "example",
                        "url": "https://example.invalid/b.ckpt",
                        "target_filename": "b.ckpt",
                    },
                ],
            }
        )


def test_manifest_rejects_case_insensitive_filename_duplicates() -> None:
    with pytest.raises(ValidationError):
        CheckpointManifest.model_validate(
            {
                "manifest_id": "dup",
                "checkpoints": [
                    {
                        "candidate_id": "one",
                        "url": "https://example.invalid/a.ckpt",
                        "target_filename": "Model.ckpt",
                    },
                    {
                        "candidate_id": "two",
                        "url": "https://example.invalid/b.ckpt",
                        "target_filename": "model.ckpt",
                    },
                ],
            }
        )


def test_entry_rejects_http_without_opt_in() -> None:
    with pytest.raises(ValidationError):
        CheckpointEntry.model_validate(
            {
                "candidate_id": "insecure",
                "url": "http://example.invalid/model.ckpt",
                "target_filename": "model.ckpt",
            }
        )


def test_entry_allows_http_with_explicit_opt_in() -> None:
    entry = CheckpointEntry.model_validate(
        {
            "candidate_id": "insecure",
            "url": "http://example.invalid/model.ckpt",
            "target_filename": "model.ckpt",
            "require_https": False,
        }
    )

    assert entry.url.scheme == "http"


def test_entry_rejects_unportable_target_filename() -> None:
    with pytest.raises(ValidationError):
        CheckpointEntry.model_validate(
            {
                "candidate_id": "bad",
                "url": "https://example.invalid/model.ckpt",
                "target_filename": "sub/dir/model.ckpt",
            }
        )


def test_fetch_downloads_and_returns_hash_when_expected_is_none(
    tmp_path: Path,
) -> None:
    payload = b"MODEL-BYTES"
    expected = hashlib.sha256(payload).hexdigest()
    entry = _valid_entry()

    report = fetch_checkpoint(entry, tmp_path, opener=_make_opener(payload))

    assert report.outcome is FetchOutcome.DOWNLOADED
    assert report.sha256 == expected
    assert report.bytes_written == len(payload)
    assert (tmp_path / "model.ckpt").read_bytes() == payload
    assert list(tmp_path.glob(".model.ckpt.*.part")) == []


def test_fetch_enforces_expected_sha256_on_download(tmp_path: Path) -> None:
    payload = b"MODEL-BYTES"
    entry = _valid_entry(expected_sha256="0" * 64)

    with pytest.raises(CheckpointHashMismatchError) as captured:
        fetch_checkpoint(entry, tmp_path, opener=_make_opener(payload))

    assert captured.value.expected == "0" * 64
    assert captured.value.actual == hashlib.sha256(payload).hexdigest()
    assert not (tmp_path / "model.ckpt").exists()
    assert list(tmp_path.glob(".model.ckpt.*.part")) == []


def test_fetch_skips_when_existing_file_matches_expected(tmp_path: Path) -> None:
    payload = b"KEEP"
    (tmp_path / "model.ckpt").write_bytes(payload)
    entry = _valid_entry(expected_sha256=hashlib.sha256(payload).hexdigest())

    report = fetch_checkpoint(
        entry,
        tmp_path,
        opener=_make_opener(b"THIS-SHOULD-NOT-BE-USED"),
    )

    assert report.outcome is FetchOutcome.SKIPPED
    assert report.sha256 == entry.expected_sha256
    assert (tmp_path / "model.ckpt").read_bytes() == payload


def test_fetch_skips_when_existing_file_and_expected_is_none(tmp_path: Path) -> None:
    payload = b"KEEP-UNPINNED"
    (tmp_path / "model.ckpt").write_bytes(payload)
    entry = _valid_entry(expected_sha256=None)

    report = fetch_checkpoint(entry, tmp_path, opener=_make_opener(b"IGNORED"))

    assert report.outcome is FetchOutcome.SKIPPED
    assert report.sha256 == hashlib.sha256(payload).hexdigest()


def test_fetch_raises_when_existing_file_mismatches_expected(tmp_path: Path) -> None:
    payload = b"OLD-VERSION"
    (tmp_path / "model.ckpt").write_bytes(payload)
    entry = _valid_entry(expected_sha256="0" * 64)

    with pytest.raises(CheckpointHashMismatchError):
        fetch_checkpoint(entry, tmp_path, opener=_make_opener(b"UNUSED"))

    assert (tmp_path / "model.ckpt").read_bytes() == payload


def test_fetch_cleans_up_staging_file_on_opener_error(tmp_path: Path) -> None:
    entry = _valid_entry()

    def broken_opener(request, timeout):
        raise RuntimeError("network gremlin")

    with pytest.raises(RuntimeError, match="network gremlin"):
        fetch_checkpoint(entry, tmp_path, opener=broken_opener)

    assert list(tmp_path.iterdir()) == []


def test_script_reports_manifest_not_found(tmp_path: Path) -> None:
    completed = subprocess.run(
        [
            sys.executable,
            str(SCRIPT_PATH),
            "--manifest",
            str(tmp_path / "missing.yaml"),
            "--target",
            str(tmp_path / "models"),
        ],
        capture_output=True,
        text=True,
        check=False,
        timeout=30,
    )

    assert completed.returncode == 1
    assert completed.stdout == ""
    error = json.loads(completed.stderr)
    assert error["ok"] is False
    assert error["error"]["code"] == "manifest.not_found"


def test_script_reports_manifest_validation_error(tmp_path: Path) -> None:
    manifest = tmp_path / "invalid.yaml"
    manifest.write_text(
        textwrap.dedent(
            """\
            manifest_id: dup
            checkpoints:
              - candidate_id: one
                url: https://example.invalid/a.ckpt
                target_filename: model.ckpt
              - candidate_id: one
                url: https://example.invalid/b.ckpt
                target_filename: other.ckpt
            """
        ),
        encoding="utf-8",
    )

    completed = subprocess.run(
        [
            sys.executable,
            str(SCRIPT_PATH),
            "--manifest",
            str(manifest),
            "--target",
            str(tmp_path / "models"),
        ],
        capture_output=True,
        text=True,
        check=False,
        timeout=30,
    )

    assert completed.returncode == 1
    error = json.loads(completed.stderr)
    assert error["error"]["code"] == "manifest.invalid"
