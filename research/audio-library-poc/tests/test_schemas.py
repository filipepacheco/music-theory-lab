import json
from pathlib import Path

from audio_library_poc.schemas import export_json_schemas

EXPECTED_SCHEMA_NAMES = (
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
)
PACKAGE_ROOT = Path(__file__).parents[1]
COMMITTED_SCHEMA_DIRECTORY = PACKAGE_ROOT / "schemas"


def test_export_json_schemas_writes_both_modes_for_each_contract(
    tmp_path: Path,
) -> None:
    written = export_json_schemas(tmp_path)

    assert tuple(path.name for path in written) == EXPECTED_SCHEMA_NAMES
    for path in written:
        schema = json.loads(path.read_text(encoding="utf-8"))
        assert schema["title"] in {
            "CorpusManifest",
            "PipelineManifest",
            "StageResultEnvelope",
            "MetadataResult",
            "SourceInspectionReport",
            "SeparationResult",
            "CheckpointManifest",
            "BeatAnalysisResult",
            "ChordAnalysisResult",
        }
        assert schema["type"] == "object"


def test_committed_schemas_are_byte_reproducible_on_rerun(
    tmp_path: Path,
) -> None:
    first_paths = export_json_schemas(tmp_path)
    first_bytes = {path.name: path.read_bytes() for path in first_paths}

    second_paths = export_json_schemas(tmp_path)
    second_bytes = {path.name: path.read_bytes() for path in second_paths}
    committed_bytes = {
        path.name: path.read_bytes()
        for path in COMMITTED_SCHEMA_DIRECTORY.glob("*.json")
    }

    assert second_bytes == first_bytes
    assert committed_bytes == first_bytes
    assert len(committed_bytes) == 18
    assert list(tmp_path.glob(".*.tmp")) == []
