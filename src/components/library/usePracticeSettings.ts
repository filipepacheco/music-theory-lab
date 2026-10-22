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
  const [loaded, setLoaded] = useState<{
    chartId: string;
    practice: Practice;
  } | null>(null);
  const practice =
    loaded?.chartId === chartId ? loaded.practice : ORIGINAL_PRACTICE;
  const setPractice = useCallback(
    (change: (shown: Practice) => Practice) =>
      setLoaded((current) => ({
        chartId,
        practice: change(
          current?.chartId === chartId ? current.practice : ORIGINAL_PRACTICE,
        ),
      })),
    [chartId],
  );
  const writes = useRef(0);
  const queue = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    let cancelled = false;
    const writesBefore = writes.current;
    (async () => {
      try {
        const stored = await rocksmithLibrary.getSettings(chartId);
        if (!cancelled && writes.current === writesBefore)
          setLoaded({ chartId, practice: practiceOf(stored) });
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, [chartId, refreshKey]);

  const write = useCallback(
    (change: (shown: ChartSettings | null, now: string) => ChartSettings) => {
      const id = (writes.current += 1);
      const run = async () => {
        try {
          const current = await rocksmithLibrary.getSettings(chartId);
          const next = change(current, new Date().toISOString());
          if (writes.current === id) setPractice(() => practiceOf(next));
          await rocksmithLibrary.saveSettings(next);
        } catch {
          return;
        }
        void syncChartSettings().catch(() => undefined);
      };
      const done = queue.current.then(run);
      queue.current = done;
      return done;
    },
    [chartId, setPractice],
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
      setPractice((shown) => ({ ...shown, transposition: next }));
      return write((s, now) => withTransposition(s, chartId, next, now));
    },
    [chartId, setPractice, write],
  );

  return {
    octaves: practice.octaves,
    transposition: practice.transposition,
    setOctave,
    clearOctaves,
    setTransposition,
  };
}
