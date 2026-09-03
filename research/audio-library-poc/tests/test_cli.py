import json
import subprocess
import sys
from pathlib import Path

import pytest
from pydantic import ValidationError

from audio_library_poc.cache import stage_cache_key
from audio_library_poc.cli import main
from audio_library_poc.models import (
    ArtifactReference,
    FfprobePayload,
    Metrics,
    StageIdentity,
    StageResultEnvelope,
    StageStatus,
)

PACKAGE_ROOT = Path(__file__).parents[1]
INPUT_SHA256 = "a" * 64


def write_pipeline(path: Path, *, code_revision: str = "test-revision") -> None:
    path.write_text(
        f"""\
schema_version: 1.0.0
pipeline_id: cli-test-pipeline
code_revision: {code_revision}
stages:
  - stage_kind: fake.first
    implementation_version: 1.0.0
    config:
      payload:
        label: first
  - stage_kind: fake.second
    implementation_version: 1.0.0
    config:
      payload:
        label: second
""",
        encoding="utf-8",
    )


def read_stdout(capsys) -> dict[str, object]:
    captured = capsys.readouterr()
    assert captured.err == ""
    return json.loads(captured.out)


def test_validate_corpus_emits_deterministic_summary(capsys) -> None:
    manifest = PACKAGE_ROOT / "corpus.example.yaml"

    first_status = main(["validate-corpus", str(manifest)])
    first_output = capsys.readouterr()
    second_status = main(["validate-corpus", str(manifest)])
    second_output = capsys.readouterr()

    assert first_status == second_status == 0
    assert first_output.err == second_output.err == ""
    assert first_output.out == second_output.out
    assert json.loads(first_output.out) == {
        "command": "validate-corpus",
        "corpus_id": "example-self-recorded-corpus",
        "excerpt_count": 1,
        "ok": True,
        "schema_version": "1.0.0",
        "track_count": 1,
        "track_ids": ["self-recorded-interval-study"],
    }


def test_malformed_manifest_emits_typed_json_error(tmp_path, capsys) -> None:
    manifest = tmp_path / "invalid.yaml"
    manifest.write_text("corpus_id: invalid\ntracks: []\n", encoding="utf-8")

    status = main(["validate-corpus", str(manifest)])
    captured = capsys.readouterr()

    assert status == 2
    assert captured.out == ""
    error = json.loads(captured.err)
    assert error["ok"] is False
    assert error["error"]["code"] == "validation.invalid"
    assert error["error"]["retryable"] is False
    assert error["error"]["details"]["issues"]
    assert all(
        set(issue) == {"location", "message", "type"}
        for issue in error["error"]["details"]["issues"]
    )
    assert "Traceback" not in captured.err


def test_malformed_yaml_emits_typed_json_error(tmp_path, capsys) -> None:
    manifest = tmp_path / "invalid.yaml"
    manifest.write_text("tracks: [\n", encoding="utf-8")

    status = main(["validate-corpus", str(manifest)])
    captured = capsys.readouterr()

    assert status == 2
    assert captured.out == ""
    assert json.loads(captured.err)["error"]["code"] == "manifest.yaml"
    assert "Traceback" not in captured.err


def test_malformed_utf8_manifest_emits_typed_json_error(tmp_path, capsys) -> None:
    manifest = tmp_path / "invalid-encoding.yaml"
    manifest.write_bytes(b"schema_version: \xff\n")

    status = main(["validate-corpus", str(manifest)])
    captured = capsys.readouterr()

    assert status == 2
    assert captured.out == ""
    error = json.loads(captured.err)
    assert error["ok"] is False
    assert error["error"]["code"] == "manifest.encoding"
    assert error["error"]["retryable"] is False
    assert "Traceback" not in captured.err


def test_invalid_cli_usage_emits_typed_json_error(capsys) -> None:
    status = main([])
    captured = capsys.readouterr()

    assert status == 2
    assert captured.out == ""
    assert json.loads(captured.err)["error"]["code"] == "cli.usage"
    assert "Traceback" not in captured.err


