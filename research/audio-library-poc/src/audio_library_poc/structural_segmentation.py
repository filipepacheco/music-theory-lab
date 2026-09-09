"""Pure rules for deterministic beat-synchronous structural segmentation."""

from __future__ import annotations

import hashlib
import json
from collections.abc import Iterable
from dataclasses import asdict, dataclass
from enum import StrEnum
from math import ceil, isfinite, log2
from statistics import median

import numpy as np
from pydantic import ConfigDict, Field, StrictBool, field_validator, model_validator

from audio_library_poc.models import (
    CodeRevision,
    ContractModel,
    Identifier,
    Sha256,
    VersionString,
)


class FrozenStructuralModel(ContractModel):
    model_config = ConfigDict(frozen=True, revalidate_instances="always")


@dataclass(frozen=True)
class CandidateLevel:
    """One hierarchy level after chronological short-run consolidation."""

    m: int
    labels: tuple[int, ...]
    boundaries_seconds: tuple[float, ...]
    section_count: int
    mean_run_duration_seconds: float
    label_entropy: float
    eligible: bool


@dataclass(frozen=True)
class PreparedHierarchy:
    """Seed-independent spectral embedding shared by four K-means runs."""

    eigenvectors: np.ndarray
    combined_features: np.ndarray
    interval_count: int


@dataclass(frozen=True)
class SectionStabilityThresholds:
    """Versioned product gate pinned to the held-out v1 calibration."""

    gate_version: str
    calibration_id: str | None
    minimum_count_agreement: float = 0.75
    minimum_median_stability_f1: float = 0.75
    minimum_boundary_support: float = 0.67
    minimum_eligible_levels: int = 2

    def __post_init__(self) -> None:
        baseline = (0.75, 0.75, 0.67, 2)
        configured = (
            self.minimum_count_agreement,
            self.minimum_median_stability_f1,
            self.minimum_boundary_support,
            self.minimum_eligible_levels,
        )
        major_text = self.gate_version.split(".", maxsplit=1)[0]
        major = int(major_text) if major_text.isdigit() else 0
        if configured != baseline and major <= 1:
            raise ValueError("threshold changes require a new major gate version")

    @classmethod
    def provisional_v1(cls) -> SectionStabilityThresholds:
        return cls(
            gate_version="1.0.0-provisional",
            calibration_id=None,
        )

    @classmethod
    def production_v1(cls, calibration_id: str) -> SectionStabilityThresholds:
        return cls(gate_version="1.0.0", calibration_id=calibration_id)

    def sha256(self) -> str:
        payload = json.dumps(
            asdict(self), sort_keys=True, separators=(",", ":")
        ).encode()
        return hashlib.sha256(payload).hexdigest()


class SectionFallbackReason(StrEnum):
    UNCALIBRATED = "section.gate_uncalibrated"
    NO_ELIGIBLE_LEVEL = "section.no_eligible_level"
    COUNT_UNSTABLE = "section.count_unstable"
    BOUNDARIES_UNSTABLE = "section.boundaries_unstable"
    BOUNDARY_UNSUPPORTED = "section.boundary_unsupported"
    INSUFFICIENT_ELIGIBLE_LEVELS = "section.insufficient_eligible_levels"


class SectionDecision(StrEnum):
    ACCEPTED = "accepted"
    FALLBACK = "fallback"


class PerturbationConfiguration(FrozenStructuralModel):
    neighbor_offset: int = Field(ge=-1, le=1)
    smoothing_beats: int = Field(ge=1)
    kmeans_seed: int = Field(ge=0)


