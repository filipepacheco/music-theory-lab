import { afterEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { fixtureChart } from '@/domain/bassChartFixture';
import {
  isNewerChartRecord,
  type BassChartRecord,
} from '@/domain/bassChartRecord';
import {
  isNewerChartSettings,
  type ChartSettings,
} from '@/domain/chartSettings';
import {
  createIndexedDbRocksmithLibrary,
  type RocksmithLibraryRepository,
} from '@/services/rocksmithLibrary';
import {
  createChartSyncStore,
  synchronizeBassCharts,
  type ChartCloud,
} from '@/services/bassChartSync';
import {
  BARS_PER_ROW_KEY,
  LINE_LENGTH_MIGRATED_KEY,
  migrateBrowserLineLengths,
} from '@/services/lineLengthMigration';
import {
  CHART_SETTINGS_SYNC_FORMAT,
  chartSettingsCloud,
  createChartSettingsSyncStore,
  synchronizeChartSettings,
  type ChartSettingsCloud,
} from '@/services/chartSettingsSync';

const chart = {
  ...fixtureChart(2, [{ bar: 0, beat: 0, midi: 33 }]),
  id: 'a'.repeat(64),
  source: 'gp' as const,
};

function settingsOf(
  index: number,
  change: Partial<ChartSettings> = {},
): ChartSettings {
  return {
    chartId: index.toString(16).padStart(64, '0'),
    updatedAt: '2026-10-05T10:00:00.000Z',
    songLineLength: 4,
    sectionLineLengths: { 0: 'auto', 8: 2 },
    groupOverride: null,
    ...change,
  };
}
const settings = settingsOf(0, { chartId: chart.id });

/**
 * A cloud that follows the settings route: each write that it accepts gets
 * the next counter, a write that loses changes nothing, and a read returns
 * one page of the records after a counter.
 */
function settingsCloud(pageLimit = 100, writeLimit = 100) {
  const rows = new Map<string, { record: ChartSettings; counter: number }>();
  let last = 0;
  const fake = {
    writeLimit,
    /** Each read: the counter that it sent and the ids that it downloaded. */
    reads: [] as { after: number; ids: string[] }[],
    /** The chart ids of each write. */
    writes: [] as string[][],
    record: (chartId: string) => rows.get(chartId)?.record,
    async pull(after: number) {
      const page = [...rows.values()]
        .filter((row) => row.counter > after)
        .sort((a, b) => a.counter - b.counter)
        .slice(0, pageLimit);
      fake.reads.push({ after, ids: page.map((row) => row.record.chartId) });
      return {
        records: structuredClone(page.map((row) => row.record)) as unknown[],
        counter: page.length > 0 ? page[page.length - 1].counter : after,
        more: page.length === pageLimit,
      };
    },
    async push(records: ChartSettings[]) {
      if (records.length > writeLimit) throw new Error('HTTP 400');
      fake.writes.push(records.map((record) => record.chartId));
      return records.map((record) => {
        if (isNewerChartSettings(record, rows.get(record.chartId)?.record)) {
          rows.set(record.chartId, { record, counter: ++last });
        }
        const row = rows.get(record.chartId)!;
        return JSON.stringify(row.record) === JSON.stringify(record)
          ? row.counter
          : null;
      });
    },
  };
  return fake satisfies ChartSettingsCloud;
}

/** The fake cloud of the chart tests, with the ids that it moved. */
function chartCloud() {
  const rows = new Map<string, { record: BassChartRecord; counter: number }>();
  let last = 0;
  const fake = {
    downloaded: [] as string[],
    writes: [] as string[],
    record: (id: string) => rows.get(id)?.record,
    async pull(after: number) {
      const page = [...rows.values()]
        .filter((row) => row.counter > after)
        .sort((a, b) => a.counter - b.counter);
      fake.downloaded.push(...page.map((row) => row.record.id));
      return {
        records: page.map((row) => row.record) as unknown[],
        counter: page.length > 0 ? page[page.length - 1].counter : after,
        more: false,
      };
    },
    async push(record: BassChartRecord): Promise<number | null> {
      fake.writes.push(record.id);
      if (isNewerChartRecord(record, rows.get(record.id)?.record)) {
        rows.set(record.id, { record, counter: ++last });
      }
      return rows.get(record.id)!.counter;
    },
  };
  return fake satisfies ChartCloud;
}

function memoryStorage() {
  const items = new Map<string, string>();
  return {
    items,
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
  };
}

/** One browser: its local database and its storage. */
function device() {
  const storage = memoryStorage();
  return {
    library: createIndexedDbRocksmithLibrary(new IDBFactory()),
    storage,
    settingsStore: createChartSettingsSyncStore(() => storage),
    chartStore: createChartSyncStore(() => storage),
  };
}
type Device = ReturnType<typeof device>;

const syncSettings = (item: Device, cloud: ChartSettingsCloud) =>
  synchronizeChartSettings(item.library, cloud, item.settingsStore);

/** The synchronization of the app: the charts and the chart settings. */
async function syncAll(
  item: Device,
  clouds: { charts: ChartCloud; settings: ChartSettingsCloud },
) {
  await synchronizeBassCharts(item.library, clouds.charts, item.chartStore);
  await syncSettings(item, clouds.settings);
}

afterEach(() => vi.unstubAllGlobals());

describe('chart settings synchronization', () => {
  it('brings a settings record from one device to a second device at the next synchronization', async () => {
    const [first, second] = [device(), device()];
    const cloud = settingsCloud();
    await first.library.saveSettings(settings);
    await syncSettings(first, cloud);
    expect(await second.library.getSettings(chart.id)).toBeNull();
    await syncSettings(second, cloud);
    expect(await second.library.getSettings(chart.id)).toEqual(settings);
    expect(cloud.record(chart.id)).toEqual(settings);
  });

  it('a chart settings record from one device reaches a second device, and no chart goes with it', async () => {
    const [first, second] = [device(), device()];
    const clouds = { charts: chartCloud(), settings: settingsCloud() };
    await first.library.save(chart, null);
    await syncAll(first, clouds);
    await syncAll(second, clouds);
    const chartRecords = await first.library.listRecords();
    clouds.charts.writes.length = 0;
    clouds.charts.downloaded.length = 0;

    await first.library.saveSettings(settings);
    await syncAll(first, clouds);
    await syncAll(second, clouds);

    expect(await second.library.getSettings(chart.id)).toEqual(settings);
    expect(clouds.settings.writes).toEqual([[chart.id]]);
    // No device sent a chart, and no device downloaded one.
    expect(clouds.charts.writes).toEqual([]);
    expect(clouds.charts.downloaded).toEqual([]);
    // The chart record of each device is the one from before the change.
    expect(await first.library.listRecords()).toEqual(chartRecords);
    expect(await second.library.listRecords()).toEqual(chartRecords);
  });

  it('keeps the later write on the two devices when the two change one chart', async () => {
    const [first, second] = [device(), device()];
    const cloud = settingsCloud();
    await first.library.saveSettings(settings);
    await syncSettings(first, cloud);
    await syncSettings(second, cloud);

    const earlier = {
      ...settings,
      updatedAt: '2026-10-05T10:10:00.000Z',
      songLineLength: 16,
    };
    const later = {
      ...settings,
      updatedAt: '2026-10-05T10:20:00.000Z',
      songLineLength: 2,
      groupOverride: 'separate',
    };
    // The device with the later write synchronizes first.
    await second.library.saveSettings(later);
    await first.library.saveSettings(earlier);
    await syncSettings(second, cloud);
    await syncSettings(first, cloud);
    await syncSettings(second, cloud);
    expect(await first.library.getSettings(chart.id)).toEqual(later);
    expect(await second.library.getSettings(chart.id)).toEqual(later);
    expect(cloud.record(chart.id)).toEqual(later);
  });

  it('keeps the later write when the device with the earlier write synchronizes first', async () => {
    const [first, second] = [device(), device()];
    const cloud = settingsCloud();
    const earlier = { ...settings, songLineLength: 16 };
    const later = {
      ...settings,
      updatedAt: '2026-10-05T10:20:00.000Z',
      songLineLength: 2,
    };
    await first.library.saveSettings(earlier);
    await second.library.saveSettings(later);
    await syncSettings(first, cloud);
    await syncSettings(second, cloud);
    await syncSettings(first, cloud);
    expect(await first.library.getSettings(chart.id)).toEqual(later);
    expect(await second.library.getSettings(chart.id)).toEqual(later);
    expect(cloud.record(chart.id)).toEqual(later);
  });

  it('keeps one record on the two devices for two writes with one update time', async () => {
    const [first, second] = [device(), device()];
    const cloud = settingsCloud();
    await first.library.saveSettings({ ...settings, songLineLength: 4 });
    await second.library.saveSettings({ ...settings, songLineLength: 8 });
    await syncSettings(first, cloud);
    await syncSettings(second, cloud);
    await syncSettings(first, cloud);
    const kept = await first.library.getSettings(chart.id);
    expect(await second.library.getSettings(chart.id)).toEqual(kept);
    expect(cloud.record(chart.id)).toEqual(kept);
  });

  it('lets a change on a device with a slow clock win after it got the record of the other device', async () => {
    const [fast, slow] = [device(), device()];
    const cloud = settingsCloud();
    // The clock of the first device is one hour fast.
    const fromFast = { ...settings, updatedAt: '2026-10-05T11:00:00.000Z' };
    await fast.library.saveSettings(fromFast);
    await syncSettings(fast, cloud);
    await syncSettings(slow, cloud);
    // A later change, with a clock that reads an earlier time.
    await slow.library.saveSettings({
      ...settings,
      updatedAt: '2026-10-05T10:05:00.000Z',
      songLineLength: 8,
    });
    await syncSettings(slow, cloud);
    await syncSettings(fast, cloud);
    const kept = await fast.library.getSettings(chart.id);
    expect(kept?.songLineLength).toBe(8);
    expect(await slow.library.getSettings(chart.id)).toEqual(kept);
    expect(cloud.record(chart.id)).toEqual(kept);
  });

  it('does not replace a change that a screen saved during the read', async () => {
    const [first, second] = [device(), device()];
    const cloud = settingsCloud();
    await first.library.saveSettings(settings);
    await syncSettings(first, cloud);
    const change = {
      ...settings,
      updatedAt: '2026-10-05T10:30:00.000Z',
      songLineLength: 8,
    };
    const pull = cloud.pull;
    await syncSettings(second, {
      ...cloud,
      pull: async (after) => {
        const page = await pull(after);
        await second.library.saveSettings(change);
        return page;
      },
    });
    expect(await second.library.getSettings(chart.id)).toEqual(change);
    expect(cloud.record(chart.id)).toEqual(change);
  });

  it('reads no record and sends none in a second synchronization with no change', async () => {
    const [first, second] = [device(), device()];
    const cloud = settingsCloud();
    for (let index = 1; index <= 3; index++) {
      await first.library.saveSettings(settingsOf(index));
    }
    await syncSettings(first, cloud);
    await syncSettings(second, cloud);
    cloud.reads.length = 0;
    cloud.writes.length = 0;
    await syncSettings(first, cloud);
    await syncSettings(second, cloud);
    expect(cloud.reads).toEqual([
      { after: 3, ids: [] },
      { after: 3, ids: [] },
    ]);
    expect(cloud.writes).toEqual([]);
  });

  it('reads only the record that changed', async () => {
    const [first, second] = [device(), device()];
    const cloud = settingsCloud();
    for (let index = 1; index <= 3; index++) {
      await first.library.saveSettings(settingsOf(index));
    }
    await syncSettings(first, cloud);
    await syncSettings(second, cloud);
    cloud.reads.length = 0;
    cloud.writes.length = 0;

    const changed = settingsOf(2, {
      updatedAt: '2026-10-05T10:30:00.000Z',
      songLineLength: 8,
    });
    await first.library.saveSettings(changed);
    await syncSettings(first, cloud);
    await syncSettings(second, cloud);
    expect(cloud.writes).toEqual([[changed.chartId]]);
    expect(cloud.reads).toEqual([
      { after: 3, ids: [] },
      { after: 3, ids: [changed.chartId] },
    ]);
    expect(await second.library.getSettings(changed.chartId)).toEqual(changed);
  });

  it('reads page after page, and sends 100 records at most in a write', async () => {
    const [first, second] = [device(), device()];
    const cloud = settingsCloud(100, 100);
    for (let index = 1; index <= 230; index++) {
      await first.library.saveSettings(settingsOf(index));
    }
    await syncSettings(first, cloud);
    expect(cloud.writes.map((write) => write.length)).toEqual([100, 100, 30]);
    expect(first.settingsStore.read().counter).toBe(230);

    cloud.reads.length = 0;
    await syncSettings(second, cloud);
    expect(cloud.reads.map((read) => [read.after, read.ids.length])).toEqual([
      [0, 100],
      [100, 100],
      [200, 30],
    ]);
    expect(await second.library.listSettings()).toHaveLength(230);
    expect(second.settingsStore.read().counter).toBe(230);
  });

  it('sends the records again after a write that failed', async () => {
    const local = device();
    const cloud = settingsCloud();
    await local.library.saveSettings(settings);
    await expect(
      syncSettings(local, {
        ...cloud,
        push: async () => {
          throw new Error('offline');
        },
      }),
    ).rejects.toThrow('offline');
    expect(await local.library.getSettings(chart.id)).toEqual(settings);
    await syncSettings(local, cloud);
    expect(cloud.record(chart.id)).toEqual(settings);
  });

  it('reads all records again when the local database was emptied', async () => {
    const first = device();
    const cloud = settingsCloud();
    await first.library.saveSettings(settings);
    await syncSettings(first, cloud);
    const emptied = { ...first, library: device().library };
    await syncSettings(emptied, cloud);
    expect(await emptied.library.getSettings(chart.id)).toEqual(settings);
  });

  it('gets the record of the cloud again when the local record is the older one', async () => {
    const first = device();
    const cloud = settingsCloud();
    const newer = { ...settings, updatedAt: '2026-10-05T11:00:00.000Z' };
    await first.library.saveSettings(newer);
    await first.library.saveSettings(settingsOf(1));
    await syncSettings(first, cloud);
    // The device knows the record of the cloud, and its local database holds
    // an older one.
    const older = device().library;
    await older.applySettings({ ...settings, songLineLength: 8 });
    await older.applySettings(settingsOf(1));
    const behind = { ...first, library: older };
    cloud.reads.length = 0;
    cloud.writes.length = 0;
    await syncSettings(behind, cloud);
    expect(await older.getSettings(chart.id)).toEqual(newer);
    expect(cloud.record(chart.id)).toEqual(newer);
    expect(cloud.reads.map((read) => read.after)).toEqual([2, 0]);
    expect(cloud.writes).toEqual([]);
  });

  it('reads from counter 0 when the format version of the client changes', async () => {
    const local = device();
    const cloud = settingsCloud();
    await local.library.saveSettings(settings);
    await syncSettings(local, cloud);
    expect(
      JSON.parse(
        local.storage.items.get('music-theory-lab-chart-settings-sync')!,
      ),
    ).toMatchObject({ format: CHART_SETTINGS_SYNC_FORMAT, counter: 1 });
    cloud.reads.length = 0;
    await syncSettings(local, cloud);
    await synchronizeChartSettings(
      local.library,
      cloud,
      createChartSettingsSyncStore(
        () => local.storage,
        CHART_SETTINGS_SYNC_FORMAT + 1,
      ),
    );
    expect(cloud.reads.map((read) => read.after)).toEqual([1, 0]);
  });

  it('ignores a record of the cloud with a value that is not allowed', async () => {
    const local = device();
    const cloud = settingsCloud();
    const pull = cloud.pull;
    await syncSettings(local, {
      ...cloud,
      pull: async (after) => ({
        ...(await pull(after)),
        records: [
          { ...settings, songLineLength: 99 },
          { ...settings, chart },
          settingsOf(1),
        ],
      }),
    });
    expect(await local.library.listSettings()).toEqual([settingsOf(1)]);
  });

  it('keeps its counter apart from the counter of the charts', async () => {
    const local = device();
    const clouds = { charts: chartCloud(), settings: settingsCloud() };
    await local.library.save(chart, null);
    await local.library.saveSettings(settings);
    await local.library.saveSettings(settingsOf(1));
    await syncAll(local, clouds);
    expect(local.chartStore.read().counter).toBe(1);
    expect(local.settingsStore.read().counter).toBe(2);
    expect([...local.storage.items.keys()].sort()).toEqual([
      'music-theory-lab-chart-settings-sync',
      'music-theory-lab-chart-sync',
    ]);
  });
});

describe('chart settings and the deletion of their chart', () => {
  const clouds = () => ({ charts: chartCloud(), settings: settingsCloud() });
  const ids = async (list: Promise<{ id: string }[]>) =>
    (await list).map((item) => item.id);

  async function synchronized() {
    const [first, second] = [device(), device()];
    const remote = clouds();
    await first.library.save(chart, null);
    await first.library.saveSettings(settings);
    await syncAll(first, remote);
    await syncAll(second, remote);
    return { first, second, remote };
  }

  it('a chart deletion removes its summary and its row of the list, and keeps its settings record', async () => {
    const { first, second, remote } = await synchronized();
    expect(await ids(second.library.listSummaries())).toEqual([chart.id]);

    await first.library.remove(chart.id);
    // Before a synchronization: the device keeps the record by itself.
    expect(await first.library.listSummaries()).toEqual([]);
    expect(await first.library.listSettings()).toEqual([settings]);
    await syncAll(first, remote);
    await syncAll(second, remote);
    // The settings synchronization read no record again to repair a loss.
    expect(remote.settings.reads.map((read) => read.after)).toEqual([
      0, 0, 1, 1,
    ]);

    for (const item of [first, second]) {
      expect(await item.library.listSummaries()).toEqual([]);
      expect(await item.library.getChart(chart.id)).toBeNull();
      expect(await item.library.getSettings(chart.id)).toEqual(settings);
    }
    // In the cloud: a deletion record of the chart, and the settings record.
    expect(remote.charts.record(chart.id)?.chart).toBeNull();
    expect(remote.settings.record(chart.id)).toEqual(settings);
  });

  it('gives a new import of the same file its settings again, also on a device that never had the chart', async () => {
    const { first, second, remote } = await synchronized();
    await first.library.remove(chart.id);
    await syncAll(first, remote);
    await syncAll(second, remote);
    const third = device();
    await syncAll(third, remote);
    expect(await third.library.listSummaries()).toEqual([]);
    expect(await third.library.getSettings(chart.id)).toEqual(settings);

    // The same file gives the same chart id. The import is later than the
    // deletion on the clock.
    await new Promise((resolve) => setTimeout(resolve, 5));
    await third.library.save({ ...chart }, null);
    expect(await third.library.getSettings(chart.id)).toEqual(settings);
    await syncAll(third, remote);
    await syncAll(first, remote);
    expect(await ids(first.library.listSummaries())).toEqual([chart.id]);
    expect(await first.library.getSettings(chart.id)).toEqual(settings);
    expect(remote.settings.writes).toEqual([[chart.id]]);
  });
});

describe('local chart settings', () => {
  const library = (): RocksmithLibraryRepository =>
    createIndexedDbRocksmithLibrary(new IDBFactory());

  it('refuses to save a record with a value that the table does not allow', async () => {
    const local = library();
    await local.saveSettings(settings);
    const refused: unknown[] = [
      { ...settings, songLineLength: 17 },
      { ...settings, songLineLength: 0 },
      { ...settings, sectionLineLengths: { 0: 32 } },
      { ...settings, sectionLineLengths: { intro: 4 } },
      { ...settings, groupOverride: 'Not A Song Key' },
      { ...settings, chartId: 'chart' },
      { ...settings, updatedAt: 'now' },
      { ...settings, chart },
    ];
    for (const bad of refused) {
      await expect(
        local.saveSettings(bad as ChartSettings),
        JSON.stringify(bad).slice(0, 80),
      ).rejects.toThrow('Invalid chart settings');
    }
    expect(await local.listSettings()).toEqual([settings]);
  });

  it('applies a record of a different device only when it is the newer one', async () => {
    const local = library();
    const newer = {
      ...settings,
      updatedAt: '2026-10-05T10:30:00.000Z',
      songLineLength: 8,
    };
    await local.applySettings(settings);
    expect(await local.getSettings(chart.id)).toEqual(settings);
    await local.applySettings(newer);
    expect(await local.getSettings(chart.id)).toEqual(newer);
    await local.applySettings({ ...settings, songLineLength: 16 });
    expect(await local.getSettings(chart.id)).toEqual(newer);
  });
});

describe('the settings route, from the browser', () => {
  it('sends the last counter and reads a page', async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ records: [settings], counter: 8, more: true }),
    });
    vi.stubGlobal('fetch', fetch);
    expect(await chartSettingsCloud.pull(7)).toEqual({
      records: [settings],
      counter: 8,
      more: true,
    });
    expect(fetch).toHaveBeenCalledWith('/api/chart-settings?after=7');

    for (const body of [
      [settings],
      { records: [settings] },
      { counter: 8, more: false },
    ]) {
      fetch.mockResolvedValue({ ok: true, json: async () => body });
      await expect(chartSettingsCloud.pull(7)).rejects.toThrow('Invalid');
    }
  });

  it('sends settings records in one write, with the device id and no chart', async () => {
    vi.stubGlobal('localStorage', { getItem: () => 'device' });
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, counters: [12, null] }),
    });
    vi.stubGlobal('fetch', fetch);
    const records = [settings, settingsOf(1)];
    expect(await chartSettingsCloud.push(records)).toEqual([12, null]);
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('/api/chart-settings');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ device_id: 'device', records });
    expect(chartSettingsCloud.writeLimit).toBe(100);

    // A response without counters says nothing of the records.
    fetch.mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    expect(await chartSettingsCloud.push(records)).toEqual([null, null]);
  });

  it('reports HTTP failures instead of treating them as successful writes', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 500 }),
    );
    vi.stubGlobal('localStorage', { getItem: () => 'device' });
    await expect(chartSettingsCloud.pull(0)).rejects.toThrow('500');
    await expect(chartSettingsCloud.push([settings])).rejects.toThrow('500');
  });
});

