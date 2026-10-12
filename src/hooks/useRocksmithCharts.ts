import { useCallback, useEffect, useRef, useState } from 'react';
import type { BassChart } from '@/domain/bassChart';
import type { ChartSummary } from '@/domain/chartSummary';
import { rocksmithLibrary } from '@/services/rocksmithLibrary';
import { syncBassCharts } from '@/services/bassChartSync';

export type RocksmithImportStatus =
  | { state: 'idle' }
  | { state: 'importing'; fileName: string }
  | { state: 'imported'; chartId: string; hasAudio: boolean }
  | { state: 'error'; message: string };

/** The importer for a file, by extension. */
async function loadImporter(file: File) {
  if (/\.gp$/i.test(file.name)) {
    const { importGpChart, gpChartImportErrorMessage } =
      await import('@/services/gp/importGpChart');
    return {
      importChart: importGpChart,
      importErrorMessage: gpChartImportErrorMessage,
    };
  }
  if (/\.midi?$/i.test(file.name)) {
    const { importMidi, midiImportErrorMessage } =
      await import('@/services/midi/importMidi');
    return {
      importChart: importMidi,
      importErrorMessage: midiImportErrorMessage,
    };
  }
  const { importPsarc, psarcImportErrorMessage } =
    await import('@/services/rocksmith/importPsarc');
  return {
    importChart: importPsarc,
    importErrorMessage: psarcImportErrorMessage,
  };
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
  const [openChart, setOpenChart] = useState<BassChart | null>(null);
  const openIdRef = useRef<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<
    'syncing' | 'synced' | 'offline'
  >('syncing');
  const [importStatus, setImportStatus] = useState<RocksmithImportStatus>({
    state: 'idle',
  });

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
    try {
      await syncBassCharts();
      setSyncStatus('synced');
    } catch {
      setSyncStatus('offline');
    }
    await refresh();
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
    async (file: File): Promise<BassChart | null> => {
      setImportStatus({ state: 'importing', fileName: file.name });
      // Let the status paint: parsing and audio conversion block the thread.
      await new Promise((resolve) => setTimeout(resolve, 30));
      let importErrorMessage: (error: unknown) => string = () =>
        'Não foi possível importar o arquivo.';
      try {
        const loaded = await loadImporter(file);
        importErrorMessage = loaded.importErrorMessage;
        const { importChart } = loaded;
        const { chart, audio } = await importChart(file);
        await rocksmithLibrary.save(
          chart,
          audio && { chartId: chart.id, origin: 'psarc', ...audio },
        );
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
  };
}
