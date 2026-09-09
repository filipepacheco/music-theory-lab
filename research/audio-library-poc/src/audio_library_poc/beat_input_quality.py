"""Immutable eligibility decision between beat tracking and section inference."""

from __future__ import annotations

import hashlib
import json
import math
from enum import StrEnum
from statistics import median
from typing import Any, Literal, Self

import numpy as np
from pydantic import ConfigDict, Field, StrictBool, field_validator, model_validator

from audio_library_poc.beat_analysis import BeatAnalysisResult
from audio_library_poc.models import (
    CodeRevision,
    ContractModel,
    Identifier,
    Sha256,
    VersionString,
)


class FrozenQualityModel(ContractModel):
    model_config = ConfigDict(frozen=True, revalidate_instances="always")


class BeatInputFatalReason(StrEnum):
    CONTRACT_INVALID = "beat.contract_invalid"
    NO_BEATS_DETECTED = "beat.no_beats_detected"
    ANALYZER_FAILED = "beat.analyzer_failed"
    INSUFFICIENT_GRID = "beat.insufficient_grid"
    INSUFFICIENT_SUPPORTED_DURATION = "beat.insufficient_supported_duration"
    INSUFFICIENT_ACTIVE_COVERAGE = "beat.insufficient_active_coverage"
    LONG_ACTIVE_GAP = "beat.long_active_gap"


class BeatInputDiagnostic(StrEnum):
    MISSING_DOWNBEATS = "beat.missing_downbeats"
    UNUSUAL_TEMPO = "beat.unusual_tempo"
    IRREGULAR_TIMING = "beat.irregular_timing"
    LEADING_SILENCE = "beat.leading_silence"
    TRAILING_SILENCE = "beat.trailing_silence"
    UNCALIBRATED = "beat.gate_uncalibrated"


class BeatInputQualityPolicyConfig(FrozenQualityModel):
    """Every behaviour-affecting value covered by the policy digest."""

    gate_id: Literal["beat-input-validity"] = "beat-input-validity"
    gate_version: VersionString
    minimum_beats: int = Field(default=16, ge=1)
    minimum_supported_active_seconds: float = Field(default=12.0, ge=0)
    minimum_active_coverage_ratio: float = Field(default=0.8, ge=0, le=1)
    maximum_unsupported_run_seconds: float = Field(default=8.0, ge=0)
    maximum_unsupported_run_beats: float = Field(default=8.0, ge=0)
    rms_frame_seconds: float = Field(default=0.1, gt=0)
    absolute_activity_dbfs: float = -60.0
    relative_activity_db: float = Field(default=40.0, ge=0)
    close_inactive_holes_seconds: float = Field(default=0.3, ge=0)
    minimum_support_radius_seconds: float = Field(default=0.35, ge=0)
    support_radius_inter_beat_ratio: float = Field(default=0.75, ge=0)
    maximum_support_radius_seconds: float = Field(default=1.5, ge=0)

    @field_validator("gate_version")
    @classmethod
    def validate_gate_version(cls, value: str) -> str:
        core, separator, suffix = value.partition("-")
        parts = core.split(".")
        if (
            len(parts) != 3
            or any(not part.isdigit() for part in parts)
            or (separator and suffix != "provisional")
        ):
            raise ValueError("gate_version must be semantic, optionally provisional")
        return value

    @classmethod
    def provisional_v1(cls) -> Self:
        return cls(gate_version="1.0.0-provisional")

    @classmethod
    def production_v1(cls) -> Self:
        return cls(gate_version="1.0.0")

    @model_validator(mode="after")
    def require_major_bump_for_threshold_changes(self) -> Self:
        baseline = {
            "minimum_beats": 16,
            "minimum_supported_active_seconds": 12.0,
            "minimum_active_coverage_ratio": 0.8,
            "maximum_unsupported_run_seconds": 8.0,
            "maximum_unsupported_run_beats": 8.0,
            "rms_frame_seconds": 0.1,
            "absolute_activity_dbfs": -60.0,
            "relative_activity_db": 40.0,
            "close_inactive_holes_seconds": 0.3,
            "minimum_support_radius_seconds": 0.35,
            "support_radius_inter_beat_ratio": 0.75,
            "maximum_support_radius_seconds": 1.5,
        }
        changed = any(getattr(self, key) != value for key, value in baseline.items())
        major_text = self.gate_version.split(".", maxsplit=1)[0]
        major = int(major_text) if major_text.isdigit() else 0
        if changed and major <= 1:
            raise ValueError(
                "behavioural threshold changes require a new major gate version"
            )
        return self

    def sha256(self) -> str:
        payload = json.dumps(
            self.model_dump(mode="json"),
            sort_keys=True,
            separators=(",", ":"),
        ).encode()
        return hashlib.sha256(payload).hexdigest()


