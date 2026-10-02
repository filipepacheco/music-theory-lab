import { CHORD_TYPES } from '@/constants/chords';
import { NOTE_NAMES } from '@/constants/notes';
import type { BassChart, BassChartNote } from '@/domain/bassChart';

// Reads the harmony a bass line implies, bar by bar. Everything here comes
// from the bass notes alone, so it states only what the bass shows: the root
// is the note heard on the downbeat, and a chord quality is named only when
// the notes actually played leave a single reading in the chord vocabulary.
// Theory rules follow the project's music-theory reference; `§n` cites it.

/**
 * How a note behaves in the line (§12.1–12.2). Only `chordTone` notes count
 * as evidence of the bar's harmony; the ornaments pass through it.
 */
export type NoteRole =
  | 'chordTone'
  | 'passing'
  | 'neighbor'
  | 'approach'
  | 'anticipation'
  | 'dead';

/** What a note is to the bar's root once the bar's quality is read. */
export type DegreeCategory =
  | 'root'
  | 'third'
  | 'fifth'
  | 'seventh'
  | 'tension'
  | 'ornament';

export const DEGREE_CATEGORIES: DegreeCategory[] = [
  'root',
  'third',
  'fifth',
  'seventh',
  'tension',
  'ornament',
];

/**
 * Where the bar's root came from: a note on the downbeat, a note from the
 * previous bar still sounding across the bar line (a tie or a pushed
 * anticipation), or — with neither — the bar's strongest-placed note.
 */
export type RootSource = 'downbeat' | 'tied' | 'estimated';

export interface AnalyzedNote {
  /** Position in `chart.notes`. */
  index: number;
  /** Sounding pitch, or null for a dead note. */
  midi: number | null;
  /** Semitones above the bar's root, 0–11; null without a pitch or root. */
  interval: number | null;
  role: NoteRole;
  category: DegreeCategory | null;
}

export interface ChordEvidence {
  /** Distinct intervals above the root heard as harmony, ascending. */
  intervals: number[];
  third: 'minor' | 'major' | 'both' | null;
  fifth: 'diminished' | 'perfect' | 'augmented' | null;
  seventh: 'diminished' | 'minor' | 'major' | 'both' | null;
  /** A `CHORD_TYPES` key, only when the notes played allow one reading. */
  chordType: string | null;
}

export interface MelodicMotion {
  /** Same pitch as the previous note. */
  repeats: number;
  /** One or two semitones: grau conjunto (§12.1). */
  steps: number;
  leaps: number;
}

export interface BarAnalysis {
  bar: number;
  /** Pitch class, 0–11. */
  root: number | null;
  rootSource: RootSource | null;
  /** The bar's notes, in chart order. */
  notes: AnalyzedNote[];
  evidence: ChordEvidence;
  counts: Record<DegreeCategory, number>;
  motion: MelodicMotion;
}

export interface AnalysisSummary {
  counts: Record<DegreeCategory, number>;
  motion: MelodicMotion;
}

/**
 * Semitones above the open string that a natural harmonic sounds, by the
 * fret it is played over: the node splits the string into 1/2, 1/3, 1/4, 1/5
 * or 1/6, sounding that partial. The chart's `midi` is the fretted pitch.
 */
const HARMONIC_SEMITONES: Record<number, number> = {
  3: 31,
  4: 28,
  5: 24,
  7: 19,
  9: 28,
  12: 12,
  16: 28,
  19: 19,
  24: 24,
};

/** The pitch a note sounds, or null for a dead (muted) note. */
export function soundingMidi(note: BassChartNote): number | null {
  if (note.techniques.includes('mute')) return null;
  if (note.techniques.includes('harmonic')) {
    const above = HARMONIC_SEMITONES[note.fret];
    if (above !== undefined) return note.midi - note.fret + above;
  }
  return note.midi;
}

