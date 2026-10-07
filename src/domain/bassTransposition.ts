import { STANDARD_OPEN_MIDI, type BassChart } from '@/domain/bassChart';
import type { MusicalKey } from '@/domain/bassHarmony';
import { suggestFingering } from '@/domain/midiBassChart';

export function supportsBassTransposition(chart: BassChart): boolean {
  return chart.source === 'midi' || chart.source === 'gp';
}

export function canTransposeBassChart(
  chart: BassChart,
  semitones: number,
): boolean {
  return (
    supportsBassTransposition(chart) &&
    Number.isInteger(semitones) &&
    Math.abs(semitones) <= 12 &&
    chart.notes.every(
      (note) => note.midi + semitones >= 0 && note.midi + semitones <= 127,
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
): BassChart {
  if (!supportsBassTransposition(chart) || semitones === 0) return chart;
  if (!canTransposeBassChart(chart, semitones)) {
    throw new RangeError('Transposition outside the MIDI range');
  }
  if (chart.notes.length === 0) return chart;
  const pitched = chart.notes.map((note) => ({
    pitch: note.midi + semitones,
    time: note.time,
  }));
  const originalOpen = STANDARD_OPEN_MIDI.map(
    (open, string) => open + chart.tuning[string],
  );
  const lowest = pitched.reduce((min, note) => Math.min(min, note.pitch), 127);
  const highest = pitched.reduce((max, note) => Math.max(max, note.pitch), 0);
  // Keep the imported tuning whenever all pitches still fit its 24-fret neck.
  // At either edge, move the tuning only as far as needed, without folding
  // the bass line into a different octave or dropping its lowest notes.
  const lowerBound = highest - (Math.max(...originalOpen) + 24);
  const upperBound = lowest - Math.min(...originalOpen);
  const tuningShift = Math.max(lowerBound, Math.min(0, upperBound));
  const tuning = chart.tuning.map((offset) => offset + tuningShift);
  const open = originalOpen.map((pitch) => pitch + tuningShift);
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
