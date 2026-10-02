import type { SngArrangement, SngNote } from '@/services/rocksmith/sng';

/**
 * A bass arrangement imported from a Rocksmith chart, laid out on the chart's
 * own beat grid. Rocksmith stores every difficulty level of every phrase; the
 * chart keeps only the hardest level of each phrase, which is the full part
 * as recorded.
 */
export interface BassChart {
  schemaVersion: 1;
  /** SHA-256 of the imported file, so re-importing it is idempotent. */
  id: string;
  sourceFileName: string;
  /**
   * `midi` charts have no fingering of their own: their strings and frets are
   * a suggestion. Absent on charts stored before MIDI import, all Rocksmith.
   */
  source?: BassChartSource;
  importedAt: string;
  title: string;
  artist: string;
  album: string;
  year: number | null;
  /** Semitone offset from E-A-D-G for each string, low to high. */
  tuning: number[];
  songLengthSeconds: number;
  averageTempoBpm: number;
  bars: BassChartBar[];
  sections: BassChartSection[];
  notes: BassChartNote[];
}

export type BassChartSource = 'rocksmith' | 'midi';

export interface BassChartBar {
  index: number;
  startTime: number;
  endTime: number;
  beatCount: number;
}

export interface BassChartSection {
  /** Rocksmith's section name, e.g. `verse`. */
  name: string;
  /** How many consecutive Rocksmith sections of this name were merged. */
  parts: number;
  startBar: number;
  /** Exclusive. */
  endBar: number;
}

export type BassTechnique =
  | 'mute'
  | 'accent'
  | 'hammerOn'
  | 'pullOff'
  | 'slide'
  | 'harmonic'
  | 'palmMute'
  | 'slap'
  | 'pop'
  | 'tap'
  | 'vibrato'
  | 'bend'
  | 'tremolo';

export interface BassChartNote {
  time: number;
  /** When the fretboard stops showing the note. */
  endTime: number;
  /** 0 = lowest (E) string. */
  string: number;
  fret: number;
  midi: number;
  sustain: number;
  bar: number;
  /** Beats from the bar's downbeat, quantised to twelfths of a beat. */
  beatInBar: number;
  slideToFret: number | null;
  techniques: BassTechnique[];
}

export interface BassChartMetadata {
  title: string;
  artist: string;
  album: string;
  year: number | null;
}

/** Twelve ticks per beat covers straight 8ths, 16ths and triplets. */
export const TICKS_PER_BEAT = 12;
export const STANDARD_OPEN_MIDI = [28, 33, 38, 43];
const STRING_COUNT = 4;

const TECHNIQUE_MASKS: [number, BassTechnique][] = [
  [0x20000, 'mute'],
  [0x4000000, 'accent'],
  [0x200, 'hammerOn'],
  [0x400, 'pullOff'],
  [0x800, 'slide'],
  [0x20, 'harmonic'],
  [0x40, 'palmMute'],
  [0x80, 'slap'],
  [0x100, 'pop'],
  [0x4000, 'tap'],
  [0x10000, 'vibrato'],
  [0x1000, 'bend'],
  [0x10, 'tremolo'],
];

export function buildBassChart(input: {
  id: string;
  sourceFileName: string;
  importedAt: string;
  metadata: BassChartMetadata;
  arrangement: SngArrangement;
  source?: BassChartSource;
}): BassChart {
  const { arrangement } = input;
  const beatTimes = arrangement.beats.map((b) => b.time);
  const bars = buildBars(arrangement);
  if (bars.length === 0) throw new Error('bass chart has no bars');
  const barStartBeats = barStartBeatIndexes(arrangement);
  const tuning = Array.from(
    { length: STRING_COUNT },
    (_, i) => arrangement.metadata.tuning[i] ?? 0,
  );

  const raw = hardestNotes(arrangement);
  const notes: BassChartNote[] = raw.map((note) => {
    const tick = Math.max(
      0,
      Math.round(beatPosition(beatTimes, note.time) * TICKS_PER_BEAT),
    );
    const bar = lastIndexAtOrBefore(barStartBeats, tick / TICKS_PER_BEAT);
    return {
      time: note.time,
      endTime: note.time,
      string: note.string,
      fret: note.fret,
      midi: STANDARD_OPEN_MIDI[note.string] + tuning[note.string] + note.fret,
      sustain: note.sustain,
      bar,
      beatInBar: (tick - barStartBeats[bar] * TICKS_PER_BEAT) / TICKS_PER_BEAT,
      slideToFret: note.slideTo >= 0 ? note.slideTo : null,
      techniques: TECHNIQUE_MASKS.filter(([mask]) => note.mask & mask).map(
        ([, technique]) => technique,
      ),
    };
  });
  assignEndTimes(notes, bars);

  const songLengthSeconds =
    arrangement.metadata.songLength || bars[bars.length - 1].endTime;
  return {
    schemaVersion: 1,
    id: input.id,
    sourceFileName: input.sourceFileName,
    source: input.source ?? 'rocksmith',
    importedAt: input.importedAt,
    title: input.metadata.title,
    artist: input.metadata.artist,
    album: input.metadata.album,
    year: input.metadata.year,
    tuning,
    songLengthSeconds,
    // The median beat, not the package's average: a fast count-in before the
    // song skews the mean.
    averageTempoBpm: medianTempo(beatTimes),
    bars,
    sections: buildSections(arrangement, bars),
    notes,
  };
}

