"""Heavy audio/runtime adapter for stable structural segmentation."""

from __future__ import annotations

import platform
import time
from importlib.metadata import version
from pathlib import Path
from statistics import median

import librosa
import numpy as np
import soundfile as sf

from audio_library_poc.beat_analysis import BeatAnalysisResult
from audio_library_poc.execution import ExpectedStageFailure
from audio_library_poc.models import Metrics, StageIdentity, TypedError
from audio_library_poc.structural_segmentation import (
    CandidateLevel,
    LibraryVersion,
    ResolvedStructuralParameters,
    SectionDecision,
    SectionStabilityThresholds,
    StructuralCandidateLevel,
    StructuralPerturbationResult,
    StructuralSegmentationMeasurements,
    StructuralSegmentationPolicy,
    StructuralSegmentationResult,
    build_published_sections,
    cluster_candidate_levels,
    evaluate_stability_gate,
    perturbation_configurations,
    prepare_candidate_hierarchy,
    select_candidate_level,
    standardize_features,
    summarize_stability,
)
from audio_library_poc.structural_segmentation_stage import (
    STRUCTURAL_SEGMENTATION_STAGE_KIND,
    StructuralSegmentationStageConfig,
)


def run_structural_segmentation(
    *,
    source_path: Path,
    beat_result: BeatAnalysisResult,
    config: StructuralSegmentationStageConfig,
    identity: StageIdentity,
    beat_input_valid: bool,
    upstream_warnings: tuple[str, ...] = (),
) -> tuple[StructuralSegmentationResult, Metrics]:
    actual_versions = _verify_dependency_versions(config)
    audio, native_sample_rate = sf.read(
        str(source_path), dtype="float32", always_2d=True
    )
    duration_seconds = len(audio) / native_sample_rate
    mono = audio.mean(axis=1)
    if native_sample_rate != config.sample_rate:
        mono = librosa.resample(
            mono, orig_sr=native_sample_rate, target_sr=config.sample_rate
        )
    beat_boundaries = _beat_boundaries(beat_result, duration_seconds)

    started = time.monotonic()
    harmonic, timbre = _beat_synchronous_features(
        mono,
        sample_rate=config.sample_rate,
        fft_window=config.fft_window,
        hop_length=config.hop_length,
        beat_boundaries=beat_boundaries,
    )
    _, harmonic_zero = standardize_features(harmonic)
    _, timbre_zero = standardize_features(timbre)
    internal_runs: list[tuple[CandidateLevel, ...]] = []
    perturbations: list[StructuralPerturbationResult] = []
    prepared_hierarchies = {}
    for perturbation in perturbation_configurations():
        graph_key = (
            perturbation.neighbor_offset,
            perturbation.smoothing_beats,
        )
        prepared = prepared_hierarchies.get(graph_key)
        if prepared is None:
            prepared = prepare_candidate_hierarchy(
                harmonic_features=harmonic,
                timbre_features=timbre,
                neighbor_offset=perturbation.neighbor_offset,
                smoothing_beats=perturbation.smoothing_beats,
            )
            prepared_hierarchies[graph_key] = prepared
        candidates = cluster_candidate_levels(
            prepared=prepared,
            beat_boundaries=beat_boundaries,
            kmeans_seed=perturbation.kmeans_seed,
        )
        internal_runs.append(candidates)
        selected = select_candidate_level(candidates)
        perturbations.append(
            StructuralPerturbationResult(
                configuration=perturbation,
                candidate_levels=tuple(
                    _contract_candidate(item) for item in candidates
                ),
                selected_m=selected.m if selected else None,
                selected_boundaries_seconds=(
                    selected.boundaries_seconds if selected else ()
                ),
                selected_section_count=selected.section_count if selected else 0,
            )
        )

    baseline_index = perturbation_configurations().index(
        next(
            item
            for item in perturbation_configurations()
            if (item.neighbor_offset, item.smoothing_beats, item.kmeans_seed)
            == (0, 17, 0)
        )
    )
    baseline_candidates = internal_runs[baseline_index]
    selected = select_candidate_level(baseline_candidates)
    selected_boundaries = selected.boundaries_seconds[1:-1] if selected else ()
    intervals = np.diff(np.asarray(beat_boundaries))
    tolerance = max(3.0, float(median(intervals)) if len(intervals) else 0.0)
    selected_runs = [select_candidate_level(run) for run in internal_runs]
    count_agreement, stability_f1, support = summarize_stability(
        baseline_boundaries=selected_boundaries,
        baseline_count=selected.section_count if selected else 0,
        perturbation_boundaries=tuple(
            item.boundaries_seconds[1:-1] if item else () for item in selected_runs
        ),
        perturbation_counts=tuple(
            item.section_count if item else 0 for item in selected_runs
        ),
        tolerance_seconds=tolerance,
    )
    eligible_count = sum(item.eligible for item in baseline_candidates)
    selection_margin = _selection_margin(baseline_candidates, selected)
    thresholds = SectionStabilityThresholds(
        gate_version=config.section_gate_version,
        calibration_id=(
            config.section_calibration.calibration_id
            if config.section_calibration is not None
            else None
        ),
    )
    gate = evaluate_stability_gate(
        thresholds=thresholds,
        count_agreement=count_agreement,
        median_stability_f1=stability_f1,
        boundary_support=support,
        eligible_level_count=eligible_count,
    )
    decision = (
        SectionDecision.ACCEPTED
        if gate.accepted and selected
        else SectionDecision.FALLBACK
    )
    sections = build_published_sections(
        accepted=decision is SectionDecision.ACCEPTED,
        selected=selected,
        duration_seconds=duration_seconds,
    )
    parameters = ResolvedStructuralParameters(
        sample_rate=config.sample_rate,
        fft_window=config.fft_window,
        hop_length=config.hop_length,
        boundary_tolerance_seconds=tolerance,
    )
    result = StructuralSegmentationResult(
        source_sha256=identity.input_sha256,
        beat_result_sha256=config.beat_result_sha256,
        beat_quality_decision_sha256=config.beat_quality_decision_sha256,
        stage_kind=STRUCTURAL_SEGMENTATION_STAGE_KIND,
        implementation_version=identity.implementation_version,
        code_revision=identity.code_revision,
        config_sha256=identity.config_sha256,
        library_versions=actual_versions,
        runtime_platform=platform.platform(),
        resolved_parameters=parameters,
        policy=StructuralSegmentationPolicy(
            gate_version=thresholds.gate_version,
            calibration_id=thresholds.calibration_id,
            config_sha256=thresholds.sha256(),
        ),
        baseline_candidate_levels=tuple(
            _contract_candidate(item) for item in baseline_candidates
        ),
        baseline_selected_m=selected.m if selected else None,
        measurements=StructuralSegmentationMeasurements(
            beat_input_valid=beat_input_valid,
            count_agreement=count_agreement,
            median_boundary_stability_f1=stability_f1,
            boundary_support=support,
            eligible_level_count=eligible_count,
            selection_margin=selection_margin,
            perturbation_run_count=36,
            zero_variance_harmonic_dimensions=harmonic_zero,
            zero_variance_timbre_dimensions=timbre_zero,
        ),
        perturbations=tuple(perturbations),
        decision=decision,
        reason_codes=gate.reason_codes,
        sections=sections,
        duration_seconds=duration_seconds,
        beat_times_seconds=tuple(
            float(beat.time_seconds) for beat in beat_result.beats
        ),
        warnings=tuple(dict.fromkeys(upstream_warnings)),
    )
    elapsed = time.monotonic() - started
    return result, Metrics(
        duration_seconds=elapsed,
        counters={"sections_emitted": len(sections), "perturbation_runs": 36},
        measurements={
            "count_agreement": count_agreement,
            "median_boundary_stability_f1": stability_f1,
        },
    )


