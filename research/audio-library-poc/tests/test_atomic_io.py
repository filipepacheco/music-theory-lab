import pytest

from audio_library_poc.io import atomic_write_json


def test_atomic_write_json_replaces_existing_file_deterministically(tmp_path) -> None:
    destination = tmp_path / "state.json"
    destination.write_text("old-content", encoding="utf-8")

    atomic_write_json(destination, {"z": 2, "a": 1})

    assert destination.read_bytes() == b'{\n  "a": 1,\n  "z": 2\n}\n'
    assert list(tmp_path.glob(".state.json.*.tmp")) == []


def test_serialization_failure_preserves_existing_file(tmp_path) -> None:
    destination = tmp_path / "state.json"
    destination.write_text("known-good", encoding="utf-8")

    with pytest.raises(TypeError):
        atomic_write_json(destination, {"unsupported": object()})

    assert destination.read_text(encoding="utf-8") == "known-good"
    assert list(tmp_path.glob(".state.json.*.tmp")) == []


def test_replace_failure_preserves_existing_file_and_cleans_temp(
    tmp_path,
    monkeypatch,
) -> None:
    destination = tmp_path / "state.json"
    destination.write_text("known-good", encoding="utf-8")

    def fail_replace(_source, _destination) -> None:
        raise OSError("simulated replace failure")

    monkeypatch.setattr("audio_library_poc.io.os.replace", fail_replace)

    with pytest.raises(OSError, match="simulated replace failure"):
        atomic_write_json(destination, {"replacement": True})

    assert destination.read_text(encoding="utf-8") == "known-good"
    assert list(tmp_path.glob(".state.json.*.tmp")) == []
