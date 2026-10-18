import { withBrowserLineLengths } from '@/domain/chartSettings';
import type { RocksmithLibraryRepository } from '@/services/rocksmithLibrary';

export const BARS_PER_ROW_KEY = 'music-theory-lab:bars-per-row';
export const LINE_LENGTH_MIGRATED_KEY =
  'music-theory-lab:line-lengths-migrated';

type Library = Pick<
  RocksmithLibraryRepository,
  'listCharts' | 'getSettings' | 'saveSettings' | 'applySettings'
>;

export async function migrateBrowserLineLengths(
  library: Library,
  storage: Pick<Storage, 'getItem' | 'setItem'>,
): Promise<boolean> {
  if (storage.getItem(LINE_LENGTH_MIGRATED_KEY) === 'true') return false;
  let browser: unknown = {};
  try {
    browser = JSON.parse(storage.getItem(BARS_PER_ROW_KEY) ?? '{}');
  } catch {}
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
      if (current) await library.saveSettings(copy);
      else await library.applySettings(copy);
    }
  }
  storage.setItem(LINE_LENGTH_MIGRATED_KEY, 'true');
  return true;
}
