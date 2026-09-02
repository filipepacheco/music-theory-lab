import pytest

from audio_library_poc.cache import hash_config, stage_cache_key
from audio_library_poc.models import StageIdentity

CONFIG_SHA256 = "b7849f2fac09007d4f0289085454f7fdafca371b1a94511db7d2d880e4a0810d"


def identity(**overrides: object) -> StageIdentity:
    values: dict[str, object] = {
        "stage_kind": "fake.metadata",
        "input_sha256": "a" * 64,
        "implementation_version": "1.2.3",
        "config_sha256": CONFIG_SHA256,
        "output_schema_version": "2.0.0",
        "model_identifier": None,
        "model_sha256": None,
        "code_revision": "git:abc123",
    }
    values.update(overrides)
    return StageIdentity.model_validate(values)


def test_cache_identity_matches_independent_known_vector() -> None:
    config_sha256 = hash_config({"nested": {"z": 2, "a": True}, "alpha": 1})

    assert config_sha256 == CONFIG_SHA256
    assert stage_cache_key(identity(config_sha256=config_sha256)) == (
        "63848a3965b2c1d6f8ff7f46052a3797f5123b53b1b5db7feadaa7b8923bb3c4"
    )


@pytest.mark.parametrize(
    ("field", "replacement"),
    [
        ("stage_kind", "fake.analysis"),
        ("input_sha256", "b" * 64),
        ("implementation_version", "1.2.4"),
        ("config_sha256", "c" * 64),
        ("output_schema_version", "2.1.0"),
        ("model_identifier", "model-a"),
        ("model_sha256", "d" * 64),
        ("code_revision", "git:def456"),
    ],
)
def test_each_provenance_field_changes_the_cache_key(
    field: str,
    replacement: object,
) -> None:
    baseline = stage_cache_key(identity())
    changed = stage_cache_key(identity(**{field: replacement}))

    assert changed != baseline


def test_absent_and_present_model_provenance_are_unambiguous() -> None:
    identities = [
        identity(),
        identity(model_identifier="model-a"),
        identity(model_sha256="e" * 64),
        identity(model_identifier="model-a", model_sha256="e" * 64),
    ]
    absent = identities[0].model_dump(mode="json")

    assert absent["model_identifier"] is None
    assert absent["model_sha256"] is None
    assert len({stage_cache_key(value) for value in identities}) == 4