class StructuralCandidateLevel(FrozenStructuralModel):
    m: int = Field(ge=2, le=10)
    labels: tuple[int, ...]
    boundaries_seconds: tuple[float, ...] = Field(min_length=2)
    section_count: int = Field(ge=1)
    mean_run_duration_seconds: float = Field(ge=0)
    label_entropy: float = Field(ge=0)
    eligible: StrictBool

    @model_validator(mode="after")
    def validate_candidate(self) -> StructuralCandidateLevel:
        if self.section_count != contiguous_run_count(self.labels):
            raise ValueError("section_count must count contiguous label runs")
        if len(self.boundaries_seconds) != self.section_count + 1:
            raise ValueError("candidate boundaries must delimit every run")
        if any(
            right <= left
            for left, right in zip(
                self.boundaries_seconds,
                self.boundaries_seconds[1:],
                strict=False,
            )
        ):
            raise ValueError("candidate boundaries must be strictly ordered")
        return self


class StructuralPerturbationResult(FrozenStructuralModel):
    configuration: PerturbationConfiguration
    candidate_levels: tuple[StructuralCandidateLevel, ...]
    selected_m: int | None = Field(default=None, ge=2, le=10)
    selected_boundaries_seconds: tuple[float, ...]
    selected_section_count: int = Field(ge=0)


class StructuralSegmentationPolicy(FrozenStructuralModel):
    gate_version: VersionString
    calibration_id: Identifier | None
    config_sha256: Sha256


class LibraryVersion(FrozenStructuralModel):
    name: Identifier
    version: str = Field(min_length=1)


class ResolvedStructuralParameters(FrozenStructuralModel):
    sample_rate: int = Field(gt=0)
    fft_window: int = Field(gt=0)
    hop_length: int = Field(gt=0)
    cqt_bins: int = Field(default=72, ge=1)
    cqt_bins_per_octave: int = Field(default=12, ge=1)
    mfcc_count: int = Field(default=13, ge=1)
    recurrence_exclusion_beats: int = Field(default=3, ge=0)
    minimum_run_beats: int = Field(default=4, ge=1)
    minimum_mean_run_seconds: float = Field(default=10.0, ge=0)
    candidate_m_min: int = Field(default=2, ge=2)
    candidate_m_max: int = Field(default=10, le=10)
    kmeans_n_init: int = Field(default=20, ge=1)
    kmeans_max_iter: int = Field(default=300, ge=1)
    kmeans_tolerance: float = Field(default=1e-4, gt=0)
    kmeans_algorithm: str = Field(default="lloyd", pattern="^lloyd$")
    boundary_tolerance_seconds: float = Field(default=3.0, gt=0)


class StructuralSegmentationMeasurements(FrozenStructuralModel):
    count_agreement: float = Field(ge=0, le=1)
    median_boundary_stability_f1: float = Field(ge=0, le=1)
    boundary_support: tuple[float, ...]
    eligible_level_count: int = Field(ge=0)
    selection_margin: float = Field(ge=0)
    perturbation_run_count: int = Field(ge=0)
    zero_variance_harmonic_dimensions: tuple[int, ...] = ()
    zero_variance_timbre_dimensions: tuple[int, ...] = ()

    @field_validator("boundary_support")
    @classmethod
    def validate_support(cls, value: tuple[float, ...]) -> tuple[float, ...]:
        if any(support < 0 or support > 1 for support in value):
            raise ValueError("boundary support values must be between 0 and 1")
        return value


class StructuralSection(FrozenStructuralModel):
    label: str = Field(pattern=r"^Parte [1-9][0-9]*$")
    start_seconds: float = Field(ge=0)
    end_seconds: float = Field(gt=0)
    cluster_id: int | None = Field(default=None, ge=0)
    origin: str = Field(pattern=r"^(automatic|fallback)$")
    review_required: StrictBool

    @model_validator(mode="after")
    def validate_interval(self) -> StructuralSection:
        if self.end_seconds <= self.start_seconds:
            raise ValueError("section end must be after its start")
        return self


