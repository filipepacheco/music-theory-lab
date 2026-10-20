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

const BUTTERWORTH_Q = Math.SQRT1_2;
const MIN_CROSSOVER_HZ = 120;
const MAX_CROSSOVER_HZ = 350;
const HEADROOM = 1.5;
const FALLBACK_TOP_MIDI = 55;

export function midiFrequency(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

export function bassCrossoverHz(chart: Pick<BassChart, 'notes'>): number {
  const top = chart.notes.reduce(
    (max, note) => Math.max(max, note.midi),
    Number.NEGATIVE_INFINITY,
  );
  const topMidi = Number.isFinite(top) ? top : FALLBACK_TOP_MIDI;
  const hz = midiFrequency(topMidi) * HEADROOM;
  return Math.round(Math.min(MAX_CROSSOVER_HZ, Math.max(MIN_CROSSOVER_HZ, hz)));
}

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
