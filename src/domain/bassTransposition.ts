import { STANDARD_OPEN_MIDI, type BassChart } from '@/domain/bassChart';
import type { MusicalKey } from '@/domain/bassHarmony';
import { suggestFingering } from '@/domain/midiBassChart';

export const DROP_D_TUNING = [-2, 0, 0, 0];
export const E_STANDARD_TUNING = [0, 0, 0, 0];

/** Keep the exact register when possible; otherwise use the nearest octave. */
function playablePitch(pitch: number, open: number[]): number | null {
  if (pitch < 0 || pitch > 127 || !Number.isInteger(pitch)) return null;
  const lowest = Math.min(...open);
  const highest = Math.min(127, Math.max(...open) + 24);
  while (pitch < lowest) pitch += 12;
  while (pitch > highest) pitch -= 12;
  return open.some((string) => pitch >= string && pitch <= string + 24)
    ? pitch
    : null;
}

export function supportsBassTransposition(chart: BassChart): boolean {
  return chart.source === 'midi' || chart.source === 'gp';
}

export function canTransposeBassChart(
  chart: BassChart,
  semitones: number,
  tuning: number[] = chart.tuning,
): boolean {
  const open = STANDARD_OPEN_MIDI.map(
    (pitch, string) => pitch + tuning[string],
  );
  return (
    supportsBassTransposition(chart) &&
    Number.isInteger(semitones) &&
    Math.abs(semitones) <= 12 &&
    tuning.length === 4 &&
    open.every(
      (pitch) => Number.isInteger(pitch) && pitch >= 0 && pitch <= 127,
    ) &&
    chart.notes.every(
      (note) => playablePitch(note.midi + semitones, open) !== null,
    )
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
  const open = STANDARD_OPEN_MIDI.map(
    (pitch, string) => pitch + tuning[string],
  );
  const pitched = chart.notes.map((note) => ({
    pitch: playablePitch(note.midi + semitones, open)!,
    time: note.time,
  }));
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