/**
 * The notes of each phrase iteration at that phrase's highest difficulty,
 * with chords expanded into one note per string, ordered by time then string.
 */
export function hardestNotes(arrangement: SngArrangement): SngNote[] {
  const levels = new Map(arrangement.levels.map((l) => [l.difficulty, l]));
  const notes: SngNote[] = [];
  arrangement.phraseIterations.forEach((iteration, iterationId) => {
    const phrase = arrangement.phrases[iteration.phraseId];
    const level = phrase ? levels.get(phrase.maxDifficulty) : undefined;
    if (!level) return;
    for (const note of level.notes) {
      if (note.phraseIterationId !== iterationId) continue;
      const chord =
        note.chordId >= 0 ? arrangement.chordTemplates[note.chordId] : null;
      if (!chord) {
        notes.push(note);
        continue;
      }
      chord.frets.slice(0, STRING_COUNT).forEach((fret, string) => {
        if (fret >= 0) notes.push({ ...note, string, fret, chordId: -1 });
      });
    }
  });
  return notes
    .filter((n) => n.string >= 0 && n.string < STRING_COUNT && n.fret >= 0)
    .sort((a, b) => a.time - b.time || a.string - b.string);
}

function barStartBeatIndexes(arrangement: SngArrangement): number[] {
  const starts: number[] = [];
  arrangement.beats.forEach((beat, index) => {
    if (beat.beat === 0) starts.push(index);
  });
  return starts;
}

function buildBars(arrangement: SngArrangement): BassChartBar[] {
  const beats = arrangement.beats;
  const starts = barStartBeatIndexes(arrangement);
  return starts.map((beatIndex, index) => {
    const nextBeatIndex = starts[index + 1] ?? beats.length;
    const beatCount = nextBeatIndex - beatIndex;
    const startTime = beats[beatIndex].time;
    const endTime =
      nextBeatIndex < beats.length
        ? beats[nextBeatIndex].time
        : beats[beats.length - 1].time +
          lastBeatLength(beats.map((b) => b.time));
    return { index, startTime, endTime, beatCount };
  });
}

function lastBeatLength(beatTimes: number[]): number {
  const n = beatTimes.length;
  return n >= 2 ? beatTimes[n - 1] - beatTimes[n - 2] : 0.5;
}

/** Fractional beat index of `time` on the chart's (non-uniform) beat grid. */
export function beatPosition(beatTimes: number[], time: number): number {
  if (beatTimes.length === 0) return 0;
  const i = Math.max(0, lastIndexAtOrBefore(beatTimes, time + 1e-4));
  const next = beatTimes[i + 1];
  const length =
    next !== undefined ? next - beatTimes[i] : lastBeatLength(beatTimes);
  return i + (time - beatTimes[i]) / length;
}

/** Index of the last sorted value `<= target`, or 0 when all are greater. */
function lastIndexAtOrBefore(sorted: number[], target: number): number {
  let lo = 0;
  let hi = sorted.length - 1;
  let found = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] <= target) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}

/**
 * A note is shown until the next onset, but never longer than its sustain or
 * one beat — whichever is longer — so a short note before a rest does not
 * linger on the fretboard.
 */
function assignEndTimes(notes: BassChartNote[], bars: BassChartBar[]): void {
  let nextOnset = Infinity;
  for (let i = notes.length - 1; i >= 0; i -= 1) {
    const note = notes[i];
    const bar = bars[note.bar];
    const beatSeconds = (bar.endTime - bar.startTime) / bar.beatCount;
    note.endTime = Math.min(
      nextOnset,
      note.time + Math.max(note.sustain, beatSeconds),
    );
    if (i === 0 || notes[i - 1].time < note.time) nextOnset = note.time;
  }
}