def _verify_dependency_versions(
    config: StructuralSegmentationStageConfig,
) -> tuple[LibraryVersion, ...]:
    expected = (
        ("librosa", "librosa", config.librosa_version),
        ("numpy", "numpy", config.numpy_version),
        ("scipy", "scipy", config.scipy_version),
        ("scikit-learn", "scikit-learn", config.scikit_learn_version),
    )
    actual = tuple(
        LibraryVersion(name=name, version=version(package))
        for name, package, _ in expected
    )
    mismatches = {
        name: {"expected": pinned, "actual": installed.version}
        for (name, _, pinned), installed in zip(expected, actual, strict=True)
        if installed.version != pinned
    }
    if mismatches:
        raise ExpectedStageFailure(
            TypedError(
                code="section.dependency_version_mismatch",
                message=(
                    "structural segmentation dependencies must match the pinned runtime"
                ),
                retryable=False,
                details={"mismatches": mismatches},
            )
        )
    return actual


def _beat_boundaries(
    beat_result: BeatAnalysisResult, duration_seconds: float
) -> tuple[float, ...]:
    internal = sorted(
        {
            float(beat.time_seconds)
            for beat in beat_result.beats
            if 0 < beat.time_seconds < duration_seconds
        }
    )
    return (0.0, *internal, duration_seconds)


