import json
import subprocess

import pytest

from audio_library_poc.metadata import (
    PocRuntimeError,
    hash_file,
    inspect_source,
    inspect_sources,
)


def probe_runner(payload: dict[str, object]):
    def run(argv: list[str], **_kwargs: object):
        return subprocess.CompletedProcess(argv, 0, json.dumps(payload), "")

    return run


def test_hash_file_matches_known_sha256_with_streamed_chunks(tmp_path) -> None:
    source = tmp_path / "source.mp3"
    source.write_bytes(b"abc")

    digest = hash_file(source, chunk_size=1)

    assert digest == "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"


def test_embedded_tags_win_and_ffprobe_uses_safe_argv(tmp_path) -> None:
    source = tmp_path / "Wrong Artist - Wrong Title.mp3"
    source.write_bytes(b"abc")
    calls: list[tuple[list[str], dict[str, object]]] = []
    payload = {
        "format": {
            "filename": str(source),
            "format_name": "mp3",
            "duration": "123.5",
            "size": "3",
            "bit_rate": "192000",
            "tags": {
                "TITLE": "Embedded Title",
                "artist": "Embedded Artist",
                "album": "Embedded Album",
                "date": "1973-03-01",
                "genre": "Rock; Blues",
                "custom-tag": "retained",
            },
        },
        "streams": [
            {
                "index": 0,
                "codec_type": "audio",
                "codec_name": "mp3",
                "sample_rate": "44100",
                "channels": 2,
                "tags": {"language": "eng"},
            }
        ],
    }

    def fake_runner(argv: list[str], **kwargs: object):
        calls.append((argv, kwargs))
        return subprocess.CompletedProcess(argv, 0, json.dumps(payload), "")

    result = inspect_source(source, runner=fake_runner)

    assert result.canonical.title == "Embedded Title"
    assert result.canonical.artist == "Embedded Artist"
    assert result.canonical.album == "Embedded Album"
    assert result.canonical.year == 1973
    assert result.canonical.genres == ["Rock", "Blues"]
    assert result.origins.title == "embedded"
    assert result.raw_format_tags["custom-tag"] == "retained"
    assert result.raw_stream_tags == [{"language": "eng"}]
    argv, kwargs = calls[0]
    assert isinstance(argv, list)
    assert argv[-1] == str(source)
    assert argv[1:-1] == [
        "-v",
        "error",
        "-show_format",
        "-show_streams",
        "-of",
        "json",
    ]
    assert kwargs["shell"] is False


def test_absent_tags_are_explicitly_missing(tmp_path) -> None:
    source = tmp_path / "unstructured_filename.mp3"
    source.write_bytes(b"untagged")
    payload = {
        "format": {"format_name": "mp3"},
        "streams": [{"index": 0, "codec_type": "audio"}],
    }

    result = inspect_source(source, runner=probe_runner(payload))

    assert result.canonical.model_dump() == {
        "title": None,
        "artist": None,
        "album": None,
        "year": None,
        "genres": None,
    }
    assert set(result.origins.model_dump().values()) == {"missing"}
    assert result.raw_format_tags == {}
    assert result.raw_stream_tags == [{}]


def test_filename_fallback_fills_only_missing_embedded_fields(tmp_path) -> None:
    source = tmp_path / "Filename Artist - Filename Title.mp3"
    source.write_bytes(b"partial-tags")
    payload = {
        "format": {
            "format_name": "mp3",
            "tags": {"title": "Embedded Title", "album": "Embedded Album"},
        },
        "streams": [{"index": 0, "codec_type": "audio"}],
    }

    result = inspect_source(source, runner=probe_runner(payload))

    assert result.canonical.title == "Embedded Title"
    assert result.origins.title == "embedded"
    assert result.canonical.artist == "Filename Artist"
    assert result.origins.artist == "filename"
    assert result.canonical.album == "Embedded Album"
    assert result.origins.album == "embedded"


def test_ffprobe_failure_returns_a_typed_error(tmp_path) -> None:
    source = tmp_path / "broken.mp3"
    source.write_bytes(b"broken")

    def failed_runner(argv: list[str], **_kwargs: object):
        return subprocess.CompletedProcess(argv, 1, "", "invalid media")

    with pytest.raises(PocRuntimeError) as captured:
        inspect_source(source, runner=failed_runner)

    assert captured.value.error.code == "ffprobe.failed"
    assert captured.value.error.retryable is False
    assert captured.value.error.details["returncode"] == 1


@pytest.mark.parametrize("stdout", ["not-json", '{"streams": []}'])
def test_ffprobe_invalid_json_or_shape_returns_a_typed_error(
    tmp_path,
    stdout: str,
) -> None:
    source = tmp_path / "invalid-output.mp3"
    source.write_bytes(b"invalid")

    def invalid_runner(argv: list[str], **_kwargs: object):
        return subprocess.CompletedProcess(argv, 0, stdout, "")

    with pytest.raises(PocRuntimeError) as captured:
        inspect_source(source, runner=invalid_runner)

    assert captured.value.error.code == "ffprobe.invalid_output"


def test_duplicate_content_is_probed_once_and_reported(tmp_path) -> None:
    first = tmp_path / "Artist - First.mp3"
    duplicate = tmp_path / "Artist - Duplicate.mp3"
    distinct = tmp_path / "Artist - Distinct.mp3"
    first.write_bytes(b"same-content")
    duplicate.write_bytes(b"same-content")
    distinct.write_bytes(b"different-content")
    calls: list[list[str]] = []

    def counting_runner(argv: list[str], **_kwargs: object):
        calls.append(argv)
        payload = {
            "format": {"format_name": "mp3"},
            "streams": [{"index": 0, "codec_type": "audio"}],
        }
        return subprocess.CompletedProcess(argv, 0, json.dumps(payload), "")

    report = inspect_sources([first, duplicate, distinct], runner=counting_runner)

    assert len(calls) == 2
    assert len(report.duplicates) == 1
    assert report.duplicates[0].source_paths == [str(first), str(duplicate)]
    assert report.results[1].duplicate_of_source_path == str(first)
    assert report.results[2].duplicate_of_source_path is None