class StructuralSegmentationResult(FrozenStructuralModel):
    """Immutable evidence plus the accepted or abstaining partition."""

    schema_version: str = Field(default="1.0.0", pattern=r"^1\.0\.0$")
    source_sha256: Sha256
    beat_result_sha256: Sha256
    beat_quality_decision_sha256: Sha256
    stage_kind: str = Field(pattern=r"^section\.mcfee_ellis_laplacian$")
    implementation_version: VersionString
    code_revision: CodeRevision
    config_sha256: Sha256
    library_versions: tuple[LibraryVersion, ...]
    runtime_platform: str = Field(min_length=1)
    resolved_parameters: ResolvedStructuralParameters
    policy: StructuralSegmentationPolicy
    baseline_candidate_levels: tuple[StructuralCandidateLevel, ...]
    baseline_selected_m: int | None = Field(default=None, ge=2, le=10)
    measurements: StructuralSegmentationMeasurements
    perturbations: tuple[StructuralPerturbationResult, ...]
    decision: SectionDecision
    reason_codes: tuple[SectionFallbackReason, ...]
    sections: tuple[StructuralSection, ...] = Field(min_length=1)
    duration_seconds: float = Field(gt=0)
    beat_times_seconds: tuple[float, ...]
    warnings: tuple[str, ...] = ()

    @model_validator(mode="after")
    def validate_result(self) -> StructuralSegmentationResult:
        expected_configurations = tuple(
            (offset, window, seed)
            for offset in (-1, 0, 1)
            for window in (13, 17, 21)
            for seed in (0, 1, 2, 3)
        )
        actual_configurations = tuple(
            (
                run.configuration.neighbor_offset,
                run.configuration.smoothing_beats,
                run.configuration.kmeans_seed,
            )
            for run in self.perturbations
        )
        if actual_configurations != expected_configurations:
            raise ValueError("perturbations must be the ordered 36-run suite")
        if self.measurements.perturbation_run_count != 36:
            raise ValueError("perturbation_run_count must be 36")
        if tuple(level.m for level in self.baseline_candidate_levels) != tuple(
            range(2, 11)
        ):
            raise ValueError("baseline candidate levels must cover m=2 through m=10")
        selected = next(
            (
                level
                for level in self.baseline_candidate_levels
                if level.m == self.baseline_selected_m
            ),
            None,
        )
        expected_support_count = (
            max(0, len(selected.boundaries_seconds) - 2) if selected else 0
        )
        if len(self.measurements.boundary_support) != expected_support_count:
            raise ValueError("boundary support must cover every internal boundary")
        tolerance = 1e-3
        expected_start = 0.0
        for index, section in enumerate(self.sections):
            if abs(section.start_seconds - expected_start) > tolerance:
                raise ValueError(f"sections[{index}] leaves a gap or overlap")
            expected_start = section.end_seconds
        if abs(expected_start - self.duration_seconds) > tolerance:
            raise ValueError("sections must cover the source duration")
        detected_beats = set(self.beat_times_seconds)
        if any(
            section.start_seconds not in detected_beats for section in self.sections[1:]
        ):
            raise ValueError("every internal section boundary must snap to a beat")
        if self.decision is SectionDecision.ACCEPTED:
            if self.reason_codes or any(
                section.origin != "automatic" or section.review_required
                for section in self.sections
            ):
                raise ValueError("accepted results require automatic sections")
        elif (
            len(self.sections) != 1
            or self.sections[0].origin != "fallback"
            or not self.sections[0].review_required
            or not self.reason_codes
        ):
            raise ValueError("fallback results require one reviewable section")
        return self


@dataclass(frozen=True)
class StabilityGateDecision:
    accepted: bool
    reason_codes: tuple[SectionFallbackReason, ...]


def contiguous_run_count(labels: Iterable[int]) -> int:
    """Count chronological runs, not the number of distinct cluster ids."""

    iterator = iter(labels)
    try:
        previous = next(iterator)
    except StopIteration:
        return 0
    count = 1
    for label in iterator:
        if label != previous:
            count += 1
            previous = label
    return count


def perturbation_configurations() -> tuple[PerturbationConfiguration, ...]:
    return tuple(
        PerturbationConfiguration(
            neighbor_offset=offset,
            smoothing_beats=window,
            kmeans_seed=seed,
        )
        for offset in (-1, 0, 1)
        for window in (13, 17, 21)
        for seed in (0, 1, 2, 3)
    )