def test_unexpected_internal_value_error_propagates(
    tmp_path,
    monkeypatch,
) -> None:
    manifest = tmp_path / "corpus.yaml"

    def raise_internal_error(_path):
        raise ValueError("unexpected internal defect")

    monkeypatch.setattr(
        "audio_library_poc.cli.load_corpus_manifest",
        raise_internal_error,
    )

    with pytest.raises(ValueError, match="unexpected internal defect"):
        main(["validate-corpus", str(manifest)])


def test_unexpected_internal_pydantic_validation_error_propagates(
    tmp_path,
    monkeypatch,
) -> None:
    pipeline = tmp_path / "pipeline.yaml"
    write_pipeline(pipeline)

    def raise_internal_error(*_args, **_kwargs):
        StageResultEnvelope.model_validate({})

    monkeypatch.setattr(
        "audio_library_poc.cli.StageOrchestrator.run_stage",
        raise_internal_error,
    )

    with pytest.raises(ValidationError):
        main(
            [
                "run-fake",
                "--pipeline",
                str(pipeline),
                "--workspace",
                str(tmp_path / "workspace"),
                "--run-id",
                "run-internal-validation-error",
                "--input-sha256",
                INPUT_SHA256,
            ]
        )


def test_export_schemas_writes_all_contracts(tmp_path, capsys) -> None:
    output = tmp_path / "schemas"

    status = main(["export-schemas", "--output", str(output)])
    summary = read_stdout(capsys)

    assert status == 0
    assert summary["schema_count"] == 20
    assert summary["files"] == [
        "corpus-manifest.validation.schema.json",
        "corpus-manifest.serialization.schema.json",
        "pipeline-manifest.validation.schema.json",
        "pipeline-manifest.serialization.schema.json",
        "stage-result-envelope.validation.schema.json",
        "stage-result-envelope.serialization.schema.json",
        "metadata-result.validation.schema.json",
        "metadata-result.serialization.schema.json",
        "source-inspection-report.validation.schema.json",
        "source-inspection-report.serialization.schema.json",
        "separation-result.validation.schema.json",
        "separation-result.serialization.schema.json",
        "checkpoint-manifest.validation.schema.json",
        "checkpoint-manifest.serialization.schema.json",
        "beat-analysis-result.validation.schema.json",
        "beat-analysis-result.serialization.schema.json",
        "chord-analysis-result.validation.schema.json",
        "chord-analysis-result.serialization.schema.json",
        "key-analysis-result.validation.schema.json",
        "key-analysis-result.serialization.schema.json",
    ]
    assert len(list(output.glob("*.json"))) == 20


def test_inspect_hashes_probes_and_reports_duplicates_atomically(
    tmp_path,
    monkeypatch,
    capsys,
) -> None:
    first = tmp_path / "Artist - First.mp3"
    duplicate = tmp_path / "Artist - Duplicate.mp3"
    first.write_bytes(b"same-audio")
    duplicate.write_bytes(b"same-audio")
    calls: list[tuple[Path, str]] = []

    def fake_ffprobe(path, *, executable, runner):
        calls.append((Path(path), executable))
        return FfprobePayload.model_validate(
            {
                "format": {
                    "format_name": "mp3",
                    "duration": "12.5",
                    "tags": {"artist": "Embedded Artist"},
                },
                "streams": [
                    {
                        "index": 0,
                        "codec_type": "audio",
                        "codec_name": "mp3",
                    }
                ],
            }
        )

    monkeypatch.setattr("audio_library_poc.metadata.run_ffprobe", fake_ffprobe)
    output = tmp_path / "reports" / "inspection.json"

    status = main(
        [
            "inspect",
            str(first),
            str(duplicate),
            "--output",
            str(output),
            "--ffprobe",
            "mock-ffprobe",
        ]
    )
    summary = read_stdout(capsys)
    report = json.loads(output.read_text(encoding="utf-8"))

    assert status == 0
    assert summary["source_count"] == 2
    assert summary["duplicate_group_count"] == 1
    assert calls == [(first, "mock-ffprobe")]
    assert report["results"][0]["source_sha256"] == report["duplicates"][0]["sha256"]
    assert report["results"][1]["duplicate_of_source_path"] == str(first)
    assert list(output.parent.glob(".inspection.json.*.tmp")) == []


