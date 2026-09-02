from pathlib import Path

import pytest
import yaml
from pydantic import ValidationError

from audio_library_poc.manifest import (
    load_corpus_manifest,
    load_pipeline_manifest,
    resolve_source_path,
)

VALID_CORPUS_YAML = """\
schema_version: 1.0.0
corpus_id: test-corpus
tracks:
  - track_id: self-recorded-study
    source_path: audio/self-recorded-study.wav
    expected_sha256: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
"""

VALID_PIPELINE_YAML = """\
schema_version: 1.0.0
pipeline_id: test-pipeline
code_revision: test-revision
stages:
  - stage_kind: fake.deterministic
    implementation_version: 1.0.0
    config:
      artifact_count: 1
"""

PACKAGE_ROOT = Path(__file__).parents[1]


def test_load_corpus_manifest_validates_yaml_without_changing_source_path(
    tmp_path: Path,
) -> None:
    manifest_path = tmp_path / "corpus.yaml"
    manifest_path.write_text(VALID_CORPUS_YAML, encoding="utf-8")

    manifest = load_corpus_manifest(manifest_path)

    assert manifest.corpus_id == "test-corpus"
    assert manifest.tracks[0].source_path == "audio/self-recorded-study.wav"


def test_load_pipeline_manifest_validates_yaml(tmp_path: Path) -> None:
    manifest_path = tmp_path / "pipeline.yaml"
    manifest_path.write_text(VALID_PIPELINE_YAML, encoding="utf-8")

    manifest = load_pipeline_manifest(manifest_path)

    assert manifest.pipeline_id == "test-pipeline"
    assert manifest.stages[0].stage_kind == "fake.deterministic"


@pytest.mark.parametrize(
    "contents",
    [
        "- a-list-is-not-a-manifest\n",
        "schema_version: 1.0.0\ncorpus_id: invalid\ntracks: []\n",
    ],
)
def test_invalid_manifest_shape_or_schema_surfaces_pydantic_validation_error(
    tmp_path: Path,
    contents: str,
) -> None:
    manifest_path = tmp_path / "invalid.yaml"
    manifest_path.write_text(contents, encoding="utf-8")

    with pytest.raises(ValidationError):
        load_corpus_manifest(manifest_path)


def test_malformed_or_unsafe_yaml_surfaces_yaml_error(tmp_path: Path) -> None:
    manifest_path = tmp_path / "unsafe.yaml"
    manifest_path.write_text(
        "!!python/object/apply:pathlib.Path ['not-safe']\n",
        encoding="utf-8",
    )

    with pytest.raises(yaml.YAMLError):
        load_corpus_manifest(manifest_path)


def test_missing_manifest_surfaces_file_not_found(tmp_path: Path) -> None:
    with pytest.raises(FileNotFoundError):
        load_corpus_manifest(tmp_path / "missing.yaml")


def test_relative_source_path_resolves_from_manifest_without_mutating_model(
    tmp_path: Path,
) -> None:
    manifest_path = tmp_path / "fixtures" / "corpus.yaml"
    manifest_path.parent.mkdir()
    manifest_path.write_text(VALID_CORPUS_YAML, encoding="utf-8")
    manifest = load_corpus_manifest(manifest_path)

    resolved = resolve_source_path(
        manifest_path,
        manifest.tracks[0].source_path,
    )

    assert (
        resolved
        == (manifest_path.parent / "audio" / "self-recorded-study.wav").resolve()
    )
    assert manifest.tracks[0].source_path == "audio/self-recorded-study.wav"


def test_example_corpus_is_portable_and_contains_trusted_excerpt_annotations() -> None:
    manifest = load_corpus_manifest(PACKAGE_ROOT / "corpus.example.yaml")

    track = manifest.tracks[0]
    excerpt = track.annotation.excerpts[0]
    assert Path(track.source_path).is_absolute() is False
    assert excerpt.trusted_key is not None
    assert excerpt.trusted_key.provenance.source == "user-created-example"
    assert excerpt.chords
    assert excerpt.beats
    assert excerpt.melodies


def test_example_pipeline_is_valid_and_configures_a_fake_stage() -> None:
    manifest = load_pipeline_manifest(PACKAGE_ROOT / "pipeline.example.yaml")

    stage = manifest.stages[0]
    assert stage.stage_kind == "fake.deterministic"
    assert stage.config == {
        "retryable_failures": 0,
        "terminal_failure": False,
        "interrupt_attempts": [],
        "payload": {"fixture": "example", "records": 1},
    }