/** One onset of the bass line: its lowest sounding note. */
interface LineNote {
  index: number;
  note: BassChartNote;
  midi: number;
  level: MetricLevel;
}

/**
 * 0 = downbeat, 1 = the other strong beat (beat 3 of 4/4), 2 = a weak beat,
 * 3 = off the beat. Chord tones sit on 0–1, ornaments on 2–3 (§12.1).
 */
type MetricLevel = 0 | 1 | 2 | 3;

function metricLevel(beatInBar: number, beatCount: number): MetricLevel {
  if (beatInBar === 0) return 0;
  if (!Number.isInteger(beatInBar)) return 3;
  if (beatCount >= 4 && beatCount % 2 === 0 && beatInBar === beatCount / 2) {
    return 1;
  }
  return 2;
}

function pitchClass(midi: number): number {
  return ((midi % 12) + 12) % 12;
}

function isStep(semitones: number): boolean {
  const size = Math.abs(semitones);
  return size === 1 || size === 2;
}

export function analyzeBassChart(chart: BassChart): BarAnalysis[] {
  const sounding = chart.notes.map(soundingMidi);
  const beatSeconds = chart.bars.map(
    (bar) => (bar.endTime - bar.startTime) / bar.beatCount,
  );
  const line = bassLine(chart, sounding);
  const lineByBar = chart.bars.map(() => [] as LineNote[]);
  line.forEach((entry) => lineByBar[entry.note.bar]?.push(entry));

  const linePosition = new Map(line.map((entry, i) => [entry.index, i]));
  // Line notes are in time order, so bars are too: the note before a bar's
  // first line note is the last one sounding into it.
  let firstInBar = 0;
  const roots = chart.bars.map((_, bar) => {
    while (firstInBar < line.length && line[firstInBar].note.bar < bar) {
      firstInBar += 1;
    }
    return inferRoot(
      chart,
      bar,
      lineByBar[bar],
      line[firstInBar - 1] ?? null,
      beatSeconds[bar],
    );
  });

  const roles: NoteRole[] = chart.notes.map((_, index) => {
    if (sounding[index] === null) return 'dead';
    const position = linePosition.get(index);
    // The upper note of a double stop sounds with the line: harmony.
    if (position === undefined) return 'chordTone';
    return lineRole(chart, line, position, roots, beatSeconds);
  });

  const notesInBar = chart.bars.map(() => [] as number[]);
  chart.notes.forEach((note, index) => notesInBar[note.bar]?.push(index));

  return chart.bars.map((_, bar) => {
    const { root, source } = roots[bar];
    const indexes = notesInBar[bar];
    const intervalOf = (index: number): number | null => {
      const midi = sounding[index];
      return midi === null || root === null ? null : pitchClass(midi - root);
    };
    const harmonic = indexes
      .filter((index) => roles[index] === 'chordTone')
      .map(intervalOf)
      .filter((interval): interval is number => interval !== null);
    const evidence = readEvidence(root === null ? [] : [0, ...harmonic]);
    const notes = indexes.map((index): AnalyzedNote => {
      const interval = intervalOf(index);
      return {
        index,
        midi: sounding[index],
        interval,
        role: roles[index],
        category: categorize(roles[index], interval, evidence),
      };
    });
    return {
      bar,
      root,
      rootSource: source,
      notes,
      evidence,
      counts: countCategories(notes),
      motion: barMotion(line, lineByBar[bar], linePosition, bar),
    };
  });
}

/** The lowest sounding note at each onset, in time order. */
function bassLine(chart: BassChart, sounding: (number | null)[]): LineNote[] {
  const line: LineNote[] = [];
  chart.notes.forEach((note, index) => {
    const midi = sounding[index];
    if (midi === null) return;
    const last = line[line.length - 1];
    if (last && last.note.time === note.time) {
      if (midi < last.midi) {
        line[line.length - 1] = { ...last, index, note, midi };
      }
      return;
    }
    const beatCount = chart.bars[note.bar]?.beatCount ?? 4;
    line.push({
      index,
      note,
      midi,
      level: metricLevel(note.beatInBar, beatCount),
    });
  });
  return line;
}

