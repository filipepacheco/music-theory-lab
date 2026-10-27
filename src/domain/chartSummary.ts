import type { BassChartSource } from '@/domain/bassChart';
import { isDrumChart, type Chart } from '@/domain/drumChart';
import { isGuitarChart } from '@/domain/guitarChart';
import { isVocalChart } from '@/domain/vocalChart';

export type ChartPart = 'bass' | 'drums' | 'guitar' | 'vocals';

export const PART_ORDER: readonly ChartPart[] = [
  'bass',
  'drums',
  'guitar',
  'vocals',
];

export function partRank(part: ChartPart): number {
  return PART_ORDER.indexOf(part);
}

export interface ChartSummary {
  id: string;
  title: string;
  artist: string;
  source: BassChartSource;
  part: ChartPart;
  /** Guitar and vocal charts: the name of the GP track. */
  partName?: string;
  /** Guitar and vocal charts: the index of the GP track. */
  trackIndex?: number;
  tempoBpm: number;
  durationSeconds: number;
  barCount: number;
  noteCount: number;
  tuning: number[] | null;
  importedAt: string;
}

export function summarizeChart(chart: Chart): ChartSummary {
  const shared = {
    id: chart.id,
    title: chart.title,
    artist: chart.artist,
    source: chart.source ?? 'rocksmith',
    tempoBpm: chart.averageTempoBpm,
    durationSeconds: chart.songLengthSeconds,
    barCount: chart.bars.length,
    importedAt: chart.importedAt,
  } as const;
  if (isDrumChart(chart)) {
    return {
      ...shared,
      part: 'drums',
      noteCount: chart.hits.length,
      tuning: null,
    };
  }
  if (isGuitarChart(chart)) {
    return {
      ...shared,
      part: 'guitar',
      partName: chart.partName,
      trackIndex: chart.trackIndex,
      noteCount: chart.notes.length,
      tuning: null,
    };
  }
  if (isVocalChart(chart)) {
    return {
      ...shared,
      part: 'vocals',
      partName: chart.partName,
      trackIndex: chart.trackIndex,
      noteCount: chart.notes.length,
      tuning: null,
    };
  }
  return {
    ...shared,
    part: 'bass',
    noteCount: chart.notes.length,
    tuning: [...chart.tuning],
  };
}
