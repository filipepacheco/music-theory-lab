// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { IDBFactory } from 'fake-indexeddb';
import { fixtureChart } from '@/domain/bassChartFixture';
import type { BassChartRecord } from '@/domain/bassChartRecord';
import { withGroupOverride, type ChartSettings } from '@/domain/chartSettings';
import { groupLibrarySongs } from '@/domain/librarySong';
import { rocksmithLibrary } from '@/services/rocksmithLibrary';
import { useRocksmithCharts } from '@/hooks/useRocksmithCharts';

const chart = {
  ...fixtureChart(2, [{ bar: 0, beat: 0, midi: 33 }]),
  id: 'a'.repeat(64),
  source: 'gp' as const,
};
const settings: ChartSettings = {
  chartId: chart.id,
  updatedAt: '2026-10-05T10:00:00.000Z',
  songLineLength: 4,
  sectionLineLengths: { 0: 'auto', 8: 2 },
  groupOverride: null,
};

interface Sent {
  method: string;
  path: string;
  records: unknown[];
}

function route<R>(id: (record: R) => string) {
  const rows = new Map<string, { record: R; counter: number }>();
  let last = 0;
  return {
    failing: false,
    record: (key: string) => rows.get(key)?.record,
    put(record: R) {
      rows.set(id(record), { record, counter: ++last });
      return last;
    },
    read(after: number) {
      const page = [...rows.values()]
        .filter((row) => row.counter > after)
        .sort((a, b) => a.counter - b.counter);
      return {
        records: page.map((row) => row.record),
        counter: page.length > 0 ? page[page.length - 1].counter : after,
        more: false,
      };
    },
  };
}

function network() {
  const routes = {
    '/api/bass-charts': route<BassChartRecord>((record) => record.id),
    '/api/chart-settings': route<ChartSettings>((record) => record.chartId),
  };
  const sent: Sent[] = [];
  vi.stubGlobal(
    'fetch',
    async (url: string, init?: { method?: string; body?: string }) => {
      const [path, search = ''] = url.split('?');
      const target = routes[path as keyof typeof routes] as ReturnType<
        typeof route<unknown>
      >;
      if (target.failing) return { ok: false, status: 500 };
      if (init?.method === 'POST') {
        const records: unknown[] = JSON.parse(init.body!).records;
        sent.push({ method: 'POST', path, records });
        const counters = records.map((record) => target.put(record));
        return { ok: true, status: 200, json: async () => ({ counters }) };
      }
      const page = target.read(
        Number(new URLSearchParams(search).get('after')),
      );
      sent.push({ method: 'GET', path, records: page.records });
      return {
        ok: true,
        status: 200,
        json: async () => structuredClone(page),
      };
    },
  );
  return {
    sent,
    charts: routes['/api/bass-charts'],
    settings: routes['/api/chart-settings'],
  };
}

let cloud: ReturnType<typeof network>;

