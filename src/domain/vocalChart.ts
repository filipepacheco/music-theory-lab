import {
  beatPosition,
  type BassChartBar,
  type BassChartMetadata,
  type BassChartSection,
  type ChartBars,
} from './bassChart.js';
import type { Chart } from './drumChart.js';

export const VOCAL_TICKS_PER_BEAT = 48;
export const VOCAL_MAX_LYRIC_LENGTH = 200;

/**
 * One melody note of a vocal chart. `lyric` is the syllable that the score
 * sings on the note, or null when the score has none. Notes that sound at once
 * stay as separate notes, and each keeps the syllable of its beat.
 */
export interface VocalChartNote {
  time: number;
  endTime: number;
  /** The sounding pitch, a MIDI number. */
  midi: number;
  sustain: number;
  bar: number;
  beatInBar: number;
  lyric: string | null;
}

export interface VocalChart {
  schemaVersion: 1;
  id: string;
  part: 'vocals';
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
  notes: VocalChartNote[];
}

export function isVocalChart(chart: Chart): chart is VocalChart {
  return 'part' in chart && chart.part === 'vocals';
}

export interface VocalNoteInput {
  time: number;
  sustain: number;
  midi: number;
  lyric: string | null;
}

/**
 * Places the melody notes of one vocal track on the bar grid of the song,
 * which the other charts of the same file share.
 */
export function buildVocalChart(input: {
  id: string;
  partName: string;
  trackIndex: number;
  sourceFileName: string;
  importedAt: string;
  metadata: BassChartMetadata;
  grid: Pick<
    VocalChart,
    'bars' | 'sections' | 'songLengthSeconds' | 'averageTempoBpm'
  >;
  /** The beats of the song: `beat` is 0 on the first beat of a bar. */
  beats: { time: number; beat: number }[];
  notes: VocalNoteInput[];
}): VocalChart {
  const { grid, beats } = input;
  const beatTimes = beats.map((beat) => beat.time);
  const barStartBeats = beats.flatMap((beat, index) =>
    beat.beat === 0 ? [index] : [],
  );
  const sorted = [...input.notes].sort(
    (a, b) => a.time - b.time || a.midi - b.midi,
  );

  let bar = 0;
  const notes: VocalChartNote[] = sorted.map((raw) => {
    const tick = Math.max(
      0,
      Math.round(beatPosition(beatTimes, raw.time) * VOCAL_TICKS_PER_BEAT),
    );
    while (
      bar + 1 < barStartBeats.length &&
      barStartBeats[bar + 1] * VOCAL_TICKS_PER_BEAT <= tick
    )
      bar += 1;
    const barLength = grid.bars[bar];
    const beatSeconds = barLength
      ? (barLength.endTime - barLength.startTime) / barLength.beatCount
      : 0.5;
    return {
      time: raw.time,
      endTime: raw.time + Math.max(raw.sustain, beatSeconds / 4),
      midi: raw.midi,
      sustain: raw.sustain,
      bar,
      beatInBar:
        (tick - barStartBeats[bar] * VOCAL_TICKS_PER_BEAT) /
        VOCAL_TICKS_PER_BEAT,
      lyric: raw.lyric,
    };
  });

  return {
    schemaVersion: 1,
    id: input.id,
    part: 'vocals',
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
    notes,
  };
}

/** One sung beat: the notes that start together, with their syllable. */
export interface VocalOnset {
  beatInBar: number;
  /** Notes of the onset, lowest first, each with its index in the chart. */
  notes: { note: VocalChartNote; index: number }[];
  lyric: string | null;
}

/** Notes of the chart bar by bar, grouped by onset. */
export function vocalOnsetsByBar(
  chart: Pick<VocalChart, 'bars' | 'notes'>,
): VocalOnset[][] {
  const buckets = chart.bars.map(() => [] as VocalOnset[]);
  chart.notes.forEach((note, index) => {
    const onsets = buckets[note.bar];
    if (!onsets) return;
    const last = onsets[onsets.length - 1];
    if (last && last.beatInBar === note.beatInBar) {
      last.notes.push({ note, index });
      last.notes.sort((a, b) => a.note.midi - b.note.midi);
      last.lyric = last.lyric ?? note.lyric;
    } else {
      onsets.push({
        beatInBar: note.beatInBar,
        notes: [{ note, index }],
        lyric: note.lyric,
      });
    }
  });
  return buckets;
}

/** The lowest and the highest pitch of the chart, for the height of the lane. */
export function vocalRange(
  chart: Pick<VocalChart, 'notes'>,
): { low: number; high: number } | null {
  if (chart.notes.length === 0) return null;
  let low = Infinity;
  let high = -Infinity;
  for (const { midi } of chart.notes) {
    low = Math.min(low, midi);
    high = Math.max(high, midi);
  }
  return { low, high };
}

export function vocalBarDrawing(
  chart: Pick<ChartBars, 'bars'>,
  onsets: VocalOnset[][],
): (bar: number) => string | null {
  return (bar) => {
    const cells = (onsets[bar] ?? []).map(
      (onset) =>
        `${onset.beatInBar}:${onset.notes.map(({ note }) => note.midi).join('+')}:${onset.lyric ?? ''}`,
    );
    return cells.length > 0
      ? `${chart.bars[bar].beatCount}|${cells.join(',')}`
      : null;
  };
}
