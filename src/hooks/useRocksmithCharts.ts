import { useCallback, useEffect, useState } from 'react';
import type { BassChart } from '@/domain/bassChart';
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

export function useRocksmithCharts() {
  const [charts, setCharts] = useState<BassChart[]>([]);
  const [syncStatus, setSyncStatus] = useState<
    'syncing' | 'synced' | 'offline'
  >('syncing');
  const [importStatus, setImportStatus] = useState<RocksmithImportStatus>({
    state: 'idle',
  });

  const refresh = useCallback(async () => {
    try {
      const next = await rocksmithLibrary.listCharts();
      // Preserve unchanged chart objects: background polling must not reset
      // the synth transport or the user's position in the open chart.
      setCharts((current) =>
        next.map((chart) => {
          const existing = current.find((item) => item.id === chart.id);
          return existing && JSON.stringify(existing) === JSON.stringify(chart)
            ? existing
            : chart;
        }),
      );
    } catch {
      // IndexedDB unavailable (private mode, blocked): no imported charts.
      setCharts([]);
    }
  }, []);

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

  return { charts, importStatus, importFile, remove, syncStatus, synchronize };
}
