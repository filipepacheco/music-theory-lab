import { withBrowserLineLengths } from '@/domain/chartSettings';
import type { RocksmithLibraryRepository } from '@/services/rocksmithLibrary';

/** The old browser store: chart id, then first bar of a section, then length. */
export const BARS_PER_ROW_KEY = 'music-theory-lab:bars-per-row';
export const LINE_LENGTH_MIGRATED_KEY =
  'music-theory-lab:line-lengths-migrated';

type Library = Pick<
  RocksmithLibraryRepository,
  'listCharts' | 'getSettings' | 'saveSettings' | 'applySettings'
>;

/**
 * Copy the line lengths of this browser into chart settings, one time. A copy
 * for a chart without settings has the import time of its chart as update
 * time, so an edit from a different device wins. Returns true when it ran.
 * A failure leaves the flag unset, so the next start tries again.
 */
export async function migrateBrowserLineLengths(
  library: Library,
  storage: Pick<Storage, 'getItem' | 'setItem'>,
): Promise<boolean> {
  if (storage.getItem(LINE_LENGTH_MIGRATED_KEY) === 'true') return false;
  let browser: unknown = {};
  try {
    browser = JSON.parse(storage.getItem(BARS_PER_ROW_KEY) ?? '{}');
  } catch {
    // Unreadable old data: nothing to copy.
  }
  if (browser && typeof browser === 'object') {
    const charts = await library.listCharts();
    for (const chart of charts) {
      const perChart = (browser as Record<string, unknown>)[chart.id];
      const current = await library.getSettings(chart.id);
      const copy = withBrowserLineLengths(
        current,
        chart.id,
        perChart,
        new Date(chart.importedAt).toISOString(),
      );
      if (!copy) continue;
      // Without settings the copy keeps the import time; with settings it
      // is a merge that the device makes now.
      if (current) await library.saveSettings(copy);
      else await library.applySettings(copy);
    }
  }
  storage.setItem(LINE_LENGTH_MIGRATED_KEY, 'true');
  return true;
}
