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

/** The octaves that bars of the tab move, by bar index. */
export type BarOctaves = Readonly<Record<number, number>>;

const NO_BAR_OCTAVES: BarOctaves = {};

/** Octaves the whole line moves to fit the tuning; 0 when it cannot fit. */
export function lineOctaveOffset(
  chart: BassChart,
  semitones: number,
  tuning: number[] = chart.tuning,
): number {
  return (playableOctaveOffset(chart, semitones, tuning) ?? 0) / 12;
}

/**
 * True when each note of the bar still has a place on the neck after the bar
 * moves `octave` octaves, on top of the transposition of the whole line.
 */
export function barOctaveFits(
  chart: BassChart,
  bar: number,
  octave: number,
  semitones = 0,
  tuning: number[] = chart.tuning,
): boolean {
  const base = playableOctaveOffset(chart, semitones, tuning);
  if (base === null || tuning.length !== 4) return false;
  const open = STANDARD_OPEN_MIDI.map(
    (pitch, string) => pitch + tuning[string],
  );
  return chart.notes.every((note) => {
    if (note.bar !== bar) return true;
    const pitch = note.midi + semitones + base + octave * 12;
    return open.some((string) => pitch >= string && pitch <= string + 24);
  });
}

/** The bars with the same notes at the same beats as `bar`, `bar` included. */
export function barsLike(chart: BassChart, bar: number): number[] {
  const texts = new Map<number, string>();
  for (const note of chart.notes) {
    texts.set(
      note.bar,
      `${texts.get(note.bar) ?? ''}${note.beatInBar}:${note.midi};`,
    );
  }
  const text = texts.get(bar);
  if (text === undefined) return [bar];
  const beats = chart.bars[bar]?.beatCount;
  return chart.bars
    .filter(
      (item) => item.beatCount === beats && texts.get(item.index) === text,
    )
    .map((item) => item.index);
}

/**
 * A practice view of the original import; timing and saved bytes stay intact.
 * A bar octave moves the notes of one bar; a bar whose notes then leave the
 * neck plays as written. With no transposition, only the moved bars get a new
 * fingering.
 */
export function transposeBassChart(
  chart: BassChart,
  semitones: number,
  tuning: number[] = chart.tuning,
  barOctaves: BarOctaves = NO_BAR_OCTAVES,
): BassChart {
  const sameTuning =
    tuning.length === chart.tuning.length &&
    tuning.every((offset, string) => offset === chart.tuning[string]);
  const moved = new Map<number, number>();
  for (const [bar, octave] of Object.entries(barOctaves)) {
    if (
      octave !== 0 &&
      chart.notes.some((note) => note.bar === Number(bar)) &&
      barOctaveFits(chart, Number(bar), octave, semitones, tuning)
    )
      moved.set(Number(bar), octave);
  }
  const lineChanges = semitones !== 0 || !sameTuning;
  if (!lineChanges && moved.size === 0) return chart;
  if (lineChanges && !supportsBassTransposition(chart)) return chart;
  const octaveOffset = lineChanges
    ? playableOctaveOffset(chart, semitones, tuning)
    : 0;
  if (octaveOffset === null) {
    throw new RangeError('Transposition outside the selected bass tuning');
  }
  const open = STANDARD_OPEN_MIDI.map(
    (pitch, string) => pitch + tuning[string],
  );
  const pitched = chart.notes.map((note) => ({
    pitch:
      note.midi + semitones + octaveOffset + (moved.get(note.bar) ?? 0) * 12,
    time: note.time,
  }));
  const fingering: ({ string: number; fret: number } | null)[] = lineChanges
    ? suggestFingering(pitched, open)
    : chart.notes.map(() => null);
  if (!lineChanges) {
    // Each run of moved notes gets its own fingering; the rest stays.
    let start = 0;
    while (start < chart.notes.length) {
      if (!moved.has(chart.notes[start].bar)) {
        start += 1;
        continue;
      }
      let end = start;
      while (end < chart.notes.length && moved.has(chart.notes[end].bar))
        end += 1;
      suggestFingering(pitched.slice(start, end), open).forEach(
        (position, index) => {
          fingering[start + index] = position;
        },
      );
      start = end;
    }
  }
  return {
    ...chart,
    tuning,
    notes: chart.notes.map((note, index) => {
      const position = fingering[index];
      if (!position) return note;
      const slide =
        note.slideToFret === null
          ? null
          : note.slideToFret + position.fret - note.fret;
      return {
        ...note,
        ...position,
        midi: pitched[index].pitch,
        slideToFret:
          lineChanges || slide === null
            ? note.slideToFret
            : slide >= 0 && slide <= 24
              ? slide
              : null,
      };
    }),
  };
}