class CalibrationEvidence(FrozenQualityModel):
    calibration_id: Identifier
    config_sha256: Sha256
    held_out: StrictBool
    confidence_level: Literal[0.95]
    invalid_accepted_upper_bound: float = Field(ge=0, le=1)
    valid_retained_lower_bound: float = Field(ge=0, le=1)

    @property
    def passes(self) -> bool:
        return (
            self.held_out
            and self.invalid_accepted_upper_bound <= 0.05
            and self.valid_retained_lower_bound >= 0.85
        )


class BeatResultIdentity(FrozenQualityModel):
    result_sha256: Sha256
    analyzer_candidate: Identifier
    analyzer_implementation_version: VersionString
    model_identifier: str = Field(min_length=1)
    model_sha256: Sha256
    code_revision: CodeRevision


class BeatInputQualityPolicy(FrozenQualityModel):
    gate_id: Literal["beat-input-validity"]
    gate_version: VersionString
    calibration_id: Identifier | None
    config_sha256: Sha256
    implementation_revision: CodeRevision


class BeatInputQualityMeasurements(FrozenQualityModel):
    beat_count: int = Field(ge=0)
    downbeat_count: int = Field(ge=0)
    median_inter_beat_seconds: float = Field(ge=0)
    inter_beat_mad_seconds: float = Field(ge=0)
    inter_beat_p05_seconds: float = Field(ge=0)
    inter_beat_p95_seconds: float = Field(ge=0)
    max_to_median_inter_beat_ratio: float = Field(ge=0)
    active_duration_seconds: float = Field(ge=0)
    beat_supported_active_seconds: float = Field(ge=0)
    active_coverage_ratio: float = Field(ge=0, le=1)
    longest_unsupported_active_run_seconds: float = Field(ge=0)
    longest_unsupported_active_run_beats: float = Field(ge=0)
    first_beat_seconds: float = Field(ge=0)
    last_beat_seconds: float = Field(ge=0)
    detected_span_ratio: float = Field(ge=0, le=1)


class BeatInputQualityDecision(FrozenQualityModel):
    schema_version: Literal["1.0.0"] = "1.0.0"
    source_sha256: Sha256
    beat_result_identity: BeatResultIdentity
    policy: BeatInputQualityPolicy
    beat_input_valid: StrictBool
    publication_allowed: StrictBool
    fatal_reason_codes: tuple[BeatInputFatalReason, ...]
    diagnostic_codes: tuple[str, ...]
    measurements: BeatInputQualityMeasurements


