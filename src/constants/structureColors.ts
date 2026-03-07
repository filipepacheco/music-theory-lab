import type { TimeSignature } from '@/types';

export const TIME_SIGNATURES: TimeSignature[] = ['2/4', '3/4', '4/4', '6/8'];

/** Predefined color palette for structure sections and bars */
export const STRUCTURE_PALETTE: string[] = [
  '#3b82f6', // blue
  '#8b5cf6', // violet
  '#06b6d4', // cyan
  '#f59e0b', // amber
  '#10b981', // emerald
  '#ec4899', // pink
  '#6366f1', // indigo
  '#f97316', // orange
  '#14b8a6', // teal
  '#e11d48', // rose
  '#84cc16', // lime
  '#9ca3af', // gray
];

/** Common section name suggestions with default palette index */
export const SECTION_SUGGESTIONS: { name: string; colorIndex: number }[] = [
  { name: 'Intro', colorIndex: 1 },
  { name: 'Verso', colorIndex: 0 },
  { name: 'Pre-Refrao', colorIndex: 2 },
  { name: 'Refrao', colorIndex: 3 },
  { name: 'Ponte', colorIndex: 4 },
  { name: 'Solo', colorIndex: 5 },
  { name: 'Outro', colorIndex: 6 },
];
