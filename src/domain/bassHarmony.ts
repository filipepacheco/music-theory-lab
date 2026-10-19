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
  intervalDegreeLabel,
  readEvidence,
  type BarAnalysis,
  type ChordEvidence,
  type DegreeCategory,
} from '@/domain/bassAnalysis';
import type { BassChart } from '@/domain/bassChart';
import { getPreferredRootName } from '@/utils/noteHelpers';

export type KeyMode = 'major' | 'minor';

export interface MusicalKey {
  tonic: number;
  mode: KeyMode;
}

export interface KeyEvidence {
  tonicBars: number;
  sectionStarts: number;
  sectionEnds: number;
  dominantArrivals: number;
  endsOnTonic: boolean;
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
  numeral: string;
  func: HarmonicFunction | null;
  kind: HarmonyKind;
  detail: string;
  confirmed: boolean;
  avoid: number[];
  chordType: string | null;
}

export interface HarmonicSegment {
  startBar: number;
  endBar: number;
  root: number;
  fromTonic: number;
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
  endBar: number;
}

export interface HarmonyAnalysis {
  key: MusicalKey;
  segments: HarmonicSegment[];
  barSegments: number[];
  avoidNotes: Set<number>;
  events: HarmonicEvent[];
}

const FIELDS: Record<KeyMode, DegreeTemplate[]> = {
  major: MAJOR_FIELD,
  minor: MINOR_FIELD,
};

const MIN_TONIC_SHARE = 0.1;

const MAJOR_SCALE = SCALE_PATTERNS.major.intervals;
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

function rootChanges(rooted: RootedBar[]): [number, number][] {
  const changes: [number, number][] = [];
  rooted.forEach((bar, i) => {
    const prev = rooted[i - 1];
    if (prev && prev.root !== bar.root) changes.push([prev.root, bar.root]);
  });
  return changes;
}

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

export function analyzeHarmony(
  chart: BassChart,
  bars: BarAnalysis[],
  key: MusicalKey,
): HarmonyAnalysis {
  const sectionStarts = new Set(chart.sections.map((s) => s.startBar));
  const runs = buildRuns(bars, sectionStarts);
  const segments: HarmonicSegment[] = runs.map((run, i) => {
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

function couldBeDominant(evidence: ChordEvidence): boolean {
  return !contradicts(evidence, 'dom7');
}

function isDiminished(degree: DegreeTemplate): boolean {
  return degree.chordType === 'halfDim7' || degree.chordType === 'dim7';
}

const AVOID: Record<KeyMode, Record<number, number[]>> = {
  major: { 0: [5], 2: [], 4: [1, 8], 5: [], 7: [5], 9: [8], 11: [1] },
  minor: { 0: [8], 2: [1], 3: [5], 5: [], 7: [1, 8], 8: [], 10: [5] },
};
const DOMINANT_AVOID = [5];

const FUNCTION_NAMES: Record<HarmonicFunction, string> = {
  T: 'Tônica',
  SD: 'Subdominante',
  D: 'Dominante',
};

interface Borrowing {
  fromTonic: number;
  numeral: (evidence: ChordEvidence) => string;
  chordType: (evidence: ChordEvidence) => string;
  func: HarmonicFunction;
  source: string;
  fits: (evidence: ChordEvidence) => boolean;
}

const notMinor = (e: ChordEvidence) => e.third !== 'minor';

const BORROWINGS: Record<KeyMode, Borrowing[]> = {
  major: [
    {
      fromTonic: 5,
      numeral: () => 'iv',
      chordType: () => 'min7',
      func: 'SD',
      source: 'menor natural',
      fits: (e) => e.third === 'minor',
    },
    {
      fromTonic: 10,
      numeral: () => 'bVII',
      chordType: () => 'dom7',
      func: 'SD',
      source: 'menor natural / mixolídio',
      fits: notMinor,
    },
    {
      fromTonic: 8,
      numeral: () => 'bVI',
      chordType: () => 'maj7',
      func: 'SD',
      source: 'menor natural',
      fits: notMinor,
    },
    {
      fromTonic: 3,
      numeral: () => 'bIII',
      chordType: () => 'maj7',
      func: 'T',
      source: 'menor natural',
      fits: notMinor,
    },
    {
      fromTonic: 2,
      numeral: (e) => (e.seventh === 'minor' ? 'iiø' : 'ii°'),
      chordType: (e) => (e.seventh === 'minor' ? 'halfDim7' : 'dim'),
      func: 'SD',
      source: 'menor harmônica',
      fits: (e) => e.fifth === 'diminished',
    },
    {
      fromTonic: 0,
      numeral: () => 'i',
      chordType: () => 'min7',
      func: 'T',
      source: 'menor paralelo',
      fits: (e) => e.third === 'minor',
    },
  ],
  minor: [
    {
      fromTonic: 5,
      numeral: () => 'IV',
      chordType: () => 'maj7',
      func: 'SD',
      source: 'maior paralelo',
      fits: (e) => e.third === 'major',
    },
    {
      fromTonic: 0,
      numeral: () => 'I',
      chordType: () => 'maj7',
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
        chordType: 'dom7',
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
        chordType: 'dim7',
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
      chordType: degree.chordType,
    };
  }

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
      chordType: 'dom7',
    };
  }

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
      chordType: 'dom7',
    };
  }

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
        chordType: evidence.chordType ?? 'dim7',
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
      chordType: borrowing.chordType(evidence),
    };
  }

  return {
    numeral: chromaticNumeral(fromTonic, 'flat', evidence),
    func: null,
    kind: 'chromatic',
    detail: 'Cromático: fora do campo harmônico',
    confirmed: evidence.third !== null,
    avoid: [],
    chordType: evidence.chordType,
  };
}

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
  const majorDominant = (link: Link) => {
    const { third, fifth } = link.segment.evidence;
    if (fifth === 'diminished') return false;
    return key.mode === 'major' ? third !== 'minor' : third === 'major';
  };
  const resolvedByTwoFive = new Set<number>();

  chain.forEach((a, i) => {
    const b = chain[i + 1];
    const c = chain[i + 2];
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
      events.push({
        kind: 'phrygianBass',
        label: 'Baixo b6→5: cadência frígia (iv6→V) ou sexta aumentada',
        ...pair,
      });
    }
  });

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

