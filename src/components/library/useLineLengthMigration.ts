import { useEffect, useState } from 'react';
import { rocksmithLibrary } from '@/services/rocksmithLibrary';
import { syncChartSettings } from '@/services/chartSettingsSync';
import { migrateBrowserLineLengths } from '@/services/lineLengthMigration';

/**
 * Run the one-time copy of the browser line lengths into chart settings, then
 * synchronize them without waiting. The result changes when the copy wrote
 * something, so a screen can reload its line lengths.
 */
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
      } catch {
        // The next start tries again; a failure never blocks the screen.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return copies;
}
