// Practice mixes for an imported Rocksmith chart. A package carries the song
// as one full mix, so the bass is split off by frequency: a crossover sits
// just above the chart's highest bass fundamental, the "sem baixo" mix keeps
// what lies above it and the "só baixo" mix what lies below. It is an
// approximation: the kick drum stays with the bass, and the bass's upper
// harmonics stay with the band.

import type { BassChart } from '@/domain/bassChart';

export type BassMixMode = 'full' | 'noBass' | 'bassOnly';

export const BASS_MIX_MODES: readonly BassMixMode[] = [
  'full',
  'noBass',
  'bassOnly',
];

export interface BassMixFilter {
  type: 'lowpass' | 'highpass';
  frequency: number;
  Q: number;
}

/** Butterworth Q: two cascaded sections form a Linkwitz-Riley 24 dB/oct slope. */
const BUTTERWORTH_Q = Math.SQRT1_2;
const MIN_CROSSOVER_HZ = 120;
const MAX_CROSSOVER_HZ = 350;
/** Room above the top fundamental so the highest notes keep their body. */
const HEADROOM = 1.5;
/** E1 up to G3: the span of a four-string bass below the 12th fret. */
const FALLBACK_TOP_MIDI = 55;

export function midiFrequency(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

/** Crossover frequency (Hz) for a chart, from its highest note. */
export function bassCrossoverHz(chart: Pick<BassChart, 'notes'>): number {
  const top = chart.notes.reduce(
    (max, note) => Math.max(max, note.midi),
    Number.NEGATIVE_INFINITY,
  );
  const topMidi = Number.isFinite(top) ? top : FALLBACK_TOP_MIDI;
  const hz = midiFrequency(topMidi) * HEADROOM;
  return Math.round(Math.min(MAX_CROSSOVER_HZ, Math.max(MIN_CROSSOVER_HZ, hz)));
}

/** Filter sections, in series, that produce a mix; empty for the full mix. */
export function bassMixFilters(
  mode: BassMixMode,
  crossoverHz: number,
): BassMixFilter[] {
  if (mode === 'full') return [];
  const type = mode === 'noBass' ? 'highpass' : 'lowpass';
  const section = { type, frequency: crossoverHz, Q: BUTTERWORTH_Q } as const;
  return [{ ...section }, { ...section }];
}

export function bassMixLabel(mode: BassMixMode): string {
  switch (mode) {
    case 'full':
      return 'Mix completa';
    case 'noBass':
      return 'Sem baixo';
    case 'bassOnly':
      return 'Só baixo';
  }
}
