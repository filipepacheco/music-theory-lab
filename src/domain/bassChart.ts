import type { SngArrangement, SngNote } from '@/services/rocksmith/sng';

export interface BassChart {
  schemaVersion: 1;
  id: string;
  sourceFileName: string;
  source?: BassChartSource;
  importedAt: string;
  title: string;
  artist: string;
  album: string;
  year: number | null;
  tuning: number[];
  songLengthSeconds: number;
  averageTempoBpm: number;
  bars: BassChartBar[];
  sections: BassChartSection[];
  notes: BassChartNote[];
  originalFingering?: BassFretPosition[];
}

export interface BassFretPosition {
  string: number;
  fret: number;
}

export type BassChartSource = 'rocksmith' | 'midi' | 'gp';

export interface BassChartBar {
  index: number;
  startTime: number;
  endTime: number;
  beatCount: number;
}

export interface BassChartSection {
  name: string;
  parts: number;
  startBar: number;
  endBar: number;
}

export interface ChartBars {
  bars: BassChartBar[];
  sections: BassChartSection[];
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
  endTime: number;
  string: number;
  fret: number;
  midi: number;
  sustain: number;
  bar: number;
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
    averageTempoBpm: medianTempo(beatTimes),
    bars,
    sections: buildSections(arrangement, bars),
    notes,
  };
}

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

export function beatPosition(beatTimes: number[], time: number): number {
  if (beatTimes.length === 0) return 0;
  const i = Math.max(0, lastIndexAtOrBefore(beatTimes, time + 1e-4));
  const next = beatTimes[i + 1];
  const length =
    next !== undefined ? next - beatTimes[i] : lastBeatLength(beatTimes);
  return i + (time - beatTimes[i]) / length;
}

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

export function sectionLabel(name: string): string {
  const label = SECTION_LABELS[name.toLowerCase()];
  if (label) return label;
  return name.charAt(0).toUpperCase() + name.slice(1);
}

export function barIndexAt(
  chart: Pick<ChartBars, 'bars'>,
  seconds: number,
): number {
  if (!Number.isFinite(seconds) || seconds < chart.bars[0].startTime) return -1;
  const index = lastIndexAtOrBefore(
    chart.bars.map((b) => b.startTime),
    seconds,
  );
  return seconds < chart.bars[index].endTime ? index : -1;
}

export function sectionIndexOfBar(
  chart: Pick<ChartBars, 'sections'>,
  barIndex: number,
): number {
  return chart.sections.findIndex(
    (s) => barIndex >= s.startBar && barIndex < s.endBar,
  );
}

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

export function timeSignatures(chart: Pick<ChartBars, 'bars'>): string[] {
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

export function midiNoteName(midi: number): string {
  return `${NOTE_NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`;
}

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
  colorIndex: number;
  occurrence: number;
  occurrenceTotal: number;
  items: SectionBlockItem[];
}

export function sectionBlocks(
  chart: Pick<ChartBars, 'sections'> & { notes?: readonly { bar: number }[] },
  barsWithNotes: ReadonlySet<number> = new Set(
    (chart.notes ?? []).map((n) => n.bar),
  ),
): BassChartSectionBlock[] {
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

export const MAX_BEAT_WIDTH_SCALE = 3;
/**
 * Chromium lays out in 1/64 px, so the width is rounded down to it. Firefox
 * lays out in 1/60 px and can round a bar up by a fraction.
 */
export function lineBeatWidth(line: {
  lineWidth: number;
  barsPerLine: number;
  beatCount: number;
  barChrome: number;
  gap: number;
  baseBeatWidth: number;
}): number {
  const bars = Math.max(1, Math.floor(line.barsPerLine));
  const beats = bars * Math.max(1, line.beatCount);
  const room = line.lineWidth - (bars - 1) * line.gap - bars * line.barChrome;
  const shared = Math.floor((room / beats) * 64) / 64;
  return Math.min(
    line.baseBeatWidth * MAX_BEAT_WIDTH_SCALE,
    Math.max(1, shared),
  );
}

export function sectionBeatWidth(base: number, needed: number): number {
  return Math.min(base * MAX_BEAT_WIDTH_SCALE, Math.max(base, needed));
}

export interface LaneLabel {
  beat: number;
  chars: number;
}

export interface LabelLane {
  charWidth: number;
  labels: LaneLabel[];
}

export function neededBeatWidth(lanes: LabelLane[], gap: number): number {
  let needed = 0;
  for (const { charWidth, labels } of lanes) {
    const sorted = [...labels].sort((a, b) => a.beat - b.beat);
    for (let i = 1; i < sorted.length; i += 1) {
      const distance = sorted[i].beat - sorted[i - 1].beat;
      if (distance <= 0) continue;
      needed = Math.max(
        needed,
        (sorted[i - 1].chars * charWidth + gap) / distance,
      );
    }
  }
  return needed;
}

export interface LaneLabelPlace {
  level: number;
  x: number;
  shift: number;
}

export const DEGREE_LANE_LEVELS = 2;
const TOUCH_SLACK = 1e-6;

export function degreeLanePlaces(
  lane: LabelLane,
  beatWidth: number,
  gap: number,
  shiftFrom: number = Infinity,
): LaneLabelPlace[] {
  const order = lane.labels
    .map((_, index) => index)
    .sort((a, b) => lane.labels[a].beat - lane.labels[b].beat);
  const free = Array.from({ length: DEGREE_LANE_LEVELS }, () => -Infinity);
  const places: LaneLabelPlace[] = [];
  for (const index of order) {
    const label = lane.labels[index];
    const noteX = label.beat * beatWidth;
    let level = free.findIndex((x) => noteX + TOUCH_SLACK >= x);
    let shift = 0;
    if (level < 0) {
      level = free.indexOf(Math.min(...free));
      if (beatWidth + TOUCH_SLACK >= shiftFrom) shift = free[level] - noteX;
    }
    places[index] = { level, x: noteX + shift, shift };
    free[level] = noteX + shift + label.chars * lane.charWidth + gap;
  }
  return places;
}

export function repeatsAbove(
  block: BassChartSectionBlock,
  barsPerRow: number,
  drawing: (bar: number) => string | null,
): Map<number, number> {
  const shown = new Set(
    block.items.flatMap((item) => (item.kind === 'bar' ? [item.bar] : [])),
  );
  const repeats = new Map<number, number>();
  for (const bar of shown) {
    const above = bar - barsPerRow;
    if (!shown.has(above)) continue;
    const drawn = drawing(bar);
    if (drawn !== null && drawn === drawing(above)) repeats.set(bar, above);
  }
  return repeats;
}

export function bassBarDrawing(
  chart: Pick<ChartBars, 'bars'>,
  notes: { note: BassChartNote }[][],
): (bar: number) => string | null {
  return (bar) => {
    const cells = (notes[bar] ?? [])
      .map(({ note }) =>
        [
          note.beatInBar,
          note.string,
          note.fret,
          note.slideToFret,
          [...note.techniques].sort().join('+'),
        ].join(':'),
      )
      .sort();
    return cells.length > 0
      ? `${chart.bars[bar].beatCount}|${cells.join(',')}`
      : null;
  };
}

export function barsRepeatingAbove(
  chart: BassChart,
  block: BassChartSectionBlock,
  barsPerRow: number,
  notes: { note: BassChartNote }[][] = notesByBar(chart),
): Map<number, number> {
  return repeatsAbove(block, barsPerRow, bassBarDrawing(chart, notes));
}

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
