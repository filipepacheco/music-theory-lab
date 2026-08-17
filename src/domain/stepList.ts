import {
  MAX_PROGRESSION_STEPS,
  type ProgressionStep,
} from '@/constants/progressions';

const MIN_BEATS = 0.5;
const MAX_BEATS = 8;

/** Clamp beats to 0.5-8 in 0.5 increments — the single rule for step durations. */
export function clampStepBeats(beats: number): number {
  return Math.max(MIN_BEATS, Math.min(MAX_BEATS, Math.round(beats * 2) / 2));
}

/** Append a step, no-op at the 64-step cap. */
export function appendStep(
  steps: ProgressionStep[],
  step: ProgressionStep,
): ProgressionStep[] {
  if (steps.length >= MAX_PROGRESSION_STEPS) return steps;
  return [...steps, step];
}

export function removeStep(
  steps: ProgressionStep[],
  index: number,
): ProgressionStep[] {
  return steps.filter((_, i) => i !== index);
}

export function setStepBeats(
  steps: ProgressionStep[],
  index: number,
  beats: number,
): ProgressionStep[] {
  const clamped = clampStepBeats(beats);
  return steps.map((step, i) =>
    i === index ? { ...step, beats: clamped } : step,
  );
}
