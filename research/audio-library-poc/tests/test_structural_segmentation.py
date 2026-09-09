"""Behaviour tests for stable beat-synchronous structural segmentation."""

from __future__ import annotations

import numpy as np
import pytest
from pydantic import ValidationError

from audio_library_poc.structural_segmentation import (
    CandidateLevel,
    LibraryVersion,
    PerturbationConfiguration,
    ResolvedStructuralParameters,
    SectionDecision,
    SectionFallbackReason,
    SectionStabilityThresholds,
    StructuralCandidateLevel,
    StructuralPerturbationResult,
    StructuralSection,
    StructuralSegmentationMeasurements,
    StructuralSegmentationPolicy,
    StructuralSegmentationResult,
    analyze_candidate_levels,
    build_published_sections,
    contiguous_run_count,
    evaluate_stability_gate,
    match_boundary_f1,
    perturbation_configurations,
    select_candidate_level,
    snap_boundaries_to_beats,
)


def candidate(
    m: int,
    labels: tuple[int, ...],
    *,
    entropy: float,
    mean_duration: float = 12.0,
) -> CandidateLevel:
    run_count = contiguous_run_count(labels)
    return CandidateLevel(
        m=m,
        labels=labels,
        boundaries_seconds=tuple(float(index * 12) for index in range(run_count + 1)),
        section_count=run_count,
        mean_run_duration_seconds=mean_duration,
        label_entropy=entropy,
        eligible=mean_duration >= 10.0,
    )


def test_level_selection_uses_entropy_and_counts_contiguous_runs() -> None:
    repeated_label = candidate(2, (0, 0, 1, 1, 0, 0), entropy=0.63)
    higher_entropy = candidate(3, (0, 1, 2, 2, 1, 0), entropy=1.01)

    selected = select_candidate_level((repeated_label, higher_entropy))

    assert repeated_label.section_count == 3
    assert selected is higher_entropy


def test_level_selection_excludes_short_mean_duration_and_breaks_ties() -> None:
    too_short = candidate(2, (0, 1), entropy=2.0, mean_duration=9.99)
    smaller_m = candidate(3, (0, 1, 2), entropy=1.0)
    larger_m = candidate(4, (0, 1, 2, 3), entropy=1.0)

    assert select_candidate_level((too_short, larger_m, smaller_m)) is smaller_m


def test_boundary_snapping_uses_detected_beats_and_earlier_tie() -> None:
    snapped = snap_boundaries_to_beats(
        (0.0, 2.0, 4.0, 8.0),
        beat_times=(1.0, 3.0, 5.0, 7.0),
        duration_seconds=8.0,
    )

    assert snapped == (0.0, 1.0, 3.0, 8.0)


def test_boundary_matching_maximizes_one_to_one_matches() -> None:
    score, support = match_boundary_f1(
        (1.0, 2.0),
        (0.0, 1.5),
        tolerance_seconds=1.0,
    )

    assert score == 1.0
    assert support == (True, True)


@pytest.mark.parametrize(
    ("overrides", "accepted"),
    [
        ({}, True),
        ({"count_agreement": np.nextafter(0.75, 0.0)}, False),
        ({"median_stability_f1": np.nextafter(0.75, 0.0)}, False),
        ({"boundary_support": (0.67, np.nextafter(0.67, 0.0))}, False),
        ({"eligible_level_count": 1}, False),
    ],
)
def test_stability_gate_covers_every_threshold(
    overrides: dict[str, object], accepted: bool
) -> None:
    measurements: dict[str, object] = {
        "count_agreement": 0.75,
        "median_stability_f1": 0.75,
        "boundary_support": (0.67, 1.0),
        "eligible_level_count": 2,
    }
    measurements.update(overrides)

    decision = evaluate_stability_gate(
        thresholds=SectionStabilityThresholds.production_v1("held-out-test"),
        **measurements,
    )

    assert decision.accepted is accepted
    if accepted:
        assert decision.reason_codes == ()
    else:
        assert decision.reason_codes


