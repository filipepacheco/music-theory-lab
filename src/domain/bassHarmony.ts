import { CHORD_TYPES } from '@/constants/chords';
import {
  MAJOR_FIELD,
  MINOR_FIELD,
  type DegreeTemplate,
  type HarmonicFunction,
} from '@/constants/harmonicFields';
import { FLAT_KEYS, NOTE_NAMES, NOTE_NAMES_FLAT } from '@/constants/notes';
import { SCALE_PATTERNS } from '@/constants/scales';
import {
  readEvidence,
  type BarAnalysis,
  type ChordEvidence,
} from '@/domain/bassAnalysis';
import type { BassChart } from '@/domain/bassChart';
import { getPreferredRootName } from '@/utils/noteHelpers';

// Places the bar roots read by `bassAnalysis` in a key: suggests the key,
// names each chord's degree and function, and finds cadences and common
// progressions. The bass rarely proves a chord's quality, so a root on a
// degree of the harmonic field keeps the field's quality unless a third,
// fifth or seventh the bass played contradicts it; only then is the chord
// read as a secondary dominant, SubV, diminished or borrowed chord.
// Rules cite the music-theory reference (§n).

export type KeyMode = 'major' | 'minor';

export interface MusicalKey {
  /** Pitch class of the tonic, 0–11. */
  tonic: number;
  mode: KeyMode;
}

export interface KeyEvidence {
  /** Share of bars with a root whose root is the tonic. */
  tonicBars: number;
  /** Share of sections whose first chord is on the tonic. */
  sectionStarts: number;
  /** Share of sections whose last chord is on the tonic. */
  sectionEnds: number;
  /** Chord changes from the fifth degree into the tonic, of any quality. */
  dominantArrivals: number;
  endsOnTonic: boolean;
  /** Share of sounding notes inside the key's scale. */
  scaleFit: number;
}

export interface KeySuggestion extends MusicalKey {
  score: number;
  evidence: KeyEvidence;
}

export type HarmonyKind =
  | 'diatonic'
  | 'secondaryDominant'
  | 'subV'
  | 'passingDiminished'
  | 'borrowed'
  | 'chromatic';

export interface SegmentHarmony {
  /** Roman numeral, e.g. `ii`, `V7/vi`, `bVII`, `#i°`. */
  numeral: string;
  func: HarmonicFunction | null;
  kind: HarmonyKind;
  /** pt-BR explanation, e.g. `Dominante secundária de vi`. */
  detail: string;
  /**
   * True when the bass played the third that the reading needs; false when
   * the quality is the harmonic field's, assumed from the root alone.
   */
  confirmed: boolean;
  /** Intervals over the root that are avoid notes on this degree (§8). */
  avoid: number[];
}

/** One chord: a run of consecutive bars on the same root. */
export interface HarmonicSegment {
  startBar: number;
  /** Exclusive. */
  endBar: number;
  root: number;
  /** Semitones from the tonic to the root. */
  fromTonic: number;
  /** The evidence of every bar in the run, pooled. */
  evidence: ChordEvidence;
  harmony: SegmentHarmony;
}

export type HarmonicEventKind =
  | 'twoFiveOne'
  | 'authentic'
  | 'modal'
  | 'plagal'
  | 'deceptive'
  | 'half'
  | 'phrygianBass'
  | 'progression'
  | 'blues';

export interface HarmonicEvent {
  kind: HarmonicEventKind;
  label: string;
  startBar: number;
  /** Exclusive. */
  endBar: number;
}

export interface HarmonyAnalysis {
  key: MusicalKey;
  segments: HarmonicSegment[];
  /** Index into `segments` for each bar, or -1 for a bar without a root. */
  barSegments: number[];
  /** Chart note indexes of prominent notes that are avoid notes (§8.6). */
  avoidNotes: Set<number>;
  events: HarmonicEvent[];
}

const FIELDS: Record<KeyMode, DegreeTemplate[]> = {
  major: MAJOR_FIELD,
  minor: MINOR_FIELD,
};

/** Below this share of the bars a root is not a credible tonic. */
const MIN_TONIC_SHARE = 0.1;

