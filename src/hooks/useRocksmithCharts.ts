import { useCallback, useEffect, useRef, useState } from 'react';
import type { Chart } from '@/domain/drumChart';
import type { ChartSummary } from '@/domain/chartSummary';
import { rocksmithLibrary } from '@/services/rocksmithLibrary';
import { syncBassCharts } from '@/services/bassChartSync';
import { syncChartSettings } from '@/services/chartSettingsSync';

export type RocksmithImportStatus =
  | { state: 'idle' }
  | { state: 'importing'; fileName: string }
  | { state: 'imported'; chartId: string; hasAudio: boolean }
  | { state: 'error'; message: string };

/**
 * The importer for a file, by extension. An import gives one chart for each
 * part of the file, the bass chart first.
 */
async function loadImporter(file: File) {
  if (/\.gp$/i.test(file.name)) {
    const { importGpChart, gpChartImportErrorMessage } =
      await import('@/services/gp/importGpChart');
    return {
      importCharts: importGpChart,
      importErrorMessage: gpChartImportErrorMessage,
    };
  }
  if (/\.midi?$/i.test(file.name)) {
    const { importMidi, midiImportErrorMessage } =
      await import('@/services/midi/importMidi');
    return {
      importCharts: importMidi,
      importErrorMessage: midiImportErrorMessage,
    };
  }
  const { importPsarc, psarcImportErrorMessage } =
    await import('@/services/rocksmith/importPsarc');
  return {
    importCharts: async (source: File) => {
      const { chart, audio } = await importPsarc(source);
      return { charts: [chart], audio };
    },
    importErrorMessage: psarcImportErrorMessage,
  };
}

/** True when a new import of the file gives the chart that is stored. */
function isStoredChart(stored: Chart | null, imported: Chart): boolean {
  return (
    stored !== null &&
    JSON.stringify({ ...stored, importedAt: '' }) ===
      JSON.stringify({ ...imported, importedAt: '' })
  );
}

/** Keep the previous object when the new one holds the same data. */
function keepIfEqual<T>(existing: T | undefined, next: T): T {
  return existing !== undefined &&
    JSON.stringify(existing) === JSON.stringify(next)
    ? existing
    : next;
}

export function useRocksmithCharts() {
  const [summaries, setSummaries] = useState<ChartSummary[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [openChart, setOpenChart] = useState<Chart | null>(null);
  const openIdRef = useRef<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<
    'syncing' | 'synced' | 'offline'
  >('syncing');
  const [importStatus, setImportStatus] = useState<RocksmithImportStatus>({
    state: 'idle',
  });
  // Raised when a pass of the chart settings ends. A pass can bring settings
  // of a different device and no chart: `summaries` keeps its identity then,
  // so a screen that shows chart settings reloads them by this number.
  const [settingsRevision, setSettingsRevision] = useState(0);

  /** Load the one full chart that is open; null when it is gone. */
  const loadOpen = useCallback(async () => {
    const id = openIdRef.current;
    if (id === null) return;
    try {
      const chart = await rocksmithLibrary.getChart(id);
      if (openIdRef.current !== id) return;
      // Preserve an unchanged chart object: background polling must not reset
      // the synth transport or the user's position in the open chart.
      setOpenChart((current) =>
        chart
          ? keepIfEqual(current?.id === id ? current : undefined, chart)
          : null,
      );
    } catch {
      if (openIdRef.current === id) setOpenChart(null);
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      const next = await rocksmithLibrary.listSummaries();
      setSummaries((current) => {
        const same =
          current.length === next.length &&
          next.every(
            (row, index) => keepIfEqual(current[index], row) === current[index],
          );
        return same
          ? current
          : next.map((row) =>
              keepIfEqual(
                current.find((item) => item.id === row.id),
                row,
              ),
            );
      });
    } catch {
      // IndexedDB unavailable (private mode, blocked): no imported charts.
      setSummaries([]);
    }
    await loadOpen();
  }, [loadOpen]);

  /** Open one chart by id, loading it in full; null closes it. */
  const open = useCallback(
    async (chartId: string | null) => {
      openIdRef.current = chartId;
      setOpenId(chartId);
      setOpenChart(null);
      await loadOpen();
    },
    [loadOpen],
  );

  const synchronize = useCallback(async () => {
    setSyncStatus('syncing');
    // The status covers the charts and the chart settings. One that fails
    // does not stop the other.
    // A pass that fails can still have stored what it read, so the number
    // rises after each pass. It does not wait for the charts.
    const results = await Promise.allSettled([
      syncBassCharts(),
      syncChartSettings().finally(() =>
        setSettingsRevision((revision) => revision + 1),
      ),
    ]);
    // The list is read before the status leaves 'syncing': a screen that
    // waits for the end of a pass then sees the charts that the pass brought.
    // `refresh` catches its own errors, so the status always changes.
    await refresh();
    setSyncStatus(
      results.every((result) => result.status === 'fulfilled')
        ? 'synced'
        : 'offline',
    );
  }, [refresh]);

  useEffect(() => {
    void refresh();
    void synchronize();
    const retry = () => void synchronize();
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') retry();
    }, 30_000);
    window.addEventListener('focus', retry);
    window.addEventListener('online', retry);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', retry);
      window.removeEventListener('online', retry);
    };
  }, [refresh, synchronize]);

  const importFile = useCallback(
    async (file: File): Promise<Chart | null> => {
      setImportStatus({ state: 'importing', fileName: file.name });
      // Let the status paint: parsing and audio conversion block the thread.
      await new Promise((resolve) => setTimeout(resolve, 30));
      let importErrorMessage: (error: unknown) => string = () =>
        'Não foi possível importar o arquivo.';
      try {
        const loaded = await loadImporter(file);
        importErrorMessage = loaded.importErrorMessage;
        const { charts, audio } = await loaded.importCharts(file);
        // The first chart opens after the import, and it owns the recording.
        const [chart] = charts;
        for (const item of charts) {
          const recording =
            item === chart && audio
              ? { chartId: item.id, origin: 'psarc' as const, ...audio }
              : null;
          // A new import of a file adds only the part that the library does
          // not hold: a stored chart with no change is not written again.
          if (
            !recording &&
            isStoredChart(await rocksmithLibrary.getChart(item.id), item)
          )
            continue;
          await rocksmithLibrary.save(item, recording);
        }
        await refresh();
        setImportStatus({
          state: 'imported',
          chartId: chart.id,
          hasAudio: audio !== null,
        });
        void synchronize();
        return chart;
      } catch (error) {
        setImportStatus({
          state: 'error',
          message:
            error instanceof DOMException
              ? 'Não foi possível salvar a importação neste navegador.'
              : importErrorMessage(error),
        });
        return null;
      }
    },
    [refresh, synchronize],
  );

  const remove = useCallback(
    async (chartId: string) => {
      await rocksmithLibrary.remove(chartId);
      await refresh();
      void synchronize();
    },
    [refresh, synchronize],
  );

  return {
    summaries,
    openId,
    openChart,
    open,
    importStatus,
    importFile,
    remove,
    syncStatus,
    synchronize,
    settingsRevision,
  };
}
