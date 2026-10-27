import { useEffect, useState } from 'react';
import { rocksmithLibrary } from '@/services/rocksmithLibrary';
import { isGuitarChart, type GuitarChart } from '@/domain/guitarChart';
import type { ChartSummary } from '@/domain/chartSummary';

/** The guitar charts of the song; the analysis keeps those of the same file. */
export function useSameFileGuitars(
  charts: readonly ChartSummary[] | undefined,
): readonly GuitarChart[] {
  const [guitars, setGuitars] = useState<readonly GuitarChart[]>([]);
  const key = (charts ?? [])
    .filter((c) => c.part === 'guitar')
    .map((c) => c.id)
    .join(',');
  useEffect(() => {
    let live = true;
    const ids = key ? key.split(',') : [];
    if (ids.length === 0) {
      setGuitars([]);
      return;
    }
    void (async () => {
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
  }, [key]);
  return guitars;
}
