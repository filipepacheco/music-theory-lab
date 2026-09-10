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

The intake stages are exactly the ones ``sync_workspace_to_public.py``
consumes. ``key.chord_root_profile`` is deliberately absent: it is an
evaluation baseline the public export never reads.

Stage versions come from the stage modules rather than literals: each stage
rejects a result whose provenance disagrees with the version its manifest
declared, so a hand-written "1.0.0" here would start failing the moment a
runtime was corrected.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from pathlib import PurePosixPath
from typing import Any, Final

from audio_library_poc.beat_input_quality import BeatInputQualityPolicyConfig
from audio_library_poc.beat_quality_stage import (
    BEAT_INPUT_QUALITY_IMPLEMENTATION_VERSION,
)
from audio_library_poc.beat_this_stage import BEAT_THIS_IMPLEMENTATION_VERSION
from audio_library_poc.chordmini_btc_stage import (
    CHORDMINI_BTC_IMPLEMENTATION_VERSION,
)
from audio_library_poc.hpcp_key_stage import HPCP_KEY_IMPLEMENTATION_VERSION
from audio_library_poc.section_stage import SECTION_LIBROSA_IMPLEMENTATION_VERSION

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
#: the GPU stages; key, quality, and section are CPU-only and comparatively cheap.
INTAKE_STAGE_KINDS: Final = (
    "beat.beat_this",
    "chord.chordmini_btc",
    "key.hpcp",
    "quality.beat_input",
    "section.librosa_segment",
)

#: ``Identifier`` in models.py, which run_id and pipeline_id both use.
_IDENTIFIER_MAX_LENGTH: Final = 128
_SLUG_FALLBACK: Final = "faixa"

#: Where the intake records what it analyzed, for the public export to read.
#: Deliberately not ``corpus.local.yaml``: that one is the curated evaluation
#: set whose ``trusted_key`` annotations evaluation runs score against, and an
#: upload has no ground truth to contribute to it.
INTAKE_TRACKS_MANIFEST: Final = "intake-tracks.local.yaml"


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
    """Assemble the intake manifest for one source file.

    All stages go in a single manifest under a single run id rather than
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
                "implementation_version": BEAT_THIS_IMPLEMENTATION_VERSION,
                "output_schema_version": "2.0.0",
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
                "implementation_version": CHORDMINI_BTC_IMPLEMENTATION_VERSION,
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
                "implementation_version": HPCP_KEY_IMPLEMENTATION_VERSION,
                "max_attempts": 1,
                "config": {
                    "source_relative_path": source_relative_path,
                    "sample_rate": sample_rate,
                    "hop_length": hop_length,
                },
            },
            {
                "stage_kind": "quality.beat_input",
                "implementation_version": BEAT_INPUT_QUALITY_IMPLEMENTATION_VERSION,
                "max_attempts": 1,
                "config": {
                    "source_relative_path": source_relative_path,
                    # The intake runner resolves this pointer to the immutable
                    # beat artifact before dispatching the quality stage.
                    "beat_result_relative_path": ".pending/beat-analysis-result.json",
                    "analyzer_candidate": "beat_this",
                    "analyzer_implementation_version": BEAT_THIS_IMPLEMENTATION_VERSION,
                    "model_identifier": beat_checkpoint.identifier,
                    "model_sha256": beat_checkpoint.sha256,
                    "analyzer_code_revision": "workspace-local",
                    "policy": BeatInputQualityPolicyConfig.provisional_v1().model_dump(
                        mode="json"
                    ),
                },
            },
            {
                "stage_kind": "section.librosa_segment",
                "implementation_version": SECTION_LIBROSA_IMPLEMENTATION_VERSION,
                "output_schema_version": "2.0.0",
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


def upsert_intake_track(
    manifest: dict[str, Any] | None,
    *,
    track_id: str,
    source_relative_path: str,
    sha256: str,
    title: str,
    artist: str,
) -> dict[str, Any]:
    """Record one uploaded track's display metadata, replacing any older row.

    The public export reads title, artist and source path from here. Without
    a row a track reaches the app as "Untitled" by "Unknown" with no audio to
    play, because the only other place the export looks is the corpus. Rows
    are shaped like corpus entries so the export parses both the same way,
    minus the annotation fields an upload cannot honestly fill in.

    A row is replaced when it matches on ``expected_sha256`` -- the key the
    export groups tracks by -- or on ``track_id``, whose slug also names the
    file on disk, so re-uploading under the same title overwrites that audio
    and leaves the older row describing bytes that are gone.
    """

    tracks = list((manifest or {}).get("tracks") or [])
    kept = [
        track
        for track in tracks
        if track.get("expected_sha256") != sha256 and track.get("track_id") != track_id
    ]
    kept.append(
        {
            "track_id": track_id,
            "source_path": source_relative_path,
            "expected_sha256": sha256,
            "annotation": {"title": title, "artist": artist},
        }
    )
    return {"schema_version": "1.0.0", "tracks": kept}


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