const MAJOR_SCALE = SCALE_PATTERNS.major.intervals;
/** Natural minor plus the raised seventh its V7 borrows (§2.3). */
const MINOR_SCALE = [...SCALE_PATTERNS.aeolian.intervals, 11];

function mod12(n: number): number {
  return ((n % 12) + 12) % 12;
}

function share(part: number, total: number): number {
  return total > 0 ? part / total : 0;
}

type RootedBar = BarAnalysis & { root: number };

function rootedBars(bars: BarAnalysis[]): RootedBar[] {
  return bars.filter((bar): bar is RootedBar => bar.root !== null);
}

/** Consecutive root pairs where the root changes, in bar order. */
function rootChanges(rooted: RootedBar[]): [number, number][] {
  const changes: [number, number][] = [];
  rooted.forEach((bar, i) => {
    const prev = rooted[i - 1];
    if (prev && prev.root !== bar.root) changes.push([prev.root, bar.root]);
  });
  return changes;
}

/**
 * Keys ranked by where the bass rests, not just which notes it uses: a
 * scale collection fits its relative major and minor equally, so the tonic
 * is chosen by the share of bars on it, how sections start and end,
 * arrivals from the fifth degree and (at half weight, one chord being one
 * data point) the final chord; the notes' fit to the scale breaks ties. A
 * tonic under `MIN_TONIC_SHARE` of the bars ranks below every other: rarely
 * heard, it is evidence against itself. The mode follows the third the bass
 * plays over the tonic, else the scale.
 */
export function suggestKeys(
  chart: BassChart,
  bars: BarAnalysis[],
  limit = 3,
): KeySuggestion[] {
  const rooted = rootedBars(bars);
  if (rooted.length === 0) return [];

  const notePitches = Array<number>(12).fill(0);
  let noteTotal = 0;
  for (const bar of bars) {
    for (const note of bar.notes) {
      if (note.midi === null) continue;
      notePitches[mod12(note.midi)] += 1;
      noteTotal += 1;
    }
  }
  const fit = (tonic: number, scale: number[]) =>
    share(
      scale.reduce((sum, i) => sum + notePitches[mod12(tonic + i)], 0),
      noteTotal,
    );

  const changes = rootChanges(rooted);
  const sectionEdges = chart.sections
    .map((section) =>
      rooted.filter(
        (bar) => bar.bar >= section.startBar && bar.bar < section.endBar,
      ),
    )
    .filter((inSection) => inSection.length > 0)
    .map((inSection) => [
      inSection[0].root,
      inSection[inSection.length - 1].root,
    ]);
  const lastRoot = rooted[rooted.length - 1].root;

  const suggestions = Array.from({ length: 12 }, (_, tonic) => {
    const onTonic = rooted.filter((bar) => bar.root === tonic);
    const majors = onTonic.filter((b) => b.evidence.third === 'major').length;
    const minors = onTonic.filter((b) => b.evidence.third === 'minor').length;
    const majorFit = fit(tonic, MAJOR_SCALE);
    const minorFit = fit(tonic, MINOR_SCALE);
    const mode: KeyMode =
      majors !== minors
        ? majors > minors
          ? 'major'
          : 'minor'
        : majorFit >= minorFit
          ? 'major'
          : 'minor';
    const dominant = mod12(tonic + 7);
    const evidence: KeyEvidence = {
      tonicBars: share(onTonic.length, rooted.length),
      sectionStarts: share(
        sectionEdges.filter(([first]) => first === tonic).length,
        sectionEdges.length,
      ),
      sectionEnds: share(
        sectionEdges.filter(([, last]) => last === tonic).length,
        sectionEdges.length,
      ),
      dominantArrivals: changes.filter(
        ([from, to]) => to === tonic && from === dominant,
      ).length,
      endsOnTonic: lastRoot === tonic,
      scaleFit: mode === 'major' ? majorFit : minorFit,
    };
    const score =
      evidence.tonicBars +
      evidence.sectionStarts +
      evidence.sectionEnds +
      share(evidence.dominantArrivals, changes.length) +
      (evidence.endsOnTonic ? 0.5 : 0) +
      evidence.scaleFit;
    return { tonic, mode, score, evidence };
  });
  const plausible = (s: KeySuggestion) =>
    s.evidence.tonicBars >= MIN_TONIC_SHARE ? 1 : 0;
  return suggestions
    .sort((a, b) => plausible(b) - plausible(a) || b.score - a.score)
    .slice(0, limit);
}

