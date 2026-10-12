import type { BassChartSource } from '@/domain/bassChart';
import { isDrumChart, type Chart } from '@/domain/drumChart';

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
  /** The notes of a bass chart, or the hits of a drum chart. */
  noteCount: number;
  /** Semitone offsets from E-A-D-G; null for a chart without strings. */
  tuning: number[] | null;
  importedAt: string;
}

/**
 * The summary of a stored chart. A chart without a part field is a bass
 * chart, and one without a source predates MIDI import, so it is Rocksmith.
 */
export function summarizeChart(chart: Chart): ChartSummary {
  const drums = isDrumChart(chart);
  return {
    id: chart.id,
    title: chart.title,
    artist: chart.artist,
    source: chart.source ?? 'rocksmith',
    part: drums ? 'drums' : 'bass',
    tempoBpm: chart.averageTempoBpm,
    durationSeconds: chart.songLengthSeconds,
    barCount: chart.bars.length,
    noteCount: drums ? chart.hits.length : chart.notes.length,
    tuning: drums ? null : [...chart.tuning],
    importedAt: chart.importedAt,
  };
}
