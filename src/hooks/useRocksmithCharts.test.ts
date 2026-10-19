// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { summarizeChart } from '@/domain/chartSummary';
import type { BassChart } from '@/domain/bassChart';
import { fixtureChart } from '@/domain/bassChartFixture';
import type { Chart } from '@/domain/drumChart';
import { fixtureDrumChart } from '@/domain/drumChartFixture';
import { useRocksmithCharts } from '@/hooks/useRocksmithCharts';

const state = vi.hoisted(() => ({
  charts: [] as Chart[],
  saves: [] as string[],
  chartReads: 0,
  listReads: 0,
  listDelayMs: 0,
  sync: vi.fn(),
  syncSettings: vi.fn(),
  importGp: vi.fn(),
}));
vi.mock('@/services/rocksmithLibrary', () => ({
  rocksmithLibrary: {
    listCharts: async () => {
      state.listReads += 1;
      return structuredClone(state.charts);
    },
    listSummaries: async () => {
      if (state.listDelayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, state.listDelayMs));
      }
      return state.charts.map(summarizeChart);
    },
    getChart: async (id: string) => {
      state.chartReads += 1;
      const found = state.charts.find((item) => item.id === id);
      return found ? structuredClone(found) : null;
    },
    save: async (chart: Chart) => {
      state.saves.push(chart.id);
      state.charts = [
        ...state.charts.filter((item) => item.id !== chart.id),
        chart,
      ];
    },
    remove: async () => {
      state.charts = [];
    },
  },
}));
vi.mock('@/services/bassChartSync', () => ({ syncBassCharts: state.sync }));
vi.mock('@/services/chartSettingsSync', () => ({
  syncChartSettings: state.syncSettings,
}));
vi.mock('@/services/gp/importGpChart', () => ({
  importGpChart: state.importGp,
  gpChartImportErrorMessage: () => 'Erro Guitar Pro',
}));

const chart = {
  ...fixtureChart(1, [{ bar: 0, beat: 0, midi: 33 }]),
  id: 'a'.repeat(64),
  source: 'gp' as const,
};
const drums = { ...fixtureDrumChart(1, [{ bar: 0, beat: 0, midi: 36 }]) };
beforeEach(() => {
  state.charts = [];
  state.saves = [];
  state.chartReads = 0;
  state.listReads = 0;
  state.listDelayMs = 0;
  state.sync.mockReset().mockResolvedValue(undefined);
  state.syncSettings.mockReset().mockResolvedValue(undefined);
  state.importGp
    .mockReset()
    .mockResolvedValue({ charts: [chart], audio: null });
});
afterEach(cleanup);