def standardize_features(
    features: np.ndarray,
) -> tuple[np.ndarray, tuple[int, ...]]:
    """Standardize dimensions per track without dividing by zero."""

    values = np.asarray(features, dtype=np.float64)
    if values.ndim != 2 or not np.all(np.isfinite(values)):
        raise ValueError("features must be a finite dimensions-by-beats matrix")
    means = values.mean(axis=1, keepdims=True)
    deviations = values.std(axis=1, keepdims=True)
    zero_variance = tuple(int(index) for index in np.flatnonzero(deviations[:, 0] == 0))
    safe = deviations.copy()
    safe[safe == 0] = 1.0
    return (values - means) / safe, zero_variance


def analyze_candidate_levels(
    *,
    harmonic_features: np.ndarray,
    timbre_features: np.ndarray,
    beat_boundaries: tuple[float, ...],
    neighbor_offset: int,
    smoothing_beats: int,
    kmeans_seed: int,
    minimum_run_beats: int = 4,
    minimum_mean_run_seconds: float = 10.0,
) -> tuple[CandidateLevel, ...]:
    """Compute candidate levels for one deterministic perturbation run."""

    prepared = prepare_candidate_hierarchy(
        harmonic_features=harmonic_features,
        timbre_features=timbre_features,
        neighbor_offset=neighbor_offset,
        smoothing_beats=smoothing_beats,
    )
    return cluster_candidate_levels(
        prepared=prepared,
        beat_boundaries=beat_boundaries,
        kmeans_seed=kmeans_seed,
        minimum_run_beats=minimum_run_beats,
        minimum_mean_run_seconds=minimum_mean_run_seconds,
    )


def prepare_candidate_hierarchy(
    *,
    harmonic_features: np.ndarray,
    timbre_features: np.ndarray,
    neighbor_offset: int,
    smoothing_beats: int,
) -> PreparedHierarchy:
    """Build the graph and eigenvectors shared by all seed perturbations."""

    from scipy.linalg import eigh
    from scipy.sparse.csgraph import laplacian

    harmonic, _ = standardize_features(harmonic_features)
    timbre, _ = standardize_features(timbre_features)
    if harmonic.shape[1] != timbre.shape[1]:
        raise ValueError("harmonic and timbre features must share beat intervals")
    n_intervals = harmonic.shape[1]
    if n_intervals < 2:
        return PreparedHierarchy(
            eigenvectors=np.empty((n_intervals, 0)),
            combined_features=np.vstack((harmonic, timbre)),
            interval_count=n_intervals,
        )

    base_neighbors = 1 + ceil(2 * log2(n_intervals))
    neighbor_count = max(1, min(n_intervals - 1, base_neighbors + neighbor_offset))
    recurrence = _recurrence_affinity(
        harmonic,
        neighbor_count=neighbor_count,
        exclusion_beats=3,
        smoothing_beats=smoothing_beats,
    )
    sequence = _sequence_affinity(timbre)
    recurrence_degree = recurrence.sum(axis=1)
    sequence_degree = sequence.sum(axis=1)
    total_degree = recurrence_degree + sequence_degree
    denominator = float(np.dot(total_degree, total_degree))
    mu = (
        float(np.dot(sequence_degree, total_degree)) / denominator
        if denominator
        else 0.5
    )
    adjacency = mu * recurrence + (1.0 - mu) * sequence
    graph_laplacian = laplacian(adjacency, normed=True)
    maximum_m = min(10, n_intervals)
    _, eigenvectors = eigh(
        graph_laplacian,
        subset_by_index=(0, maximum_m - 1),
        driver="evr",
    )
    return PreparedHierarchy(
        eigenvectors=eigenvectors,
        combined_features=np.vstack((harmonic, timbre)),
        interval_count=n_intervals,
    )


