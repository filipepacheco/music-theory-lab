import { STANDARD_OPEN_MIDI, type BassChart } from '@/domain/bassChart';
import type { MusicalKey } from '@/domain/bassHarmony';
import { suggestFingering } from '@/domain/midiBassChart';

export const DROP_D_TUNING = [-2, 0, 0, 0];

export function supportsBassTransposition(chart: BassChart): boolean {
  return chart.source === 'midi' || chart.source === 'gp';
}

export function canTransposeBassChart(
  chart: BassChart,
  semitones: number,
  tuning: number[] = chart.tuning,
): boolean {
  return (
    supportsBassTransposition(chart) &&
    Number.isInteger(semitones) &&
    Math.abs(semitones) <= 12 &&
    chart.notes.every((note) => {
      const pitch = note.midi + semitones;
      return (
        pitch >= 0 &&
        pitch <= 127 &&
        STANDARD_OPEN_MIDI.some((standard, string) => {
          const fret = pitch - (standard + tuning[string]);
          return fret >= 0 && fret <= 24;
        })
      );
    })
  );
}

export function transposeMusicalKey<T extends MusicalKey>(
  key: T,
  semitones: number,
): T {
  return { ...key, tonic: (((key.tonic + semitones) % 12) + 12) % 12 };
}

/** A practice view of the original import; timing and saved bytes stay intact. */
export function transposeBassChart(
  chart: BassChart,
  semitones: number,
  tuning: number[] = chart.tuning,
): BassChart {
  if (!supportsBassTransposition(chart)) return chart;
  if (
    semitones === 0 &&
    tuning.every((offset, string) => offset === chart.tuning[string])
  )
    return chart;
  if (!canTransposeBassChart(chart, semitones, tuning)) {
    throw new RangeError('Transposition outside the selected bass tuning');
  }
  if (chart.notes.length === 0) return chart;
  const pitched = chart.notes.map((note) => ({
    pitch: note.midi + semitones,
    time: note.time,
  }));
  const open = STANDARD_OPEN_MIDI.map(
    (pitch, string) => pitch + tuning[string],
  );
  const fingering = suggestFingering(pitched, open);
  return {
    ...chart,
    tuning,
    notes: chart.notes.map((note, index) => ({
      ...note,
      ...fingering[index],
      midi: pitched[index].pitch,
    })),
  };
}
