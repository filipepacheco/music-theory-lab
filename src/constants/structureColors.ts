import type { TimeSignature } from '@/types';

export const TIME_SIGNATURES: TimeSignature[] = ['2/4', '3/4', '4/4', '6/8'];

export const STRUCTURE_PALETTE: string[] = [
  '#3b82f6',
  '#8b5cf6',
  '#06b6d4',
  '#f59e0b',
  '#10b981',
  '#ec4899',
  '#6366f1',
  '#f97316',
  '#14b8a6',
  '#e11d48',
  '#84cc16',
  '#9ca3af',
];

export const SECTION_SUGGESTIONS: { name: string; colorIndex: number }[] = [
  { name: 'Intro', colorIndex: 1 },
  { name: 'Verso', colorIndex: 0 },
  { name: 'Pre-Refrão', colorIndex: 2 },
  { name: 'Refrão', colorIndex: 3 },
  { name: 'Ponte', colorIndex: 4 },
  { name: 'Solo', colorIndex: 5 },
  { name: 'Outro', colorIndex: 6 },
];
