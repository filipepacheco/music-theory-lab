import type {
  BassChart,
  BassChartBar,
  BassChartMetadata,
  BassChartNote,
  BassChartSection,
  BassTechnique,
} from './bassChart.js';
import type { Chart } from './drumChart.js';

export const GUITAR_MIN_STRINGS = 5;
export const GUITAR_MAX_STRINGS = 16;
export const GUITAR_MAX_CAPO = 24;
export const GUITAR_TICKS_PER_BEAT = 48;

/** The techniques of a bass note, with bends. */
export type GuitarTechnique = BassTechnique;

/**
 * One note of a guitar chart. `string` counts from the lowest string (0), in
 * the order of `openPitches`. `fret` counts from the capo, as in Guitar Pro.
 * `midi` is `openPitches[string] + capo + fret`.
 */
export type GuitarChartNote = BassChartNote;

export interface GuitarChart {
  schemaVersion: 1;
  id: string;
  part: 'guitar';
  /** The name of the GP track. */
  partName: string;
  /** The index of the GP track in the score. */
  trackIndex: number;
  sourceFileName: string;
  source: 'gp';
  importedAt: string;
  title: string;
  artist: string;
  album: string;
  year: number | null;
  songLengthSeconds: number;
  averageTempoBpm: number;
  bars: BassChartBar[];
  sections: BassChartSection[];
  strings: number;
  /** The absolute MIDI pitch of each open string, lowest string first. */
  openPitches: number[];
  capo: number;
  notes: GuitarChartNote[];
}

export function isGuitarChart(chart: Chart): chart is GuitarChart {
  return 'part' in chart && chart.part === 'guitar';
}

export interface GuitarNoteInput {
  time: number;
  sustain: number;
  string: number;
  fret: number;
  slideToFret: number | null;
  techniques: GuitarTechnique[];
}

/**
 * Places the notes of one guitar track on the bar grid of the song, which
 * the bass and drum charts of the same file share.
 */
export function buildGuitarChart(input: {
  id: string;
  partName: string;
  trackIndex: number;
  sourceFileName: string;
  importedAt: string;
  metadata: BassChartMetadata;
  grid: Pick<
    BassChart,
    'bars' | 'sections' | 'songLengthSeconds' | 'averageTempoBpm'
  >;
  /** The beats of the song: `beat` is 0 on the first beat of a bar. */
  beats: { time: number; beat: number }[];
  openPitches: number[];
  capo: number;
  notes: GuitarNoteInput[];
}): GuitarChart {
  const { grid, beats, openPitches, capo } = input;
  const beatTimes = beats.map((beat) => beat.time);
  const barStartBeats = beats.flatMap((beat, index) =>
    beat.beat === 0 ? [index] : [],
  );
  const sorted = [...input.notes].sort(
    (a, b) => a.time - b.time || a.string - b.string,
  );

  let bar = 0;
  const notes: GuitarChartNote[] = sorted.map((raw) => {
    const tick = Math.max(
      0,
      Math.round(beatPositionOf(beatTimes, raw.time) * GUITAR_TICKS_PER_BEAT),
    );
    while (
      bar + 1 < barStartBeats.length &&
      barStartBeats[bar + 1] * GUITAR_TICKS_PER_BEAT <= tick
    )
      bar += 1;
    return {
      time: raw.time,
      endTime: raw.time,
      string: raw.string,
      fret: raw.fret,
      midi: openPitches[raw.string] + capo + raw.fret,
      sustain: raw.sustain,
      bar,
      beatInBar:
        (tick - barStartBeats[bar] * GUITAR_TICKS_PER_BEAT) /
        GUITAR_TICKS_PER_BEAT,
      slideToFret: raw.slideToFret,
      techniques: raw.techniques,
    };
  });
  assignGuitarEndTimes(notes, grid.bars);

  return {
    schemaVersion: 1,
    id: input.id,
    part: 'guitar',
    partName: input.partName,
    trackIndex: input.trackIndex,
    sourceFileName: input.sourceFileName,
    source: 'gp',
    importedAt: input.importedAt,
    title: input.metadata.title,
    artist: input.metadata.artist,
    album: input.metadata.album,
    year: input.metadata.year,
    songLengthSeconds: grid.songLengthSeconds,
    averageTempoBpm: grid.averageTempoBpm,
    bars: grid.bars,
    sections: grid.sections,
    strings: openPitches.length,
    openPitches: [...openPitches],
    capo,
    notes,
  };
}

function beatPositionOf(beatTimes: number[], time: number): number {
  if (beatTimes.length === 0) return 0;
  let index = 0;
  for (let i = 0; i < beatTimes.length; i += 1) {
    if (beatTimes[i] <= time + 1e-4) index = i;
    else break;
  }
  const next = beatTimes[index + 1];
  const length =
    next !== undefined
      ? next - beatTimes[index]
      : index > 0
        ? beatTimes[index] - beatTimes[index - 1]
        : 0.5;
  return index + (time - beatTimes[index]) / length;
}

/** A note rings to the next onset, or for its length when that is shorter. */
function assignGuitarEndTimes(
  notes: GuitarChartNote[],
  bars: BassChartBar[],
): void {
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

/** Notes of the chart, with their index, bar by bar. */
export function guitarNotesByBar(
  chart: Pick<GuitarChart, 'bars' | 'notes'>,
): { note: GuitarChartNote; index: number }[][] {
  const buckets = chart.bars.map(
    () => [] as { note: GuitarChartNote; index: number }[],
  );
  chart.notes.forEach((note, index) =>
    buckets[note.bar]?.push({ note, index }),
  );
  return buckets;
}

/**
 * The guitar line as a `BassChart`, so the bar analysis and the key
 * suggestions of the bass chart can read its pitches. Not for display.
 */
export function guitarAsBassChart(chart: GuitarChart): BassChart {
  return {
    schemaVersion: 1,
    id: chart.id,
    sourceFileName: chart.sourceFileName,
    source: 'gp',
    importedAt: chart.importedAt,
    title: chart.title,
    artist: chart.artist,
    album: chart.album,
    year: chart.year,
    tuning: [0, 0, 0, 0],
    songLengthSeconds: chart.songLengthSeconds,
    averageTempoBpm: chart.averageTempoBpm,
    bars: chart.bars,
    sections: chart.sections,
    notes: chart.notes,
  };
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

/** The tuning, from the lowest string, for example "E A D G B E". */
export function guitarTuningLabel(
  chart: Pick<GuitarChart, 'openPitches'>,
): string {
  return chart.openPitches.map((pitch) => NOTE_NAMES[pitch % 12]).join(' ');
}