export function keyLabel(key: MusicalKey): string {
  return `${getPreferredRootName(key.tonic)} ${key.mode === 'major' ? 'maior' : 'menor'}`;
}

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

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

export function keyNoteNames(key: MusicalKey): readonly string[] {
  const relativeMajor = key.mode === 'major' ? key.tonic : mod12(key.tonic + 3);
  return FLAT_KEYS.has(getPreferredRootName(relativeMajor))
    ? NOTE_NAMES_FLAT
    : NOTE_NAMES;
}

export interface FieldChord {
  numeral: string;
  name: string;
  func: HarmonicFunction;
}

export function fieldChords(key: MusicalKey): FieldChord[] {
  const names = keyNoteNames(key);
  return FIELDS[key.mode].map((degree) => ({
    numeral: degree.romanNumeral,
    name: `${names[mod12(key.tonic + degree.scaleInterval)]}${CHORD_TYPES[degree.chordType].symbol}`,
    func: degree.harmonicFunction,
  }));
}

export interface ChordTone {
  interval: number;
  category: Exclude<DegreeCategory, 'ornament'>;
  label: string;
  played: boolean;
}

const SLOT_INTERVALS = {
  third: { minor: [3], major: [4], both: [3, 4] },
  fifth: { diminished: [6], perfect: [7], augmented: [8] },
  seventh: { diminished: [9], minor: [10], major: [11], both: [10, 11] },
} as const;

export function barChordTones(
  bar: BarAnalysis,
  segment: HarmonicSegment | null,
): ChordTone[] {
  if (bar.root === null) return [];
  const played = bar.evidence;
  const chordType = segment?.harmony.chordType ?? played.chordType;
  const implied = chordType
    ? readEvidence(CHORD_TYPES[chordType].intervals)
    : null;
  const tones: ChordTone[] = [
    { interval: 0, category: 'root', label: 'R', played: true },
  ];
  for (const slot of ['third', 'fifth', 'seventh'] as const) {
    const playedValue = played[slot];
    const value = playedValue ?? implied?.[slot] ?? null;
    if (value === null) continue;
    const intervals = (
      SLOT_INTERVALS[slot] as Record<string, readonly number[]>
    )[value];
    for (const interval of intervals) {
      tones.push({
        interval,
        category: slot,
        label: intervalDegreeLabel(interval, slot),
        played: playedValue !== null,
      });
    }
  }
  const used = new Set(tones.map((tone) => tone.interval));
  for (const interval of played.intervals) {
    if (used.has(interval)) continue;
    tones.push({
      interval,
      category: 'tension',
      label: intervalDegreeLabel(interval, 'tension'),
      played: true,
    });
  }
  return tones;
}
