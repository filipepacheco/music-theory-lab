import { useEffect, useState } from 'react';
import { rocksmithLibrary } from '@/services/rocksmithLibrary';
import { partChartId } from '@/services/chartId';
import { isGuitarChart, type GuitarChart } from '@/domain/guitarChart';
import type { ChartSummary } from '@/domain/chartSummary';

/** Ids of the guitar charts that come from the same GP file as the bass. */
export async function sameFileGuitarIds(
  bassId: string,
  charts: readonly ChartSummary[],
): Promise<string[]> {
  const found: string[] = [];
  for (const chart of charts) {
    if (chart.part !== 'guitar' || chart.trackIndex === undefined) continue;
    if ((await partChartId(bassId, 'guitar', chart.trackIndex)) === chart.id)
      found.push(chart.id);
  }
  return found;
}

/** The guitar charts of the same file as the bass chart. */
export function useSameFileGuitars(
  bassId: string,
  charts: readonly ChartSummary[] | undefined,
): readonly GuitarChart[] {
  const [guitars, setGuitars] = useState<readonly GuitarChart[]>([]);
  const key = (charts ?? [])
    .filter((c) => c.part === 'guitar')
    .map((c) => `${c.id}:${c.trackIndex}`)
    .join(',');
  useEffect(() => {
    let live = true;
    if (!key) {
      setGuitars([]);
      return;
    }
    void (async () => {
      const ids = await sameFileGuitarIds(bassId, charts ?? []);
      const loaded = await Promise.all(
        ids.map((id) => rocksmithLibrary.getChart(id)),
      );
      const found: GuitarChart[] = [];
      for (const chart of loaded) {
        if (chart && isGuitarChart(chart)) found.push(chart);
      }
      if (live) setGuitars(found);
    })().catch(() => {});
    return () => {
      live = false;
    };
    // `charts` is covered by `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bassId, key]);
  return guitars;
}