function buildSections(
  arrangement: SngArrangement,
  bars: BassChartBar[],
): BassChartSection[] {
  const barStarts = bars.map((b) => b.startTime);
  const sections: BassChartSection[] = [];
  const sorted = [...arrangement.sections].sort(
    (a, b) => a.startTime - b.startTime,
  );
  for (const section of sorted) {
    const startBar = nearestIndex(barStarts, section.startTime);
    const previous = sections[sections.length - 1];
    if (previous && startBar <= previous.startBar) continue;
    if (previous?.name === section.name) {
      previous.parts += 1;
      continue;
    }
    sections.push({ name: section.name, parts: 1, startBar, endBar: 0 });
  }
  if (sections.length === 0 || sections[0].startBar > 0) {
    sections.unshift({ name: '', parts: 1, startBar: 0, endBar: 0 });
  }
  sections.forEach((section, i) => {
    section.endBar = sections[i + 1]?.startBar ?? bars.length;
  });
  return sections;
}

function nearestIndex(sorted: number[], target: number): number {
  let best = 0;
  for (let i = 1; i < sorted.length; i += 1) {
    if (Math.abs(sorted[i] - target) < Math.abs(sorted[best] - target)) {
      best = i;
    }
  }
  return best;
}

function medianTempo(beatTimes: number[]): number {
  const gaps = beatTimes
    .slice(1)
    .map((t, i) => t - beatTimes[i])
    .filter((gap) => gap > 0)
    .sort((a, b) => a - b);
  if (gaps.length === 0) return 0;
  return 60 / gaps[Math.floor(gaps.length / 2)];
}

// ---------------------------------------------------------------- queries

const SECTION_LABELS: Record<string, string> = {
  '': 'Início',
  intro: 'Intro',
  verse: 'Verso',
  modverse: 'Verso (variação)',
  preverse: 'Pré-verso',
  postvs: 'Pós-verso',
  chorus: 'Refrão',
  modchorus: 'Refrão (variação)',
  prechorus: 'Pré-refrão',
  postchorus: 'Pós-refrão',
  hook: 'Gancho',
  bridge: 'Ponte',
  modbridge: 'Ponte (variação)',
  solo: 'Solo',
  riff: 'Riff',
  transition: 'Transição',
  interlude: 'Interlúdio',
  breakdown: 'Breakdown',
  buildup: 'Preparação',
  vamp: 'Vamp',
  variation: 'Variação',
  head: 'Tema',
  melody: 'Melodia',
  tapping: 'Tapping',
  outro: 'Final',
  fadein: 'Fade-in',
  fadeout: 'Fade-out',
  silence: 'Silêncio',
  noguitar: 'Sem baixo',
  ambient: 'Ambiente',
};