def test_inspect_missing_source_emits_json_error(tmp_path, capsys) -> None:
    output = tmp_path / "inspection.json"

    status = main(
        [
            "inspect",
            str(tmp_path / "missing.mp3"),
            "--output",
            str(output),
        ]
    )
    captured = capsys.readouterr()

    assert status == 3
    assert captured.out == ""
    assert json.loads(captured.err)["error"]["code"] == "filesystem.not_found"
    assert "Traceback" not in captured.err
    assert not output.exists()


def test_fake_run_is_sequential_and_repeat_uses_cache(
    tmp_path,
    capsys,
) -> None:
    pipeline = tmp_path / "pipeline.yaml"
    workspace = tmp_path / "workspace"
    write_pipeline(pipeline)
    argv = [
        "run-fake",
        "--pipeline",
        str(pipeline),
        "--workspace",
        str(workspace),
        "--run-id",
        "run-01",
        "--input-sha256",
        INPUT_SHA256,
    ]

    first_status = main(argv)
    first_summary = read_stdout(capsys)
    repeated_status = main(argv)
    repeated_summary = read_stdout(capsys)

    assert first_status == repeated_status == 0
    assert first_summary == repeated_summary
    assert first_summary["completed"] is True
    assert [stage["status"] for stage in first_summary["stages"]] == [
        "succeeded",
        "succeeded",
    ]
    first_artifact_sha256 = first_summary["stages"][0]["artifacts"][0]["sha256"]
    assert first_summary["stages"][1]["input_sha256"] == first_artifact_sha256
    events = (workspace / "runs" / "run-01" / "events.jsonl").read_text(
        encoding="utf-8"
    )
    event_names = [json.loads(line)["event_name"] for line in events.splitlines()]
    assert event_names == [
        "stage.started",
        "stage.succeeded",
        "stage.started",
        "stage.succeeded",
        "stage.cache_hit",
        "stage.cache_hit",
    ]


def test_fake_run_code_revision_invalidates_cache(tmp_path, capsys) -> None:
    pipeline = tmp_path / "pipeline.yaml"
    workspace = tmp_path / "workspace"
    argv = [
        "run-fake",
        "--pipeline",
        str(pipeline),
        "--workspace",
        str(workspace),
        "--run-id",
        "run-revision",
        "--input-sha256",
        INPUT_SHA256,
    ]

    write_pipeline(pipeline, code_revision="revision-a")
    first_status = main(argv)
    first_summary = read_stdout(capsys)

    write_pipeline(pipeline, code_revision="revision-b")
    second_status = main(argv)
    second_summary = read_stdout(capsys)

    assert first_status == second_status == 0
    assert [stage["cache_key"] for stage in first_summary["stages"]] != [
        stage["cache_key"] for stage in second_summary["stages"]
    ]
    assert [stage["attempts"] for stage in second_summary["stages"]] == [1, 1]
    events = (workspace / "runs" / "run-revision" / "events.jsonl").read_text(
        encoding="utf-8"
    )
    assert [json.loads(line)["event_name"] for line in events.splitlines()] == [
        "stage.started",
        "stage.succeeded",
        "stage.started",
        "stage.succeeded",
        "stage.started",
        "stage.succeeded",
        "stage.started",
        "stage.succeeded",
    ]


def test_fake_run_accepts_256_character_code_revision(tmp_path, capsys) -> None:
    pipeline = tmp_path / "pipeline.yaml"
    workspace = tmp_path / "workspace"
    write_pipeline(pipeline, code_revision="r" * 256)

    status = main(
        [
            "run-fake",
            "--pipeline",
            str(pipeline),
            "--workspace",
            str(workspace),
            "--run-id",
            "run-max-code-revision",
            "--input-sha256",
            INPUT_SHA256,
        ]
    )
    summary = read_stdout(capsys)

    assert status == 0
    assert summary["completed"] is True
    assert summary["status"] == "succeeded"


