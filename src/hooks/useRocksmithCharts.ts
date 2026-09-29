import { useCallback, useEffect, useState } from 'react';
import type { BassChart } from '@/domain/bassChart';
import { rocksmithLibrary } from '@/services/rocksmithLibrary';

export type RocksmithImportStatus =
  | { state: 'idle' }
  | { state: 'importing'; fileName: string }
  | { state: 'imported'; chartId: string; hasAudio: boolean }
  | { state: 'error'; message: string };

export function useRocksmithCharts() {
  const [charts, setCharts] = useState<BassChart[]>([]);
  const [importStatus, setImportStatus] = useState<RocksmithImportStatus>({
    state: 'idle',
  });

  const refresh = useCallback(async () => {
    try {
      setCharts(await rocksmithLibrary.listCharts());
    } catch {
      // IndexedDB unavailable (private mode, blocked): no imported charts.
      setCharts([]);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const importFile = useCallback(
    async (file: File): Promise<BassChart | null> => {
      setImportStatus({ state: 'importing', fileName: file.name });
      // Let the status paint: parsing and audio conversion block the thread.
      await new Promise((resolve) => setTimeout(resolve, 30));
      const { importPsarc, psarcImportErrorMessage } =
        await import('@/services/rocksmith/importPsarc');
      try {
        const { chart, audio } = await importPsarc(file);
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
        return chart;
      } catch (error) {
        setImportStatus({
          state: 'error',
          message:
            error instanceof DOMException
              ? 'Não foi possível salvar a importação neste navegador.'
              : psarcImportErrorMessage(error),
        });
        return null;
      }
    },
    [refresh],
  );

  const remove = useCallback(
    async (chartId: string) => {
      await rocksmithLibrary.remove(chartId);
      await refresh();
    },
    [refresh],
  );

  return { charts, importStatus, importFile, remove };
}
