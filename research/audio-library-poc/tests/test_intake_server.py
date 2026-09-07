"""Tests for the intake upload boundary.

Only `prepare_job` is covered here, and deliberately: it is the point where
an untrusted filename and an arbitrary byte string become a file on disk and
a manifest. Everything past it (the FastAPI wiring, the worker thread, the
GPU stages) needs the `server` and `inference` extras, which CI does not
install.

Importing this module must stay cheap for the same reason — `create_app`
imports FastAPI lazily so the rest of the file works without it.
"""

from __future__ import annotations

from pathlib import Path

import pytest
import yaml

from audio_library_poc.intake_server import (
    BEAT_CHECKPOINT_PATH,
    CHORD_CHECKPOINT_PATH,
    MAX_UPLOAD_BYTES,
    IntakeError,
    checkpoint_ref,
    prepare_job,
)
from audio_library_poc.models import PipelineManifest
from audio_library_poc.track_intake import INTAKE_TRACKS_MANIFEST

PAYLOAD = b"not really audio, but the intake never decodes it"


@pytest.fixture
def workspace(tmp_path: Path) -> Path:
    for relative in (BEAT_CHECKPOINT_PATH, CHORD_CHECKPOINT_PATH):
        path = tmp_path / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(b"checkpoint bytes for " + relative.encode())
    return tmp_path


def prepare(workspace: Path, **overrides: object):
    arguments: dict = {
        "workspace": workspace,
        "filename": "Come Together.mp3",
        "payload": PAYLOAD,
        "title": "Come Together",
        "artist": "The Beatles",
        "segment_count": 7,
        "device": "cuda",
    }
    arguments.update(overrides)
    return prepare_job(**arguments)  # type: ignore[arg-type]


class TestCheckpointRef:
    def test_hashes_what_is_on_disk(self, workspace: Path) -> None:
        ref = checkpoint_ref(workspace, BEAT_CHECKPOINT_PATH)
        assert ref.relative_path == BEAT_CHECKPOINT_PATH
        assert len(ref.sha256) == 64

    def test_names_the_fetch_script_when_a_checkpoint_is_missing(
        self, tmp_path: Path
    ) -> None:
        with pytest.raises(IntakeError, match="fetch_checkpoints"):
            checkpoint_ref(tmp_path, BEAT_CHECKPOINT_PATH)


