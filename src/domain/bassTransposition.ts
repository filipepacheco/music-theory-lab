import { STANDARD_OPEN_MIDI, type BassChart } from '@/domain/bassChart';
import type { MusicalKey } from '@/domain/bassHarmony';
import { suggestFingering } from '@/domain/midiBassChart';

export const DROP_D_TUNING = [-2, 0, 0, 0];
export const E_STANDARD_TUNING = [0, 0, 0, 0];

export function supportsBassTransposition(chart: BassChart): boolean {
  return chart.source === 'midi' || chart.source === 'gp';
}

/** One register shift for the whole line keeps every melodic interval intact. */
function playableOctaveOffset(
  chart: BassChart,
  semitones: number,
  tuning: number[],
): number | null {
  const open = STANDARD_OPEN_MIDI.map(
    (pitch, string) => pitch + tuning[string],
  );
  if (
    !supportsBassTransposition(chart) ||
    !Number.isInteger(semitones) ||
    Math.abs(semitones) > 12 ||
    tuning.length !== 4 ||
    !open.every(
      (pitch) => Number.isInteger(pitch) && pitch >= 0 && pitch <= 127,
    ) ||
    !chart.notes.every(
      (note) =>
        Number.isInteger(note.midi) && note.midi >= 0 && note.midi <= 127,
    )
  )
    return null;

  // Try the written register first, then the closest octaves in either direction.
  for (let distance = 0; distance <= 120; distance += 12) {
    for (const offset of distance === 0 ? [0] : [distance, -distance]) {
      if (
        chart.notes.every((note) => {
          const pitch = note.midi + semitones + offset;
          return (
            pitch >= 0 &&
            pitch <= 127 &&
            open.some((string) => pitch >= string && pitch <= string + 24)
          );
        })
      )
        return offset;
    }
  }
  return null;
}

export function canTransposeBassChart(
  chart: BassChart,
  semitones: number,
  tuning: number[] = chart.tuning,
): boolean {
  return playableOctaveOffset(chart, semitones, tuning) !== null;
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
    tuning.length === chart.tuning.length &&
    tuning.every((offset, string) => offset === chart.tuning[string])
  )
    return chart;
  const octaveOffset = playableOctaveOffset(chart, semitones, tuning);
  if (octaveOffset === null) {
    throw new RangeError('Transposition outside the selected bass tuning');
  }
  const open = STANDARD_OPEN_MIDI.map(
    (pitch, string) => pitch + tuning[string],
  );
  const pitched = chart.notes.map((note) => ({
    pitch: note.midi + semitones + octaveOffset,
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
