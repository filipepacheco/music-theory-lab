from __future__ import annotations

from pathlib import Path

import pytest
import yaml

from audio_library_poc.beat_input_quality import BeatInputQualityPolicyConfig
from audio_library_poc.intake_server import (
    BEAT_CHECKPOINT_PATH,
    CHORD_CHECKPOINT_PATH,
    MAX_UPLOAD_BYTES,
    IntakeError,
    checkpoint_ref,
    prepare_job,
)
from audio_library_poc.models import PipelineManifest
from audio_library_poc.structural_segmentation_stage import (
    structural_calibration_config_sha256,
)
from audio_library_poc.track_intake import (
    INTAKE_CALIBRATION_MANIFEST,
    INTAKE_TRACKS_MANIFEST,
    IntakeQualityGates,
)

PAYLOAD = b"not really audio, but the intake never decodes it"


def calibrated_quality_gates() -> IntakeQualityGates:
    beat_policy = BeatInputQualityPolicyConfig.production_v1()
    return IntakeQualityGates.model_validate(
        {
            "beat_policy": beat_policy.model_dump(mode="json"),
            "beat_calibration": {
                "calibration_id": "beat-held-out-v1",
                "config_sha256": beat_policy.sha256(),
                "held_out": True,
                "confidence_level": 0.95,
                "invalid_accepted_upper_bound": 0.05,
                "valid_retained_lower_bound": 0.85,
            },
            "section_gate_version": "1.0.0",
            "section_calibration": {
                "calibration_id": "section-held-out-v1",
                "config_sha256": structural_calibration_config_sha256(
                    gate_version="1.0.0"
                ),
                "held_out": True,
                "accepted_boundary_precision_3s": 0.8,
                "exact_count_accuracy": 0.7,
                "coverage": 0.6,
                "invalid_fallback_partitions": 0,
            },
        }
    )


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
        assert [stage.stage_kind for stage in manifest.stages] == [
            "beat.beat_this",
            "chord.chordmini_btc",
            "key.hpcp",
            "quality.beat_input",
            "section.mcfee_ellis_laplacian",
        ]

    def test_loads_pinned_held_out_calibration_for_automatic_path(
        self, workspace: Path
    ) -> None:
        calibration = calibrated_quality_gates()
        (workspace / INTAKE_CALIBRATION_MANIFEST).write_text(
            yaml.safe_dump(calibration.model_dump(mode="json"), sort_keys=False),
            encoding="utf-8",
        )

        prepare(workspace)

        manifest_path = workspace / "intake-come-together.local.yaml"
        payload = yaml.safe_load(manifest_path.read_text(encoding="utf-8"))
        by_kind = {stage["stage_kind"]: stage for stage in payload["stages"]}
        assert (
            by_kind["quality.beat_input"]["config"]["calibration"]["calibration_id"]
            == "beat-held-out-v1"
        )
        assert (
            by_kind["section.mcfee_ellis_laplacian"]["config"]["section_calibration"][
                "calibration_id"
            ]
            == "section-held-out-v1"
        )

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

    def test_an_upload_cannot_escape_the_originals_directory(
        self, workspace: Path
    ) -> None:
        job = prepare(workspace, title="", filename="../../etc/passwd.mp3")
        landed = (workspace / "originals" / f"{job.slug}.mp3").resolve()
        assert landed.is_file()
        assert landed.parent == (workspace / "originals").resolve()

    def test_two_uploads_of_the_same_title_reuse_one_slug(
        self, workspace: Path
    ) -> None:
        first = prepare(workspace)
        second = prepare(workspace)
        assert first.slug == second.slug
        assert first.id != second.id


class TestTrackRegistration:
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
        prepare(workspace)
        prepare(workspace, title="Come Together (remaster)")
        (row,) = self._rows(workspace)
        assert row["annotation"]["title"] == "Come Together (remaster)"

    def test_re_upload_replaces_rather_than_duplicates(self, workspace: Path) -> None:
        prepare(workspace)
        prepare(workspace, artist="Beatles")
        (row,) = self._rows(workspace)
        assert row["annotation"]["artist"] == "Beatles"
