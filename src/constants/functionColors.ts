import type { HarmonicFunction } from '@/constants/harmonicFields';

/** Harmonic function -> CSS variable. Single source for all UI palettes. */
export const FUNCTION_COLORS: Record<HarmonicFunction, string> = {
  T: 'var(--color-tonic)',
  SD: 'var(--color-subdominant)',
  D: 'var(--color-dominant)',
};