interface InferredRoot {
  root: number | null;
  source: RootSource | null;
}

function inferRoot(
  chart: BassChart,
  bar: number,
  own: LineNote[],
  before: LineNote | null,
  beatSeconds: number,
): InferredRoot {
  const first = own[0];
  if (first?.level === 0) {
    return { root: pitchClass(first.midi), source: 'downbeat' };
  }
  // The last line note before this bar, if it is still ringing a quarter
  // beat past the bar line, is the bass the bar starts on.
  const barStart = chart.bars[bar].startTime;
  if (
    before &&
    before.note.time + before.note.sustain > barStart + beatSeconds / 4
  ) {
    return { root: pitchClass(before.midi), source: 'tied' };
  }
  if (own.length === 0) return { root: null, source: null };
  const strongest = own.reduce((best, entry) =>
    entry.level < best.level ? entry : best,
  );
  return { root: pitchClass(strongest.midi), source: 'estimated' };
}

/**
 * The role of the line note at `position`. A note on a strong beat, or held
 * for two beats or more, is structural; weak-beat notes are ornaments when
 * their neighbours make them one (§12.2), otherwise arpeggiated chord tones.
 */
function lineRole(
  chart: BassChart,
  line: LineNote[],
  position: number,
  roots: InferredRoot[],
  beatSeconds: number[],
): NoteRole {
  const current = line[position];
  const { note } = current;
  const beat = beatSeconds[note.bar];
  if (current.level <= 1 || note.sustain >= 2 * beat) return 'chordTone';

  // Neighbours more than two beats away are across a rest, not a line.
  const prevEntry = line[position - 1];
  const nextEntry = line[position + 1];
  const prev =
    prevEntry && note.time - prevEntry.note.time <= 2 * beat ? prevEntry : null;
  const next =
    nextEntry && nextEntry.note.time - note.time <= 2 * beat ? nextEntry : null;

  // Antecipação: the next bar's root, played in the last half beat.
  const ownRoot = roots[note.bar].root;
  const nextRoot = roots[note.bar + 1]?.root ?? null;
  const beatCount = chart.bars[note.bar].beatCount;
  const pc = pitchClass(current.midi);
  if (
    note.beatInBar >= beatCount - 0.5 &&
    nextRoot !== null &&
    pc === nextRoot &&
    pc !== ownRoot
  ) {
    return 'anticipation';
  }
  // The bar's own root is a chord tone wherever it falls, even when it also
  // leads by step into the next bar (B♭ on beat 4 of a B♭ bar before A).
  if (pc === ownRoot) return 'chordTone';

  // Aproximação cromática (§12.3): a half step into the next downbeat, or
  // from off the beat into a note on the beat.
  if (next && Math.abs(next.midi - current.midi) === 1) {
    const intoDownbeat =
      next.note.bar === note.bar + 1 && next.note.beatInBar === 0;
    const intoBeat =
      current.level === 3 && next.level <= 2 && next.note.bar === note.bar;
    if (intoDownbeat || intoBeat) return 'approach';
  }

  if (prev && next) {
    const inbound = current.midi - prev.midi;
    const outbound = next.midi - current.midi;
    if (!isStep(inbound)) return 'chordTone';
    if (isStep(outbound) && Math.sign(inbound) === Math.sign(outbound)) {
      return 'passing';
    }
    if (next.midi === prev.midi) return 'neighbor';
  }
  return 'chordTone';
}

/**
 * Chord slots from the intervals heard as harmony. A tritone is the fifth
 * only over a minor third (b5 of a diminished chord), a minor sixth only over
 * a major third (#5), a major sixth only over a diminished triad (bb7);
 * otherwise they are tensions (#11, b13, 13). Also pools the evidence of a
 * chord held over several bars.
 */