describe('the copy of the browser line lengths', () => {
  const importedAt = new Date(chart.importedAt).toISOString();

  async function oldBrowser() {
    const item = device();
    await item.library.save(chart, null);
    item.storage.setItem(
      BARS_PER_ROW_KEY,
      JSON.stringify({
        [chart.id]: { 0: 4, 8: 2 },
        ['f'.repeat(64)]: { 0: 3 },
      }),
    );
    return item;
  }

  it('copies each length of a stored chart with its import time, one time', async () => {
    const item = await oldBrowser();
    expect(await migrateBrowserLineLengths(item.library, item.storage)).toBe(
      true,
    );
    expect(await item.library.getSettings(chart.id)).toEqual({
      chartId: chart.id,
      updatedAt: importedAt,
      songLineLength: 'auto',
      sectionLineLengths: { 0: 4, 8: 2 },
      groupOverride: null,
    });
    // A chart that this browser does not hold gets nothing.
    expect(await item.library.listSettings()).toHaveLength(1);
    expect(item.storage.getItem(LINE_LENGTH_MIGRATED_KEY)).toBe('true');
    // A second start copies nothing, also after a later edit.
    const edited = {
      ...(await item.library.getSettings(chart.id))!,
      updatedAt: '2026-10-06T10:00:00.000Z',
      sectionLineLengths: { 0: 'auto' as const },
    };
    await item.library.saveSettings(edited);
    expect(await migrateBrowserLineLengths(item.library, item.storage)).toBe(
      false,
    );
    expect(await item.library.getSettings(chart.id)).toEqual(edited);
  });

  it('runs again after a failure, and copies nothing from unreadable data', async () => {
    const item = await oldBrowser();
    const broken = {
      ...item.library,
      listCharts: () => Promise.reject(new Error('x')),
    };
    await expect(
      migrateBrowserLineLengths(broken, item.storage),
    ).rejects.toThrow();
    expect(item.storage.getItem(LINE_LENGTH_MIGRATED_KEY)).toBeNull();
    item.storage.setItem(BARS_PER_ROW_KEY, '{oops');
    await migrateBrowserLineLengths(item.library, item.storage);
    expect(await item.library.listSettings()).toEqual([]);
  });

  it('loses to an edit from a different device, whichever device synchronizes first', async () => {
    for (const copiedFirst of [true, false]) {
      const [old, other] = [await oldBrowser(), device()];
      const cloud = settingsCloud();
      await migrateBrowserLineLengths(old.library, old.storage);
      const edit = {
        ...settings,
        updatedAt: '2026-10-07T10:00:00.000Z',
        songLineLength: 'auto' as const,
        sectionLineLengths: { 0: 8 },
      };
      await other.library.saveSettings(edit);
      if (copiedFirst) {
        await syncSettings(old, cloud);
        await syncSettings(other, cloud);
      } else {
        await syncSettings(other, cloud);
        await syncSettings(old, cloud);
      }
      await syncSettings(old, cloud);
      await syncSettings(other, cloud);
      expect(await old.library.getSettings(chart.id)).toEqual(edit);
      expect(await other.library.getSettings(chart.id)).toEqual(edit);
      expect(cloud.record(chart.id)).toEqual(edit);
    }
  });

  it('reaches a second device that has no edit, as a settings record', async () => {
    const [old, other] = [await oldBrowser(), device()];
    const cloud = settingsCloud();
    await migrateBrowserLineLengths(old.library, old.storage);
    await syncSettings(old, cloud);
    await syncSettings(other, cloud);
    expect(
      (await other.library.getSettings(chart.id))?.sectionLineLengths,
    ).toEqual({ 0: 4, 8: 2 });
  });
});