describe('Biblioteca import and refresh', () => {
  it('keeps supported types in the guidance when an importer rejects the content', async () => {
    state.importGp.mockRejectedValue(new Error('invalid score'));
    const { result } = renderHook(useRocksmithCharts);
    await act(async () => {
      expect(
        await result.current.importFile(new File(['bad'], 'wrong.gp')),
      ).toBeNull();
    });
    expect(result.current.importStatus).toEqual({
      state: 'error',
      message: 'Erro Guitar Pro Tipos aceitos: .gp, .psarc, .mid ou .midi.',
    });
    expect(state.saves).toEqual([]);
    expect(result.current.summaries).toEqual([]);
  });

  it('rejects an unsupported filename without reading or saving it', async () => {
    const file = new File(['bad'], 'wrong.mp3');
    const read = vi.fn();
    Object.defineProperty(file, 'arrayBuffer', { value: read });
    const { result } = renderHook(useRocksmithCharts);
    await act(async () => {
      expect(await result.current.importFile(file)).toBeNull();
    });
    expect(result.current.importStatus).toMatchObject({ state: 'error' });
    expect(JSON.stringify(result.current.importStatus)).toContain(
      '.gp, .psarc, .mid ou .midi',
    );
    expect(read).not.toHaveBeenCalled();
    expect(state.saves).toEqual([]);
    expect(state.importGp).not.toHaveBeenCalled();
  });

  it('routes .gp files through the GP importer and saves the shared chart', async () => {
    const { result } = renderHook(useRocksmithCharts);
    const file = new File(['score'], 'Example.GP');
    await act(async () => {
      await result.current.importFile(file);
    });
    expect(state.importGp).toHaveBeenCalledWith(file);
    expect(result.current.summaries).toEqual([summarizeChart(chart)]);
    expect(result.current.importStatus).toMatchObject({
      state: 'imported',
      chartId: chart.id,
    });
  });

  it('saves the two charts of a file with bass and drums, and opens the bass chart', async () => {
    state.importGp.mockResolvedValue({ charts: [chart, drums], audio: null });
    const { result } = renderHook(useRocksmithCharts);
    let imported: Chart | null = null;
    await act(async () => {
      imported = await result.current.importFile(new File(['s'], 'a.gp'));
    });
    expect(imported).toEqual(chart);
    expect(state.saves).toEqual([chart.id, drums.id]);
    expect(result.current.summaries.map((item) => item.part).sort()).toEqual([
      'bass',
      'drums',
    ]);
    expect(result.current.importStatus).toMatchObject({
      state: 'imported',
      chartId: chart.id,
    });
  });

  it('a new import of a file that the library holds as a bass chart adds only the drum chart', async () => {
    state.charts = [chart as BassChart];
    const again = { ...chart, importedAt: '2026-10-12T10:00:00.000Z' };
    state.importGp.mockResolvedValue({ charts: [again, drums], audio: null });
    const { result } = renderHook(useRocksmithCharts);
    await waitFor(() => expect(result.current.summaries).toHaveLength(1));
    await act(async () => {
      await result.current.importFile(new File(['s'], 'a.gp'));
    });
    expect(state.saves).toEqual([drums.id]);
    expect(state.charts).toEqual([chart, drums]);
    expect(result.current.summaries).toHaveLength(2);
    expect(
      result.current.summaries.find((item) => item.id === chart.id)?.importedAt,
    ).toBe(chart.importedAt);
  });

  it('writes a stored chart again when the new import changes it', async () => {
    state.charts = [chart as BassChart];
    const changed = { ...chart, title: 'Outro título' };
    state.importGp.mockResolvedValue({ charts: [changed], audio: null });
    const { result } = renderHook(useRocksmithCharts);
    await act(async () => {
      await result.current.importFile(new File(['s'], 'a.gp'));
    });
    expect(state.saves).toEqual([chart.id]);
    expect(state.charts).toEqual([changed]);
  });

  it('imports a file with only drums and opens its drum chart', async () => {
    state.importGp.mockResolvedValue({ charts: [drums], audio: null });
    const { result } = renderHook(useRocksmithCharts);
    await act(async () => {
      const imported = await result.current.importFile(new File(['s'], 'a.gp'));
      await result.current.open(imported!.id);
    });
    expect(result.current.importStatus).toMatchObject({
      state: 'imported',
      chartId: drums.id,
    });
    expect(result.current.summaries).toEqual([summarizeChart(drums)]);
    expect(result.current.openChart).toEqual(drums);
  });

  it('keeps a successful local import when cloud sync fails', async () => {
    state.sync.mockRejectedValue(new Error('offline'));
    const { result } = renderHook(useRocksmithCharts);
    await act(async () => {
      await result.current.importFile(new File(['score'], 'Example.gp'));
    });
    await waitFor(() => expect(result.current.syncStatus).toBe('offline'));
    expect(result.current.summaries).toEqual([summarizeChart(chart)]);
    expect(result.current.importStatus.state).toBe('imported');
  });

  it('lists 300 summaries without reading any full chart', async () => {
    state.charts = Array.from({ length: 300 }, (_, index) => ({
      ...chart,
      id: index.toString(16).padStart(64, '0'),
    }));
    const { result } = renderHook(useRocksmithCharts);
    await waitFor(() => expect(result.current.summaries).toHaveLength(300));
    expect(state.chartReads).toBe(0);
    expect(state.listReads).toBe(0);
    expect(result.current.openChart).toBeNull();
  });

  it('loads the full chart of one song when it is opened', async () => {
    state.charts = [chart as BassChart];
    const { result } = renderHook(useRocksmithCharts);
    await waitFor(() => expect(result.current.summaries).toHaveLength(1));
    await act(async () => {
      await result.current.open(chart.id);
    });
    expect(result.current.openChart).toEqual(chart);
    expect(state.chartReads).toBe(1);
  });

  it('opens the imported chart', async () => {
    const { result } = renderHook(useRocksmithCharts);
    await act(async () => {
      const imported = await result.current.importFile(new File(['s'], 'a.gp'));
      await result.current.open(imported!.id);
    });
    expect(result.current.openChart?.id).toBe(chart.id);
  });

  it('removes the row and closes the chart after a deletion', async () => {
    state.charts = [chart as BassChart];
    const { result } = renderHook(useRocksmithCharts);
    await waitFor(() => expect(result.current.summaries).toHaveLength(1));
    await act(async () => {
      await result.current.open(chart.id);
    });
    await act(async () => {
      await result.current.remove(chart.id);
    });
    expect(result.current.summaries).toEqual([]);
    expect(result.current.openChart).toBeNull();
  });

  it('changes the row and the open chart when a synchronization changes the chart', async () => {
    state.charts = [chart as BassChart];
    const { result } = renderHook(useRocksmithCharts);
    await waitFor(() => expect(result.current.summaries).toHaveLength(1));
    await act(async () => {
      await result.current.open(chart.id);
    });
    state.sync.mockImplementation(async () => {
      state.charts = [{ ...chart, title: 'Renamed' } as BassChart];
    });
    await act(async () => {
      await result.current.synchronize();
    });
    expect(result.current.summaries[0].title).toBe('Renamed');
    expect(result.current.openChart?.title).toBe('Renamed');
  });

  it('preserves the open chart object when unchanged data is refreshed', async () => {
    state.charts = [chart as BassChart];
    const { result } = renderHook(useRocksmithCharts);
    await waitFor(() => expect(result.current.summaries).toHaveLength(1));
    await act(async () => {
      await result.current.open(chart.id);
    });
    const row = result.current.summaries[0];
    const openChart = result.current.openChart;
    await act(async () => {
      await result.current.synchronize();
    });
    expect(result.current.summaries[0]).toBe(row);
    expect(result.current.openChart).toBe(openChart);
  });
});

