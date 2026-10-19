import { importFormat } from '@/domain/importFormat';
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

async function loadImporter(file: File) {
  const format = importFormat(file.name);
  if (!format) throw new Error('Selecione um arquivo .gp, .psarc, .mid ou .midi.');
  if (format === 'gp') {
    const { importGpChart, gpChartImportErrorMessage } =
      await import('@/services/gp/importGpChart');
    return {
      importCharts: importGpChart,
      importErrorMessage: gpChartImportErrorMessage,
    };
  }
  if (format === 'midi') {
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

function isStoredChart(stored: Chart | null, imported: Chart): boolean {
  return (
    stored !== null &&
    JSON.stringify({ ...stored, importedAt: '' }) ===
      JSON.stringify({ ...imported, importedAt: '' })
  );
}

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
  const [settingsRevision, setSettingsRevision] = useState(0);

  const loadOpen = useCallback(async () => {
    const id = openIdRef.current;
    if (id === null) return;
    try {
      const chart = await rocksmithLibrary.getChart(id);
      if (openIdRef.current !== id) return;
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
      setSummaries([]);
    }
    await loadOpen();
  }, [loadOpen]);

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
    const results = await Promise.allSettled([
      syncBassCharts(),
      syncChartSettings().finally(() =>
        setSettingsRevision((revision) => revision + 1),
      ),
    ]);
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
      await new Promise((resolve) => setTimeout(resolve, 30));
      let importErrorMessage: (error: unknown) => string = () =>
        'Selecione um arquivo .gp, .psarc, .mid ou .midi válido.';
      try {
        const loaded = await loadImporter(file);
        importErrorMessage = loaded.importErrorMessage;
        const { charts, audio } = await loaded.importCharts(file);
        const [chart] = charts;
        for (const item of charts) {
          const recording =
            item === chart && audio
              ? { chartId: item.id, origin: 'psarc' as const, ...audio }
              : null;
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