def _beat_synchronous_features(
    audio: np.ndarray,
    *,
    sample_rate: int,
    fft_window: int,
    hop_length: int,
    beat_boundaries: tuple[float, ...],
) -> tuple[np.ndarray, np.ndarray]:
    constant_q = librosa.cqt(
        y=audio,
        sr=sample_rate,
        hop_length=hop_length,
        fmin=librosa.note_to_hz("C2"),
        n_bins=72,
        bins_per_octave=12,
    )
    harmonic = np.log1p(np.abs(constant_q) ** 2)
    timbre = librosa.feature.mfcc(
        y=audio,
        sr=sample_rate,
        n_mfcc=13,
        n_fft=fft_window,
        hop_length=hop_length,
    )
    harmonic_sync = _aggregate_intervals(
        harmonic, sample_rate, hop_length, beat_boundaries
    )
    previous = np.concatenate((harmonic_sync[:, :1], harmonic_sync[:, :-1]), axis=1)
    return np.vstack((harmonic_sync, previous)), _aggregate_intervals(
        timbre, sample_rate, hop_length, beat_boundaries
    )


def _aggregate_intervals(
    features: np.ndarray,
    sample_rate: int,
    hop_length: int,
    boundaries: tuple[float, ...],
) -> np.ndarray:
    frame_times = librosa.frames_to_time(
        np.arange(features.shape[1]), sr=sample_rate, hop_length=hop_length
    )
    columns: list[np.ndarray] = []
    for start, end in zip(boundaries, boundaries[1:], strict=False):
        mask = (frame_times >= start) & (frame_times < end)
        if np.any(mask):
            columns.append(features[:, mask].mean(axis=1))
        else:
            nearest = min(
                range(features.shape[1]),
                key=lambda index: abs(frame_times[index] - start),
            )
            columns.append(features[:, nearest])
    return np.stack(columns, axis=1)


def _contract_candidate(candidate: CandidateLevel) -> StructuralCandidateLevel:
    return StructuralCandidateLevel(
        m=candidate.m,
        labels=candidate.labels,
        boundaries_seconds=candidate.boundaries_seconds,
        section_count=candidate.section_count,
        mean_run_duration_seconds=candidate.mean_run_duration_seconds,
        label_entropy=candidate.label_entropy,
        eligible=candidate.eligible,
    )


def _selection_margin(
    candidates: tuple[CandidateLevel, ...], selected: CandidateLevel | None
) -> float:
    if selected is None:
        return 0.0
    runner_up = sorted(
        (item.label_entropy for item in candidates if item.eligible), reverse=True
    )
    if len(runner_up) < 2 or selected.label_entropy == 0:
        return 0.0
    return max(0.0, (runner_up[0] - runner_up[1]) / selected.label_entropy)
