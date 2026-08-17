import { describe, expect, it } from 'vitest';
import {
  appendStep,
  clampStepBeats,
  removeStep,
  setStepBeats,
} from './stepList';
import type { ProgressionStep } from '@/constants/progressions';

const step = (i: number): ProgressionStep => ({
  degree: null,
  label: `S${i}`,
});

describe('clampStepBeats', () => {
  it('clamps to 0.5-8 in 0.5 increments', () => {
    expect(clampStepBeats(0.1)).toBe(0.5);
    expect(clampStepBeats(1.24)).toBe(1);
    expect(clampStepBeats(1.26)).toBe(1.5);
    expect(clampStepBeats(20)).toBe(8);
  });
});

describe('appendStep', () => {
  it('appends below the 64-step cap', () => {
    expect(appendStep([step(0)], step(1))).toHaveLength(2);
  });

  it('is a no-op at the cap', () => {
    const full = Array.from({ length: 64 }, (_, i) => step(i));
    expect(appendStep(full, step(64))).toHaveLength(64);
  });
});

describe('removeStep', () => {
  it('removes the step at the index', () => {
    const steps = [step(0), step(1), step(2)];
    expect(removeStep(steps, 1)).toEqual([step(0), step(2)]);
  });
});

describe('setStepBeats', () => {
  it('clamps and updates the step at the index', () => {
    const steps = [step(0), step(1)];
    expect(setStepBeats(steps, 1, 2.7)).toEqual([
      step(0),
      { ...step(1), beats: 2.5 },
    ]);
  });
});