def cluster_candidate_levels(
    *,
    prepared: PreparedHierarchy,
    beat_boundaries: tuple[float, ...],
    kmeans_seed: int,
    minimum_run_beats: int = 4,
    minimum_mean_run_seconds: float = 10.0,
) -> tuple[CandidateLevel, ...]:
    """Cluster every m for one seed using a prepared spectral hierarchy."""

    from sklearn.cluster import KMeans

    n_intervals = prepared.interval_count
    if len(beat_boundaries) != n_intervals + 1:
        raise ValueError("beat_boundaries must delimit every feature interval")
    if n_intervals < 2:
        return ()
    maximum_m = min(10, n_intervals)
    candidates: list[CandidateLevel] = []
    for m in range(2, maximum_m + 1):
        embedding = prepared.eigenvectors[:, :m]
        norms = np.linalg.norm(embedding, axis=1, keepdims=True)
        norms[norms == 0] = 1.0
        embedding = embedding / norms
        labels = KMeans(
            n_clusters=m,
            init="k-means++",
            n_init=20,
            max_iter=300,
            tol=1e-4,
            algorithm="lloyd",
            random_state=kmeans_seed,
        ).fit_predict(embedding)
        merged = _merge_short_runs(
            tuple(int(label) for label in labels),
            prepared.combined_features,
            minimum_run_beats=minimum_run_beats,
        )
        boundaries = _boundaries_from_labels(merged, beat_boundaries)
        section_count = contiguous_run_count(merged)
        mean_duration = (
            (beat_boundaries[-1] - beat_boundaries[0]) / section_count
            if section_count
            else 0.0
        )
        candidates.append(
            CandidateLevel(
                m=m,
                labels=merged,
                boundaries_seconds=boundaries,
                section_count=section_count,
                mean_run_duration_seconds=mean_duration,
                label_entropy=_label_entropy(merged),
                eligible=mean_duration >= minimum_mean_run_seconds,
            )
        )
    return tuple(candidates)


def _recurrence_affinity(
    features: np.ndarray,
    *,
    neighbor_count: int,
    exclusion_beats: int,
    smoothing_beats: int,
) -> np.ndarray:
    columns = features.T
    distances = np.linalg.norm(columns[:, None, :] - columns[None, :, :], axis=2)
    allowed = np.ones(distances.shape, dtype=bool)
    for index in range(len(columns)):
        lower = max(0, index - exclusion_beats)
        upper = min(len(columns), index + exclusion_beats + 1)
        allowed[index, lower:upper] = False
    masked = np.where(allowed, distances, np.inf)
    neighbors = np.zeros(masked.shape, dtype=bool)
    for index in range(len(columns)):
        finite_count = int(np.isfinite(masked[index]).sum())
        take = min(neighbor_count, finite_count)
        if take:
            selected = np.argpartition(masked[index], take - 1)[:take]
            neighbors[index, selected] = True
    mutual = neighbors & neighbors.T
    positive = distances[mutual & (distances > 0)]
    bandwidth = float(np.median(positive)) if positive.size else 1.0
    affinity = np.zeros(distances.shape, dtype=np.float64)
    affinity[mutual] = np.exp(-distances[mutual] / max(bandwidth, np.finfo(float).eps))
    return _diagonal_median_filter(affinity, smoothing_beats)


def _diagonal_median_filter(matrix: np.ndarray, window: int) -> np.ndarray:
    filtered = np.zeros_like(matrix)
    radius = window // 2
    for offset in range(-(len(matrix) - 1), len(matrix)):
        diagonal = np.diagonal(matrix, offset=offset)
        if diagonal.size == 0:
            continue
        padded = np.pad(diagonal, (radius, radius), mode="edge")
        values = np.array(
            [
                np.median(padded[index : index + window])
                for index in range(len(diagonal))
            ]
        )
        if offset >= 0:
            rows = np.arange(len(diagonal))
            columns = rows + offset
        else:
            columns = np.arange(len(diagonal))
            rows = columns - offset
        filtered[rows, columns] = values
    return np.maximum(filtered, filtered.T)


