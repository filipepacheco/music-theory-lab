"""Tests for the upload-intake manifest builder.

The point of these is that a manifest built here loads through the same
``PipelineManifest`` the CLI uses. A manifest that only looks right is worth
nothing: the operator finds out it is wrong halfway through a GPU run.
"""

from __future__ import annotations

import pytest

from audio_library_poc.models import PipelineManifest
from audio_library_poc.track_intake import (
    INTAKE_STAGE_KINDS,
    CheckpointRef,
    build_intake_manifest,
    intake_source_relative_path,
    slugify,
    upsert_intake_track,
)

BEAT = CheckpointRef(relative_path="models/beat_this-final0.ckpt", sha256="a" * 64)
CHORD = CheckpointRef(
    relative_path="models/chordmini-btc-model-best.pth", sha256="b" * 64
)


def build(**overrides: object) -> dict:
    arguments = {
        "slug": "come-together",
        "source_relative_path": "originals/come-together.mp3",
        "beat_checkpoint": BEAT,
        "chord_checkpoint": CHORD,
    }
    arguments.update(overrides)
    return build_intake_manifest(**arguments)  # type: ignore[arg-type]


class TestSlugify:
    def test_lowercases_and_dashes(self) -> None:
        assert slugify("Come Together") == "come-together"

    def test_folds_accents_rather_than_dropping_them(self) -> None:
        assert slugify("Coração de Estudante") == "coracao-de-estudante"

    def test_collapses_runs_of_punctuation_to_one_dash(self) -> None:
        assert slugify("Wish  You --- Were?! Here") == "wish-you-were-here"

    def test_trims_leading_and_trailing_separators(self) -> None:
        assert slugify("  -- Hey Jude -- ") == "hey-jude"

    def test_falls_back_when_nothing_survives(self) -> None:
        assert slugify("!!!") == "faixa"
        assert slugify("") == "faixa"

    def test_respects_a_custom_fallback(self) -> None:
        assert slugify("???", fallback="sem-nome") == "sem-nome"

    def test_truncates_without_leaving_a_trailing_dash(self) -> None:
        slug = slugify("a " * 200)
        assert len(slug) <= 128
        assert not slug.endswith("-")

    def test_output_is_a_valid_identifier(self) -> None:
        # Identifier's pattern: lowercase runs joined by single . _ or -
        manifest = build(slug=slugify("Björk — Jóga (Live!)"))
        PipelineManifest.model_validate(manifest)


class TestSourcePath:
    def test_keeps_the_uploaded_extension(self) -> None:
        assert intake_source_relative_path("x", ".flac") == "originals/x.flac"

    def test_lowercases_the_extension(self) -> None:
        assert intake_source_relative_path("x", ".MP3") == "originals/x.mp3"

    def test_falls_back_to_mp3_when_there_is_no_suffix(self) -> None:
        assert intake_source_relative_path("x", "") == "originals/x.mp3"
        assert intake_source_relative_path("x", ".") == "originals/x.mp3"