def test_result_keeps_all_36_candidates_as_immutable_provenance() -> None:
    level = StructuralCandidateLevel(
        m=2,
        labels=(0, 0, 1, 1),
        boundaries_seconds=(0.0, 2.0, 4.0),
        section_count=2,
        mean_run_duration_seconds=2.0,
        label_entropy=0.69,
        eligible=False,
    )
    levels = tuple(level.model_copy(update={"m": m}) for m in range(2, 11))
    runs = tuple(
        StructuralPerturbationResult(
            configuration=PerturbationConfiguration(
                neighbor_offset=offset,
                smoothing_beats=window,
                kmeans_seed=seed,
            ),
            candidate_levels=levels,
            selected_m=None,
            selected_boundaries_seconds=(),
            selected_section_count=0,
        )
        for offset in (-1, 0, 1)
        for window in (13, 17, 21)
        for seed in (0, 1, 2, 3)
    )
    thresholds = SectionStabilityThresholds.production_v1("held-out-test")
    result = StructuralSegmentationResult(
        source_sha256="a" * 64,
        beat_result_sha256="b" * 64,
        beat_quality_decision_sha256="c" * 64,
        stage_kind="section.mcfee_ellis_laplacian",
        implementation_version="1.0.0",
        code_revision="test",
        config_sha256="d" * 64,
        library_versions=(LibraryVersion(name="numpy", version="2.0.0"),),
        runtime_platform="test-platform",
        resolved_parameters=ResolvedStructuralParameters(
            sample_rate=22050,
            fft_window=2048,
            hop_length=512,
        ),
        policy=StructuralSegmentationPolicy(
            gate_version=thresholds.gate_version,
            calibration_id=thresholds.calibration_id,
            config_sha256=thresholds.sha256(),
        ),
        baseline_candidate_levels=levels,
        baseline_selected_m=None,
        measurements=StructuralSegmentationMeasurements(
            beat_input_valid=True,
            count_agreement=0.0,
            median_boundary_stability_f1=0.0,
            boundary_support=(),
            eligible_level_count=0,
            selection_margin=0.0,
            perturbation_run_count=36,
        ),
        perturbations=runs,
        decision=SectionDecision.FALLBACK,
        reason_codes=("section.no_eligible_level",),
        sections=(
            StructuralSection(
                label="Parte 1",
                start_seconds=0.0,
                end_seconds=4.0,
                cluster_id=None,
                origin="fallback",
                review_required=True,
            ),
        ),
        duration_seconds=4.0,
        beat_times_seconds=(1.0, 2.0, 3.0),
    )

    assert len(result.perturbations) == 36
    assert result.sections[0].origin == "fallback"
    with pytest.raises(ValidationError):
        result.sections[0].label = "Refrão"  # type: ignore[misc]


def test_candidate_hierarchy_is_repeatable_and_covers_m_2_through_10() -> None:
    beat_boundaries = tuple(float(index * 5) for index in range(25))
    block = np.repeat(np.eye(3), 8, axis=1)
    harmonic = np.vstack((block, block))
    timbre = np.vstack((block, block, block))

    first = analyze_candidate_levels(
        harmonic_features=harmonic,
        timbre_features=timbre,
        beat_boundaries=beat_boundaries,
        neighbor_offset=0,
        smoothing_beats=17,
        kmeans_seed=0,
    )
    second = analyze_candidate_levels(
        harmonic_features=harmonic,
        timbre_features=timbre,
        beat_boundaries=beat_boundaries,
        neighbor_offset=0,
        smoothing_beats=17,
        kmeans_seed=0,
    )

    assert tuple(level.m for level in first) == tuple(range(2, 11))
    assert first == second
    assert all(
        boundary in beat_boundaries
        for level in first
        for boundary in level.boundaries_seconds
    )


def test_perturbation_suite_is_fixed_and_lexicographic() -> None:
    configurations = perturbation_configurations()

    assert len(configurations) == 36
    assert configurations[0] == PerturbationConfiguration(
        neighbor_offset=-1, smoothing_beats=13, kmeans_seed=0
    )
    assert configurations[-1] == PerturbationConfiguration(
        neighbor_offset=1, smoothing_beats=21, kmeans_seed=3
    )


def test_accepted_export_is_neutral_chronological_and_automatic() -> None:
    selected = candidate(2, (0, 0, 1, 1, 0, 0), entropy=0.63)

    sections = build_published_sections(
        accepted=True, selected=selected, duration_seconds=36.0
    )

    assert [section.label for section in sections] == [
        "Parte 1",
        "Parte 2",
        "Parte 3",
    ]
    assert [section.cluster_id for section in sections] == [0, 1, 0]
    assert all(section.origin == "automatic" for section in sections)
    assert all(not section.review_required for section in sections)


def test_rejected_export_is_one_editable_full_track_fallback() -> None:
    sections = build_published_sections(
        accepted=False, selected=None, duration_seconds=24.0
    )

    assert len(sections) == 1
    assert sections[0].model_dump() == {
        "label": "Parte 1",
        "start_seconds": 0.0,
        "end_seconds": 24.0,
        "cluster_id": None,
        "origin": "fallback",
        "review_required": True,
    }


def test_threshold_changes_require_a_new_major_gate_version() -> None:
    with pytest.raises(ValueError, match="major gate version"):
        SectionStabilityThresholds(
            gate_version="1.0.1",
            calibration_id="new-calibration",
            minimum_count_agreement=0.8,
        )

    changed = SectionStabilityThresholds(
        gate_version="2.0.0",
        calibration_id="new-calibration",
        minimum_count_agreement=0.8,
    )
    assert changed.minimum_count_agreement == 0.8


def test_provisional_thresholds_cannot_publish_an_automatic_result() -> None:
    decision = evaluate_stability_gate(
        thresholds=SectionStabilityThresholds.provisional_v1(),
        count_agreement=1.0,
        median_stability_f1=1.0,
        boundary_support=(1.0,),
        eligible_level_count=9,
    )

    assert decision.accepted is False
    assert decision.reason_codes == (SectionFallbackReason.UNCALIBRATED,)
