import json

from audio_library_poc.events import JsonlEventLog, read_events
from audio_library_poc.models import StageStatus


def test_event_log_writes_stable_structured_json_lines(tmp_path) -> None:
    path = tmp_path / "events.jsonl"
    event_log = JsonlEventLog(path)

    event_log.emit(
        event_name="stage.started",
        stage_kind="fake.metadata",
        attempt=1,
        status=StageStatus.RUNNING,
        cache_key="a" * 64,
        fields={"input": "fixture"},
    )
    event_log.emit(
        event_name="stage.succeeded",
        stage_kind="fake.metadata",
        attempt=1,
        status=StageStatus.SUCCEEDED,
        cache_key="a" * 64,
    )

    raw_lines = path.read_text(encoding="utf-8").splitlines()
    parsed_lines = [json.loads(line) for line in raw_lines]

    assert len(raw_lines) == 2
    assert parsed_lines[0] == {
        "attempt": 1,
        "cache_key": "a" * 64,
        "event_name": "stage.started",
        "fields": {"input": "fixture"},
        "schema_version": "1.0.0",
        "stage_kind": "fake.metadata",
        "status": "running",
    }
    assert "timestamp" not in parsed_lines[0]
    assert [event.event_name for event in read_events(path)] == [
        "stage.started",
        "stage.succeeded",
    ]
