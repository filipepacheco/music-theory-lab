"""Pure-domain module: align ChordSegments to detected beats + roman-numeral degrees.

Takes three independent Phase 3 analysis results — beats
(``BeatAnalysisResult``), chord segments (``ChordAnalysisResult``), and a
detected key (``KeyAnalysisResult``) — and produces one integrated view
of "which chord landed on which beat, and what does it mean relative to
the detected key". No new stage kind: this is a data transformation the
report script and any downstream similarity code can call directly.

Beat alignment rule:

- Each chord segment ``[start_seconds, end_seconds)`` is snapped to the
  nearest beat by index. ``start_beat_index`` is the argmin over
  ``|beat_time - start_seconds|``; ``end_beat_index`` is the argmin over
  ``|beat_time - end_seconds|``.
- The chord's ``snapped_start_seconds`` / ``snapped_end_seconds`` are the
  beat times at those indices (or the original endpoint when it falls
  outside the beat grid — clamped to the first/last beat).
- When both indices collapse to the same beat (chord shorter than one
  half-beat), the region is still emitted with ``beat_span == 0`` — the
  caller can filter these out.

Roman-numeral rule:

- ``relative_root_pc = (chord.root_pc - key.tonic_pc) mod 12``.
- Non-pitched labels (``unknown``, ``no_chord``) get ``relative_root_pc =
  None`` and ``roman_numeral = None``.
- Otherwise, the twelve chromatic offsets map to seven diatonic degrees
  with an accidental prefix (``b`` or ``#``) that depends on the key's
  mode; case is upper for major chord quality, lower for minor.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from audio_library_poc.beat_analysis import BeatAnalysisResult, BeatEstimate
from audio_library_poc.chord_analysis import (
    ChordAnalysisResult,
    ChordLabel,
)
from audio_library_poc.key_analysis import KeyAnalysisResult
from audio_library_poc.models import TonalMode

Accidental = Literal["", "b", "#"]

_MAJOR_DEGREE_MAP: dict[int, tuple[int, Accidental]] = {
    0: (1, ""),
    1: (2, "b"),
    2: (2, ""),
    3: (3, "b"),
    4: (3, ""),
    5: (4, ""),
    6: (4, "#"),
    7: (5, ""),
    8: (6, "b"),
    9: (6, ""),
    10: (7, "b"),
    11: (7, ""),
}

_MINOR_DEGREE_MAP: dict[int, tuple[int, Accidental]] = {
    0: (1, ""),
    1: (2, "b"),
    2: (2, ""),
    3: (3, ""),
    4: (3, "#"),
    5: (4, ""),
    6: (5, "b"),
    7: (5, ""),
    8: (6, ""),
    9: (6, "#"),
    10: (7, ""),
    11: (7, "#"),
}

_DEGREE_NUMERALS = ("I", "II", "III", "IV", "V", "VI", "VII")

_PITCH_CLASS_NAMES = (
    "C",
    "C#",
    "D",
    "D#",
    "E",
    "F",
    "F#",
    "G",
    "G#",
    "A",
    "A#",
    "B",
)


@dataclass(frozen=True)
class AlignedChordRegion:
    """One chord segment expressed in beat-aligned + tonal-relative terms."""

    start_seconds: float
    end_seconds: float
    snapped_start_seconds: float
    snapped_end_seconds: float
    start_beat_index: int
    end_beat_index: int
    beat_span: int
    chord_label: ChordLabel
    root_pc: int | None
    candidate_label: str
    relative_root_pc: int | None
    roman_numeral: str | None

    @property
    def chord_display(self) -> str:
        """A short human-readable chord label, or ``N`` / ``?`` for non-pitched."""

        if self.chord_label is ChordLabel.NO_CHORD:
            return "N"
        if self.chord_label is ChordLabel.UNKNOWN:
            return "?"
        assert self.root_pc is not None
        suffix = "m" if self.chord_label is ChordLabel.MINOR else ""
        return f"{_PITCH_CLASS_NAMES[self.root_pc]}{suffix}"


def relative_root_of(chord_root_pc: int, key_tonic_pc: int) -> int:
    """Return the chromatic offset (0-11) of ``chord_root_pc`` from ``key_tonic_pc``."""

    return (chord_root_pc - key_tonic_pc) % 12


def roman_numeral(
    relative_root_pc: int,
    chord_mode: ChordLabel,
    key_mode: TonalMode,
) -> str:
    """Return a roman-numeral degree such as ``I``, ``vi``, ``bVII``.

    Case is upper for major chord quality, lower for minor. Only major /
    minor chord modes are supported; passing anything else raises
    ``ValueError``.
    """

    if chord_mode not in (ChordLabel.MAJOR, ChordLabel.MINOR):
        raise ValueError(
            f"roman_numeral supports major/minor chords only, got {chord_mode}"
        )
    if key_mode is TonalMode.MAJOR:
        degree, accidental = _MAJOR_DEGREE_MAP[relative_root_pc]
    elif key_mode is TonalMode.MINOR:
        degree, accidental = _MINOR_DEGREE_MAP[relative_root_pc]
    else:
        raise ValueError(f"Unknown key mode: {key_mode}")
    numeral = _DEGREE_NUMERALS[degree - 1]
    if chord_mode is ChordLabel.MINOR:
        numeral = numeral.lower()
    return f"{accidental}{numeral}"


def align_chords_to_beats(
    chords: ChordAnalysisResult,
    beats: BeatAnalysisResult,
    key: KeyAnalysisResult,
) -> list[AlignedChordRegion]:
    """Snap every chord segment to the nearest detected beat.

    The three results must be for the same source (same
    ``source_sha256``); a mismatch raises ``ValueError`` immediately
    rather than silently mis-aligning.
    """

    if chords.source_sha256 != beats.source_sha256:
        raise ValueError("chords and beats have different source_sha256")
    if chords.source_sha256 != key.source_sha256:
        raise ValueError("chords and key have different source_sha256")

    beat_times = [beat.time_seconds for beat in beats.beats]
    key_tonic = key.top_estimate.tonic_pc
    key_mode = key.top_estimate.mode

    regions: list[AlignedChordRegion] = []
    for segment in chords.segments:
        start_index = _nearest_beat_index(beat_times, segment.start_seconds)
        end_index = _nearest_beat_index(beat_times, segment.end_seconds)
        snapped_start = beat_times[start_index] if beat_times else segment.start_seconds
        snapped_end = beat_times[end_index] if beat_times else segment.end_seconds
        beat_span = max(0, end_index - start_index)

        relative_root_pc: int | None = None
        numeral: str | None = None
        if segment.root_pc is not None and segment.label in (
            ChordLabel.MAJOR,
            ChordLabel.MINOR,
        ):
            relative_root_pc = relative_root_of(segment.root_pc, key_tonic)
            numeral = roman_numeral(relative_root_pc, segment.label, key_mode)

        regions.append(
            AlignedChordRegion(
                start_seconds=segment.start_seconds,
                end_seconds=segment.end_seconds,
                snapped_start_seconds=snapped_start,
                snapped_end_seconds=snapped_end,
                start_beat_index=start_index,
                end_beat_index=end_index,
                beat_span=beat_span,
                chord_label=segment.label,
                root_pc=segment.root_pc,
                candidate_label=segment.candidate_label,
                relative_root_pc=relative_root_pc,
                roman_numeral=numeral,
            )
        )
    return regions


def collapse_short_regions(
    regions: list[AlignedChordRegion],
    *,
    min_beat_span: int = 1,
) -> list[AlignedChordRegion]:
    """Fold regions shorter than ``min_beat_span`` into the previous region.

    Useful for the report generator which wants a bar-level view of the
    progression rather than raw frame-level flicker.
    """

    if min_beat_span < 1:
        return list(regions)
    merged: list[AlignedChordRegion] = []
    for region in regions:
        if merged and region.beat_span < min_beat_span:
            prev = merged[-1]
            merged[-1] = _extend_region(prev, region)
        else:
            merged.append(region)
    return merged


def _nearest_beat_index(beat_times: list[float], target_seconds: float) -> int:
    if not beat_times:
        return 0
    lo, hi = 0, len(beat_times) - 1
    while lo < hi:
        mid = (lo + hi) // 2
        if beat_times[mid] < target_seconds:
            lo = mid + 1
        else:
            hi = mid
    # lo is the first beat >= target. Compare with lo-1 to pick the nearest.
    if lo == 0:
        return 0
    prev = lo - 1
    if abs(beat_times[prev] - target_seconds) <= abs(beat_times[lo] - target_seconds):
        return prev
    return lo


def _extend_region(
    prev: AlignedChordRegion,
    absorbed: AlignedChordRegion,
) -> AlignedChordRegion:
    return AlignedChordRegion(
        start_seconds=prev.start_seconds,
        end_seconds=absorbed.end_seconds,
        snapped_start_seconds=prev.snapped_start_seconds,
        snapped_end_seconds=absorbed.snapped_end_seconds,
        start_beat_index=prev.start_beat_index,
        end_beat_index=absorbed.end_beat_index,
        beat_span=max(0, absorbed.end_beat_index - prev.start_beat_index),
        chord_label=prev.chord_label,
        root_pc=prev.root_pc,
        candidate_label=prev.candidate_label,
        relative_root_pc=prev.relative_root_pc,
        roman_numeral=prev.roman_numeral,
    )


# Silence unused-import lint noise: BeatEstimate is re-exported for tests.
__all__ = (
    "AlignedChordRegion",
    "BeatEstimate",
    "align_chords_to_beats",
    "collapse_short_regions",
    "relative_root_of",
    "roman_numeral",
)