beforeEach(() => {
  vi.stubGlobal('indexedDB', new IDBFactory());
  localStorage.clear();
  cloud = network();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function openLibrary() {
  await rocksmithLibrary.save(chart, null);
  const view = renderHook(useRocksmithCharts);
  await waitFor(() => expect(view.result.current.syncStatus).toBe('synced'));
  await act(async () => {
    await view.result.current.open(chart.id);
  });
  expect(view.result.current.openChart).toEqual(chart);
  cloud.sent.length = 0;
  return view;
}

const chartsSent = () =>
  cloud.sent.filter(
    (item) => item.path === '/api/bass-charts' && item.records.length > 0,
  );

describe('chart settings in the Biblioteca', () => {
  it('a settings change sends no chart and keeps the open chart, so playback does not restart', async () => {
    const { result } = await openLibrary();
    const openChart = result.current.openChart;
    const row = result.current.summaries[0];
    const chartRecords = await rocksmithLibrary.listRecords();

    await rocksmithLibrary.saveSettings(settings);
    await act(async () => {
      await result.current.synchronize();
    });

    expect(result.current.syncStatus).toBe('synced');
    expect(cloud.sent.filter((item) => item.method === 'POST')).toEqual([
      { method: 'POST', path: '/api/chart-settings', records: [settings] },
    ]);
    expect(chartsSent()).toEqual([]);
    expect(cloud.settings.record(chart.id)).toEqual(settings);
    expect(result.current.openChart).toBe(openChart);
    expect(result.current.summaries[0]).toBe(row);
    expect(await rocksmithLibrary.listRecords()).toEqual(chartRecords);
  });

  it('a settings record of a different device arrives with no chart and keeps the open chart', async () => {
    const { result } = await openLibrary();
    const openChart = result.current.openChart;
    cloud.settings.put(settings);

    await act(async () => {
      await result.current.synchronize();
    });

    expect(await rocksmithLibrary.getSettings(chart.id)).toEqual(settings);
    const reads = [...cloud.sent].sort((x, y) => x.path.localeCompare(y.path));
    expect(reads).toEqual([
      { method: 'GET', path: '/api/bass-charts', records: [] },
      { method: 'GET', path: '/api/chart-settings', records: [settings] },
    ]);
    expect(result.current.openChart).toBe(openChart);
  });

  it('raises the settings revision after each pass of the settings, also when no chart changed and when the route fails', async () => {
    const { result } = await openLibrary();
    const summaries = result.current.summaries;
    const before = result.current.settingsRevision;
    cloud.settings.put(settings);

    await act(async () => {
      await result.current.synchronize();
    });

    expect(result.current.summaries).toBe(summaries);
    expect(result.current.settingsRevision).toBe(before + 1);

    cloud.settings.failing = true;
    await act(async () => {
      await result.current.synchronize();
    });
    expect(result.current.syncStatus).toBe('offline');
    expect(result.current.settingsRevision).toBe(before + 2);
  });

  it('a chart deletion removes its summary and its row of the list, and keeps its settings record', async () => {
    await rocksmithLibrary.saveSettings(settings);
    const { result } = await openLibrary();
    expect(groupLibrarySongs(result.current.summaries, [])).toHaveLength(1);

    cloud.settings.failing = true;
    await act(async () => {
      await result.current.remove(chart.id);
    });
    await waitFor(() =>
      expect(cloud.charts.record(chart.id)?.chart).toBeNull(),
    );
    await waitFor(() => expect(result.current.syncStatus).toBe('offline'));

    expect(result.current.summaries).toEqual([]);
    expect(groupLibrarySongs(result.current.summaries, [])).toEqual([]);
    expect(result.current.openChart).toBeNull();
    expect(await rocksmithLibrary.listSummaries()).toEqual([]);
    expect(await rocksmithLibrary.getSettings(chart.id)).toEqual(settings);

    cloud.settings.failing = false;
    cloud.sent.length = 0;
    await act(async () => {
      await result.current.synchronize();
    });
    expect(result.current.syncStatus).toBe('synced');
    expect(cloud.sent.flatMap((item) => item.records)).toEqual([]);
    expect(cloud.settings.record(chart.id)).toEqual(settings);
    expect(await rocksmithLibrary.getSettings(chart.id)).toEqual(settings);
  });

  it('shows no synchronization when the settings route fails, and the retry repairs it', async () => {
    const { result } = await openLibrary();
    await rocksmithLibrary.saveSettings(settings);
    cloud.settings.failing = true;
    await act(async () => {
      await result.current.synchronize();
    });
    expect(result.current.syncStatus).toBe('offline');
    expect(cloud.settings.record(chart.id)).toBeUndefined();

    cloud.settings.failing = false;
    await act(async () => {
      await result.current.synchronize();
    });
    expect(result.current.syncStatus).toBe('synced');
    expect(cloud.settings.record(chart.id)).toEqual(settings);
  });

  it('a group override reaches a second device and changes no chart', async () => {
    await rocksmithLibrary.saveSettings(settings);
    const first = await openLibrary();
    const override = withGroupOverride(
      await rocksmithLibrary.getSettings(chart.id),
      chart.id,
      'other song|other artist',
      '2026-10-06T10:00:00.000Z',
    );
    await rocksmithLibrary.saveSettings(override);
    await act(async () => {
      await first.result.current.synchronize();
    });
    expect(cloud.settings.record(chart.id)).toEqual(override);
    expect(override.songLineLength).toBe(4);
    expect(chartsSent()).toEqual([]);
    const chartOnCloud = structuredClone(cloud.charts.record(chart.id));
    first.unmount();

    vi.stubGlobal('indexedDB', new IDBFactory());
    const second = renderHook(useRocksmithCharts);
    await waitFor(() =>
      expect(second.result.current.syncStatus).toBe('synced'),
    );
    expect(await rocksmithLibrary.getSettings(chart.id)).toEqual(override);
    expect(await rocksmithLibrary.getChart(chart.id)).toEqual(chart);
    expect(cloud.charts.record(chart.id)).toEqual(chartOnCloud);
  });
});