def _sequence_affinity(features: np.ndarray) -> np.ndarray:
    count = features.shape[1]
    affinity = np.zeros((count, count), dtype=np.float64)
    if count < 2:
        return affinity
    distances = np.linalg.norm(np.diff(features, axis=1), axis=0)
    positive = distances[distances > 0]
    bandwidth = float(np.median(positive)) if positive.size else 1.0
    similarities = np.exp(-distances / max(bandwidth, np.finfo(float).eps))
    indexes = np.arange(count - 1)
    affinity[indexes, indexes + 1] = similarities
    affinity[indexes + 1, indexes] = similarities
    return affinity


def _runs(labels: tuple[int, ...]) -> list[tuple[int, int, int]]:
    if not labels:
        return []
    runs: list[tuple[int, int, int]] = []
    start = 0
    for index in range(1, len(labels) + 1):
        if index == len(labels) or labels[index] != labels[start]:
            runs.append((start, index, labels[start]))
            start = index
    return runs


def _merge_short_runs(
    labels: tuple[int, ...],
    features: np.ndarray,
    *,
    minimum_run_beats: int,
) -> tuple[int, ...]:
    merged = list(labels)
    while True:
        runs = _runs(tuple(merged))
        short_index = next(
            (
                index
                for index, (start, end, _) in enumerate(runs)
                if end - start < minimum_run_beats
            ),
            None,
        )
        if short_index is None or len(runs) == 1:
            return tuple(merged)
        start, end, _ = runs[short_index]
        if short_index == 0:
            replacement = runs[1][2]
        elif short_index == len(runs) - 1:
            replacement = runs[-2][2]
        else:
            left_discontinuity = float(
                np.linalg.norm(features[:, start] - features[:, start - 1])
            )
            right_discontinuity = float(
                np.linalg.norm(features[:, end] - features[:, end - 1])
            )
            replacement = (
                runs[short_index - 1][2]
                if left_discontinuity <= right_discontinuity
                else runs[short_index + 1][2]
            )
        merged[start:end] = [replacement] * (end - start)


def _boundaries_from_labels(
    labels: tuple[int, ...], beat_boundaries: tuple[float, ...]
) -> tuple[float, ...]:
    internal = tuple(
        beat_boundaries[index]
        for index in range(1, len(labels))
        if labels[index] != labels[index - 1]
    )
    return (beat_boundaries[0], *internal, beat_boundaries[-1])


def _label_entropy(labels: tuple[int, ...]) -> float:
    if not labels:
        return 0.0
    _, counts = np.unique(labels, return_counts=True)
    probabilities = counts / len(labels)
    return float(-np.sum(probabilities * np.log(probabilities)))


def select_candidate_level(
    candidates: tuple[CandidateLevel, ...],
) -> CandidateLevel | None:
    """Apply the mean-duration/maximum-entropy published level rule."""

    eligible = [candidate for candidate in candidates if candidate.eligible]
    if not eligible:
        return None
    return min(
        eligible,
        key=lambda candidate: (
            -candidate.label_entropy,
            candidate.m,
            candidate.section_count,
        ),
    )


def snap_boundaries_to_beats(
    boundaries: Iterable[float],
    *,
    beat_times: tuple[float, ...],
    duration_seconds: float,
) -> tuple[float, ...]:
    """Snap internal boundaries to beats, resolving equal ties earlier."""

    valid_beats = tuple(
        beat for beat in beat_times if isfinite(beat) and 0.0 < beat < duration_seconds
    )
    snapped: list[float] = [0.0]
    if valid_beats:
        for boundary in boundaries:
            if not isfinite(boundary) or boundary <= 0 or boundary >= duration_seconds:
                continue
            nearest = min(valid_beats, key=lambda beat: (abs(beat - boundary), beat))
            snapped.append(nearest)
    snapped.append(duration_seconds)
    return tuple(sorted(set(snapped)))


