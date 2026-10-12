import { useCallback, useEffect, useState } from 'react';
import { rocksmithLibrary } from '@/services/rocksmithLibrary';
import { syncChartSettings } from '@/services/chartSettingsSync';
import {
  sectionLineLength,
  withSectionLineLength,
  type ChartSettings,
  type LineLength,
} from '@/domain/chartSettings';

/**
 * The line lengths of one chart, from its chart settings. They reload when
 * `refreshKey` changes (a synchronization or the copy from the browser brings
 * new ones). `setLength` stores a choice through the settings path and
 * synchronizes it without waiting; it never touches the chart, so playback
 * and the cursor stay as they are.
 */
export function useSectionLineLengths(chartId: string, refreshKey: unknown) {
  const [settings, setSettings] = useState<ChartSettings | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stored = await rocksmithLibrary.getSettings(chartId);
        if (!cancelled) setSettings(stored);
      } catch {
        // No local store: the automatic layout stays.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [chartId, refreshKey]);

  const lengthOf = useCallback(
    (startBar: number): LineLength => sectionLineLength(settings, startBar),
    [settings],
  );

  const setLength = useCallback(
    async (startBar: number, length: LineLength) => {
      const now = new Date().toISOString();
      // The screen shows the choice at once; the store confirms it below.
      setSettings((shown) =>
        withSectionLineLength(shown, chartId, startBar, length, now),
      );
      try {
        const current = await rocksmithLibrary.getSettings(chartId);
        await rocksmithLibrary.saveSettings(
          withSectionLineLength(current, chartId, startBar, length, now),
        );
        setSettings(await rocksmithLibrary.getSettings(chartId));
      } catch {
        return;
      }
      void syncChartSettings().catch(() => undefined);
    },
    [chartId],
  );

  return { lengthOf, setLength };
}
