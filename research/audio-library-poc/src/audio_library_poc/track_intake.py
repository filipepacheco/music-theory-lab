"""Build one runnable pipeline manifest for a newly added source file.

Adding a track by hand means writing a manifest per stage, pasting the same
source path into each, pinning both checkpoint digests, and inventing a run
id -- roughly thirty lines of YAML that differ from the last track's only in
the filename. ``workspace/`` currently holds twenty-eight such manifests for
four tracks.

Everything here is pure: it takes a filename and two checkpoint references
and returns the manifest as a plain dict, ready for
``PipelineManifest.model_validate``. Hashing files, writing YAML, running
stages and publishing results all live in the caller.

The four stages are exactly the ones ``sync_workspace_to_public.py``
consumes. ``key.chord_root_profile`` is deliberately absent: it is an
evaluation baseline the public export never reads.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from pathlib import PurePosixPath
from typing import Any, Final

DEFAULT_DEVICE: Final = "cuda"
DEFAULT_PRECISION: Final = "float16"
DEFAULT_SAMPLE_RATE: Final = 22050
DEFAULT_HOP_LENGTH: Final = 2048
DEFAULT_SEGMENT_COUNT: Final = 7

#: ``EffectiveSectionAnalyzerSettings.n_segments`` is ``gt=0, le=64``. A stage
#: ``config`` is a free-form dict at manifest load, so nothing between an
#: upload form and the section runtime would catch a bad value -- it would
#: surface minutes in, after the GPU stages had already run.
MIN_SEGMENT_COUNT: Final = 1
MAX_SEGMENT_COUNT: Final = 64

#: Stages the public export needs, in the order they run. Beat and chord are
#: the GPU stages; key and section are CPU-only and comparatively cheap.
INTAKE_STAGE_KINDS: Final = (
    "beat.beat_this",
    "chord.chordmini_btc",
    "key.hpcp",
    "section.librosa_segment",
)

#: ``Identifier`` in models.py, which run_id and pipeline_id both use.
_IDENTIFIER_MAX_LENGTH: Final = 128
_SLUG_FALLBACK: Final = "faixa"


@dataclass(frozen=True)
class CheckpointRef:
    """One pinned checkpoint: where it lives and what it must hash to."""

    relative_path: str
    sha256: str

    @property
    def identifier(self) -> str:
        """Filename, which is what the manifests use as model_identifier."""

        return PurePosixPath(self.relative_path).name


def slugify(value: str, *, fallback: str = _SLUG_FALLBACK) -> str:
    """Reduce a title to something usable as a run id and a filename.

    ``Identifier`` accepts lowercase alphanumerics separated by single ``.``,
    ``_`` or ``-``, so accents are folded rather than dropped ("Coração" ->
    "coracao") and every other character collapses to a single dash. An input
    with nothing usable in it returns `fallback`, because a caller that
    uploaded "!!!.mp3" still deserves a working run.
    """

    folded = unicodedata.normalize("NFKD", value)
    ascii_only = folded.encode("ascii", "ignore").decode("ascii").lower()
    dashed = re.sub(r"[^a-z0-9]+", "-", ascii_only).strip("-")
    if not dashed:
        return fallback
    return dashed[:_IDENTIFIER_MAX_LENGTH].rstrip("-")


def build_intake_manifest(
    *,
    slug: str,
    source_relative_path: str,
    beat_checkpoint: CheckpointRef,
    chord_checkpoint: CheckpointRef,
    device: str = DEFAULT_DEVICE,
    precision: str = DEFAULT_PRECISION,
    sample_rate: int = DEFAULT_SAMPLE_RATE,
    hop_length: int = DEFAULT_HOP_LENGTH,
    segment_count: int = DEFAULT_SEGMENT_COUNT,
) -> dict[str, Any]:
    """Assemble the four-stage manifest for one source file.

    All four stages go in a single manifest under a single run id rather than
    one run each: ``PipelineManifest`` already requires distinct stage kinds,
    the orchestrator runs a manifest's stages in order and stops at the first
    failure, and ``collect_analyses`` groups by ``source_sha256`` across
    whatever run directories it finds. One run is simply less to name.
    """

    if not MIN_SEGMENT_COUNT <= segment_count <= MAX_SEGMENT_COUNT:
        raise ValueError(
            f"segment_count must be between {MIN_SEGMENT_COUNT} and "
            f"{MAX_SEGMENT_COUNT}, got {segment_count}"
        )
    return {
        "schema_version": "1.0.0",
        "pipeline_id": f"intake-{slug}"[:_IDENTIFIER_MAX_LENGTH].rstrip("-"),
        "code_revision": "workspace-local",
        "stages": [
            {
                "stage_kind": "beat.beat_this",
                "implementation_version": "1.0.0",
                "model_identifier": beat_checkpoint.identifier,
                "model_sha256": beat_checkpoint.sha256,
                "max_attempts": 1,
                "config": {
                    "source_relative_path": source_relative_path,
                    "checkpoint_relative_path": beat_checkpoint.relative_path,
                    "device": device,
                    "precision": precision,
                    "use_dbn": False,
                },
            },
            {
                "stage_kind": "chord.chordmini_btc",
                "implementation_version": "1.0.0",
                "model_identifier": chord_checkpoint.identifier,
                "model_sha256": chord_checkpoint.sha256,
                "max_attempts": 1,
                "config": {
                    "source_relative_path": source_relative_path,
                    "checkpoint_relative_path": chord_checkpoint.relative_path,
                    "device": device,
                    "precision": precision,
                    "sliding_window_overlap": 0.5,
                    "min_segment_seconds": 0.0,
                },
            },
            {
                "stage_kind": "key.hpcp",
                "implementation_version": "1.0.0",
                "max_attempts": 1,
                "config": {
                    "source_relative_path": source_relative_path,
                    "sample_rate": sample_rate,
                    "hop_length": hop_length,
                },
            },
            {
                "stage_kind": "section.librosa_segment",
                "implementation_version": "1.0.0",
                "model_identifier": "librosa_segment",
                "max_attempts": 1,
                "config": {
                    "source_relative_path": source_relative_path,
                    "sample_rate": sample_rate,
                    "hop_length": hop_length,
                    "n_segments": segment_count,
                },
            },
        ],
    }


def intake_source_relative_path(slug: str, suffix: str) -> str:
    """Where an uploaded file lands, as a workspace-relative POSIX path.

    The suffix keeps the uploaded extension (lowercased) because the decoders
    downstream dispatch on it; an empty or dotless suffix falls back to
    ``.mp3``, matching what the module is for.
    """

    normalized = suffix.lower()
    if not normalized.startswith(".") or len(normalized) < 2:
        normalized = ".mp3"
    return f"originals/{slug}{normalized}"
