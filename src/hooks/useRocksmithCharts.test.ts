// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { fixtureChart } from '@/domain/bassChartFixture';
import { useRocksmithCharts } from '@/hooks/useRocksmithCharts';

const state = vi.hoisted(() => ({
  charts: [] as unknown[],
  sync: vi.fn(),
  importGp: vi.fn(),
}));
vi.mock('@/services/rocksmithLibrary', () => ({
  rocksmithLibrary: {
    listCharts: async () => structuredClone(state.charts),
    save: async (chart: unknown) => {
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
    expect(result.current.charts).toEqual([chart]);
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
    expect(result.current.charts).toEqual([chart]);
    expect(result.current.importStatus.state).toBe('imported');
  });

  it('preserves the open chart object when unchanged data is refreshed', async () => {
    state.charts = [chart];
    const { result } = renderHook(useRocksmithCharts);
    await waitFor(() => expect(result.current.charts).toHaveLength(1));
    const open = result.current.charts[0];
    await act(async () => {
      await result.current.synchronize();
    });
    expect(result.current.charts[0]).toBe(open);
  });
});
