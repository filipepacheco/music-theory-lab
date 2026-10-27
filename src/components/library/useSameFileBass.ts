import { useEffect, useState } from 'react';
import { rocksmithLibrary } from '@/services/rocksmithLibrary';
import { partChartId } from '@/services/chartId';
import { isBassChart } from '@/domain/drumChart';
import type { BassChart } from '@/domain/bassChart';
import type { ChartSummary } from '@/domain/chartSummary';

/**
 * The bass chart of the GP file that gave a vocal chart: its id is the file
 * hash, and the id of the vocal chart is a hash of it, the part, and the track.
 */
export function useSameFileBass(
  vocalId: string,
  trackIndex: number,
  charts: readonly ChartSummary[],
): BassChart | null {
  const [bass, setBass] = useState<BassChart | null>(null);
  const bassIds = charts
    .filter((chart) => chart.part === 'bass')
    .map((chart) => chart.id);
  const key = bassIds.join(',');
  useEffect(() => {
    let live = true;
    setBass(null);
    void (async () => {
      for (const id of bassIds) {
        if ((await partChartId(id, 'vocals', trackIndex)) !== vocalId) continue;
        const chart = await rocksmithLibrary.getChart(id);
        if (live && chart && isBassChart(chart)) setBass(chart);
        return;
      }
    })().catch(() => {});
    return () => {
      live = false;
    };
  },[vocalId, trackIndex, key]);
  return bass;
}
