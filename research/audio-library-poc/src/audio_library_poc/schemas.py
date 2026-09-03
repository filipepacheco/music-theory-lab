"""Deterministic JSON Schema export for POC contracts."""

from pathlib import Path
from typing import Literal

from pydantic import BaseModel

from audio_library_poc.beat_analysis import BeatAnalysisResult
from audio_library_poc.checkpoints import CheckpointManifest
from audio_library_poc.chord_analysis import ChordAnalysisResult
from audio_library_poc.io import atomic_write_json
from audio_library_poc.models import (
    CorpusManifest,
    MetadataResult,
    PipelineManifest,
    SourceInspectionReport,
    StageResultEnvelope,
)
from audio_library_poc.separation import SeparationResult

SchemaMode = Literal["validation", "serialization"]

SCHEMA_MODELS: tuple[tuple[str, type[BaseModel]], ...] = (
    ("corpus-manifest", CorpusManifest),
    ("pipeline-manifest", PipelineManifest),
    ("stage-result-envelope", StageResultEnvelope),
    ("metadata-result", MetadataResult),
    ("source-inspection-report", SourceInspectionReport),
    ("separation-result", SeparationResult),
    ("checkpoint-manifest", CheckpointManifest),
    ("beat-analysis-result", BeatAnalysisResult),
    ("chord-analysis-result", ChordAnalysisResult),
)
SCHEMA_MODES: tuple[SchemaMode, ...] = ("validation", "serialization")


def export_json_schemas(destination: Path) -> tuple[Path, ...]:
    """Atomically export stable validation and serialization schemas."""

    output_directory = Path(destination)
    written: list[Path] = []
    for name, model in SCHEMA_MODELS:
        for mode in SCHEMA_MODES:
            output_path = output_directory / f"{name}.{mode}.schema.json"
            schema = model.model_json_schema(mode=mode)
            atomic_write_json(output_path, schema)
            written.append(output_path)
    return tuple(written)