export function readEvidence(harmonic: number[]): ChordEvidence {
  const intervals = [...new Set(harmonic)].sort((a, b) => a - b);
  const has = (interval: number) => intervals.includes(interval);
  if (intervals.length === 0) {
    return {
      intervals,
      third: null,
      fifth: null,
      seventh: null,
      chordType: null,
    };
  }

  const third =
    has(3) && has(4) ? 'both' : has(4) ? 'major' : has(3) ? 'minor' : null;
  const fifth = has(7)
    ? 'perfect'
    : third === 'minor' && has(6)
      ? 'diminished'
      : third === 'major' && has(8)
        ? 'augmented'
        : null;
  const seventh =
    has(10) && has(11)
      ? 'both'
      : has(11)
        ? 'major'
        : has(10)
          ? 'minor'
          : fifth === 'diminished' && has(9)
            ? 'diminished'
            : null;
  return {
    intervals,
    third,
    fifth,
    seventh,
    chordType: chordTypeOf(third, fifth, seventh),
  };
}

/**
 * The single `CHORD_TYPES` entry the slots allow, or null. A missing slot is
 * unknown, not absent: a major third alone could be major or augmented, so
 * it names nothing. A major third with a minor seventh is the dominant's
 * tritone (§3.2) and names a 7 chord even without the fifth.
 */
function chordTypeOf(
  third: ChordEvidence['third'],
  fifth: ChordEvidence['fifth'],
  seventh: ChordEvidence['seventh'],
): string | null {
  if (third === 'major') {
    if (seventh === 'major') return fifth === 'augmented' ? null : 'maj7';
    if (seventh === 'minor') return fifth === 'augmented' ? null : 'dom7';
    if (seventh !== null) return null;
    if (fifth === 'perfect') return 'major';
    if (fifth === 'augmented') return 'aug';
    return null;
  }
  if (third === 'minor') {
    if (seventh === 'diminished') return 'dim7';
    if (seventh === 'minor') {
      if (fifth === 'perfect') return 'min7';
      if (fifth === 'diminished') return 'halfDim7';
      return null;
    }
    if (seventh !== null) return null;
    if (fifth === 'perfect') return 'minor';
    if (fifth === 'diminished') return 'dim';
    return null;
  }
  return null;
}

function categorize(
  role: NoteRole,
  interval: number | null,
  evidence: ChordEvidence,
): DegreeCategory | null {
  if (role === 'dead' || interval === null) return null;
  if (role !== 'chordTone') return 'ornament';
  switch (interval) {
    case 0:
      return 'root';
    case 3:
    case 4:
      return 'third';
    case 7:
      return 'fifth';
    case 6:
      return evidence.fifth === 'diminished' ? 'fifth' : 'tension';
    case 8:
      return evidence.fifth === 'augmented' ? 'fifth' : 'tension';
    case 10:
    case 11:
      return 'seventh';
    case 9:
      return evidence.seventh === 'diminished' ? 'seventh' : 'tension';
    default:
      return 'tension';
  }
}

function emptyCounts(): Record<DegreeCategory, number> {
  return {
    root: 0,
    third: 0,
    fifth: 0,
    seventh: 0,
    tension: 0,
    ornament: 0,
  };
}

function countCategories(
  notes: AnalyzedNote[],
): Record<DegreeCategory, number> {
  const counts = emptyCounts();
  for (const note of notes) {
    if (note.category) counts[note.category] += 1;
  }
  return counts;
}

/** Motion into each line note of the bar from the note before it. */
function barMotion(
  line: LineNote[],
  own: LineNote[],
  linePosition: Map<number, number>,
  bar: number,
): MelodicMotion {
  const motion: MelodicMotion = { repeats: 0, steps: 0, leaps: 0 };
  for (const entry of own) {
    const prev = line[(linePosition.get(entry.index) ?? 0) - 1];
    if (!prev || prev.note.bar < bar - 1) continue;
    const size = Math.abs(entry.midi - prev.midi);
    if (size === 0) motion.repeats += 1;
    else if (size <= 2) motion.steps += 1;
    else motion.leaps += 1;
  }
  return motion;
}

