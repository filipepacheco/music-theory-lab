import { useCallback, useEffect, useState } from 'react';
import { rocksmithLibrary } from '@/services/rocksmithLibrary';
import { syncChartSettings } from '@/services/chartSettingsSync';
import { groupOverridesOf, withGroupOverride } from '@/domain/chartSettings';

/**
 * The group overrides of the chart settings of this device. They reload when
 * `refreshKey` changes (a synchronization brings the ones of other devices).
 * `setOverride` stores one through the settings path and synchronizes it
 * without waiting; a failed synchronization never blocks the screen.
 */
export function useGroupOverrides(refreshKey: unknown) {
  const [overrides, setOverrides] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const settings = await rocksmithLibrary.listSettings();
        if (cancelled) return;
        const next = groupOverridesOf(settings);
        // A reload with no change keeps the object, so the songs are not
        // grouped again after each synchronization.
        setOverrides((current) =>
          JSON.stringify(current) === JSON.stringify(next) ? current : next,
        );
      } catch {
        // No local store: the calculated groups stay.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const setOverride = useCallback(
    async (chartId: string, override: string | null) => {
      const current = await rocksmithLibrary.getSettings(chartId);
      await rocksmithLibrary.saveSettings(
        withGroupOverride(current, chartId, override, new Date().toISOString()),
      );
      setOverrides(groupOverridesOf(await rocksmithLibrary.listSettings()));
      void syncChartSettings().catch(() => undefined);
    },
    [],
  );

  return { overrides, setOverride };
}
