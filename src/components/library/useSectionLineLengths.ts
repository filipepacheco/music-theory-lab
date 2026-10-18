import { useCallback, useEffect, useState } from 'react';
import { rocksmithLibrary } from '@/services/rocksmithLibrary';
import { syncChartSettings } from '@/services/chartSettingsSync';
import {
  sectionLineLength,
  withSectionLineLength,
  withSongLineLength,
  withoutSectionLineLength,
  hasOwnSectionLineLength,
  type ChartSettings,
  type LineLength,
} from '@/domain/chartSettings';

export function useSectionLineLengths(chartId: string, refreshKey: unknown) {
  const [settings, setSettings] = useState<ChartSettings | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stored = await rocksmithLibrary.getSettings(chartId);
        if (!cancelled) setSettings(stored);
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, [chartId, refreshKey]);

  const lengthOf = useCallback(
    (startBar: number): LineLength => sectionLineLength(settings, startBar),
    [settings],
  );

  const write = useCallback(
    async (
      change: (shown: ChartSettings | null, now: string) => ChartSettings,
    ) => {
      const now = new Date().toISOString();
      setSettings((shown) => change(shown, now));
      try {
        const current = await rocksmithLibrary.getSettings(chartId);
        await rocksmithLibrary.saveSettings(change(current, now));
        setSettings(await rocksmithLibrary.getSettings(chartId));
      } catch {
        return;
      }
      void syncChartSettings().catch(() => undefined);
    },
    [chartId],
  );

  const setLength = useCallback(
    (startBar: number, length: LineLength) =>
      write((s, now) =>
        withSectionLineLength(s, chartId, startBar, length, now),
      ),
    [chartId, write],
  );

  const setSongLength = useCallback(
    (length: LineLength) =>
      write((s, now) => withSongLineLength(s, chartId, length, now)),
    [chartId, write],
  );

  const clearLength = useCallback(
    (startBar: number) =>
      write((s, now) => withoutSectionLineLength(s, chartId, startBar, now)),
    [chartId, write],
  );

  const isOwn = useCallback(
    (startBar: number) => hasOwnSectionLineLength(settings, startBar),
    [settings],
  );

  return {
    lengthOf,
    setLength,
    setSongLength,
    clearLength,
    isOwn,
    songLength: (settings?.songLineLength ?? 'auto') as LineLength,
    hasSectionLengths:
      Object.keys(settings?.sectionLineLengths ?? {}).length > 0,
  };
}
