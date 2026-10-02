import { describe, expect, it } from 'vitest';
import {
  bassCrossoverHz,
  bassMixFilters,
  midiFrequency,
} from '@/domain/bassMix';

const chartWith = (...midis: number[]) => ({
  notes: midis.map((midi) => ({ midi })) as never,
});

describe('midiFrequency', () => {
  it('maps A4 to 440 Hz and E1 to the open low string', () => {
    expect(midiFrequency(69)).toBe(440);
    expect(midiFrequency(28)).toBeCloseTo(41.2, 1);
  });
});

describe('bassCrossoverHz', () => {
  it('sits above the highest fundamental in the chart', () => {
    // G3 (196 Hz) × 1.5
    expect(bassCrossoverHz(chartWith(28, 40, 55))).toBe(294);
  });

  it('never drops below the floor for low-lying lines', () => {
    expect(bassCrossoverHz(chartWith(28, 33))).toBe(120);
  });

  it('caps high-register lines so the band keeps its low mids', () => {
    expect(bassCrossoverHz(chartWith(67))).toBe(350);
  });

  it('falls back to a typical bass range for a chart with no notes', () => {
    expect(bassCrossoverHz(chartWith())).toBe(294);
  });
});

describe('bassMixFilters', () => {
  it('leaves the full mix unfiltered', () => {
    expect(bassMixFilters('full', 200)).toEqual([]);
  });

  it('cascades two Butterworth sections on the matching side', () => {
    const noBass = bassMixFilters('noBass', 200);
    const bassOnly = bassMixFilters('bassOnly', 200);
    expect(noBass.map((f) => f.type)).toEqual(['highpass', 'highpass']);
    expect(bassOnly.map((f) => f.type)).toEqual(['lowpass', 'lowpass']);
    for (const f of [...noBass, ...bassOnly]) {
      expect(f.frequency).toBe(200);
      expect(f.Q).toBeCloseTo(Math.SQRT1_2);
    }
  });
});