/** pt-BR label for a Rocksmith section name. */
export function sectionLabel(name: string): string {
  const label = SECTION_LABELS[name.toLowerCase()];
  if (label) return label;
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/** Index of the bar containing `seconds`, or -1 outside the chart. */
export function barIndexAt(chart: BassChart, seconds: number): number {
  if (!Number.isFinite(seconds) || seconds < chart.bars[0].startTime) return -1;
  const index = lastIndexAtOrBefore(
    chart.bars.map((b) => b.startTime),
    seconds,
  );
  return seconds < chart.bars[index].endTime ? index : -1;
}

/** Index of the section containing bar `barIndex`, or -1. */
export function sectionIndexOfBar(chart: BassChart, barIndex: number): number {
  return chart.sections.findIndex(
    (s) => barIndex >= s.startBar && barIndex < s.endBar,
  );
}

/**
 * Indexes of the notes sounding at `seconds` (several for a double stop).
 * `noteTimes` must be `chart.notes.map(n => n.time)`, passed in so a caller
 * polling every animation frame does not rebuild it.
 */
export function activeNoteIndexes(
  chart: BassChart,
  noteTimes: number[],
  seconds: number,
): number[] {
  if (!Number.isFinite(seconds) || noteTimes.length === 0) return [];
  if (seconds < noteTimes[0]) return [];
  const last = lastIndexAtOrBefore(noteTimes, seconds);
  const onset = noteTimes[last];
  const active: number[] = [];
  for (let i = last; i >= 0 && noteTimes[i] === onset; i -= 1) {
    if (seconds < chart.notes[i].endTime) active.unshift(i);
  }
  return active;
}

/**
 * Distinct time signatures in order of first appearance, e.g. `['7/4']`.
 * Charts end on a lone closing beat, which is not a real 1/4 bar.
 */
export function timeSignatures(chart: BassChart): string[] {
  const bars = chart.bars.filter(
    (bar, i) => !(i === chart.bars.length - 1 && bar.beatCount === 1),
  );
  return [...new Set(bars.map((b) => `${b.beatCount}/4`))];
}

const NOTE_NAMES = [
  'C',
  'C#',
  'D',
  'D#',
  'E',
  'F',
  'F#',
  'G',
  'G#',
  'A',
  'A#',
  'B',
];

/** Scientific pitch name, e.g. 35 → `B1`. */
export function midiNoteName(midi: number): string {
  return `${NOTE_NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`;
}

/** `E A D G` for standard tuning, otherwise the tuned open-string names. */
export function tuningLabel(tuning: number[]): string {
  return tuning
    .map((offset, i) => NOTE_NAMES[(STANDARD_OPEN_MIDI[i] + offset) % 12])
    .join(' ');
}

export function isStandardTuning(tuning: number[]): boolean {
  return tuning.every((offset) => offset === 0);
}

export type SectionBlockItem =
  | { kind: 'bar'; bar: number }
  | { kind: 'rest'; startBar: number; count: number };

export interface BassChartSectionBlock {
  section: BassChartSection;
  index: number;
  /** Slot for the section's colour, by first appearance of its name. */
  colorIndex: number;
  /** Which appearance of this name this is, 1-based. */
  occurrence: number;
  occurrenceTotal: number;
  items: SectionBlockItem[];
}

/**
 * Lay the chart out section by section. A run of two or more bars without
 * notes collapses into one rest item, so a long count-in or a tacet stretch
 * does not push the bass line off screen; bars with notes are never merged.
 */
export function sectionBlocks(chart: BassChart): BassChartSectionBlock[] {
  const barsWithNotes = new Set(chart.notes.map((n) => n.bar));
  const colorIndexes = new Map<string, number>();
  const totals = new Map<string, number>();
  for (const section of chart.sections) {
    if (!colorIndexes.has(section.name)) {
      colorIndexes.set(section.name, colorIndexes.size);
    }
    totals.set(section.name, (totals.get(section.name) ?? 0) + 1);
  }
  const seen = new Map<string, number>();
  return chart.sections.map((section, index) => {
    const occurrence = (seen.get(section.name) ?? 0) + 1;
    seen.set(section.name, occurrence);
    const items: SectionBlockItem[] = [];
    let bar = section.startBar;
    while (bar < section.endBar) {
      let end = bar;
      while (end < section.endBar && !barsWithNotes.has(end)) end += 1;
      if (end - bar >= 2) {
        items.push({ kind: 'rest', startBar: bar, count: end - bar });
        bar = end;
      } else {
        items.push({ kind: 'bar', bar });
        bar += 1;
      }
    }
    return {
      section,
      index,
      colorIndex: colorIndexes.get(section.name) ?? 0,
      occurrence,
      occurrenceTotal: totals.get(section.name) ?? 1,
      items,
    };
  });
}

/**
 * Break a section into lines of `barsPerRow` bars counted from its first
 * bar, so every line starts on the same bar numbers whatever comes before
 * it. A rest stays whole on the line where it starts; lines a rest covers
 * entirely are dropped.
 */
export function sectionRows(
  block: BassChartSectionBlock,
  barsPerRow: number,
): SectionBlockItem[][] {
  const size = Math.max(1, Math.floor(barsPerRow));
  const rows: SectionBlockItem[][] = [];
  for (const item of block.items) {
    const start = item.kind === 'bar' ? item.bar : item.startBar;
    const row = Math.floor((start - block.section.startBar) / size);
    (rows[row] ??= []).push(item);
  }
  return rows.filter((row) => row !== undefined);
}

/**
 * The line length to draw when only `fits` bars fit on screen: the chosen
 * one when it fits, else its largest divisor that does (8 → 4 → 2), so the
 * lines still start on the same bars of each phrase. A length with no such
 * divisor (7 with room for 6) falls back to as many as fit.
 */
export function fittedBarsPerRow(chosen: number, fits: number): number {
  if (fits >= chosen) return chosen;
  const room = Math.max(1, fits);
  for (let length = room; length > 1; length -= 1) {
    if (chosen % length === 0) return length;
  }
  return room;
}

/** The chart's notes bucketed by bar, each paired with its chart index. */
export function notesByBar(
  chart: BassChart,
): { note: BassChartNote; index: number }[][] {
  const buckets = chart.bars.map(
    () => [] as { note: BassChartNote; index: number }[],
  );
  chart.notes.forEach((note, index) =>
    buckets[note.bar]?.push({ note, index }),
  );
  return buckets;
}
