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

/** The same root with the other third: `Dm` for `D`, `D` for `Dm`. */
export function otherQualityCell({ ring, position }: CircleCell): CircleCell {
  return ring === 'major'
    ? { ring: 'minor', position: mod12(position - 3) }
    : { ring: 'major', position: mod12(position + 3) };
}

const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const LETTER_PITCH = [0, 2, 4, 5, 7, 9, 11];

/**
 * The minor and major third above a spelled root, two letters up: `F` and
 * `F#` above `D`, `Db` and `D` above `Bb`.
 */
export function thirdNames(root: string): { minor: string; major: string } {
  const letter = LETTERS.indexOf(root[0]);
  const accidental = [...root.slice(1)].reduce(
    (sum, sign) => sum + (sign === '#' ? 1 : sign === 'b' ? -1 : 0),
    0,
  );
  const rootPitch = LETTER_PITCH[letter] + accidental;
  const thirdLetter = (letter + 2) % 7;
  const spell = (interval: number) => {
    let offset = mod12(rootPitch + interval - LETTER_PITCH[thirdLetter]);
    if (offset > 6) offset -= 12;
    const signs = offset > 0 ? '#'.repeat(offset) : 'b'.repeat(-offset);
    return `${LETTERS[thirdLetter]}${signs}`;
  };
  return { minor: spell(3), major: spell(4) };
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

/**
 * pt-BR note on how sure the circle is of a chord's quality, from the third
 * the bass played. With no third, or both, the ring is a guess: the key's
 * reading when `fromKey`, else just the default.
 */
export function describeThird(
  root: string,
  third: 'minor' | 'major' | 'both' | null,
  minor: boolean,
  fromKey: boolean,
): string {
  const names = thirdNames(root);
  if (third === 'minor' || third === 'major') {
    return `O baixo tocou a terça ${names[third]}: acorde ${third === 'minor' ? 'menor' : 'maior'}, confirmado.`;
  }
  const guess = `${root}${minor ? 'm' : ''}`;
  const other = `${root}${minor ? '' : 'm'}`;
  const why =
    third === 'both'
      ? `O baixo tocou as duas terças (${names.minor} e ${names.major})`
      : 'O baixo não tocou a terça';
  return `${why}, então ${guess}? é ${fromKey ? 'um palpite pelo tom' : 'só um palpite'}. Com ${names[minor ? 'minor' : 'major']} é ${guess}; com ${names[minor ? 'major' : 'minor']} seria ${other} (pontilhado).`;
}
