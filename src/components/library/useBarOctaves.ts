import { useCallback, useEffect, useState } from 'react';
import { rocksmithLibrary } from '@/services/rocksmithLibrary';
import { syncChartSettings } from '@/services/chartSettingsSync';
import {
  withBarOctave,
  withoutBarOctaves,
  type ChartSettings,
} from '@/domain/chartSettings';
import type { BarOctaves } from '@/domain/bassTransposition';

const NO_OCTAVES: BarOctaves = {};

/**
 * The bar octaves of one chart, from its chart settings. They reload when
 * `refreshKey` changes. A change shows at once, is stored through the
 * settings path, and synchronizes without waiting; the chart is not touched.
 */
export function useBarOctaves(chartId: string, refreshKey: unknown) {
  const [octaves, setOctaves] = useState<BarOctaves>(NO_OCTAVES);

  useEffect(() => {
    let cancelled = false;
    setOctaves(NO_OCTAVES);
    (async () => {
      try {
        const stored = await rocksmithLibrary.getSettings(chartId);
        if (!cancelled) setOctaves(stored?.barOctaves ?? NO_OCTAVES);
      } catch {
        // No local store: each bar plays as written.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [chartId, refreshKey]);

  const write = useCallback(
    async (
      change: (shown: ChartSettings | null, now: string) => ChartSettings,
    ) => {
      const now = new Date().toISOString();
      try {
        const current = await rocksmithLibrary.getSettings(chartId);
        const next = change(current, now);
        setOctaves(next.barOctaves ?? NO_OCTAVES);
        await rocksmithLibrary.saveSettings(next);
      } catch {
        return;
      }
      void syncChartSettings().catch(() => undefined);
    },
    [chartId],
  );

  /** One write for all `bars`; an octave of 0 removes their choice. */
  const setOctave = useCallback(
    (bars: readonly number[], octave: number) =>
      write((s, now) => withBarOctave(s, chartId, bars, octave, now)),
    [chartId, write],
  );

  const clear = useCallback(
    () => write((s, now) => withoutBarOctaves(s, chartId, now)),
    [chartId, write],
  );

  return { octaves, setOctave, clear };
}
