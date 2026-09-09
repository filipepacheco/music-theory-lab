"""Deterministic JSON Schema export for POC contracts."""

from pathlib import Path
from typing import Literal

from pydantic import BaseModel

from audio_library_poc.beat_analysis import BeatAnalysisResult
from audio_library_poc.beat_input_quality import BeatInputQualityDecision
from audio_library_poc.checkpoints import CheckpointManifest
from audio_library_poc.chord_analysis import (
    ChordAnalysisResult,
    ChordFrameEvidenceArtifact,
)
from audio_library_poc.evaluation_manifest import EvaluationManifest
from audio_library_poc.io import atomic_write_json
from audio_library_poc.key_analysis import KeyAnalysisResult
from audio_library_poc.models import (
    CorpusManifest,
    MetadataResult,
    PipelineManifest,
    SourceInspectionReport,
    StageResultEnvelope,
)
from audio_library_poc.product_evaluation_report import ProductEvaluationReport
from audio_library_poc.section_analysis import SectionAnalysisResult
from audio_library_poc.structural_segmentation import StructuralSegmentationResult
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
    ("beat-input-quality-decision", BeatInputQualityDecision),
    ("chord-analysis-result", ChordAnalysisResult),
    ("chord-frame-evidence", ChordFrameEvidenceArtifact),
    ("key-analysis-result", KeyAnalysisResult),
    ("section-analysis-result", SectionAnalysisResult),
    ("structural-segmentation-result", StructuralSegmentationResult),
    ("evaluation-manifest", EvaluationManifest),
    ("product-evaluation-report", ProductEvaluationReport),
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