/**
 * Degree, function, cadences and progressions of the chart in `key`.
 * Chords are runs of bars on one root, split where a section starts.
 */
export function analyzeHarmony(
  chart: BassChart,
  bars: BarAnalysis[],
  key: MusicalKey,
): HarmonyAnalysis {
  const sectionStarts = new Set(chart.sections.map((s) => s.startBar));
  const runs = buildRuns(bars, sectionStarts);
  const segments: HarmonicSegment[] = runs.map((run, i) => {
    // Resolution and approach look past a split that kept the same root.
    const prev = runs
      .slice(0, i)
      .reverse()
      .find((r) => r.root !== run.root);
    const next = runs.slice(i + 1).find((r) => r.root !== run.root);
    const fromTonic = mod12(run.root - key.tonic);
    return {
      ...run,
      fromTonic,
      harmony: classify(run, fromTonic, prev ?? null, next ?? null, key),
    };
  });

  const barSegments = bars.map(() => -1);
  segments.forEach((segment, index) => {
    for (let bar = segment.startBar; bar < segment.endBar; bar += 1) {
      if (bars[bar].root !== null) barSegments[bar] = index;
    }
  });

  const avoidNotes = new Set<number>();
  bars.forEach((bar, index) => {
    const segment = segments[barSegments[index]];
    if (!segment) return;
    for (const note of bar.notes) {
      if (
        note.category === 'tension' &&
        note.interval !== null &&
        segment.harmony.avoid.includes(note.interval)
      ) {
        avoidNotes.add(note.index);
      }
    }
  });

  return {
    key,
    segments,
    barSegments,
    avoidNotes,
    events: findEvents(segments, bars, barSegments, sectionStarts, key),
  };
}

interface Run {
  startBar: number;
  endBar: number;
  root: number;
  evidence: ChordEvidence;
}

function buildRuns(bars: BarAnalysis[], sectionStarts: Set<number>): Run[] {
  const runs: (Run & { intervals: number[] })[] = [];
  let open = false;
  for (const bar of bars) {
    if (bar.root === null) {
      open = false;
      continue;
    }
    const last = runs[runs.length - 1];
    if (
      open &&
      last.root === bar.root &&
      last.endBar === bar.bar &&
      !sectionStarts.has(bar.bar)
    ) {
      last.endBar = bar.bar + 1;
      last.intervals.push(...bar.evidence.intervals);
    } else {
      runs.push({
        startBar: bar.bar,
        endBar: bar.bar + 1,
        root: bar.root,
        evidence: bar.evidence,
        intervals: [...bar.evidence.intervals],
      });
      open = true;
    }
  }
  return runs.map(({ intervals, ...run }) => ({
    ...run,
    evidence: readEvidence(intervals),
  }));
}

/** True when a slot the bass played differs from the chord type's. */
function contradicts(evidence: ChordEvidence, chordType: string): boolean {
  const expected = readEvidence(CHORD_TYPES[chordType].intervals);
  const clash = (played: string | null, wanted: string | null) =>
    played !== null && played !== 'both' && played !== wanted;
  return (
    clash(evidence.third, expected.third) ||
    clash(evidence.fifth, expected.fifth) ||
    clash(evidence.seventh, expected.seventh)
  );
}

/** Nothing played rules out a dominant 7 chord. */
function couldBeDominant(evidence: ChordEvidence): boolean {
  return !contradicts(evidence, 'dom7');
}

function isDiminished(degree: DegreeTemplate): boolean {
  return degree.chordType === 'halfDim7' || degree.chordType === 'dim7';
}

/**
 * Avoid notes by degree, as intervals over the chord root: a tension a b9
 * above a chord tone (§8.2), per the major field (§8.3) and the minor
 * field's modes (§8.5). The 13 of ii7 is added only in a ii–V (§8.3 note).
 */