/** Totals over bars `startBar` (inclusive) to `endBar` (exclusive). */
export function summarizeBars(
  bars: BarAnalysis[],
  startBar: number,
  endBar: number,
): AnalysisSummary {
  const counts = emptyCounts();
  const motion: MelodicMotion = { repeats: 0, steps: 0, leaps: 0 };
  for (const bar of bars.slice(startBar, endBar)) {
    for (const category of DEGREE_CATEGORIES) {
      counts[category] += bar.counts[category];
    }
    motion.repeats += bar.motion.repeats;
    motion.steps += bar.motion.steps;
    motion.leaps += bar.motion.leaps;
  }
  return { counts, motion };
}

// ---------------------------------------------------------------- labels

const PLAIN_DEGREES = [
  'R',
  'b2',
  '2',
  'b3',
  '3',
  '4',
  'b5',
  '5',
  'b6',
  '6',
  'b7',
  '7',
];

const TENSION_DEGREES: Record<number, string> = {
  1: 'b9',
  2: '9',
  5: '11',
  6: '#11',
  8: 'b13',
  9: '13',
};

/** Degree of a note over the bar's root, e.g. `b3`, `5`, `#11`, `bb7`. */
export function degreeLabel(note: AnalyzedNote): string {
  return note.interval === null
    ? ''
    : intervalDegreeLabel(note.interval, note.category);
}

/** Degree label for `interval` semitones over a root heard as `category`. */
export function intervalDegreeLabel(
  interval: number,
  category: DegreeCategory | null,
): string {
  if (category === 'fifth') {
    return interval === 6 ? 'b5' : interval === 8 ? '#5' : '5';
  }
  if (category === 'seventh' && interval === 9) return 'bb7';
  if (category === 'tension') {
    return TENSION_DEGREES[interval] ?? PLAIN_DEGREES[interval];
  }
  return PLAIN_DEGREES[interval];
}

/**
 * Chord symbol for a bar or a run of bars, e.g. `G7`, `Bm7(b5)`; the root
 * name alone when the bass does not settle the quality, or null without a
 * root. Spelled with `noteNames`, sharps unless the key calls for flats.
 */
export function barChordSymbol(
  bar: Pick<BarAnalysis, 'root' | 'evidence'>,
  noteNames: readonly string[] = NOTE_NAMES,
): string | null {
  if (bar.root === null) return null;
  const type = bar.evidence.chordType
    ? CHORD_TYPES[bar.evidence.chordType]
    : undefined;
  return `${noteNames[bar.root]}${type?.symbol ?? ''}`;
}

const THIRD_TEXT = {
  minor: '3ª menor',
  major: '3ª maior',
  both: '3ª menor e maior',
} as const;
const FIFTH_TEXT = {
  diminished: '5ª diminuta',
  perfect: '5ª justa',
  augmented: '5ª aumentada',
} as const;
const SEVENTH_TEXT = {
  diminished: '7ª diminuta',
  minor: '7ª menor',
  major: '7ª maior',
  both: '7ª menor e maior',
} as const;

/** pt-BR summary of what the bass played, e.g. `3ª menor · 5ª justa · sem 7ª`. */
export function describeEvidence(evidence: ChordEvidence): string {
  return [
    evidence.third ? THIRD_TEXT[evidence.third] : 'sem 3ª',
    evidence.fifth ? FIFTH_TEXT[evidence.fifth] : 'sem 5ª',
    evidence.seventh ? SEVENTH_TEXT[evidence.seventh] : 'sem 7ª',
  ].join(' · ');
}
