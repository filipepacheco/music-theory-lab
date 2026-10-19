import type { HarmonicFunction } from '@/constants/harmonicFields';

export const FUNCTION_COLORS: Record<HarmonicFunction, string> = {
  T: 'var(--color-tonic)',
  SD: 'var(--color-subdominant)',
  D: 'var(--color-dominant)',
};

export function functionColor(fn: HarmonicFunction | null): string {
  return fn ? FUNCTION_COLORS[fn] : 'var(--color-accent)';
}

export function functionTint(
  fn: HarmonicFunction | null,
  percent: number,
): string {
  return `color-mix(in srgb, ${functionColor(fn)} ${percent}%, transparent)`;
}