const AVOID: Record<KeyMode, Record<number, number[]>> = {
  major: { 0: [5], 2: [], 4: [1, 8], 5: [], 7: [5], 9: [8], 11: [1] },
  minor: { 0: [8], 2: [1], 3: [5], 5: [], 7: [1, 8], 8: [], 10: [5] },
};
/** On a dominant chord only the natural 11 is avoided (§8.2, §8.4). */
const DOMINANT_AVOID = [5];

const FUNCTION_NAMES: Record<HarmonicFunction, string> = {
  T: 'Tônica',
  SD: 'Subdominante',
  D: 'Dominante',
};

interface Borrowing {
  fromTonic: number;
  numeral: (evidence: ChordEvidence) => string;
  func: HarmonicFunction;
  source: string;
  fits: (evidence: ChordEvidence) => boolean;
}

const notMinor = (e: ChordEvidence) => e.third !== 'minor';

/**
 * Borrowed chords (§5.2): the parallel minor's chords in a major key, with
 * the functions they have in the minor field (§2.3); and the other way round
 * (§5.1), the parallel major's IV and I in a minor key.
 */
const BORROWINGS: Record<KeyMode, Borrowing[]> = {
  major: [
    {
      fromTonic: 5,
      numeral: () => 'iv',
      func: 'SD',
      source: 'menor natural',
      fits: (e) => e.third === 'minor',
    },
    {
      fromTonic: 10,
      numeral: () => 'bVII',
      func: 'SD',
      source: 'menor natural / mixolídio',
      fits: notMinor,
    },
    {
      fromTonic: 8,
      numeral: () => 'bVI',
      func: 'SD',
      source: 'menor natural',
      fits: notMinor,
    },
    {
      fromTonic: 3,
      numeral: () => 'bIII',
      func: 'T',
      source: 'menor natural',
      fits: notMinor,
    },
    {
      fromTonic: 2,
      numeral: (e) => (e.seventh === 'minor' ? 'iiø' : 'ii°'),
      func: 'SD',
      source: 'menor harmônica',
      fits: (e) => e.fifth === 'diminished',
    },
    {
      fromTonic: 0,
      numeral: () => 'i',
      func: 'T',
      source: 'menor paralelo',
      fits: (e) => e.third === 'minor',
    },
  ],
  minor: [
    {
      fromTonic: 5,
      numeral: () => 'IV',
      func: 'SD',
      source: 'maior paralelo',
      fits: (e) => e.third === 'major',
    },
    {
      fromTonic: 0,
      numeral: () => 'I',
      func: 'T',
      source: 'maior paralelo',
      fits: (e) => e.third === 'major',
    },
  ],
};

const FLAT_NUMERALS = [
  'I',
  'bII',
  'II',
  'bIII',
  'III',
  'IV',
  '#IV',
  'V',
  'bVI',
  'VI',
  'bVII',
  'VII',
];
const SHARP_NUMERALS = [
  'I',
  '#I',
  'II',
  '#II',
  'III',
  'IV',
  '#IV',
  'V',
  '#V',
  'VI',
  '#VI',
  'VII',
];

/** Numeral for a chromatic root, cased and marked by what the bass played. */
function chromaticNumeral(
  fromTonic: number,
  spelling: 'flat' | 'sharp',
  evidence: ChordEvidence,
): string {
  const base = (spelling === 'sharp' ? SHARP_NUMERALS : FLAT_NUMERALS)[
    fromTonic
  ];
  const numeral = evidence.third === 'minor' ? base.toLowerCase() : base;
  if (evidence.fifth === 'diminished') {
    if (evidence.seventh === 'minor') return `${numeral}ø`;
    return `${numeral}°${evidence.seventh === 'diminished' ? '7' : ''}`;
  }
  if (evidence.third === 'major' && evidence.seventh === 'minor') {
    return `${numeral}7`;
  }
  return numeral;
}

