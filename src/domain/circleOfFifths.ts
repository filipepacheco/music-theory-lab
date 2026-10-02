import {
  MAJOR_FIELD,
  MINOR_FIELD,
  type HarmonicFunction,
} from '@/constants/harmonicFields';
import type { MusicalKey } from '@/domain/bassHarmony';

// The circle of fifths as twelve cells, clockwise from C at the top: each
// step clockwise is a fifth up (a fourth down), so V→I and ii–V–I move one
// cell at a time. The outer ring holds major chords; the inner ring holds
// the relative minor under each major, so a key's diatonic chords fill one
// three-cell wedge (§2.2, §14.2: neighbouring keys differ by one accidental).

export type CircleRing = 'major' | 'minor';

export interface CircleCell {
  ring: CircleRing;
  /** 0–11, clockwise from the top. */
  position: number;
}

/** Major keys in circle order, with their usual spellings. */
export const MAJOR_RING = [
  'C',
  'G',
  'D',
  'A',
  'E',
  'B',
  'F#',
  'Db',
  'Ab',
  'Eb',
  'Bb',
  'F',
];

/** The relative minor under each major. */
export const MINOR_RING = [
  'Am',
  'Em',
  'Bm',
  'F#m',
  'C#m',
  'G#m',
  'Ebm',
  'Bbm',
  'Fm',
  'Cm',
  'Gm',
  'Dm',
];

function mod12(n: number): number {
  return ((n % 12) + 12) % 12;
}

/** Circle position of a pitch class: seven semitones per step. */
export function fifthsPosition(pitchClass: number): number {
  return mod12(pitchClass * 7);
}

/**
 * Where a chord sits: major chords (and chords whose quality is unknown) on
 * the outer ring at their root; minor and diminished chords on the inner
 * ring, under their relative major a minor third above.
 */
export function chordCell(root: number, minor: boolean): CircleCell {
  return minor
    ? { ring: 'minor', position: fifthsPosition(root + 3) }
    : { ring: 'major', position: fifthsPosition(root) };
}

const MINOR_CHORD_TYPES = new Set(['minor', 'min7', 'dim', 'halfDim7', 'dim7']);

/** True when a `CHORD_TYPES` key has a minor third. */
export function isMinorChordType(chordType: string | null): boolean {
  return chordType !== null && MINOR_CHORD_TYPES.has(chordType);
}

export interface CircleDegree extends CircleCell {
  numeral: string;
  func: HarmonicFunction;
}

/** The key's harmonic field placed on the circle, one cell per degree. */
export function keyDegreesOnCircle(key: MusicalKey): CircleDegree[] {
  const field = key.mode === 'major' ? MAJOR_FIELD : MINOR_FIELD;
  return field.map((degree) => ({
    ...chordCell(
      key.tonic + degree.scaleInterval,
      isMinorChordType(degree.chordType),
    ),
    numeral: degree.romanNumeral,
    func: degree.harmonicFunction,
  }));
}

/** Clockwise steps from `from` to `to`, folded to -6…+6 (+ = fifth up). */
export function circleSteps(from: number, to: number): number {
  const steps = mod12(fifthsPosition(to) - fifthsPosition(from));
  return steps > 6 ? steps - 12 : steps;
}

/**
 * pt-BR description of a root move on the circle, e.g. `A → D: um passo
 * anti-horário, uma quarta acima (como V→I)`.
 */
export function describeRootMotion(
  from: number,
  to: number,
  noteNames: readonly string[],
): string {
  const move = `${noteNames[mod12(from)]} → ${noteNames[mod12(to)]}`;
  const steps = circleSteps(from, to);
  if (steps === -1) {
    return `${move}: um passo anti-horário, uma quarta acima (como V→I)`;
  }
  if (steps === 1) {
    return `${move}: um passo horário, uma quinta acima (como I→V)`;
  }
  if (Math.abs(steps) === 6) return `${move}: trítono, o lado oposto do ciclo`;
  return `${move}: ${Math.abs(steps)} passos no sentido ${steps > 0 ? 'horário' : 'anti-horário'}`;
}