def decide_beat_input_quality(
    *,
    result: BeatAnalysisResult,
    result_sha256: str,
    measurements: BeatInputQualityMeasurements,
    policy_config: BeatInputQualityPolicyConfig,
    calibration: CalibrationEvidence | None = None,
    analyzer_fatal_codes: tuple[str, ...] = (),
    expected_source_sha256: str | None = None,
    expected_analyzer_candidate: str | None = None,
    implementation_revision: str = "workspace-local",
) -> BeatInputQualityDecision:
    """Apply only the fatal classifications owned by gate version 1."""

    fatal: list[BeatInputFatalReason] = []
    provenance_matches = (
        (
            expected_source_sha256 is None
            or result.source_sha256 == expected_source_sha256
        )
        and (
            expected_analyzer_candidate is None
            or result.provenance.candidate == expected_analyzer_candidate
        )
        and measurements.beat_count == len(result.beats)
        and measurements.downbeat_count == result.downbeat_count
    )
    if not provenance_matches:
        fatal.append(BeatInputFatalReason.CONTRACT_INVALID)
    if analyzer_fatal_codes:
        fatal.append(BeatInputFatalReason.ANALYZER_FAILED)
    if measurements.beat_count == 0:
        fatal.append(BeatInputFatalReason.NO_BEATS_DETECTED)
    if measurements.beat_count < policy_config.minimum_beats:
        fatal.append(BeatInputFatalReason.INSUFFICIENT_GRID)
    if (
        measurements.beat_supported_active_seconds
        < policy_config.minimum_supported_active_seconds
    ):
        fatal.append(BeatInputFatalReason.INSUFFICIENT_SUPPORTED_DURATION)
    if measurements.active_coverage_ratio < policy_config.minimum_active_coverage_ratio:
        fatal.append(BeatInputFatalReason.INSUFFICIENT_ACTIVE_COVERAGE)
    if (
        measurements.longest_unsupported_active_run_seconds
        > policy_config.maximum_unsupported_run_seconds
        and measurements.longest_unsupported_active_run_beats
        > policy_config.maximum_unsupported_run_beats
    ):
        fatal.append(BeatInputFatalReason.LONG_ACTIVE_GAP)

    diagnostics = _diagnostics(result, measurements)
    passing_calibration = (
        calibration
        if calibration is not None
        and calibration.passes
        and calibration.config_sha256 == policy_config.sha256()
        and "provisional" not in policy_config.gate_version
        else None
    )
    if passing_calibration is None:
        diagnostics.append(BeatInputDiagnostic.UNCALIBRATED.value)
    for warning in result.warnings:
        diagnostics.append(f"beat.analyzer_warning:{warning}")
    diagnostics.extend(f"beat.analyzer_fatal:{code}" for code in analyzer_fatal_codes)

    policy = BeatInputQualityPolicy(
        gate_id=policy_config.gate_id,
        gate_version=policy_config.gate_version,
        calibration_id=(
            passing_calibration.calibration_id
            if passing_calibration is not None
            else None
        ),
        config_sha256=policy_config.sha256(),
        implementation_revision=implementation_revision,
    )
    unique_fatal = tuple(dict.fromkeys(fatal))
    beat_input_valid = not unique_fatal
    return BeatInputQualityDecision(
        source_sha256=result.source_sha256,
        beat_result_identity=BeatResultIdentity(
            result_sha256=result_sha256,
            analyzer_candidate=result.provenance.candidate,
            analyzer_implementation_version=result.provenance.implementation_version,
            model_identifier=result.provenance.model_identifier,
            model_sha256=result.provenance.model_sha256,
            code_revision=result.provenance.code_revision,
        ),
        policy=policy,
        beat_input_valid=beat_input_valid,
        publication_allowed=beat_input_valid and passing_calibration is not None,
        fatal_reason_codes=unique_fatal,
        diagnostic_codes=tuple(dict.fromkeys(diagnostics)),
        measurements=measurements,
    )


def _diagnostics(
    result: BeatAnalysisResult,
    measurements: BeatInputQualityMeasurements,
) -> list[str]:
    diagnostics: list[str] = []
    if result.downbeat_count == 0:
        diagnostics.append(BeatInputDiagnostic.MISSING_DOWNBEATS.value)
    if result.tempo_median_bpm < 40 or result.tempo_median_bpm > 240:
        diagnostics.append(BeatInputDiagnostic.UNUSUAL_TEMPO.value)
    if measurements.max_to_median_inter_beat_ratio > 2:
        diagnostics.append(BeatInputDiagnostic.IRREGULAR_TIMING.value)
    if measurements.first_beat_seconds > 0.5:
        diagnostics.append(BeatInputDiagnostic.LEADING_SILENCE.value)
    if result.source.duration_seconds - measurements.last_beat_seconds > 0.5:
        diagnostics.append(BeatInputDiagnostic.TRAILING_SILENCE.value)
    return diagnostics