function classify(
  run: Run,
  fromTonic: number,
  prev: Run | null,
  next: Run | null,
  key: MusicalKey,
): SegmentHarmony {
  const { evidence } = run;
  const field = FIELDS[key.mode];
  const fieldAt = (interval: number) =>
    field.find((degree) => degree.scaleInterval === interval);
  const nextFromTonic = next ? mod12(next.root - key.tonic) : null;
  const target = nextFromTonic === null ? undefined : fieldAt(nextFromTonic);
  const intoNext = next ? mod12(next.root - run.root) : null;

  // A minor key takes its V7 and vii°7 from the harmonic minor (§2.3–2.4).
  if (key.mode === 'minor') {
    if (
      fromTonic === 7 &&
      evidence.third === 'major' &&
      couldBeDominant(evidence)
    ) {
      return {
        numeral: evidence.seventh === 'minor' ? 'V7' : 'V',
        func: 'D',
        kind: 'diatonic',
        detail: 'Dominante · V da menor harmônica',
        confirmed: true,
        avoid: DOMINANT_AVOID,
      };
    }
    if (fromTonic === 11 && !contradicts(evidence, 'dim7')) {
      return {
        numeral: 'vii°',
        func: 'D',
        kind: 'diatonic',
        detail: 'Dominante · vii° da menor harmônica',
        confirmed: evidence.fifth === 'diminished',
        avoid: [],
      };
    }
  }

  const degree = fieldAt(fromTonic);
  if (degree && !contradicts(evidence, degree.chordType)) {
    const expected = readEvidence(CHORD_TYPES[degree.chordType].intervals);
    const avoid = [...(AVOID[key.mode][fromTonic] ?? [])];
    if (key.mode === 'major' && fromTonic === 2 && intoNext === 5)
      avoid.push(9);
    return {
      numeral: degree.romanNumeral,
      func: degree.harmonicFunction,
      kind: 'diatonic',
      detail: `${FUNCTION_NAMES[degree.harmonicFunction]} · ${degree.romanNumeral} do campo harmônico`,
      confirmed: evidence.third !== null && evidence.third === expected.third,
      avoid,
    };
  }

  // Dominante secundária (§6.2): a dominant a fifth above a diatonic chord
  // it resolves to; never of a diminished chord, and V/I is just V.
  if (
    intoNext === 5 &&
    target &&
    nextFromTonic !== 0 &&
    !isDiminished(target) &&
    couldBeDominant(evidence) &&
    (evidence.third === 'major' || evidence.seventh === 'minor')
  ) {
    return {
      numeral: `V${evidence.seventh === 'minor' ? '7' : ''}/${target.romanNumeral}`,
      func: 'D',
      kind: 'secondaryDominant',
      detail: `Dominante secundária de ${target.romanNumeral}`,
      confirmed: evidence.third === 'major',
      avoid: DOMINANT_AVOID,
    };
  }

  // SubV (§6.3): a dominant 7 resolving down a half step to its target.
  if (
    intoNext === 11 &&
    target &&
    !isDiminished(target) &&
    couldBeDominant(evidence) &&
    evidence.seventh === 'minor'
  ) {
    return {
      numeral: nextFromTonic === 0 ? 'SubV7' : `SubV7/${target.romanNumeral}`,
      func: 'D',
      kind: 'subV',
      detail: `SubV (substituto de trítono) de ${target.romanNumeral}`,
      confirmed: evidence.third === 'major',
      avoid: DOMINANT_AVOID,
    };
  }

  // Diminuto de passagem ou auxiliar (§7.2): a diminished chord whose root
  // moves by half steps between its neighbours.
  if (
    evidence.fifth === 'diminished' &&
    evidence.third !== 'major' &&
    prev &&
    next
  ) {
    const fromPrev = mod12(run.root - prev.root);
    const ascending = fromPrev === 1 && intoNext === 1;
    const descending = fromPrev === 11 && intoNext === 11;
    const auxiliary = fromPrev === 1 && prev.root === next.root;
    if (ascending || descending || auxiliary) {
      return {
        numeral: chromaticNumeral(
          fromTonic,
          descending ? 'flat' : 'sharp',
          evidence,
        ),
        func: ascending ? 'D' : null,
        kind: 'passingDiminished',
        detail: ascending
          ? 'Diminuto de passagem ascendente'
          : descending
            ? 'Diminuto de passagem descendente'
            : 'Diminuto auxiliar',
        confirmed: true,
        avoid: [],
      };
    }
  }

  const borrowing = BORROWINGS[key.mode].find(
    (b) => b.fromTonic === fromTonic && b.fits(evidence),
  );
  if (borrowing) {
    return {
      numeral: borrowing.numeral(evidence),
      func: borrowing.func,
      kind: 'borrowed',
      detail: `Empréstimo modal (${borrowing.source}) · ${FUNCTION_NAMES[borrowing.func]}`,
      confirmed: evidence.third !== null,
      avoid: [],
    };
  }

  return {
    numeral: chromaticNumeral(fromTonic, 'flat', evidence),
    func: null,
    kind: 'chromatic',
    detail: 'Cromático: fora do campo harmônico',
    confirmed: evidence.third !== null,
    avoid: [],
  };
}

