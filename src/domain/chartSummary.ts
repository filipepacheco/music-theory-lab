import type { BassChart, BassChartSource } from '@/domain/bassChart';

/** The instrument of a chart. */
export type ChartPart = 'bass' | 'drums';

/**
 * What the Biblioteca list needs to know about one chart, so the list never
 * has to load the chart itself.
 */
export interface ChartSummary {
  id: string;
  title: string;
  artist: string;
  source: BassChartSource;
  part: ChartPart;
  tempoBpm: number;
  durationSeconds: number;
  barCount: number;
  noteCount: number;
  /** Semitone offsets from E-A-D-G; null for a chart without strings. */
  tuning: number[] | null;
  importedAt: string;
}

/**
 * The summary of a stored chart. A chart without a part field is a bass
 * chart, and one without a source predates MIDI import, so it is Rocksmith.
 */
export function summarizeChart(chart: BassChart): ChartSummary {
  const { part } = chart as { part?: unknown };
  return {
    id: chart.id,
    title: chart.title,
    artist: chart.artist,
    source: chart.source ?? 'rocksmith',
    part: part === 'drums' ? 'drums' : 'bass',
    tempoBpm: chart.averageTempoBpm,
    durationSeconds: chart.songLengthSeconds,
    barCount: chart.bars.length,
    noteCount: chart.notes.length,
    tuning: Array.isArray(chart.tuning) ? [...chart.tuning] : null,
    importedAt: chart.importedAt,
  };
}
