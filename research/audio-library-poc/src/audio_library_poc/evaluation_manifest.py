"""Frozen, hash-bound inputs for a private harmony evaluation.

The manifest selects artifacts by their successful result envelopes. It never
searches ``runs/``. Original audio is bound through a private corpus manifest:
that lets a corpus intentionally use an absolute, external source path without
putting a machine-specific path in this public contract.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum
from math import isfinite
from pathlib import Path
from typing import Literal, Self

import yaml
from pydantic import Field, field_validator, model_validator

from audio_library_poc.chord_analysis import ChordAnalysisResult
from audio_library_poc.io import read_json
from audio_library_poc.key_analysis import KeyAnalysisResult
from audio_library_poc.manifest import load_corpus_manifest, resolve_source_path
from audio_library_poc.metadata import hash_file
from audio_library_poc.models import (
    ArtifactReference,
    ContractModel,
    Identifier,
    Sha256,
    StageIdentity,
    StageResultEnvelope,
    StageStatus,
    VersionString,
)
from audio_library_poc.paths import validate_workspace_relative_path


class EvaluationSplit(StrEnum):
    DEVELOPMENT = "development"
    HOLDOUT = "holdout"


class EvaluationDisposition(StrEnum):
    INCLUDED = "included"
    QUARANTINED = "quarantined"


class AnnotationKind(StrEnum):
    CHORD = "chord"
    KEY = "key"


class HashBoundFile(ContractModel):
    """One private workspace file whose bytes are fixed by the manifest."""

    path: str = Field(min_length=1)
    sha256: Sha256

    @field_validator("path")
    @classmethod
    def validate_path(cls, value: str) -> str:
        return validate_workspace_relative_path(value)


class CorpusBoundOriginal(ContractModel):
    """An original selected from a corpus manifest, including external sources.

    ``corpus_manifest_path`` is contained in the evaluation workspace. The
    corpus manifest remains the only place that can name an absolute source
    path, so an evaluation manifest stays portable and auditable.
    """

    corpus_manifest_path: str = Field(min_length=1)
    corpus_track_id: Identifier
    sha256: Sha256

    @field_validator("corpus_manifest_path")
    @classmethod
    def validate_manifest_path(cls, value: str) -> str:
        return validate_workspace_relative_path(value)


class AnnotationOverlay(HashBoundFile):
    """A hash-bound, non-destructive set of interval replacements."""

    overlay_id: Identifier
    version: VersionString
    reason: str = Field(min_length=1)


class ReferenceAnnotation(HashBoundFile):
    """Raw reference provenance, disposition, timing evidence, and overlays."""

    annotation_id: Identifier
    kind: AnnotationKind
    source: str = Field(min_length=1)
    version: VersionString
    disposition: EvaluationDisposition = EvaluationDisposition.INCLUDED
    quarantine_reason: str | None = None
    available: bool = True
    offset_seconds: float = 0.0
    alignment_evidence: str | None = None
    duration_alignment_evidence: str | None = None
    overlays: tuple[AnnotationOverlay, ...] = ()

    @model_validator(mode="after")
    def validate_annotation(self) -> Self:
        if self.disposition is EvaluationDisposition.QUARANTINED:
            if not self.quarantine_reason or not self.quarantine_reason.strip():
                raise ValueError("quarantined annotations require quarantine_reason")
        elif self.quarantine_reason is not None:
            raise ValueError("included annotations must not have quarantine_reason")
        if (
            not self.available
            and self.disposition is not EvaluationDisposition.QUARANTINED
        ):
            raise ValueError("unavailable annotations must be quarantined")
        if self.offset_seconds:
            if not self.alignment_evidence or not self.alignment_evidence.strip():
                raise ValueError(
                    "a non-zero annotation offset requires independent "
                    "alignment_evidence"
                )
            forbidden = ("accuracy", "prediction", "score", "metric")
            evidence = self.alignment_evidence.casefold()
            if any(term in evidence for term in forbidden):
                raise ValueError(
                    "alignment_evidence must not justify an offset from model accuracy"
                )
        ids = [overlay.overlay_id for overlay in self.overlays]
        if len(ids) != len(set(ids)):
            raise ValueError("annotation overlay_id values must be unique")
        return self


class EvaluationExcerpt(ContractModel):
    excerpt_id: Identifier
    start_seconds: float = Field(ge=0)
    end_seconds: float = Field(gt=0)

    @model_validator(mode="after")
    def validate_interval(self) -> Self:
        if self.end_seconds <= self.start_seconds:
            raise ValueError("excerpt end_seconds must be greater than start_seconds")
        return self


class SelectedArtifact(ContractModel):
    """The one artifact a candidate/config is allowed to contribute.

    ``config_id`` is a readable report label. The immutable configuration
    binding is ``identity.config_sha256``, which is verified with the envelope.
    """

    candidate_id: Identifier
    config_id: Identifier
    run_id: Identifier
    cache_key: Sha256
    envelope_path: str = Field(min_length=1)
    identity: StageIdentity
    artifact_kind: Identifier
    artifact_path: str = Field(min_length=1)
    artifact_sha256: Sha256
    artifact_size_bytes: int = Field(ge=0)
    artifact_schema_version: VersionString

    @field_validator("envelope_path", "artifact_path")
    @classmethod
    def validate_path(cls, value: str) -> str:
        return validate_workspace_relative_path(value)

    @model_validator(mode="after")
    def validate_identity(self) -> Self:
        expected = (
            f"runs/{self.run_id}/stages/{self.identity.stage_kind}/results/"
            f"{self.cache_key}.json"
        )
        if self.envelope_path != expected:
            raise ValueError(
                "envelope_path must be the canonical selected run/stage/cache "
                "result path"
            )
        artifact_prefix = (
            f"runs/{self.run_id}/stages/{self.identity.stage_kind}/artifacts/"
            f"{self.cache_key}/"
        )
        artifact_name = self.artifact_path.removeprefix(artifact_prefix)
        if self.artifact_path == artifact_name or "/" in artifact_name:
            raise ValueError(
                "artifact_path must be a direct file in the selected "
                "run/stage/cache artifact directory"
            )
        return self


class EvaluationTrack(ContractModel):
    """One original recording, never an adjacent excerpt, in the frozen split."""

    recording_id: Identifier
    original: CorpusBoundOriginal
    split: EvaluationSplit
    excerpts: tuple[EvaluationExcerpt, ...] = Field(min_length=1)
    annotations: tuple[ReferenceAnnotation, ...] = ()
    selections: tuple[SelectedArtifact, ...] = Field(min_length=1)

    @model_validator(mode="after")
    def validate_track(self) -> Self:
        excerpt_ids = [excerpt.excerpt_id for excerpt in self.excerpts]
        if len(excerpt_ids) != len(set(excerpt_ids)):
            raise ValueError("excerpt_id values must be unique per recording")
        for earlier, later in zip(self.excerpts, self.excerpts[1:], strict=False):
            if later.start_seconds < earlier.start_seconds:
                raise ValueError("excerpts must be ordered by start_seconds")
            if later.start_seconds < earlier.end_seconds:
                raise ValueError("excerpts must not overlap")
        annotation_ids = [annotation.annotation_id for annotation in self.annotations]
        if len(annotation_ids) != len(set(annotation_ids)):
            raise ValueError("annotation_id values must be unique per recording")
        included_kinds = [
            annotation.kind
            for annotation in self.annotations
            if annotation.disposition is EvaluationDisposition.INCLUDED
        ]
        if len(included_kinds) != len(set(included_kinds)):
            raise ValueError(
                "at most one included annotation is allowed per recording and kind"
            )
        selection_ids = [
            (selection.candidate_id, selection.config_id, selection.artifact_kind)
            for selection in self.selections
        ]
        if len(selection_ids) != len(set(selection_ids)):
            raise ValueError("candidate/config/artifact selections must be unambiguous")
        for selection in self.selections:
            if selection.identity.input_sha256 != self.original.sha256:
                raise ValueError(
                    "selected identity input_sha256 must match original hash"
                )
        return self


class EvaluationManifest(ContractModel):
    """Versioned selection and provenance for the inspected four-track pilot."""

    schema_version: Literal["1.0.0"] = "1.0.0"
    manifest_id: Identifier
    split_policy: Literal["recording"] = "recording"
    pilot_disclosure: str = Field(min_length=1)
    tracks: tuple[EvaluationTrack, ...] = Field(min_length=1)

    @model_validator(mode="after")
    def validate_unique_recordings(self) -> Self:
        ids = [track.recording_id for track in self.tracks]
        if len(ids) != len(set(ids)):
            raise ValueError("recording_id values must be unique")
        hashes = [track.original.sha256 for track in self.tracks]
        if len(hashes) != len(set(hashes)):
            raise ValueError(
                "one original recording hash may appear only once; split by recording"
            )
        return self


class EvaluationSelectionError(RuntimeError):
    """A manifest-selected private input did not pass verification."""


@dataclass(frozen=True)
class AnnotationInterval:
    start_seconds: float
    end_seconds: float
    label: str


@dataclass(frozen=True)
class ResolvedAnnotation:
    track: EvaluationTrack
    annotation: ReferenceAnnotation
    intervals: tuple[AnnotationInterval, ...]


@dataclass(frozen=True)
class ResolvedArtifact:
    track: EvaluationTrack
    selection: SelectedArtifact
    envelope: StageResultEnvelope
    result: ChordAnalysisResult | KeyAnalysisResult


def load_evaluation_manifest(path: Path) -> EvaluationManifest:
    """Load a private YAML manifest without discovering any local runs."""

    with Path(path).open(encoding="utf-8") as source:
        payload = yaml.safe_load(source)
    return EvaluationManifest.model_validate(payload)


def resolve_manifest_artifacts(
    manifest: EvaluationManifest,
    workspace: Path,
) -> tuple[ResolvedArtifact, ...]:
    """Verify exactly the manifest selections; never sweep ``runs/``."""

    root = Path(workspace).resolve()
    resolved: list[ResolvedArtifact] = []
    for track in manifest.tracks:
        track_resolved: list[ResolvedArtifact] = []
        _verify_original(root, track)
        for annotation in track.annotations:
            if not annotation.available:
                continue
            _verify_file(root, annotation, f"{annotation.kind} annotation")
            for overlay in annotation.overlays:
                _verify_file(root, overlay, f"annotation overlay {overlay.overlay_id}")
        for selection in track.selections:
            item = _resolve_selection(root, track, selection)
            resolved.append(item)
            track_resolved.append(item)
        _verify_excerpt_bounds(track, track_resolved)
    return tuple(resolved)


def resolve_manifest_annotations(
    manifest: EvaluationManifest,
    workspace: Path,
) -> tuple[ResolvedAnnotation, ...]:
    """Parse included references, apply declared overlays/offsets, and clip them.

    References whose source master has a different duration require documented
    evidence. They are clipped to the selected artifact's source duration and
    the manifest excerpts, which makes the evaluated interval explicit.
    """

    root = Path(workspace).resolve()
    verified = resolve_manifest_artifacts(manifest, root)
    output: list[ResolvedAnnotation] = []
    for track in manifest.tracks:
        for annotation in track.annotations:
            if annotation.disposition is EvaluationDisposition.QUARANTINED:
                continue
            duration = _selected_duration(track, annotation.kind, verified)
            raw_rows = _parse_annotation(root, annotation)
            rows = _apply_overlays(root, annotation, raw_rows)
            rows = _shift_and_clip(
                rows,
                annotation.offset_seconds,
                duration,
                track.excerpts,
            )
            if not rows:
                raise EvaluationSelectionError(
                    f"{annotation.annotation_id} has no interval after clipping"
                )
            raw_end = max(row.end_seconds for row in raw_rows)
            if abs(raw_end + annotation.offset_seconds - duration) > 1e-3:
                if not annotation.duration_alignment_evidence:
                    raise EvaluationSelectionError(
                        f"{annotation.annotation_id} duration differs from selected "
                        "audio; record duration_alignment_evidence"
                    )
            output.append(ResolvedAnnotation(track, annotation, tuple(rows)))
    return tuple(output)


def _verify_original(root: Path, track: EvaluationTrack) -> None:
    original = track.original
    corpus_path = _workspace_path(
        root, original.corpus_manifest_path, "corpus manifest"
    )
    try:
        corpus = load_corpus_manifest(corpus_path)
    except (OSError, ValueError, yaml.YAMLError) as exc:
        raise EvaluationSelectionError(
            f"corpus manifest is invalid: {corpus_path}"
        ) from exc
    matches = [
        item for item in corpus.tracks if item.track_id == original.corpus_track_id
    ]
    if len(matches) != 1:
        raise EvaluationSelectionError(
            f"corpus track is ambiguous or missing: {original.corpus_track_id}"
        )
    corpus_track = matches[0]
    if corpus_track.expected_sha256 != original.sha256:
        raise EvaluationSelectionError(
            "corpus original hash differs from evaluation manifest"
        )
    source = resolve_source_path(corpus_path, corpus_track.source_path)
    try:
        actual = hash_file(source)
    except OSError as exc:
        raise EvaluationSelectionError(f"original is missing: {source}") from exc
    if actual != original.sha256:
        raise EvaluationSelectionError(f"original hash differs: {source}")


def _resolve_selection(
    root: Path,
    track: EvaluationTrack,
    selection: SelectedArtifact,
) -> ResolvedArtifact:
    envelope_path = _workspace_path(root, selection.envelope_path, "envelope")
    try:
        envelope = StageResultEnvelope.model_validate(read_json(envelope_path))
    except (OSError, ValueError) as exc:
        raise EvaluationSelectionError(
            f"selected envelope is invalid: {envelope_path}"
        ) from exc
    if envelope.status is not StageStatus.SUCCEEDED:
        raise EvaluationSelectionError(
            f"selected envelope is not successful: {envelope_path}"
        )
    if (
        envelope.cache_key != selection.cache_key
        or envelope.identity != selection.identity
    ):
        raise EvaluationSelectionError(
            f"selected envelope identity differs: {envelope_path}"
        )
    matches = [
        artifact
        for artifact in envelope.artifacts
        if artifact.artifact_kind == selection.artifact_kind
        and artifact.path == selection.artifact_path
    ]
    if len(matches) != 1:
        raise EvaluationSelectionError(
            f"selected artifact is ambiguous or missing: {envelope_path}"
        )
    artifact = matches[0]
    if (
        artifact.sha256 != selection.artifact_sha256
        or artifact.size_bytes != selection.artifact_size_bytes
    ):
        raise EvaluationSelectionError(
            f"selected artifact declaration differs: {envelope_path}"
        )
    artifact_path = _workspace_path(root, artifact.path, "artifact")
    _verify_file(root, artifact, "selected artifact")
    try:
        result = _parse_analysis_result(artifact.artifact_kind, artifact_path)
    except (OSError, ValueError) as exc:
        raise EvaluationSelectionError(
            f"selected artifact has invalid typed JSON: {artifact_path}"
        ) from exc
    if result.schema_version != selection.artifact_schema_version:
        raise EvaluationSelectionError(
            f"selected artifact schema differs: {artifact_path}"
        )
    if result.schema_version != envelope.output_schema_version:
        raise EvaluationSelectionError(
            f"selected artifact schema differs from envelope: {artifact_path}"
        )
    if result.source_sha256 != track.original.sha256:
        raise EvaluationSelectionError(
            f"selected artifact source differs: {artifact_path}"
        )
    if result.provenance.candidate != selection.candidate_id:
        raise EvaluationSelectionError(
            f"selected artifact candidate differs: {artifact_path}"
        )
    if result.provenance.implementation_version != envelope.implementation_version:
        raise EvaluationSelectionError(
            f"selected artifact implementation differs: {artifact_path}"
        )
    if result.provenance.code_revision != envelope.code_revision:
        raise EvaluationSelectionError(
            f"selected artifact revision differs: {artifact_path}"
        )
    if isinstance(result, ChordAnalysisResult):
        if result.provenance.model_identifier != envelope.model_identifier:
            raise EvaluationSelectionError(
                f"selected artifact model differs: {artifact_path}"
            )
        if result.provenance.model_sha256 != envelope.model_sha256:
            raise EvaluationSelectionError(
                f"selected artifact model hash differs: {artifact_path}"
            )
        if not envelope.stage_kind.startswith("chord."):
            raise EvaluationSelectionError(
                f"selected chord stage differs: {envelope_path}"
            )
    elif not envelope.stage_kind.startswith("key."):
        raise EvaluationSelectionError(f"selected key stage differs: {envelope_path}")
    return ResolvedArtifact(track, selection, envelope, result)


def _verify_excerpt_bounds(
    track: EvaluationTrack,
    artifacts: list[ResolvedArtifact],
) -> None:
    durations = {item.result.source.duration_seconds for item in artifacts}
    if len(durations) != 1:
        raise EvaluationSelectionError(
            f"{track.recording_id} selected artifacts disagree on source duration"
        )
    duration = durations.pop()
    for excerpt in track.excerpts:
        if excerpt.end_seconds > duration:
            raise EvaluationSelectionError(
                f"{track.recording_id}/{excerpt.excerpt_id} exceeds source duration"
            )


def _parse_analysis_result(
    artifact_kind: str,
    path: Path,
) -> ChordAnalysisResult | KeyAnalysisResult:
    if artifact_kind == "chord.analysis_result":
        return ChordAnalysisResult.model_validate(read_json(path))
    if artifact_kind == "key.analysis_result":
        return KeyAnalysisResult.model_validate(read_json(path))
    raise ValueError(f"unsupported evaluation artifact kind: {artifact_kind}")


def _selected_duration(
    track: EvaluationTrack,
    kind: AnnotationKind,
    artifacts: tuple[ResolvedArtifact, ...],
) -> float:
    expected_kind = (
        "chord.analysis_result"
        if kind is AnnotationKind.CHORD
        else "key.analysis_result"
    )
    durations = {
        item.result.source.duration_seconds
        for item in artifacts
        if item.track.recording_id == track.recording_id
        and item.selection.artifact_kind == expected_kind
    }
    if len(durations) != 1:
        raise EvaluationSelectionError(
            f"{track.recording_id} needs exactly one source duration for "
            f"{kind} annotation"
        )
    return durations.pop()


def _parse_annotation(
    root: Path, annotation: ReferenceAnnotation
) -> list[AnnotationInterval]:
    path = _workspace_path(root, annotation.path, "annotation")
    rows: list[AnnotationInterval] = []
    with path.open(encoding="utf-8") as source:
        for line_number, line in enumerate(source, start=1):
            stripped = line.strip()
            if not stripped or stripped.startswith("#"):
                continue
            parts = stripped.split(maxsplit=2)
            if len(parts) < 3:
                raise EvaluationSelectionError(
                    f"invalid {annotation.kind} row {line_number}: {path}"
                )
            try:
                start, end = float(parts[0]), float(parts[1])
            except ValueError as exc:
                raise EvaluationSelectionError(
                    f"invalid interval row {line_number}: {path}"
                ) from exc
            label = parts[2]
            if annotation.kind is AnnotationKind.KEY:
                key_parts = label.split(maxsplit=1)
                if key_parts and key_parts[0].strip("'\"") == "Key":
                    label = key_parts[1] if len(key_parts) == 2 else ""
            if (
                not label.strip()
                or not isfinite(start)
                or not isfinite(end)
                or end <= start
            ):
                raise EvaluationSelectionError(
                    f"invalid interval row {line_number}: {path}"
                )
            rows.append(AnnotationInterval(start, end, label))
    return _validate_ordered_intervals(rows, annotation.annotation_id)


def _apply_overlays(
    root: Path,
    annotation: ReferenceAnnotation,
    rows: list[AnnotationInterval],
) -> list[AnnotationInterval]:
    for overlay in annotation.overlays:
        path = _workspace_path(root, overlay.path, "annotation overlay")
        try:
            document = yaml.safe_load(path.read_text(encoding="utf-8"))
            if (
                not isinstance(document, dict)
                or document.get("schema_version") != "1.0.0"
            ):
                raise ValueError("unsupported overlay schema")
            if document.get("kind") != annotation.kind.value:
                raise ValueError("overlay kind differs from annotation kind")
            replacements = document.get("replacements")
            if not isinstance(replacements, list) or not replacements:
                raise ValueError("overlay needs non-empty replacements")
            parsed = [
                AnnotationInterval(
                    float(item["start_seconds"]),
                    float(item["end_seconds"]),
                    str(item["label"]),
                )
                for item in replacements
            ]
        except (OSError, TypeError, ValueError, KeyError, yaml.YAMLError) as exc:
            raise EvaluationSelectionError(
                f"invalid annotation overlay: {path}"
            ) from exc
        for replacement in _validate_ordered_intervals(parsed, overlay.overlay_id):
            rows = _replace_interval(rows, replacement)
    return _validate_ordered_intervals(rows, annotation.annotation_id)


def _replace_interval(
    rows: list[AnnotationInterval],
    replacement: AnnotationInterval,
) -> list[AnnotationInterval]:
    output: list[AnnotationInterval] = []
    for row in rows:
        if (
            row.end_seconds <= replacement.start_seconds
            or row.start_seconds >= replacement.end_seconds
        ):
            output.append(row)
            continue
        if row.start_seconds < replacement.start_seconds:
            output.append(
                AnnotationInterval(
                    row.start_seconds, replacement.start_seconds, row.label
                )
            )
        if row.end_seconds > replacement.end_seconds:
            output.append(
                AnnotationInterval(replacement.end_seconds, row.end_seconds, row.label)
            )
    output.append(replacement)
    return sorted(output, key=lambda row: (row.start_seconds, row.end_seconds))


def _shift_and_clip(
    rows: list[AnnotationInterval],
    offset: float,
    duration: float,
    excerpts: tuple[EvaluationExcerpt, ...],
) -> list[AnnotationInterval]:
    clipped: list[AnnotationInterval] = []
    for row in rows:
        start, end = row.start_seconds + offset, row.end_seconds + offset
        for excerpt in excerpts:
            clipped_start = max(start, 0.0, excerpt.start_seconds)
            clipped_end = min(end, duration, excerpt.end_seconds)
            if clipped_end > clipped_start:
                clipped.append(
                    AnnotationInterval(clipped_start, clipped_end, row.label)
                )
    return _validate_ordered_intervals(
        sorted(clipped, key=lambda row: (row.start_seconds, row.end_seconds)),
        "clipped annotation",
    )


def _validate_ordered_intervals(
    rows: list[AnnotationInterval],
    label: str,
) -> list[AnnotationInterval]:
    previous_end = -1.0
    for row in rows:
        if not isfinite(row.start_seconds) or not isfinite(row.end_seconds):
            raise EvaluationSelectionError(f"{label} has invalid interval")
        if row.end_seconds <= row.start_seconds:
            raise EvaluationSelectionError(f"{label} has invalid interval")
        if row.start_seconds < previous_end:
            raise EvaluationSelectionError(f"{label} has overlapping intervals")
        previous_end = row.end_seconds
    return rows


def _verify_file(
    root: Path, file: HashBoundFile | ArtifactReference, label: str
) -> None:
    path = _workspace_path(root, file.path, label)
    try:
        actual = hash_file(path)
    except OSError as exc:
        raise EvaluationSelectionError(f"{label} is missing: {path}") from exc
    if actual != file.sha256:
        raise EvaluationSelectionError(f"{label} hash differs: {path}")
    if isinstance(file, ArtifactReference) and path.stat().st_size != file.size_bytes:
        raise EvaluationSelectionError(f"{label} size differs: {path}")


def _workspace_path(root: Path, relative: str, label: str) -> Path:
    path = (root / relative).resolve()
    if not path.is_relative_to(root):
        raise EvaluationSelectionError(f"{label} escapes workspace")
    return path


__all__ = (
    "AnnotationInterval",
    "AnnotationKind",
    "AnnotationOverlay",
    "CorpusBoundOriginal",
    "EvaluationDisposition",
    "EvaluationManifest",
    "EvaluationSelectionError",
    "EvaluationSplit",
    "EvaluationTrack",
    "ReferenceAnnotation",
    "ResolvedAnnotation",
    "ResolvedArtifact",
    "SelectedArtifact",
    "load_evaluation_manifest",
    "resolve_manifest_annotations",
    "resolve_manifest_artifacts",
)
