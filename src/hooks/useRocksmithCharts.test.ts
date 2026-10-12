// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { summarizeChart } from '@/domain/chartSummary';
import type { BassChart } from '@/domain/bassChart';
import { fixtureChart } from '@/domain/bassChartFixture';
import { useRocksmithCharts } from '@/hooks/useRocksmithCharts';

const state = vi.hoisted(() => ({
  charts: [] as BassChart[],
  chartReads: 0,
  listReads: 0,
  sync: vi.fn(),
  importGp: vi.fn(),
}));
vi.mock('@/services/rocksmithLibrary', () => ({
  rocksmithLibrary: {
    listCharts: async () => {
      state.listReads += 1;
      return structuredClone(state.charts);
    },
    listSummaries: async () => state.charts.map(summarizeChart),
    getChart: async (id: string) => {
      state.chartReads += 1;
      const found = state.charts.find((item) => item.id === id);
      return found ? structuredClone(found) : null;
    },
    save: async (chart: BassChart) => {
      state.charts = [chart];
    },
    remove: async () => {
      state.charts = [];
    },
  },
}));
vi.mock('@/services/bassChartSync', () => ({ syncBassCharts: state.sync }));
vi.mock('@/services/gp/importGpChart', () => ({
  importGpChart: state.importGp,
  gpChartImportErrorMessage: () => 'Erro Guitar Pro',
}));

const chart = {
  ...fixtureChart(1, [{ bar: 0, beat: 0, midi: 33 }]),
  id: 'a'.repeat(64),
  source: 'gp' as const,
};
beforeEach(() => {
  state.charts = [];
  state.sync.mockReset().mockResolvedValue(undefined);
  state.importGp.mockReset().mockResolvedValue({ chart, audio: null });
});
afterEach(cleanup);

describe('Biblioteca import and refresh', () => {
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
