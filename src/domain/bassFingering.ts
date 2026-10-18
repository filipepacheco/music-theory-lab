import type { BassChart } from '@/domain/bassChart';

export function withOriginalGpFingering(chart: BassChart): BassChart {
  const positions = chart.originalFingering;
  if (chart.source !== 'gp' || !positions) return chart;
  return {
    ...chart,
    notes: chart.notes.map((note, index) => ({
      ...note,
      ...positions[index],
    })),
  };
}