class TestPrepareJob:
    def test_writes_the_upload_into_the_workspace(self, workspace: Path) -> None:
        job = prepare(workspace)
        landed = workspace / "originals" / "come-together.mp3"
        assert landed.read_bytes() == PAYLOAD
        assert job.slug == "come-together"

    def test_hashes_the_file_it_actually_wrote(self, workspace: Path) -> None:
        from audio_library_poc.metadata import hash_file

        job = prepare(workspace)
        landed = workspace / "originals" / "come-together.mp3"
        assert job.source_sha256 == hash_file(landed)

    def test_writes_a_manifest_that_loads(self, workspace: Path) -> None:
        prepare(workspace)
        manifest_path = workspace / "intake-come-together.local.yaml"
        manifest = PipelineManifest.model_validate(
            yaml.safe_load(manifest_path.read_text(encoding="utf-8"))
        )
        assert len(manifest.stages) == 4

    def test_manifest_points_at_the_file_that_was_written(
        self, workspace: Path
    ) -> None:
        prepare(workspace, filename="song.flac")
        manifest_path = workspace / "intake-come-together.local.yaml"
        payload = yaml.safe_load(manifest_path.read_text(encoding="utf-8"))
        relative = payload["stages"][0]["config"]["source_relative_path"]
        assert relative == "originals/come-together.flac"
        assert (workspace / relative).is_file()

    def test_starts_queued_with_every_stage_pending(self, workspace: Path) -> None:
        job = prepare(workspace)
        assert job.status == "queued"
        assert {stage.status for stage in job.stages} == {"pending"}

    def test_falls_back_to_the_filename_when_no_title_is_given(
        self, workspace: Path
    ) -> None:
        job = prepare(workspace, title="", filename="Hey Jude.mp3")
        assert job.slug == "hey-jude"
        assert job.title == "Hey Jude"

    @pytest.mark.parametrize("filename", ["song.txt", "song.pdf", "song", "song."])
    def test_rejects_an_unsupported_extension(
        self, workspace: Path, filename: str
    ) -> None:
        with pytest.raises(IntakeError, match="formato"):
            prepare(workspace, filename=filename)

    def test_rejects_an_empty_upload(self, workspace: Path) -> None:
        with pytest.raises(IntakeError, match="vazio"):
            prepare(workspace, payload=b"")

    def test_rejects_an_oversized_upload(self, workspace: Path) -> None:
        with pytest.raises(IntakeError, match="MB"):
            prepare(workspace, payload=b"\0" * (MAX_UPLOAD_BYTES + 1))

    def test_a_rejected_upload_writes_nothing(self, workspace: Path) -> None:
        with pytest.raises(IntakeError):
            prepare(workspace, filename="song.txt")
        assert not (workspace / "originals").exists()

    def test_rejects_a_segment_count_outside_the_contract(
        self, workspace: Path
    ) -> None:
        with pytest.raises(ValueError, match="segment_count"):
            prepare(workspace, segment_count=99)

    def test_an_upload_cannot_escape_the_originals_directory(
        self, workspace: Path
    ) -> None:
        # The filename is attacker-controlled in the general case. slugify
        # strips separators, so a traversal attempt lands as a plain name.
        job = prepare(workspace, title="", filename="../../etc/passwd.mp3")
        landed = (workspace / "originals" / f"{job.slug}.mp3").resolve()
        assert landed.is_file()
        assert landed.parent == (workspace / "originals").resolve()

    def test_two_uploads_of_the_same_title_reuse_one_slug(
        self, workspace: Path
    ) -> None:
        # Same title means the same run id, which is what makes a re-upload
        # replay through the orchestrator cache instead of redoing the work.
        first = prepare(workspace)
        second = prepare(workspace)
        assert first.slug == second.slug
        assert first.id != second.id


class TestTrackRegistration:
    """`prepare_job` must leave the export enough to display and play a track.

    Without a row in the intake manifest the published track reaches the app
    as "Untitled" by "Unknown" with the player disabled, because the export's
    only other metadata source is the curated corpus.
    """

    def _rows(self, workspace: Path) -> list[dict]:
        manifest = yaml.safe_load(
            (workspace / INTAKE_TRACKS_MANIFEST).read_text(encoding="utf-8")
        )
        return manifest["tracks"]

    def test_records_title_artist_and_source(self, workspace: Path) -> None:
        job = prepare(workspace)
        (row,) = self._rows(workspace)
        assert row["track_id"] == job.slug
        assert row["expected_sha256"] == job.source_sha256
        assert row["source_path"] == "originals/come-together.mp3"
        assert row["annotation"] == {
            "title": "Come Together",
            "artist": "The Beatles",
        }

    def test_falls_back_to_the_filename_for_an_empty_title(
        self, workspace: Path
    ) -> None:
        job = prepare(workspace, title="")
        (row,) = self._rows(workspace)
        assert row["annotation"]["title"] == "Come Together"
        assert job.title == "Come Together"

    def test_keeps_rows_for_other_tracks(self, workspace: Path) -> None:
        prepare(workspace)
        prepare(
            workspace,
            filename="Karma Police.mp3",
            title="Karma Police",
            payload=PAYLOAD + b" (a different recording)",
        )
        assert {row["track_id"] for row in self._rows(workspace)} == {
            "come-together",
            "karma-police",
        }

    def test_same_audio_under_a_new_title_leaves_one_row(self, workspace: Path) -> None:
        # Same bytes, so the export would group both under one sha256 anyway;
        # keeping both rows would just mean the display metadata depended on
        # which one the loader happened to read last.
        prepare(workspace)
        prepare(workspace, title="Come Together (remaster)")
        (row,) = self._rows(workspace)
        assert row["annotation"]["title"] == "Come Together (remaster)"

    def test_re_upload_replaces_rather_than_duplicates(self, workspace: Path) -> None:
        prepare(workspace)
        prepare(workspace, artist="Beatles")
        (row,) = self._rows(workspace)
        assert row["annotation"]["artist"] == "Beatles"
