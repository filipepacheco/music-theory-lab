import type { HarmonicFunction } from '@/constants/harmonicFields';

/** Harmonic function -> CSS variable. Single source for all UI palettes. */
export const FUNCTION_COLORS: Record<HarmonicFunction, string> = {
  T: 'var(--color-tonic)',
  SD: 'var(--color-subdominant)',
  D: 'var(--color-dominant)',
};

/** The colour of a function; a chromatic chord (`null`) is neutral. */
export function functionColor(fn: HarmonicFunction | null): string {
  return fn ? FUNCTION_COLORS[fn] : 'var(--color-accent)';
}

/** A function colour as a translucent ground, at `percent` strength. */
export function functionTint(
  fn: HarmonicFunction | null,
  percent: number,
): string {
  return `color-mix(in srgb, ${functionColor(fn)} ${percent}%, transparent)`;
}