def test_fake_run_rejects_257_character_code_revision_without_work(
    tmp_path,
    capsys,
) -> None:
    pipeline = tmp_path / "pipeline.yaml"
    workspace = tmp_path / "workspace"
    write_pipeline(pipeline, code_revision="r" * 257)

    status = main(
        [
            "run-fake",
            "--pipeline",
            str(pipeline),
            "--workspace",
            str(workspace),
            "--run-id",
            "run-oversized-code-revision",
            "--input-sha256",
            INPUT_SHA256,
        ]
    )
    captured = capsys.readouterr()

    assert status == 2
    assert captured.out == ""
    error = json.loads(captured.err)
    assert error["error"]["code"] == "validation.invalid"
    assert error["error"]["retryable"] is False
    assert error["error"]["details"]["issues"][0]["location"] == ["code_revision"]
    assert "Traceback" not in captured.err
    assert not workspace.exists()


def test_committed_pipeline_example_runs_directly(tmp_path, capsys) -> None:
    pipeline = PACKAGE_ROOT / "pipeline.example.yaml"

    status = main(
        [
            "run-fake",
            "--pipeline",
            str(pipeline),
            "--workspace",
            str(tmp_path / "workspace"),
            "--run-id",
            "run-committed-example",
            "--input-sha256",
            INPUT_SHA256,
        ]
    )
    summary = read_stdout(capsys)

    assert status == 0
    assert summary["completed"] is True
    assert summary["pipeline_id"] == "example-phase-1-pipeline"
    assert summary["status"] == "succeeded"


def test_fake_run_can_pause_then_resume(tmp_path, capsys) -> None:
    pipeline = tmp_path / "pipeline.yaml"
    workspace = tmp_path / "workspace"
    write_pipeline(pipeline)
    base = [
        "run-fake",
        "--pipeline",
        str(pipeline),
        "--workspace",
        str(workspace),
        "--run-id",
        "run-paused",
        "--input-sha256",
        INPUT_SHA256,
    ]

    paused_status = main([*base, "--pause"])
    paused = read_stdout(capsys)
    resumed_status = main([*base, "--resume"])
    resumed = read_stdout(capsys)

    assert paused_status == resumed_status == 0
    assert paused["completed"] is False
    assert paused["status"] == "paused"
    assert paused["stages"][0]["attempts"] == 0
    assert resumed["completed"] is True
    assert resumed["status"] == "succeeded"


def test_fake_run_can_cancel_before_work(tmp_path, capsys) -> None:
    pipeline = tmp_path / "pipeline.yaml"
    workspace = tmp_path / "workspace"
    write_pipeline(pipeline)

    status = main(
        [
            "run-fake",
            "--pipeline",
            str(pipeline),
            "--workspace",
            str(workspace),
            "--run-id",
            "run-cancelled",
            "--input-sha256",
            INPUT_SHA256,
            "--cancel",
        ]
    )
    summary = read_stdout(capsys)

    assert status == 0
    assert summary["completed"] is False
    assert summary["status"] == "cancelled"
    assert summary["stages"][0]["attempts"] == 0


