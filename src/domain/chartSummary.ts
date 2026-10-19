import type { BassChartSource } from '@/domain/bassChart';
import { isDrumChart, type Chart } from '@/domain/drumChart';

export type ChartPart = 'bass' | 'drums';

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
  tuning: number[] | null;
  importedAt: string;
}

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
