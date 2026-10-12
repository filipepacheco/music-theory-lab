import { useEffect, useState } from 'react';
import { rocksmithLibrary } from '@/services/rocksmithLibrary';
import { partChartId } from '@/services/chartId';
import { kickBeatsByBar } from '@/domain/bassKick';
import { isDrumChart } from '@/domain/drumChart';
import type { ChartSummary } from '@/domain/chartSummary';

/**
 * The kick beats of each bar from the drum chart of the same file as the bass
 * chart `bassId`, or null. The drum id is a hash of the file hash (the bass
 * id) and the part name, so the same file is proven from stored ids, not from
 * titles.
 */
export function useSameFileKick(
  bassId: string,
  charts: readonly ChartSummary[],
): number[][] | null {
  const [kick, setKick] = useState<number[][] | null>(null);
  const drumIds = charts.filter((c) => c.part === 'drums').map((c) => c.id);
  const key = drumIds.join(',');
  useEffect(() => {
    let live = true;
    setKick(null);
    void (async () => {
      const expected = await partChartId(bassId, 'drums');
      const chart = await rocksmithLibrary.getChart(expected);
      if (live && chart && isDrumChart(chart)) setKick(kickBeatsByBar(chart));
    })().catch(() => {});
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bassId, key]);
  return kick;
}
