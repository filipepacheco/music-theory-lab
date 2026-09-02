import pytest
from pydantic import ValidationError

from audio_library_poc.models import (
    CorpusManifest,
    Metrics,
    PipelineManifest,
    StageIdentity,
    StageSpecification,
)


def valid_manifest_data() -> dict[str, object]:
    return {
        "schema_version": "1.0.0",
        "corpus_id": "smoke-corpus",
        "tracks": [
            {
                "track_id": "track-01",
                "source_path": "audio/artist-a - track-a.mp3",
                "expected_sha256": "a" * 64,
                "annotation": {
                    "title": "Track A",
                    "artist": "Artist A",
                    "excerpts": [
                        {
                            "excerpt_id": "sparse-01",
                            "start_seconds": 10.0,
                            "end_seconds": 40.0,
                            "role": "sparse",
                            "notes": "Trusted by manual listening.",
                        }
                    ],
                },
            }
        ],
    }


def valid_pipeline_data(code_revision: str) -> dict[str, object]:
    return {
        "pipeline_id": "boundary-pipeline",
        "code_revision": code_revision,
        "stages": [
            {
                "stage_kind": "fake.boundary",
                "implementation_version": "1.0.0",
            }
        ],
    }


def valid_stage_identity_data(code_revision: str) -> dict[str, object]:
    return {
        "stage_kind": "fake.boundary",
        "input_sha256": "a" * 64,
        "implementation_version": "1.0.0",
        "config_sha256": "b" * 64,
        "output_schema_version": "1.0.0",
        "code_revision": code_revision,
    }


@pytest.mark.parametrize(
    ("model", "data_factory"),
    [
        (PipelineManifest, valid_pipeline_data),
        (StageIdentity, valid_stage_identity_data),
    ],
)
def test_code_revision_accepts_256_characters(model, data_factory) -> None:
    revision = "r" * 256

    validated = model.model_validate(data_factory(revision))

    assert validated.code_revision == revision


@pytest.mark.parametrize(
    ("model", "data_factory"),
    [
        (PipelineManifest, valid_pipeline_data),
        (StageIdentity, valid_stage_identity_data),
    ],
)
def test_code_revision_rejects_257_characters(model, data_factory) -> None:
    with pytest.raises(ValidationError, match="at most 256 characters"):
        model.model_validate(data_factory("r" * 257))


def test_valid_manifest_accepts_trusted_track_annotations() -> None:
    manifest = CorpusManifest.model_validate(valid_manifest_data())

    assert manifest.tracks[0].annotation.excerpts[0].role == "sparse"


@pytest.mark.parametrize(
    "non_finite",
    [float("nan"), float("inf"), float("-inf")],
    ids=["nan", "positive-infinity", "negative-infinity"],
)
def test_contracts_reject_non_finite_values_nested_in_json(
    non_finite: float,
) -> None:
    with pytest.raises(ValidationError, match="finite number"):
        StageSpecification.model_validate(
            {
                "stage_kind": "fake.metadata",
                "implementation_version": "1.0.0",
                "config": {"nested": [{"measurement": non_finite}]},
            }
        )


@pytest.mark.parametrize(
    "non_finite",
    [float("nan"), float("inf"), float("-inf")],
    ids=["nan", "positive-infinity", "negative-infinity"],
)
def test_contracts_reject_non_finite_typed_float_fields(
    non_finite: float,
) -> None:
    with pytest.raises(ValidationError, match="finite number"):
        Metrics(measurements={"score": non_finite})


def test_excerpt_annotations_keep_unknown_distinct_from_no_chord() -> None:
    data = valid_manifest_data()
    excerpt = data["tracks"][0]["annotation"]["excerpts"][0]  # type: ignore[index]
    excerpt["trusted_key"] = {
        "tonic_pc": 9,
        "mode": "minor",
        "provenance": {"source": "manual-ear"},
    }
    excerpt["chords"] = [
        {
            "start_seconds": 10.0,
            "end_seconds": 20.0,
            "label": "unknown",
            "provenance": {"source": "manual-ear"},
        },
        {
            "start_seconds": 20.0,
            "end_seconds": 22.0,
            "label": "no_chord",
            "provenance": {"source": "manual-ear"},
        },
    ]

    manifest = CorpusManifest.model_validate(data)
    labels = manifest.tracks[0].annotation.excerpts[0].chords

    assert [chord.label for chord in labels] == ["unknown", "no_chord"]


def test_manifest_rejects_excerpt_with_reversed_bounds() -> None:
    data = valid_manifest_data()
    data["tracks"][0]["annotation"]["excerpts"][0]["end_seconds"] = 5.0  # type: ignore[index]

    with pytest.raises(ValidationError, match="end_seconds"):
        CorpusManifest.model_validate(data)


