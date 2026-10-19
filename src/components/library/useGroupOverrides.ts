import { useCallback, useEffect, useState } from 'react';
import { rocksmithLibrary } from '@/services/rocksmithLibrary';
import { syncChartSettings } from '@/services/chartSettingsSync';
import { groupOverridesOf, withGroupOverride } from '@/domain/chartSettings';

export function useGroupOverrides(refreshKey: unknown) {
  const [overrides, setOverrides] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const settings = await rocksmithLibrary.listSettings();
        if (cancelled) return;
        const next = groupOverridesOf(settings);
        setOverrides((current) =>
          JSON.stringify(current) === JSON.stringify(next) ? current : next,
        );
      } catch {}
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