describe('Biblioteca synchronization status', () => {
  it('synchronizes the chart settings together with the charts', async () => {
    const { result } = renderHook(useRocksmithCharts);
    await waitFor(() => expect(result.current.syncStatus).toBe('synced'));
    expect(state.sync).toHaveBeenCalledTimes(1);
    expect(state.syncSettings).toHaveBeenCalledTimes(1);
    await act(async () => {
      await result.current.synchronize();
    });
    expect(state.sync).toHaveBeenCalledTimes(2);
    expect(state.syncSettings).toHaveBeenCalledTimes(2);
  });

  it('stays in progress until the chart settings end', async () => {
    let finish = () => {};
    state.syncSettings.mockReturnValue(
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
    );
    const { result } = renderHook(useRocksmithCharts);
    await waitFor(() => expect(state.sync).toHaveBeenCalled());
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(result.current.syncStatus).toBe('syncing');
    await act(async () => finish());
    await waitFor(() => expect(result.current.syncStatus).toBe('synced'));
  });

  it('reports no synchronization when only the chart settings fail', async () => {
    state.syncSettings.mockRejectedValue(new Error('offline'));
    const { result } = renderHook(useRocksmithCharts);
    await waitFor(() => expect(result.current.syncStatus).toBe('offline'));
    expect(state.sync).toHaveBeenCalled();

    state.syncSettings.mockResolvedValue(undefined);
    await act(async () => {
      await result.current.synchronize();
    });
    expect(result.current.syncStatus).toBe('synced');
  });

  it('synchronizes the chart settings when the charts fail', async () => {
    state.sync.mockRejectedValue(new Error('offline'));
    const { result } = renderHook(useRocksmithCharts);
    await waitFor(() => expect(result.current.syncStatus).toBe('offline'));
    expect(state.syncSettings).toHaveBeenCalledTimes(1);
  });

  it('lists the charts that a synchronization brought before it reports the end', async () => {
    state.listDelayMs = 20;
    state.sync.mockImplementation(async () => {
      state.charts = [chart as BassChart];
    });
    const seen: string[] = [];
    renderHook(() => {
      const value = useRocksmithCharts();
      seen.push(`${value.syncStatus}:${value.summaries.length}`);
      return value;
    });
    await waitFor(() => expect(seen[seen.length - 1]).toBe('synced:1'));
    expect(seen).not.toContain('synced:0');
  });

  it('reports the end of a failed pass after the local list, which still loads', async () => {
    state.charts = [chart as BassChart];
    state.listDelayMs = 20;
    state.sync.mockRejectedValue(new Error('offline'));
    const seen: string[] = [];
    renderHook(() => {
      const value = useRocksmithCharts();
      seen.push(`${value.syncStatus}:${value.summaries.length}`);
      return value;
    });
    await waitFor(() => expect(seen[seen.length - 1]).toBe('offline:1'));
    expect(seen).not.toContain('offline:0');
  });
});
