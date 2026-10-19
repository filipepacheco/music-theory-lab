import { useEffect, useState } from 'react';
import { rocksmithLibrary } from '@/services/rocksmithLibrary';
import { syncChartSettings } from '@/services/chartSettingsSync';
import { migrateBrowserLineLengths } from '@/services/lineLengthMigration';

export function useLineLengthMigration(): number {
  const [copies, setCopies] = useState(0);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const ran = await migrateBrowserLineLengths(
          rocksmithLibrary,
          localStorage,
        );
        if (!ran) return;
        if (!cancelled) setCopies((n) => n + 1);
        void syncChartSettings().catch(() => undefined);
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return copies;
}