def percentile(values: list[float], fraction: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    position = (len(ordered) - 1) * fraction
    lower = math.floor(position)
    upper = math.ceil(position)
    if lower == upper:
        return ordered[lower]
    weight = position - lower
    return ordered[lower] * (1 - weight) + ordered[upper] * weight


def interval_measurements(result: BeatAnalysisResult) -> dict[str, float]:
    intervals = [
        current.time_seconds - previous.time_seconds
        for previous, current in zip(result.beats, result.beats[1:], strict=False)
    ]
    if not intervals:
        return {
            "median": 0.0,
            "mad": 0.0,
            "p05": 0.0,
            "p95": 0.0,
            "max_to_median": 0.0,
        }
    middle = median(intervals)
    return {
        "median": middle,
        "mad": median(abs(value - middle) for value in intervals),
        "p05": percentile(intervals, 0.05),
        "p95": percentile(intervals, 0.95),
        "max_to_median": max(intervals) / middle if middle else 0.0,
    }


def measure_beat_input_quality(
    *,
    result: BeatAnalysisResult,
    audio: Any,
    sample_rate: int,
    policy_config: BeatInputQualityPolicyConfig,
) -> BeatInputQualityMeasurements:
    """Measure beat support from the same decoded, pre-separation waveform."""

    samples = np.asarray(audio, dtype=np.float64)
    if samples.ndim == 1:
        samples = samples[:, np.newaxis]
    if samples.ndim != 2 or samples.shape[1] < 1:
        raise ValueError("audio must contain frames and at least one channel")
    if sample_rate <= 0:
        raise ValueError("sample_rate must be positive")

    frame_samples = max(1, round(policy_config.rms_frame_seconds * sample_rate))
    frame_rms: list[float] = []
    frame_durations: list[float] = []
    for start in range(0, samples.shape[0], frame_samples):
        block = samples[start : start + frame_samples]
        frame_rms.append(float(np.sqrt(np.mean(np.square(block)))))
        frame_durations.append(block.shape[0] / sample_rate)

    peak_reference = percentile(frame_rms, 0.95)
    absolute_floor = 10 ** (policy_config.absolute_activity_dbfs / 20)
    relative_floor = peak_reference * 10 ** (-policy_config.relative_activity_db / 20)
    activity_floor = max(absolute_floor, relative_floor)
    active = [value >= activity_floor and value > 0 for value in frame_rms]
    _close_short_inactive_holes(
        active,
        frame_durations,
        policy_config.close_inactive_holes_seconds,
    )

    intervals = interval_measurements(result)
    middle = intervals["median"]
    support_radius = min(
        policy_config.maximum_support_radius_seconds,
        max(
            policy_config.minimum_support_radius_seconds,
            policy_config.support_radius_inter_beat_ratio * middle,
        ),
    )
    beat_times = np.asarray(
        [beat.time_seconds for beat in result.beats], dtype=np.float64
    )
    supported: list[bool] = []
    cursor_seconds = 0.0
    for duration, is_active in zip(frame_durations, active, strict=True):
        midpoint = cursor_seconds + duration / 2
        nearest = (
            float(np.min(np.abs(beat_times - midpoint)))
            if beat_times.size
            else math.inf
        )
        supported.append(is_active and nearest <= support_radius)
        cursor_seconds += duration

    active_seconds = sum(
        duration
        for duration, is_active in zip(frame_durations, active, strict=True)
        if is_active
    )
    supported_seconds = sum(
        duration
        for duration, is_supported in zip(frame_durations, supported, strict=True)
        if is_supported
    )
    unsupported = [
        is_active and not is_supported
        for is_active, is_supported in zip(active, supported, strict=True)
    ]
    longest_run = _longest_run_seconds(unsupported, frame_durations)
    first_beat = result.beats[0].time_seconds if result.beats else 0.0
    last_beat = result.beats[-1].time_seconds if result.beats else 0.0
    duration = result.source.duration_seconds

    return BeatInputQualityMeasurements(
        beat_count=len(result.beats),
        downbeat_count=result.downbeat_count,
        median_inter_beat_seconds=middle,
        inter_beat_mad_seconds=intervals["mad"],
        inter_beat_p05_seconds=intervals["p05"],
        inter_beat_p95_seconds=intervals["p95"],
        max_to_median_inter_beat_ratio=intervals["max_to_median"],
        active_duration_seconds=active_seconds,
        beat_supported_active_seconds=supported_seconds,
        active_coverage_ratio=(
            supported_seconds / active_seconds if active_seconds else 0.0
        ),
        longest_unsupported_active_run_seconds=longest_run,
        longest_unsupported_active_run_beats=(longest_run / middle if middle else 0.0),
        first_beat_seconds=first_beat,
        last_beat_seconds=last_beat,
        detected_span_ratio=(
            max(0.0, last_beat - first_beat) / duration if duration else 0.0
        ),
    )


def _close_short_inactive_holes(
    active: list[bool],
    durations: list[float],
    maximum_hole_seconds: float,
) -> None:
    index = 0
    while index < len(active):
        if active[index]:
            index += 1
            continue
        start = index
        while index < len(active) and not active[index]:
            index += 1
        hole_seconds = sum(durations[start:index])
        bounded_by_activity = start > 0 and index < len(active)
        if bounded_by_activity and hole_seconds < maximum_hole_seconds:
            active[start:index] = [True] * (index - start)


def _longest_run_seconds(flags: list[bool], durations: list[float]) -> float:
    longest = 0.0
    current = 0.0
    for flag, duration in zip(flags, durations, strict=True):
        if flag:
            current += duration
            longest = max(longest, current)
        else:
            current = 0.0
    return longest