def test_stage_summary_uses_committed_attempt_field(
    tmp_path,
    monkeypatch,
    capsys,
) -> None:
    pipeline = tmp_path / "pipeline.yaml"
    write_pipeline(pipeline)

    def committed_result(
        _orchestrator,
        *,
        run_id,
        specification,
        input_sha256,
        code_revision,
    ):
        identity = StageIdentity(
            stage_kind=specification.stage_kind,
            input_sha256=input_sha256,
            implementation_version=specification.implementation_version,
            config_sha256="b" * 64,
            output_schema_version=specification.output_schema_version,
            model_identifier=specification.model_identifier,
            model_sha256=specification.model_sha256,
            code_revision=code_revision,
        )
        return StageResultEnvelope(
            identity=identity,
            cache_key=stage_cache_key(identity),
            status=StageStatus.SUCCEEDED,
            attempt=7,
            artifacts=[
                ArtifactReference(
                    artifact_kind="fake.output",
                    path=f"runs/{run_id}/fake-result.json",
                    sha256="d" * 64,
                    size_bytes=1,
                )
            ],
            metrics=Metrics(),
        )

    monkeypatch.setattr(
        "audio_library_poc.cli.StageOrchestrator.run_stage",
        committed_result,
    )

    status = main(
        [
            "run-fake",
            "--pipeline",
            str(pipeline),
            "--workspace",
            str(tmp_path / "workspace"),
            "--run-id",
            "run-authoritative-attempt",
            "--input-sha256",
            INPUT_SHA256,
        ]
    )
    summary = read_stdout(capsys)

    assert status == 0
    assert [stage["attempts"] for stage in summary["stages"]] == [7, 7]


def test_fake_run_invalid_hash_emits_validation_error(tmp_path, capsys) -> None:
    pipeline = tmp_path / "pipeline.yaml"
    workspace = tmp_path / "workspace"
    write_pipeline(pipeline)

    status = main(
        [
            "run-fake",
            "--pipeline",
            str(pipeline),
            "--workspace",
            str(workspace),
            "--run-id",
            "run-invalid",
            "--input-sha256",
            "not-a-sha256",
            "--pause",
        ]
    )
    captured = capsys.readouterr()

    assert status == 2
    assert captured.out == ""
    assert json.loads(captured.err)["error"]["code"] == "validation.invalid"
    assert "Traceback" not in captured.err
    assert not workspace.exists()


def test_fake_run_invalid_run_id_emits_validation_error(tmp_path, capsys) -> None:
    pipeline = tmp_path / "pipeline.yaml"
    workspace = tmp_path / "workspace"
    write_pipeline(pipeline)

    status = main(
        [
            "run-fake",
            "--pipeline",
            str(pipeline),
            "--workspace",
            str(workspace),
            "--run-id",
            "Invalid Run Id",
            "--input-sha256",
            INPUT_SHA256,
            "--pause",
        ]
    )
    captured = capsys.readouterr()

    assert status == 2
    assert captured.out == ""
    error = json.loads(captured.err)
    assert error["error"]["code"] == "validation.invalid"
    assert error["error"]["details"]["issues"][0]["location"][0] == "run_id"
    assert "Traceback" not in captured.err
    assert not workspace.exists()


@pytest.mark.parametrize("non_finite", [".nan", ".inf", "-.inf"])
def test_non_finite_pipeline_config_emits_validation_error_without_work(
    tmp_path,
    capsys,
    non_finite,
) -> None:
    pipeline = tmp_path / "pipeline.yaml"
    workspace = tmp_path / "workspace"
    pipeline.write_text(
        f"""\
schema_version: 1.0.0
pipeline_id: non-finite-pipeline
code_revision: test-revision
stages:
  - stage_kind: fake.first
    implementation_version: 1.0.0
    config:
      payload:
        invalid_number: {non_finite}
""",
        encoding="utf-8",
    )

    status = main(
        [
            "run-fake",
            "--pipeline",
            str(pipeline),
            "--workspace",
            str(workspace),
            "--run-id",
            "run-non-finite",
            "--input-sha256",
            INPUT_SHA256,
        ]
    )
    captured = capsys.readouterr()

    assert status == 2
    assert captured.out == ""
    assert json.loads(captured.err)["error"]["code"] == "validation.invalid"
    assert "Traceback" not in captured.err
    assert not workspace.exists()


def test_installed_module_entrypoint_help_smoke() -> None:
    completed = subprocess.run(
        [sys.executable, "-m", "audio_library_poc.cli", "--help"],
        cwd=PACKAGE_ROOT,
        capture_output=True,
        text=True,
        check=False,
        timeout=30,
    )

    assert completed.returncode == 0
    assert "validate-corpus" in completed.stdout
    assert completed.stderr == ""
