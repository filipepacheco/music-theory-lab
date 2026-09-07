"""Focused integrity tests for frozen private harmony selections."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

import pytest

from audio_library_poc.cache import stage_cache_key
from audio_library_poc.chord_analysis import (
    ChordAnalysisResult,
    ChordAnalyzerProvenance,
    ChordCoverage,
    ChordLabel,
    ChordSegment,
    ChordSourceFacts,
    EffectiveChordAnalyzerSettings,
)
from audio_library_poc.evaluation_manifest import (
    AnnotationKind,
    AnnotationOverlay,
    CorpusBoundOriginal,
    EvaluationDisposition,
    EvaluationManifest,
    EvaluationSelectionError,
    EvaluationSplit,
    EvaluationTrack,
    ReferenceAnnotation,
    SelectedArtifact,
    _parse_annotation,
    load_evaluation_manifest,
    resolve_manifest_annotations,
    resolve_manifest_artifacts,
)
from audio_library_poc.models import (
    ArtifactReference,
    Metrics,
    StageIdentity,
    StageResultEnvelope,
    StageStatus,
)
from audio_library_poc.separation import SeparatorPrecision


def _sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _prepared_manifest(tmp_path: Path) -> tuple[EvaluationManifest, Path, Path]:
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    source = tmp_path / "external-original.mp3"
    source.write_bytes(b"external original")
    source_hash = _sha(source)
    (workspace / "corpus.local.yaml").write_text(
        "\n".join(
            [
                'schema_version: "1.0.0"',
                "corpus_id: private-corpus",
                "tracks:",
                "  - track_id: external-track",
                f"    source_path: {source.as_posix()}",
                f"    expected_sha256: {source_hash}",
            ]
        )
        + "\n",
        encoding="utf-8",
    )
    annotation_path = workspace / "annotations" / "reference.lab"
    annotation_path.parent.mkdir()
    annotation_path.write_text("0.0 2.0 C:maj add9\n", encoding="utf-8")

    identity = StageIdentity(
        stage_kind="chord.chordmini_btc",
        input_sha256=source_hash,
        implementation_version="1.0.0",
        config_sha256="c" * 64,
        output_schema_version="1.0.0",
        model_identifier="checkpoint",
        model_sha256="d" * 64,
        code_revision="test",
    )
    cache_key = stage_cache_key(identity)
    artifact_path = (
        workspace
        / "runs"
        / "one-run"
        / "stages"
        / identity.stage_kind
        / "artifacts"
        / cache_key
        / "chord-analysis-result.json"
    )
    artifact_path.parent.mkdir(parents=True)
    result = ChordAnalysisResult(
        source_sha256=source_hash,
        provenance=ChordAnalyzerProvenance(
            candidate="chordmini_btc",
            implementation_version="1.0.0",
            model_identifier="checkpoint",
            model_sha256="d" * 64,
            code_revision="test",
        ),
        settings=EffectiveChordAnalyzerSettings(
            device="cpu",
            precision=SeparatorPrecision.FLOAT32,
            frame_duration_seconds=0.1,
            sample_rate=22050,
            hop_length=2048,
            seq_len=108,
        ),
        source=ChordSourceFacts(
            sample_rate=1,
            channels=1,
            frame_count=3,
            duration_seconds=3.0,
            peak_absolute_sample=0.0,
        ),
        segments=(
            ChordSegment(
                start_seconds=0.0,
                end_seconds=3.0,
                label=ChordLabel.MAJOR,
                root_pc=0,
                candidate_label="C",
            ),
        ),
        coverage=ChordCoverage(
            major_seconds=3.0,
            minor_seconds=0.0,
            unknown_seconds=0.0,
            no_chord_seconds=0.0,
        ),
    )
    artifact_path.write_text(result.model_dump_json(), encoding="utf-8")
    artifact_relative = artifact_path.relative_to(workspace).as_posix()
    artifact_hash = _sha(artifact_path)
    envelope = StageResultEnvelope(
        identity=identity,
        cache_key=cache_key,
        status=StageStatus.SUCCEEDED,
        attempt=1,
        artifacts=[
            ArtifactReference(
                artifact_kind="chord.analysis_result",
                path=artifact_relative,
                sha256=artifact_hash,
                size_bytes=artifact_path.stat().st_size,
            ),
        ],
        metrics=Metrics(counters={"attempts": 1}),
    )
    envelope_path = (
        workspace
        / "runs"
        / "one-run"
        / "stages"
        / identity.stage_kind
        / "results"
        / f"{cache_key}.json"
    )
    envelope_path.parent.mkdir(parents=True)
    envelope_path.write_text(envelope.model_dump_json(), encoding="utf-8")
    selection = SelectedArtifact(
        candidate_id="chordmini_btc",
        config_id="baseline",
        run_id="one-run",
        cache_key=cache_key,
        envelope_path=envelope_path.relative_to(workspace).as_posix(),
        identity=identity,
        artifact_kind="chord.analysis_result",
        artifact_path=artifact_relative,
        artifact_sha256=artifact_hash,
        artifact_size_bytes=artifact_path.stat().st_size,
        artifact_schema_version="1.0.0",
    )
    manifest = EvaluationManifest(
        manifest_id="private-pilot",
        pilot_disclosure="All recordings have already been inspected.",
        tracks=(
            EvaluationTrack(
                recording_id="external-track",
                original=CorpusBoundOriginal(
                    corpus_manifest_path="corpus.local.yaml",
                    corpus_track_id="external-track",
                    sha256=source_hash,
                ),
                split=EvaluationSplit.DEVELOPMENT,
                excerpts=(
                    {"excerpt_id": "shared", "start_seconds": 0.5, "end_seconds": 2.5},
                ),
                annotations=(
                    ReferenceAnnotation(
                        annotation_id="trusted-chords",
                        kind=AnnotationKind.CHORD,
                        path="annotations/reference.lab",
                        sha256=_sha(annotation_path),
                        source="fixture",
                        version="1.0.0",
                        offset_seconds=0.5,
                        alignment_evidence="Matched by a documented waveform cue.",
                        duration_alignment_evidence=(
                            "The shared source span is clipped."
                        ),
                    ),
                    ReferenceAnnotation(
                        annotation_id="disputed-key",
                        kind=AnnotationKind.KEY,
                        path="annotations/missing-key.lab",
                        sha256="e" * 64,
                        source="fixture",
                        version="1.0.0",
                        disposition=EvaluationDisposition.QUARANTINED,
                        quarantine_reason=(
                            "The stated key conflicts with the source chart."
                        ),
                        available=False,
                    ),
                ),
                selections=(selection,),
            ),
        ),
    )
    return manifest, workspace, artifact_path


def test_example_manifest_is_valid_contract() -> None:
    root = Path(__file__).parents[1]
    assert load_evaluation_manifest(root / "evaluation.example.yaml").manifest_id


def test_external_corpus_source_and_quarantined_reference_are_safe(
    tmp_path: Path,
) -> None:
    manifest, workspace, _ = _prepared_manifest(tmp_path)

    artifacts = resolve_manifest_artifacts(manifest, workspace)
    annotations = resolve_manifest_annotations(manifest, workspace)

    assert len(artifacts) == 1
    assert [item.annotation.annotation_id for item in annotations] == ["trusted-chords"]
    assert annotations[0].intervals[0].start_seconds == pytest.approx(0.5)
    assert annotations[0].intervals[0].end_seconds == pytest.approx(2.5)
    assert annotations[0].intervals[0].label == "C:maj add9"


def test_tampered_selected_artifact_is_rejected(tmp_path: Path) -> None:
    manifest, workspace, artifact_path = _prepared_manifest(tmp_path)
    artifact_path.write_text(json.dumps({"tampered": True}), encoding="utf-8")

    with pytest.raises(EvaluationSelectionError, match="hash differs"):
        resolve_manifest_artifacts(manifest, workspace)


@pytest.mark.parametrize(
    ("contents", "match"),
    [
        ("0 1 C\n1 nan D\n", "invalid interval"),
        ("0 2 C\n1 3 D\n", "overlapping"),
        ("not-an-interval\n", "invalid chord row"),
    ],
)
def test_annotation_parser_rejects_malformed_intervals(
    tmp_path: Path,
    contents: str,
    match: str,
) -> None:
    manifest, workspace, _ = _prepared_manifest(tmp_path)
    annotation = manifest.tracks[0].annotations[0]
    (workspace / annotation.path).write_text(contents, encoding="utf-8")

    with pytest.raises(EvaluationSelectionError, match=match):
        _parse_annotation(workspace, annotation)


def test_annotation_parser_keeps_timed_key_mode_and_silence(tmp_path: Path) -> None:
    manifest, workspace, _ = _prepared_manifest(tmp_path)
    key_path = workspace / "annotations" / "key.lab"
    key_path.write_text(
        "0 1 Silence\n1 2 Key\tD:minor\n2 3 Key G major\n",
        encoding="utf-8",
    )
    annotation = ReferenceAnnotation(
        annotation_id="timed-key",
        kind=AnnotationKind.KEY,
        path="annotations/key.lab",
        sha256=_sha(key_path),
        source="fixture",
        version="1.0.0",
    )

    rows = _parse_annotation(workspace, annotation)

    assert [row.label for row in rows] == ["Silence", "D:minor", "G major"]


@pytest.mark.parametrize(
    ("offset", "evidence", "match"),
    [
        (0.5, None, "requires independent"),
        (0.5, "Prediction score selected this offset.", "must not justify"),
    ],
)
def test_offset_requires_independent_evidence(
    offset: float,
    evidence: str | None,
    match: str,
) -> None:
    with pytest.raises(ValueError, match=match):
        ReferenceAnnotation(
            annotation_id="offset-reference",
            kind=AnnotationKind.CHORD,
            path="annotations/reference.lab",
            sha256="a" * 64,
            source="fixture",
            version="1.0.0",
            offset_seconds=offset,
            alignment_evidence=evidence,
        )


@pytest.mark.parametrize(
    ("mutate", "match"),
    [
        (
            lambda payload: payload["tracks"][0]["annotations"].append(
                payload["tracks"][0]["annotations"][0].copy()
            ),
            "annotation_id values must be unique",
        ),
        (
            lambda payload: payload["tracks"][0]["selections"].append(
                payload["tracks"][0]["selections"][0].copy()
            ),
            "selections must be unambiguous",
        ),
        (
            lambda payload: payload["tracks"].append(payload["tracks"][0].copy()),
            "recording_id values must be unique",
        ),
    ],
)
def test_manifest_rejects_ambiguous_ids(
    tmp_path: Path,
    mutate,
    match: str,
) -> None:
    manifest, _, _ = _prepared_manifest(tmp_path)
    payload = manifest.model_dump(mode="json")
    mutate(payload)

    with pytest.raises(ValueError, match=match):
        EvaluationManifest.model_validate(payload)


@pytest.mark.parametrize(
    ("target", "match"),
    [
        ("envelope", "envelope is invalid"),
        ("artifact", "selected artifact is missing"),
        ("reference", "annotation is missing"),
        ("original", "original is missing"),
    ],
)
def test_missing_manifest_selected_input_is_rejected(
    tmp_path: Path,
    target: str,
    match: str,
) -> None:
    manifest, workspace, artifact_path = _prepared_manifest(tmp_path)
    if target == "envelope":
        next((workspace / "runs").rglob("results/*.json")).unlink()
    elif target == "artifact":
        artifact_path.unlink()
    elif target == "reference":
        (workspace / manifest.tracks[0].annotations[0].path).unlink()
    else:
        (tmp_path / "external-original.mp3").unlink()

    with pytest.raises(EvaluationSelectionError, match=match):
        resolve_manifest_artifacts(manifest, workspace)


@pytest.mark.parametrize("target", ["original", "annotation", "overlay"])
def test_tampered_hash_bound_input_is_rejected(tmp_path: Path, target: str) -> None:
    manifest, workspace, _ = _prepared_manifest(tmp_path)
    if target == "original":
        (tmp_path / "external-original.mp3").write_bytes(b"tampered")
    elif target == "annotation":
        (workspace / manifest.tracks[0].annotations[0].path).write_text(
            "0 2 D\n", encoding="utf-8"
        )
    else:
        overlay_path = workspace / "annotations" / "overlay.yaml"
        overlay_path.write_text(
            "schema_version: '1.0.0'\nkind: chord\nreplacements:\n"
            "  - start_seconds: 0\n    end_seconds: 1\n    label: C\n",
            encoding="utf-8",
        )
        payload = manifest.model_dump(mode="json")
        payload["tracks"][0]["annotations"][0]["overlays"] = [
            AnnotationOverlay(
                overlay_id="one-overlay",
                version="1.0.0",
                reason="fixture",
                path="annotations/overlay.yaml",
                sha256=_sha(overlay_path),
            ).model_dump(mode="json")
        ]
        manifest = EvaluationManifest.model_validate(payload)
        overlay_path.write_text("tampered", encoding="utf-8")

    with pytest.raises(EvaluationSelectionError, match="hash differs"):
        resolve_manifest_artifacts(manifest, workspace)


def test_unrelated_run_does_not_change_manifest_selection(tmp_path: Path) -> None:
    manifest, workspace, _ = _prepared_manifest(tmp_path)
    baseline = resolve_manifest_artifacts(manifest, workspace)
    unrelated = workspace / "runs" / "unrelated" / "stages" / "key.hpcp" / "results"
    unrelated.mkdir(parents=True)
    (unrelated / ("a" * 64 + ".json")).write_text("{}", encoding="utf-8")

    assert resolve_manifest_artifacts(manifest, workspace) == baseline


def test_duplicate_recording_hash_is_rejected_even_with_a_distinct_id(
    tmp_path: Path,
) -> None:
    manifest, _, _ = _prepared_manifest(tmp_path)
    payload = manifest.model_dump(mode="json")
    duplicate = payload["tracks"][0].copy()
    duplicate["recording_id"] = "different-recording"
    payload["tracks"].append(duplicate)

    with pytest.raises(ValueError, match="original recording hash"):
        EvaluationManifest.model_validate(payload)


def test_selection_requires_its_own_artifact_cache_directory(tmp_path: Path) -> None:
    manifest, _, _ = _prepared_manifest(tmp_path)
    payload = manifest.model_dump(mode="json")
    payload["tracks"][0]["selections"][0]["artifact_path"] = (
        "runs/other/stages/chord.chordmini_btc/artifacts/" + "a" * 64 + "/result.json"
    )

    with pytest.raises(ValueError, match="direct file"):
        EvaluationManifest.model_validate(payload)


@pytest.mark.parametrize(
    ("change", "match"),
    [
        ("schema", "artifact schema differs"),
        ("revision", "artifact revision differs"),
    ],
)
def test_selected_typed_artifact_provenance_must_match_envelope(
    tmp_path: Path,
    change: str,
    match: str,
) -> None:
    manifest, workspace, artifact_path = _prepared_manifest(tmp_path)
    payload = manifest.model_dump(mode="json")
    if change == "schema":
        payload["tracks"][0]["selections"][0]["artifact_schema_version"] = "9.9.9"
        manifest = EvaluationManifest.model_validate(payload)
    else:
        artifact = json.loads(artifact_path.read_text(encoding="utf-8"))
        artifact["provenance"]["code_revision"] = "other"
        artifact_path.write_text(json.dumps(artifact), encoding="utf-8")
        digest = _sha(artifact_path)
        size = artifact_path.stat().st_size
        envelope_path = next((workspace / "runs").rglob("results/*.json"))
        envelope = json.loads(envelope_path.read_text(encoding="utf-8"))
        envelope["artifacts"][0]["sha256"] = digest
        envelope["artifacts"][0]["size_bytes"] = size
        envelope_path.write_text(json.dumps(envelope), encoding="utf-8")
        selection = payload["tracks"][0]["selections"][0]
        selection["artifact_sha256"] = digest
        selection["artifact_size_bytes"] = size
        manifest = EvaluationManifest.model_validate(payload)

    with pytest.raises(EvaluationSelectionError, match=match):
        resolve_manifest_artifacts(manifest, workspace)


def test_selected_typed_artifact_schema_must_match_envelope(tmp_path: Path) -> None:
    manifest, workspace, _ = _prepared_manifest(tmp_path)
    payload = manifest.model_dump(mode="json")
    selection = payload["tracks"][0]["selections"][0]
    selection["identity"]["output_schema_version"] = "2.0.0"
    identity = StageIdentity.model_validate(selection["identity"])
    old_cache_key = selection["cache_key"]
    new_cache_key = stage_cache_key(identity)
    stage_root = workspace / "runs" / "one-run" / "stages" / identity.stage_kind
    (stage_root / "artifacts" / old_cache_key).rename(
        stage_root / "artifacts" / new_cache_key
    )
    old_envelope_path = stage_root / "results" / f"{old_cache_key}.json"
    envelope_path = stage_root / "results" / f"{new_cache_key}.json"
    old_envelope_path.rename(envelope_path)
    selection["cache_key"] = new_cache_key
    selection["envelope_path"] = selection["envelope_path"].replace(
        old_cache_key, new_cache_key
    )
    selection["artifact_path"] = selection["artifact_path"].replace(
        old_cache_key, new_cache_key
    )
    envelope = json.loads(envelope_path.read_text(encoding="utf-8"))
    envelope["identity"]["output_schema_version"] = "2.0.0"
    envelope["cache_key"] = new_cache_key
    envelope["artifacts"][0]["path"] = envelope["artifacts"][0]["path"].replace(
        old_cache_key, new_cache_key
    )
    envelope_path.write_text(json.dumps(envelope), encoding="utf-8")
    manifest = EvaluationManifest.model_validate(payload)

    with pytest.raises(EvaluationSelectionError, match="schema differs from envelope"):
        resolve_manifest_artifacts(manifest, workspace)
