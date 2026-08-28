import type { DrumPiece } from '@/types';

/** A groove is a fixed 16-step (one 4/4 measure) three-piece grid. */
export const GROOVE_STEPS = 16;

/** The drum pieces, in display order, with compact pt-BR labels. */
export const DRUM_PIECES: { id: DrumPiece; label: string }[] = [
  { id: 'bumbo', label: 'B' },
  { id: 'caixa', label: 'C' },
  { id: 'chimbal', label: 'CH' },
];