def evaluate_stability_gate(
    *,
    thresholds: SectionStabilityThresholds,
    count_agreement: float,
    median_stability_f1: float,
    boundary_support: tuple[float, ...],
    eligible_level_count: int,
) -> StabilityGateDecision:
    reasons: list[SectionFallbackReason] = []
    if thresholds.calibration_id is None:
        reasons.append(SectionFallbackReason.UNCALIBRATED)
    if eligible_level_count == 0:
        reasons.append(SectionFallbackReason.NO_ELIGIBLE_LEVEL)
    if count_agreement < thresholds.minimum_count_agreement:
        reasons.append(SectionFallbackReason.COUNT_UNSTABLE)
    if median_stability_f1 < thresholds.minimum_median_stability_f1:
        reasons.append(SectionFallbackReason.BOUNDARIES_UNSTABLE)
    if any(
        support < thresholds.minimum_boundary_support for support in boundary_support
    ):
        reasons.append(SectionFallbackReason.BOUNDARY_UNSUPPORTED)
    if eligible_level_count < thresholds.minimum_eligible_levels:
        reasons.append(SectionFallbackReason.INSUFFICIENT_ELIGIBLE_LEVELS)
    return StabilityGateDecision(accepted=not reasons, reason_codes=tuple(reasons))


def build_published_sections(
    *,
    accepted: bool,
    selected: CandidateLevel | None,
    duration_seconds: float,
) -> tuple[StructuralSection, ...]:
    """Build only neutral automatic sections or one reviewable fallback."""

    if not accepted or selected is None:
        return (
            StructuralSection(
                label="Parte 1",
                start_seconds=0.0,
                end_seconds=duration_seconds,
                cluster_id=None,
                origin="fallback",
                review_required=True,
            ),
        )
    runs = _runs(selected.labels)
    return tuple(
        StructuralSection(
            label=f"Parte {index}",
            start_seconds=selected.boundaries_seconds[index - 1],
            end_seconds=selected.boundaries_seconds[index],
            cluster_id=run[2],
            origin="automatic",
            review_required=False,
        )
        for index, run in enumerate(runs, start=1)
    )


def match_boundary_f1(
    reference: tuple[float, ...],
    estimated: tuple[float, ...],
    *,
    tolerance_seconds: float,
) -> tuple[float, tuple[bool, ...]]:
    """Greedy one-to-one matching for ordered internal boundaries."""

    matched_estimates: set[int] = set()
    matched_reference: list[bool] = []
    for boundary in reference:
        choices = [
            (abs(boundary - candidate), index)
            for index, candidate in enumerate(estimated)
            if index not in matched_estimates
            and abs(boundary - candidate) <= tolerance_seconds
        ]
        if not choices:
            matched_reference.append(False)
            continue
        _, match_index = min(choices)
        matched_estimates.add(match_index)
        matched_reference.append(True)
    matches = len(matched_estimates)
    precision = matches / len(estimated) if estimated else float(not reference)
    recall = matches / len(reference) if reference else float(not estimated)
    f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
    return f1, tuple(matched_reference)


def summarize_stability(
    *,
    baseline_boundaries: tuple[float, ...],
    baseline_count: int,
    perturbation_boundaries: tuple[tuple[float, ...], ...],
    perturbation_counts: tuple[int, ...],
    tolerance_seconds: float,
) -> tuple[float, float, tuple[float, ...]]:
    """Return count agreement, median F1, and baseline-boundary support."""

    if not perturbation_boundaries:
        return 0.0, 0.0, tuple(0.0 for _ in baseline_boundaries)
    matches = [0] * len(baseline_boundaries)
    scores: list[float] = []
    for boundaries in perturbation_boundaries:
        score, support = match_boundary_f1(
            baseline_boundaries,
            boundaries,
            tolerance_seconds=tolerance_seconds,
        )
        scores.append(score)
        for index, matched in enumerate(support):
            matches[index] += int(matched)
    run_count = len(perturbation_boundaries)
    return (
        sum(count == baseline_count for count in perturbation_counts) / run_count,
        median(scores),
        tuple(count / run_count for count in matches),
    )