// ---------------------------------------------------------------- events

/** Progressions from §13.1, as semitones from the tonic per chord. */
const PROGRESSIONS: {
  name: string;
  numerals: string;
  mode: KeyMode;
  steps: number[];
}[] = [
  {
    name: 'Pop/Punk',
    numerals: 'I–V–vi–IV',
    mode: 'major',
    steps: [0, 7, 9, 5],
  },
  {
    name: 'Doo-wop',
    numerals: 'I–vi–IV–V',
    mode: 'major',
    steps: [0, 9, 5, 7],
  },
  {
    name: 'Turnaround de jazz',
    numerals: 'I–vi–ii–V',
    mode: 'major',
    steps: [0, 9, 2, 7],
  },
  {
    name: 'Rock modal',
    numerals: 'I–bVII–IV',
    mode: 'major',
    steps: [0, 10, 5],
  },
  {
    name: 'Cadência andaluza',
    numerals: 'i–bVII–bVI–V',
    mode: 'minor',
    steps: [0, 10, 8, 7],
  },
  {
    name: 'Menor épico',
    numerals: 'i–bVI–bIII–bVII',
    mode: 'minor',
    steps: [0, 8, 3, 10],
  },
];

/** 12-bar blues (§13.1), with the quick change to IV in bar 2 allowed. */
const BLUES_BARS = [
  [0],
  [0, 5],
  [0],
  [0],
  [5],
  [5],
  [0],
  [0],
  [7],
  [5],
  [0],
  [0, 7],
];

/** A chain link: a chord change, with section splits of one root merged. */
interface Link {
  segment: HarmonicSegment;
  startBar: number;
  endBar: number;
}

