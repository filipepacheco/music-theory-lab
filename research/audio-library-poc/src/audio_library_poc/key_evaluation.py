from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path

import mir_eval

from audio_library_poc.key_analysis import KeyAnalysisResult
from audio_library_poc.models import TonalMode

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
class KeyEvaluationScore:
    reference_label: str
    candidate_id: str
    top_label: str
    score: float
    reference_duration_seconds: float


def load_reference_key(path: Path) -> tuple[str, float]:

    per_label = defaultdict(float)
    total_end = 0.0
    total_start = float("inf")
    with path.open(encoding="utf-8") as source:
        for line in source:
            parts = line.split()
            if len(parts) < 3:
                continue
            try:
                start = float(parts[0])
                end = float(parts[1])
            except ValueError:
                continue
            total_start = min(total_start, start)
            total_end = max(total_end, end)
            if parts[2] in {"Silence", "Modulation"}:
                continue
            label = parts[3] if len(parts) >= 4 else parts[2]
            per_label[label] += max(0.0, end - start)
    if not per_label:
        return "N", max(
            0.0, total_end - (total_start if total_start != float("inf") else 0)
        )
    dominant = max(per_label.items(), key=lambda kv: kv[1])[0]
    return _normalize_reference_key_label(dominant), max(0.0, total_end - total_start)


def _normalize_reference_key_label(raw: str) -> str:

    label = raw.strip()
    if ":" not in label:
        return f"{label} major"
    root, quality = label.split(":", 1)
    quality = quality.strip().lower()
    if quality in {"major", "maj"}:
        return f"{root} major"
    if quality in {"minor", "min"}:
        return f"{root} minor"
    return f"{root} {quality}"


def key_result_to_estimate(result: KeyAnalysisResult) -> str:

    top = result.top_estimate
    quality = "major" if top.mode is TonalMode.MAJOR else "minor"
    return f"{_PITCH_CLASS_NAMES[top.tonic_pc]} {quality}"


def evaluate(
    reference_label: str,
    reference_duration_seconds: float,
    result: KeyAnalysisResult,
    *,
    candidate_id: str = "candidate",
) -> KeyEvaluationScore:
    estimate_label = key_result_to_estimate(result)
    score = float(mir_eval.key.weighted_score(reference_label, estimate_label))
    return KeyEvaluationScore(
        reference_label=reference_label,
        candidate_id=candidate_id,
        top_label=estimate_label,
        score=score,
        reference_duration_seconds=reference_duration_seconds,
    )


__all__ = (
    "KeyEvaluationScore",
    "evaluate",
    "key_result_to_estimate",
    "load_reference_key",
)
