import { useCallback, useEffect, useRef, useState } from 'react';
import { rocksmithLibrary } from '@/services/rocksmithLibrary';
import { syncChartSettings } from '@/services/chartSettingsSync';
import {
  chartTransposition,
  ORIGINAL_TRANSPOSITION,
  withBarOctave,
  withoutBarOctaves,
  withTransposition,
  type ChartSettings,
  type ChartTransposition,
} from '@/domain/chartSettings';
import type { BarOctaves } from '@/domain/bassTransposition';

const NO_OCTAVES: BarOctaves = {};

interface Practice {
  octaves: BarOctaves;
  transposition: ChartTransposition;
}

const ORIGINAL_PRACTICE: Practice = {
  octaves: NO_OCTAVES,
  transposition: ORIGINAL_TRANSPOSITION,
};

function practiceOf(settings: ChartSettings | null): Practice {
  return {
    octaves: settings?.barOctaves ?? NO_OCTAVES,
    transposition: chartTransposition(settings),
  };
}

export function usePracticeSettings(chartId: string, refreshKey: unknown) {
  const [practice, setPractice] = useState<Practice>(ORIGINAL_PRACTICE);
  const writes = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const writesBefore = writes.current;
    setPractice(ORIGINAL_PRACTICE);
    (async () => {
      try {
        const stored = await rocksmithLibrary.getSettings(chartId);
        if (!cancelled && writes.current === writesBefore)
          setPractice(practiceOf(stored));
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, [chartId, refreshKey]);

  const write = useCallback(
    async (
      change: (shown: ChartSettings | null, now: string) => ChartSettings,
    ) => {
      writes.current += 1;
      const now = new Date().toISOString();
      try {
        const current = await rocksmithLibrary.getSettings(chartId);
        const next = change(current, now);
        setPractice(practiceOf(next));
        await rocksmithLibrary.saveSettings(next);
      } catch {
        return;
      }
      void syncChartSettings().catch(() => undefined);
    },
    [chartId],
  );

  const setOctave = useCallback(
    (bars: readonly number[], octave: number) =>
      write((s, now) => withBarOctave(s, chartId, bars, octave, now)),
    [chartId, write],
  );

  const clearOctaves = useCallback(
    () => write((s, now) => withoutBarOctaves(s, chartId, now)),
    [chartId, write],
  );

  const setTransposition = useCallback(
    (next: ChartTransposition) => {
      writes.current += 1;
      setPractice((shown) => ({ ...shown, transposition: next }));
      return write((s, now) => withTransposition(s, chartId, next, now));
    },
    [chartId, write],
  );

  return {
    octaves: practice.octaves,
    transposition: practice.transposition,
    setOctave,
    clearOctaves,
    setTransposition,
  };
}