function findEvents(
  segments: HarmonicSegment[],
  bars: BarAnalysis[],
  barSegments: number[],
  sectionStarts: Set<number>,
  key: MusicalKey,
): HarmonicEvent[] {
  const chain: Link[] = [];
  for (const segment of segments) {
    const last = chain[chain.length - 1];
    if (last && last.segment.root === segment.root) {
      last.endBar = segment.endBar;
    } else {
      chain.push({
        segment,
        startBar: segment.startBar,
        endBar: segment.endBar,
      });
    }
  }

  const events: HarmonicEvent[] = [];
  const numeral = (link: Link) => link.segment.harmony.numeral;
  // A dominant needs its major third, the leading tone (§3.2). The major
  // field's V has it, so an unplayed third is assumed major; the natural
  // minor field's v does not (§2.3 note), so in a minor key only a major
  // third the bass actually played makes it V.
  const majorDominant = (link: Link) => {
    const { third, fifth } = link.segment.evidence;
    if (fifth === 'diminished') return false;
    return key.mode === 'major' ? third !== 'minor' : third === 'major';
  };
  const resolvedByTwoFive = new Set<number>();

  chain.forEach((a, i) => {
    const b = chain[i + 1];
    const c = chain[i + 2];
    // ii–V–I (§4.2), or a ii–V into another degree when its V is a proven
    // secondary dominant (§6.2 rule 4).
    if (
      b &&
      c &&
      mod12(b.segment.root - a.segment.root) === 5 &&
      mod12(c.segment.root - b.segment.root) === 5 &&
      a.segment.evidence.third !== 'major'
    ) {
      if (c.segment.fromTonic === 0 && majorDominant(b)) {
        resolvedByTwoFive.add(i + 1);
        const shown = `${numeral(a)}–${numeral(b)}–${numeral(c)}`;
        events.push({
          kind: 'twoFiveOne',
          label: shown === 'ii–V–I' ? 'ii–V–I' : `ii–V–I (${shown})`,
          startBar: a.startBar,
          endBar: c.endBar,
        });
      } else if (b.segment.harmony.kind === 'secondaryDominant') {
        events.push({
          kind: 'twoFiveOne',
          label: `ii–V secundário (${numeral(a)}–${numeral(b)}–${numeral(c)})`,
          startBar: a.startBar,
          endBar: c.endBar,
        });
      }
    }

    if (!b) return;
    const from = a.segment.fromTonic;
    const to = b.segment.fromTonic;
    const pair = { startBar: a.startBar, endBar: b.endBar };
    const arrow = `${numeral(a)}→${numeral(b)}`;
    if (from === 7 && to === 0 && !resolvedByTwoFive.has(i)) {
      // Without the leading tone v→i is a modal cadence, not an authentic one.
      events.push(
        majorDominant(a)
          ? {
              kind: 'authentic',
              label: `Cadência autêntica (${arrow})`,
              ...pair,
            }
          : {
              kind: 'modal',
              label: `Cadência modal (${arrow}, sem sensível)`,
              ...pair,
            },
      );
    } else if (from === 5 && to === 0) {
      events.push({
        kind: 'plagal',
        label: `Cadência plagal (${arrow})`,
        ...pair,
      });
    } else if (
      from === 7 &&
      to === (key.mode === 'major' ? 9 : 8) &&
      majorDominant(a)
    ) {
      events.push({
        kind: 'deceptive',
        label: `Cadência deceptiva (${arrow})`,
        ...pair,
      });
    } else if (
      key.mode === 'minor' &&
      from === 8 &&
      to === 7 &&
      majorDominant(b)
    ) {
      // Both resolve to a major V (§4.1, §15.2); b6 → v is only a step.
      events.push({
        kind: 'phrygianBass',
        label: 'Baixo b6→5: cadência frígia (iv6→V) ou sexta aumentada',
        ...pair,
      });
    }
  });

  // Semicadência: a section's last chord is V and the next one is not I.
  chain.forEach((link, i) => {
    const next = chain[i + 1];
    const endsSection =
      !next ||
      [...sectionStarts].some((s) => s > link.startBar && s <= next.startBar);
    if (
      endsSection &&
      link.segment.fromTonic === 7 &&
      majorDominant(link) &&
      next?.segment.fromTonic !== 0
    ) {
      events.push({
        kind: 'half',
        label: `Semicadência (→${numeral(link)})`,
        startBar: link.startBar,
        endBar: link.endBar,
      });
    }
  });

  for (const progression of PROGRESSIONS) {
    if (progression.mode !== key.mode) continue;
    const { steps } = progression;
    let i = 0;
    while (i + steps.length <= chain.length) {
      let repeats = 0;
      while (
        i + (repeats + 1) * steps.length <= chain.length &&
        steps.every(
          (step, j) =>
            chain[i + repeats * steps.length + j].segment.fromTonic === step,
        )
      ) {
        repeats += 1;
      }
      if (repeats === 0) {
        i += 1;
        continue;
      }
      const end = chain[i + repeats * steps.length - 1];
      events.push({
        kind: 'progression',
        label: `${progression.name} (${progression.numerals})${repeats > 1 ? ` ×${repeats}` : ''}`,
        startBar: chain[i].startBar,
        endBar: end.endBar,
      });
      i += repeats * steps.length;
    }
  }

  const fromTonicAt = (bar: number) =>
    segments[barSegments[bar] ?? -1]?.fromTonic ?? null;
  const isBluesChorus = (start: number) =>
    BLUES_BARS.every((allowed, j) => {
      const step = fromTonicAt(start + j);
      return step !== null && allowed.includes(step);
    });
  let bar = 0;
  while (bar + BLUES_BARS.length <= bars.length) {
    let choruses = 0;
    while (isBluesChorus(bar + choruses * BLUES_BARS.length)) choruses += 1;
    if (choruses === 0) {
      bar += 1;
      continue;
    }
    events.push({
      kind: 'blues',
      label: `Blues de 12 compassos${choruses > 1 ? ` ×${choruses}` : ''}`,
      startBar: bar,
      endBar: bar + choruses * BLUES_BARS.length,
    });
    bar += choruses * BLUES_BARS.length;
  }

  // Inside a named progression its V→I, v→i, IV→I and V→vi are the
  // progression itself, not cadences worth listing on every repeat.
  const patterns = events.filter(
    (e) => e.kind === 'progression' || e.kind === 'blues',
  );
  const explained = (event: HarmonicEvent) =>
    (event.kind === 'authentic' ||
      event.kind === 'modal' ||
      event.kind === 'plagal' ||
      event.kind === 'deceptive') &&
    patterns.some(
      (p) => p.startBar <= event.startBar && event.endBar <= p.endBar,
    );
  return events
    .filter((event) => !explained(event))
    .sort((a, b) => a.startBar - b.startBar);
}