class TestManifest:
    def test_loads_as_a_pipeline_manifest(self) -> None:
        manifest = PipelineManifest.model_validate(build())
        assert manifest.pipeline_id == "intake-come-together"
        assert manifest.code_revision == "workspace-local"

    def test_carries_exactly_the_stages_the_export_consumes(self) -> None:
        manifest = PipelineManifest.model_validate(build())
        assert [stage.stage_kind for stage in manifest.stages] == list(
            INTAKE_STAGE_KINDS
        )

    def test_omits_the_chord_root_key_baseline(self) -> None:
        # It is an evaluation baseline; sync_workspace_to_public never reads it.
        assert "key.chord_root_profile" not in INTAKE_STAGE_KINDS

    def test_every_stage_points_at_the_same_source(self) -> None:
        manifest = PipelineManifest.model_validate(
            build(source_relative_path="originals/hey-jude.mp3")
        )
        for stage in manifest.stages:
            assert stage.config["source_relative_path"] == "originals/hey-jude.mp3"

    def test_pins_both_checkpoints_by_digest(self) -> None:
        manifest = PipelineManifest.model_validate(build())
        by_kind = {stage.stage_kind: stage for stage in manifest.stages}
        beat = by_kind["beat.beat_this"]
        chord = by_kind["chord.chordmini_btc"]
        assert beat.model_sha256 == "a" * 64
        assert beat.model_identifier == "beat_this-final0.ckpt"
        assert beat.config["checkpoint_relative_path"] == BEAT.relative_path
        assert chord.model_sha256 == "b" * 64
        assert chord.model_identifier == "chordmini-btc-model-best.pth"

    def test_the_cpu_stages_pin_no_checkpoint(self) -> None:
        manifest = PipelineManifest.model_validate(build())
        by_kind = {stage.stage_kind: stage for stage in manifest.stages}
        assert by_kind["key.hpcp"].model_sha256 is None
        assert by_kind["section.librosa_segment"].model_sha256 is None

    def test_device_reaches_only_the_gpu_stages(self) -> None:
        manifest = PipelineManifest.model_validate(build(device="cpu"))
        by_kind = {stage.stage_kind: stage for stage in manifest.stages}
        assert by_kind["beat.beat_this"].config["device"] == "cpu"
        assert by_kind["chord.chordmini_btc"].config["device"] == "cpu"
        assert "device" not in by_kind["key.hpcp"].config
        assert "device" not in by_kind["section.librosa_segment"].config

    def test_segment_count_reaches_the_section_stage(self) -> None:
        manifest = PipelineManifest.model_validate(build(segment_count=12))
        by_kind = {stage.stage_kind: stage for stage in manifest.stages}
        assert by_kind["section.librosa_segment"].config["n_segments"] == 12

    @pytest.mark.parametrize("count", [0, -1, 65, 1000])
    def test_rejects_a_segment_count_outside_the_contract(self, count: int) -> None:
        # A stage config is a free-form dict at manifest load, so nothing
        # downstream of here would reject the value until the section runtime
        # built its settings -- minutes in, with the GPU stages already spent.
        with pytest.raises(ValueError, match="segment_count"):
            build(segment_count=count)

    @pytest.mark.parametrize("count", [1, 7, 64])
    def test_accepts_the_whole_contract_range(self, count: int) -> None:
        PipelineManifest.model_validate(build(segment_count=count))

    def test_stage_kinds_are_unique(self) -> None:
        # PipelineManifest enforces this; the assertion documents that the
        # single-run design depends on it.
        kinds = [stage["stage_kind"] for stage in build()["stages"]]
        assert len(kinds) == len(set(kinds))

    def test_beat_and_chord_run_before_the_cpu_stages(self) -> None:
        # A GPU failure should surface before minutes of CPU work, and the
        # orchestrator stops at the first failed stage.
        kinds = [stage["stage_kind"] for stage in build()["stages"]]
        assert kinds.index("beat.beat_this") < kinds.index("key.hpcp")
        assert kinds.index("chord.chordmini_btc") < kinds.index(
            "section.librosa_segment"
        )


class TestUpsertIntakeTrack:
    ROW = {
        "track_id": "come-together",
        "source_relative_path": "originals/come-together.mp3",
        "sha256": "a" * 64,
        "title": "Come Together",
        "artist": "The Beatles",
    }

    def test_builds_a_corpus_shaped_row_from_nothing(self) -> None:
        manifest = upsert_intake_track(None, **self.ROW)
        assert manifest["schema_version"] == "1.0.0"
        assert manifest["tracks"] == [
            {
                "track_id": "come-together",
                "source_path": "originals/come-together.mp3",
                "expected_sha256": "a" * 64,
                "annotation": {
                    "title": "Come Together",
                    "artist": "The Beatles",
                },
            }
        ]

    def test_appends_a_distinct_track(self) -> None:
        first = upsert_intake_track(None, **self.ROW)
        second = upsert_intake_track(
            first,
            track_id="karma-police",
            source_relative_path="originals/karma-police.mp3",
            sha256="b" * 64,
            title="Karma Police",
            artist="Radiohead",
        )
        assert [row["track_id"] for row in second["tracks"]] == [
            "come-together",
            "karma-police",
        ]

    def test_replaces_the_row_for_the_same_audio(self) -> None:
        first = upsert_intake_track(None, **self.ROW)
        second = upsert_intake_track(
            first, **{**self.ROW, "track_id": "come-together-remaster"}
        )
        (row,) = second["tracks"]
        assert row["track_id"] == "come-together-remaster"

    def test_replaces_the_row_whose_slug_named_the_same_file(self) -> None:
        # A re-upload under the same title overwrites originals/<slug>.mp3, so
        # the old row would describe bytes that no longer exist there.
        first = upsert_intake_track(None, **self.ROW)
        second = upsert_intake_track(first, **{**self.ROW, "sha256": "c" * 64})
        (row,) = second["tracks"]
        assert row["expected_sha256"] == "c" * 64

    def test_does_not_mutate_the_manifest_it_was_given(self) -> None:
        first = upsert_intake_track(None, **self.ROW)
        upsert_intake_track(
            first,
            track_id="karma-police",
            source_relative_path="originals/karma-police.mp3",
            sha256="b" * 64,
            title="Karma Police",
            artist="Radiohead",
        )
        assert len(first["tracks"]) == 1
