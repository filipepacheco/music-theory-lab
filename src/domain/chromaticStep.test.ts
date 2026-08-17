import { describe, expect, it } from 'vitest';
import {
  buildCommonChromaticStep,
  buildManualChromaticStep,
} from './chromaticStep';

describe('buildManualChromaticStep', () => {
  it('builds absolute notes, key-relative intervals, and a label', () => {
    const result = buildManualChromaticStep(0, 'major', 0);

    expect(result.notes).toEqual([0, 4, 7]);
    expect(result.step).toEqual({
      degree: null,
      label: 'C',
      intervals: [0, 4, 7],
    });
  });

  it('expresses intervals relative to the key root', () => {
    // D major against C major: notes D F# A.
    const result = buildManualChromaticStep(2, 'major', 0);

    expect(result.notes).toEqual([2, 6, 9]);
    expect(result.step.intervals).toEqual([2, 6, 9]);
    expect(result.step.label).toBe('D');
  });

  it('spells flat roots for flat keys', () => {
    const result = buildManualChromaticStep(10, 'major', 10);

    expect(result.step.label).toBe('Bb');
  });
});

describe('buildCommonChromaticStep', () => {
  it('resolves a template offset and type against the key', () => {
    // V7/V in C major: D7, intervals 2/6/9/0 relative to C.
    const result = buildCommonChromaticStep('V7/V', 2, 'dom7', 0);

    expect(result.notes).toEqual([2, 6, 9, 0]);
    expect(result.step).toEqual({
      degree: null,
      label: 'V7/V',
      intervals: [2, 6, 9, 0],
    });
  });
});