// ---------------------------------------------------------------- labels

/** e.g. `Bb maior`, `F# menor`. */
export function keyLabel(key: MusicalKey): string {
  return `${getPreferredRootName(key.tonic)} ${key.mode === 'major' ? 'maior' : 'menor'}`;
}

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

/** pt-BR reasons a key was suggested, strongest first. */
export function describeKeyEvidence(suggestion: KeySuggestion): string {
  const { evidence } = suggestion;
  const tonic = getPreferredRootName(suggestion.tonic);
  return [
    `${percent(evidence.tonicBars)} dos compassos em ${tonic}`,
    `${percent(evidence.sectionEnds)} das seções terminam em ${tonic}`,
    evidence.dominantArrivals > 0
      ? `${evidence.dominantArrivals} chegada${evidence.dominantArrivals > 1 ? 's' : ''} do 5º grau à tônica`
      : '',
    evidence.endsOnTonic ? `última nota em ${tonic}` : '',
    `${percent(evidence.scaleFit)} das notas na escala`,
  ]
    .filter(Boolean)
    .join(' · ');
}

/**
 * The shortest cycle `items` repeats exactly, e.g. I V vi IV I V vi IV →
 * (I V vi IV) ×2; the items themselves once when they do not repeat.
 */
export function repeatingCycle<T>(
  items: T[],
  same: (a: T, b: T) => boolean,
): { cycle: T[]; repeats: number } {
  for (let size = 1; size <= items.length / 2; size += 1) {
    if (items.length % size !== 0) continue;
    if (items.every((item, i) => same(item, items[i % size]))) {
      return { cycle: items.slice(0, size), repeats: items.length / size };
    }
  }
  return { cycle: items, repeats: 1 };
}

/**
 * Note names for a key: flats for F, Bb, Eb, Ab, Db and Gb major and their
 * relative minors (so D minor has Bb, not A#), sharps otherwise.
 */
export function keyNoteNames(key: MusicalKey): readonly string[] {
  const relativeMajor = key.mode === 'major' ? key.tonic : mod12(key.tonic + 3);
  return FLAT_KEYS.has(getPreferredRootName(relativeMajor))
    ? NOTE_NAMES_FLAT
    : NOTE_NAMES;
}

export interface FieldChord {
  numeral: string;
  /** e.g. `Dm7`, `Bbmaj7`. */
  name: string;
  func: HarmonicFunction;
}

/** The key's harmonic field (§2.2–2.3) as numerals and chord names. */
export function fieldChords(key: MusicalKey): FieldChord[] {
  const names = keyNoteNames(key);
  return FIELDS[key.mode].map((degree) => ({
    numeral: degree.romanNumeral,
    name: `${names[mod12(key.tonic + degree.scaleInterval)]}${CHORD_TYPES[degree.chordType].symbol}`,
    func: degree.harmonicFunction,
  }));
}