@pytest.mark.parametrize(
    ("start_seconds", "end_seconds", "invalid_field"),
    [
        (9.0, 20.0, "start_seconds"),
        (20.0, 41.0, "end_seconds"),
    ],
)
def test_excerpt_rejects_chord_outside_bounds(
    start_seconds: float,
    end_seconds: float,
    invalid_field: str,
) -> None:
    data = valid_manifest_data()
    excerpt = data["tracks"][0]["annotation"]["excerpts"][0]  # type: ignore[index]
    excerpt["chords"] = [
        {
            "start_seconds": start_seconds,
            "end_seconds": end_seconds,
            "label": "unknown",
            "provenance": {"source": "manual-ear"},
        }
    ]

    with pytest.raises(
        ValidationError,
        match=rf"chords\[0\]\.{invalid_field} must be within excerpt bounds",
    ):
        CorpusManifest.model_validate(data)


@pytest.mark.parametrize("time_seconds", [9.0, 41.0])
def test_excerpt_rejects_beat_outside_bounds(time_seconds: float) -> None:
    data = valid_manifest_data()
    excerpt = data["tracks"][0]["annotation"]["excerpts"][0]  # type: ignore[index]
    excerpt["beats"] = [
        {
            "time_seconds": time_seconds,
            "provenance": {"source": "manual-ear"},
        }
    ]

    with pytest.raises(
        ValidationError,
        match=r"beats\[0\]\.time_seconds must be within inclusive excerpt bounds",
    ):
        CorpusManifest.model_validate(data)


@pytest.mark.parametrize("time_seconds", [9.0, 41.0])
def test_excerpt_rejects_melody_outside_bounds(time_seconds: float) -> None:
    data = valid_manifest_data()
    excerpt = data["tracks"][0]["annotation"]["excerpts"][0]  # type: ignore[index]
    excerpt["melodies"] = [
        {
            "source": "vocals",
            "time_seconds": time_seconds,
            "midi_pitch": 69,
            "provenance": {"source": "manual-ear"},
        }
    ]

    with pytest.raises(
        ValidationError,
        match=r"melodies\[0\]\.time_seconds must be within inclusive excerpt bounds",
    ):
        CorpusManifest.model_validate(data)


def test_excerpt_accepts_annotations_on_inclusive_bounds() -> None:
    data = valid_manifest_data()
    excerpt = data["tracks"][0]["annotation"]["excerpts"][0]  # type: ignore[index]
    excerpt["chords"] = [
        {
            "start_seconds": 10.0,
            "end_seconds": 40.0,
            "label": "no_chord",
            "provenance": {"source": "manual-ear"},
        }
    ]
    excerpt["beats"] = [
        {
            "time_seconds": 10.0,
            "provenance": {"source": "manual-ear"},
        },
        {
            "time_seconds": 40.0,
            "provenance": {"source": "manual-ear"},
        },
    ]
    excerpt["melodies"] = [
        {
            "source": "vocals",
            "time_seconds": 10.0,
            "midi_pitch": 69,
            "provenance": {"source": "manual-ear"},
        },
        {
            "source": "guitar",
            "time_seconds": 40.0,
            "midi_pitch": 64,
            "provenance": {"source": "manual-ear"},
        },
    ]

    manifest = CorpusManifest.model_validate(data)

    assert manifest.tracks[0].annotation.excerpts[0].beats[1].time_seconds == 40.0


def test_track_rejects_duplicate_excerpt_ids() -> None:
    data = valid_manifest_data()
    excerpts = data["tracks"][0]["annotation"]["excerpts"]  # type: ignore[index]
    excerpts.append(  # type: ignore[union-attr]
        {
            "excerpt_id": "sparse-01",
            "start_seconds": 50.0,
            "end_seconds": 60.0,
            "role": "dense",
        }
    )

    with pytest.raises(
        ValidationError,
        match="excerpt_id values must be unique within a track",
    ):
        CorpusManifest.model_validate(data)


@pytest.mark.parametrize("duplicate_field", ["track_id", "expected_sha256"])
def test_manifest_rejects_duplicate_track_identity(
    duplicate_field: str,
) -> None:
    data = valid_manifest_data()
    second_track = {
        "track_id": "track-02",
        "source_path": "audio/artist-b - track-b.mp3",
        "expected_sha256": "b" * 64,
    }
    first_track = data["tracks"][0]  # type: ignore[index]
    second_track[duplicate_field] = first_track[duplicate_field]
    data["tracks"].append(second_track)  # type: ignore[union-attr]

    with pytest.raises(ValidationError, match=duplicate_field):
        CorpusManifest.model_validate(data)
