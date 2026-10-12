import { describe, expect, it, vi, afterEach } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { fixtureChart } from '@/domain/bassChartFixture';
import {
  isNewerChartRecord,
  parseBassChartRecord,
  type BassChartRecord,
} from '@/domain/bassChartRecord';
import {
  createIndexedDbRocksmithLibrary,
  type RocksmithLibraryRepository,
} from '@/services/rocksmithLibrary';
import {
  CHART_SYNC_FORMAT,
  createChartSyncStore,
  synchronizeBassCharts,
  chartCloud,
  type ChartCloud,
  type ChartSyncStore,
} from '@/services/bassChartSync';

const chart = {
  ...fixtureChart(2, [{ bar: 0, beat: 0, midi: 33 }]),
  id: 'a'.repeat(64),
  source: 'gp' as const,
  originalFingering: [{ string: 1, fret: 0 }],
};

/** A valid chart with its own id. */
function numbered(index: number) {
  const id = index.toString(16).padStart(64, '0');
  return { ...chart, id, title: `Chart ${index}` };
}

/**
 * A cloud that follows the chart route: each write that it accepts gets the
 * next counter, a write that loses changes nothing, and a read returns one
 * page of the records after a counter.
 */
function cloud(pageLimit = 10) {
  const rows = new Map<string, { record: BassChartRecord; counter: number }>();
  let last = 0;
  const fake = {
    /** Each read: the counter that it sent and the ids that it downloaded. */
    reads: [] as { after: number; ids: string[] }[],
    /** The id of each record that a device sent. */
    writes: [] as string[],
    record: (id: string) => rows.get(id)?.record,
    async pull(after: number) {
      const page = [...rows.values()]
        .filter((row) => row.counter > after)
        .sort((a, b) => a.counter - b.counter)
        .slice(0, pageLimit);
      fake.reads.push({ after, ids: page.map((row) => row.record.id) });
      return {
        records: page.map((row) => row.record) as unknown[],
        counter: page.length > 0 ? page[page.length - 1].counter : after,
        more: page.length === pageLimit,
      };
    },
    async push(record: BassChartRecord): Promise<number | null> {
      fake.writes.push(record.id);
      if (isNewerChartRecord(record, rows.get(record.id)?.record)) {
        rows.set(record.id, { record, counter: ++last });
      }
      const row = rows.get(record.id)!;
      return row.record.updatedAt === record.updatedAt &&
        (row.record.chart === null) === (record.chart === null)
        ? row.counter
        : null;
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

// Each device keeps its own last counter, as each browser does.
const stores = new WeakMap<object, ChartSyncStore>();
function storeOf(local: RocksmithLibraryRepository): ChartSyncStore {
  let store = stores.get(local);
  if (!store) {
    const storage = memoryStorage();
    store = createChartSyncStore(() => storage);
    stores.set(local, store);
  }
  return store;
}

function sync(local: RocksmithLibraryRepository, remote: ChartCloud) {
  return synchronizeBassCharts(local, remote, storeOf(local));
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('bass chart persistence and sync', () => {
  it('makes a GP import available on a second device without its audio', async () => {
    const first = createIndexedDbRocksmithLibrary(new IDBFactory());
    const second = createIndexedDbRocksmithLibrary(new IDBFactory());
    const remote = cloud();
    await first.save(chart, {
      chartId: chart.id,
      fileName: 'local.mp3',
      blob: new Blob(['audio']),
      origin: 'local',
    });
    await sync(first, remote);
    await sync(second, remote);
    expect(await second.listCharts()).toEqual([chart]);
    expect(await second.getAudio(chart.id)).toBeNull();
    expect(await first.getAudio(chart.id)).not.toBeNull();
  });

  it('keeps deletions after an offline device reconnects', async () => {
    const first = createIndexedDbRocksmithLibrary(new IDBFactory());
    const second = createIndexedDbRocksmithLibrary(new IDBFactory());
    const remote = cloud();
    await first.save(chart, null);
    await sync(first, remote);
    await sync(second, remote);
    await first.remove(chart.id);
    await sync(first, remote);
    await sync(second, remote);
    expect(await second.listCharts()).toEqual([]);
    expect(remote.record(chart.id)?.chart).toBeNull();
  });

  it('retries failed uploads while keeping the local import', async () => {
    const local = createIndexedDbRocksmithLibrary(new IDBFactory());
    const remote = cloud();
    await local.save(chart, null);
    await expect(
      sync(local, {
        ...remote,
        push: async () => {
          throw new Error('offline');
        },
      }),
    ).rejects.toThrow('offline');
    expect(await local.listCharts()).toEqual([chart]);
    await sync(local, remote);
    expect(remote.record(chart.id)?.chart).toEqual(chart);
  });

  it('does not overwrite a deletion made while the cloud pull is in flight', async () => {
    const local = createIndexedDbRocksmithLibrary(new IDBFactory());
    const older = {
      id: chart.id,
      updatedAt: '2026-01-01T00:00:00.000Z',
      chart,
    };
    const remote = cloud();
    await remote.push(older);
    await local.save(chart, null);
    const pull = remote.pull;
    remote.pull = async (after) => {
      await local.remove(chart.id);
      return pull(after);
    };
    await sync(local, remote);
    expect(await local.listCharts()).toEqual([]);
    expect(remote.record(chart.id)?.chart).toBeNull();
  });

  it('migrates existing v1 browser imports into the synchronization journal', async () => {
    const factory = new IDBFactory();
    await new Promise<void>((resolve, reject) => {
      const request = factory.open('music-theory-lab-rocksmith', 1);
      request.onupgradeneeded = () => {
        request.result
          .createObjectStore('charts', { keyPath: 'id' })
          .put(chart);
        request.result.createObjectStore('audio', { keyPath: 'chartId' });
      };
      request.onsuccess = () => {
        request.result.close();
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
    const local = createIndexedDbRocksmithLibrary(factory);
    expect(await local.listCharts()).toEqual([chart]);
    expect(await local.listRecords()).toEqual([
      { id: chart.id, updatedAt: '2026-01-01T00:00:00.000Z', chart },
    ]);
  });

  it('upgrades a version 2 database and keeps charts, records and recordings', async () => {
    const factory = new IDBFactory();
    const older = { ...chart, id: 'b'.repeat(64), title: 'Older' };
    const record = {
      id: chart.id,
      updatedAt: '2026-02-02T00:00:00.000Z',
      chart,
    };
    const deletion = {
      id: 'c'.repeat(64),
      updatedAt: '2026-03-03T00:00:00.000Z',
      chart: null,
    };
    const audio = {
      chartId: chart.id,
      fileName: 'local.mp3',
      blob: new Blob(['audio']),
      origin: 'local' as const,
    };
    await new Promise<void>((resolve, reject) => {
      const request = factory.open('music-theory-lab-rocksmith', 2);
      request.onupgradeneeded = () => {
        const charts = request.result.createObjectStore('charts', {
          keyPath: 'id',
        });
        charts.put(chart);
        charts.put(older);
        request.result
          .createObjectStore('audio', { keyPath: 'chartId' })
          .put(audio);
        const records = request.result.createObjectStore('records', {
          keyPath: 'id',
        });
        records.put(record);
        records.put(deletion);
      };
      request.onsuccess = () => {
        request.result.close();
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
    const local = createIndexedDbRocksmithLibrary(factory);
    expect(await local.listCharts()).toEqual([chart, older]);
    expect(await local.listRecords()).toEqual([record, deletion]);
    expect((await local.getAudio(chart.id))?.fileName).toBe('local.mp3');
    expect(await local.listSettings()).toEqual([]);
    expect(await local.listSummaries()).toEqual([
      {
        id: chart.id,
        title: 'Test',
        artist: '',
        source: 'gp',
        part: 'bass',
        tempoBpm: 120,
        durationSeconds: 4,
        barCount: 2,
        noteCount: 1,
        tuning: [0, 0, 0, 0],
        importedAt: '2026-01-01T00:00:00Z',
      },
      expect.objectContaining({ id: older.id, title: 'Older', part: 'bass' }),
    ]);
  });

  it('keeps one summary for each chart through save, sync and deletion', async () => {
    const first = createIndexedDbRocksmithLibrary(new IDBFactory());
    const second = createIndexedDbRocksmithLibrary(new IDBFactory());
    const remote = cloud();
    const summaryIds = async (local: typeof first) =>
      (await local.listSummaries()).map((summary) => summary.id);
    const chartIds = async (local: typeof first) =>
      (await local.listCharts()).map((stored) => stored.id);

    await first.save(chart, null);
    expect(await summaryIds(first)).toEqual([chart.id]);
    await first.save({ ...chart, title: 'Renamed' }, null);
    expect(await first.listSummaries()).toEqual([
      expect.objectContaining({ id: chart.id, title: 'Renamed' }),
    ]);

    await sync(first, remote);
    await sync(second, remote);
    expect(await summaryIds(second)).toEqual(await chartIds(second));
    expect(await second.listSummaries()).toEqual(await first.listSummaries());

    await first.remove(chart.id);
    expect(await summaryIds(first)).toEqual([]);
    await sync(first, remote);
    await sync(second, remote);
    expect(await chartIds(second)).toEqual([]);
    expect(await summaryIds(second)).toEqual([]);
  });

  it('reads and writes chart settings, and keeps them after a chart deletion', async () => {
    const local = createIndexedDbRocksmithLibrary(new IDBFactory());
    const settings = {
      chartId: chart.id,
      updatedAt: '2026-04-04T00:00:00.000Z',
      songLineLength: 4,
      sectionLineLengths: { 0: 'auto' as const, 8: 2 },
      groupOverride: 'separate',
    };
    const other = { ...settings, chartId: 'b'.repeat(64), songLineLength: 8 };
    expect(await local.getSettings(chart.id)).toBeNull();
    await local.save(chart, null);
    await local.saveSettings(settings);
    await local.saveSettings(other);
    expect(await local.getSettings(chart.id)).toEqual(settings);
    expect(await local.listSettings()).toEqual([settings, other]);

    await local.remove(chart.id);
    expect(await local.getSettings(chart.id)).toEqual(settings);
    await local.save(chart, null);
    await local.applyRecord({
      id: chart.id,
      updatedAt: '2099-01-01T00:00:00.000Z',
      chart: null,
    });
    expect(await local.listCharts()).toEqual([]);
    expect(await local.listSettings()).toEqual([settings, other]);
  });

  it('rejects corrupt data and original audio payloads', () => {
    const record = { id: chart.id, updatedAt: chart.importedAt, chart };
    expect(parseBassChartRecord(record)).not.toBeNull();
    for (const originalFingering of [
      [],
      [{ string: 1, fret: 7 }],
      [{ string: 4, fret: 0 }],
    ]) {
      expect(
        parseBassChartRecord({
          ...record,
          chart: { ...chart, originalFingering },
        }),
      ).toBeNull();
    }
    expect(
      parseBassChartRecord({
        ...record,
        chart: { ...chart, notes: [{ ...chart.notes[0], string: 99 }] },
      }),
    ).toBeNull();
    expect(
      parseBassChartRecord({ ...record, chart: { ...chart, audio: 'binary' } }),
    ).toBeNull();
    expect(parseBassChartRecord({ ...record, id: 'b'.repeat(64) })).toBeNull();
    expect(
      parseBassChartRecord({ ...record, updatedAt: 'invalid' }),
    ).toBeNull();
  });

  it('reports HTTP failures instead of treating them as successful saves', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 500 }),
    );
    vi.stubGlobal('localStorage', { getItem: () => 'device' });
    await expect(chartCloud.pull(0)).rejects.toThrow('500');
    await expect(
      chartCloud.push({ id: chart.id, updatedAt: chart.importedAt, chart }),
    ).rejects.toThrow('500');
  });
});

describe('incremental chart synchronization', () => {
  const device = () => createIndexedDbRocksmithLibrary(new IDBFactory());

  /** A library of `count` charts in the cloud, from one device. */
  async function library(count: number, pageLimit?: number) {
    const remote = cloud(pageLimit);
    const first = device();
    for (let index = 1; index <= count; index++) {
      await first.save(numbered(index), null);
    }
    await sync(first, remote);
    remote.reads.length = 0;
    remote.writes.length = 0;
    return { remote, first };
  }

  const pages = (remote: ReturnType<typeof cloud>) =>
    remote.reads.map((read) => [read.after, read.ids.length]);

  it('reads page after page until a page is not full, then stores the last counter', async () => {
    const { remote } = await library(25);
    const second = device();
    await sync(second, remote);
    expect(pages(remote)).toEqual([
      [0, 10],
      [10, 10],
      [20, 5],
    ]);
    expect(await second.listCharts()).toHaveLength(25);
    expect(storeOf(second).read().counter).toBe(25);
  });

  it('reads one more page when the last page is full', async () => {
    const { remote } = await library(4, 2);
    const second = device();
    await sync(second, remote);
    expect(pages(remote)).toEqual([
      [0, 2],
      [2, 2],
      [4, 0],
    ]);
    expect(storeOf(second).read().counter).toBe(4);
  });

  it('stores no counter when a page fails, and reads again from the last one', async () => {
    const { remote } = await library(5, 2);
    const second = device();
    const pull = remote.pull;
    await expect(
      sync(second, {
        ...remote,
        pull: async (after) => {
          if (after > 0) throw new Error('offline');
          return pull(after);
        },
      }),
    ).rejects.toThrow('offline');
    expect(storeOf(second).read().counter).toBe(0);
    await sync(second, remote);
    expect(await second.listCharts()).toHaveLength(5);
    expect(storeOf(second).read().counter).toBe(5);
  });

  it('downloads no chart and sends none in a second synchronization with no change', async () => {
    const { remote, first } = await library(3);
    const second = device();
    await sync(second, remote);
    remote.reads.length = 0;

    // The device that got the charts, and the device that sent them.
    await sync(second, remote);
    await sync(first, remote);
    expect(remote.reads).toEqual([
      { after: 3, ids: [] },
      { after: 3, ids: [] },
    ]);
    expect(remote.writes).toEqual([]);
  });

  it('downloads only the record that changed', async () => {
    const { remote, first } = await library(3);
    const second = device();
    await sync(second, remote);
    remote.reads.length = 0;

    const renamed = { ...numbered(2), title: 'Renamed' };
    await first.save(renamed, null);
    await sync(first, remote);
    await sync(second, remote);
    expect(remote.writes).toEqual([renamed.id]);
    expect(remote.reads).toEqual([
      { after: 3, ids: [] },
      { after: 3, ids: [renamed.id] },
    ]);
    expect(await second.getChart(renamed.id)).toEqual(renamed);
  });

  it('moves a deletion record through the incremental read as a chart record', async () => {
    const { remote, first } = await library(3);
    const second = device();
    await sync(second, remote);
    remote.reads.length = 0;

    const removed = numbered(2).id;
    await first.remove(removed);
    await sync(first, remote);
    await sync(second, remote);
    expect(remote.reads[1]).toEqual({ after: 3, ids: [removed] });
    expect(remote.record(removed)?.chart).toBeNull();
    const kept = (await second.listCharts()).map((stored) => stored.id);
    expect(kept.sort()).toEqual([numbered(1).id, numbered(3).id]);
    expect(storeOf(second).read().counter).toBe(4);
  });

  it('brings a chart from a device with a slow clock to a second device', async () => {
    const { remote } = await library(3);
    const second = device();
    await sync(second, remote);

    // The clock of this device is years late: its record looks older than
    // each record of the cloud and than the last read of the second device.
    const slow = device();
    const late = numbered(9);
    await slow.applyRecord({
      id: late.id,
      updatedAt: '2019-01-01T00:00:00.000Z',
      chart: late,
    });
    await sync(slow, remote);
    remote.reads.length = 0;

    await sync(second, remote);
    expect(remote.reads).toEqual([{ after: 3, ids: [late.id] }]);
    expect(await second.getChart(late.id)).toEqual(late);
  });

  it('reads its own record again only when a second device wrote before it', async () => {
    const { remote, first } = await library(2);
    const second = device();
    await sync(second, remote);
    // The second device writes. Then the first device reads, and the second
    // device writes again before the first device sends its own record.
    await second.save(numbered(3), null);
    await sync(second, remote);
    await first.save(numbered(5), null);
    const pull = remote.pull;
    await sync(first, {
      ...remote,
      pull: async (after) => {
        const page = await pull(after);
        if (!page.more) {
          await second.save(numbered(4), null);
          await sync(second, { ...remote, pull });
        }
        return page;
      },
    });
    // The counter of the first device stays before the write that it did
    // not read, so the next read gets it.
    expect(storeOf(first).read().counter).toBe(3);
    await sync(first, remote);
    expect(await first.listCharts()).toHaveLength(5);
    expect(storeOf(first).read().counter).toBe(5);
  });

  it('reads all records again when the local database was emptied', async () => {
    const { remote } = await library(3);
    const storage = memoryStorage();
    const store = createChartSyncStore(() => storage);
    await synchronizeBassCharts(device(), remote, store);
    expect(store.read().counter).toBe(3);

    const emptied = device();
    await synchronizeBassCharts(emptied, remote, store);
    expect(await emptied.listCharts()).toHaveLength(3);
    expect(store.read().counter).toBe(3);
  });

  it('reads all records again when the stored counter is not valid', async () => {
    const { remote } = await library(3);
    for (const stored of ['{broken', '{"counter":-1,"cloud":{}}', '[]']) {
      const storage = memoryStorage();
      storage.items.set('music-theory-lab-chart-sync', stored);
      const local = device();
      await synchronizeBassCharts(
        local,
        remote,
        createChartSyncStore(() => storage),
      );
      expect(await local.listCharts()).toHaveLength(3);
    }
    const blocked = createChartSyncStore(() => {
      throw new Error('blocked storage');
    });
    const local = device();
    await synchronizeBassCharts(local, remote, blocked);
    await synchronizeBassCharts(local, remote, blocked);
    expect(await local.listCharts()).toHaveLength(3);
    expect(remote.writes).toEqual([]);
  });

  it('a slow-clock deletion of a synchronized chart converges to the cloud record on both devices', async () => {
    const remote = cloud();
    const [first, slow] = [device(), device()];
    const kept = numbered(1);
    // The cloud holds the chart with an update time that the clock of the
    // second device has not reached.
    const record = {
      id: kept.id,
      updatedAt: '2099-01-01T00:00:00.000Z',
      chart: kept,
    };
    await first.applyRecord(record);
    await first.save(numbered(2), null);
    await sync(first, remote);
    await sync(slow, remote);

    await slow.remove(kept.id);
    expect(await slow.getChart(kept.id)).toBeNull();
    remote.reads.length = 0;
    remote.writes.length = 0;
    await sync(slow, remote);
    await sync(first, remote);

    for (const local of [first, slow]) {
      expect(await local.getChart(kept.id)).toEqual(kept);
      expect(await local.listRecords()).toContainEqual(record);
      expect(
        (await local.listSummaries()).map((summary) => summary.id).sort(),
      ).toEqual([kept.id, numbered(2).id]);
    }
    expect(remote.record(kept.id)).toEqual(record);
    // The device read from the start, and it sent no record.
    expect(remote.reads.map((read) => read.after)).toEqual([2, 0, 2]);
    expect(remote.writes).toEqual([]);

    // The two agree, so the next read starts at the last counter.
    remote.reads.length = 0;
    await sync(slow, remote);
    expect(remote.reads).toEqual([{ after: 2, ids: [] }]);
  });

  it('applies a deletion record of the cloud again when a local chart has its update time', async () => {
    const remote = cloud();
    const [first, second] = [device(), device()];
    const time = '2026-10-05T10:00:00.000Z';
    await first.applyRecord({ id: chart.id, updatedAt: time, chart: null });
    await sync(first, remote);
    await sync(second, remote);
    // An import on the second device in the same millisecond.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(time));
    await second.save(chart, null);
    vi.useRealTimers();
    expect(await second.listCharts()).toHaveLength(1);

    await sync(second, remote);
    expect(await second.listCharts()).toEqual([]);
    expect(await second.listSummaries()).toEqual([]);
    expect(remote.record(chart.id)?.chart).toBeNull();
  });

  it('reads from counter 0 when the format version of the client changes', async () => {
    const { remote } = await library(3);
    const storage = memoryStorage();
    const local = device();
    await synchronizeBassCharts(
      local,
      remote,
      createChartSyncStore(() => storage),
    );
    expect(
      JSON.parse(storage.items.get('music-theory-lab-chart-sync')!),
    ).toMatchObject({ format: CHART_SYNC_FORMAT, counter: 3 });

    remote.reads.length = 0;
    await synchronizeBassCharts(
      local,
      remote,
      createChartSyncStore(() => storage),
    );
    await synchronizeBassCharts(
      local,
      remote,
      createChartSyncStore(() => storage, CHART_SYNC_FORMAT + 1),
    );
    expect(remote.reads.map((read) => read.after)).toEqual([3, 0]);
    expect(remote.writes).toEqual([]);
    expect(
      JSON.parse(storage.items.get('music-theory-lab-chart-sync')!),
    ).toMatchObject({ format: CHART_SYNC_FORMAT + 1, counter: 3 });
  });

  it('reads from counter 0 with the state that the client stored before the format version', async () => {
    const { remote } = await library(3);
    const storage = memoryStorage();
    const local = device();
    await synchronizeBassCharts(
      local,
      remote,
      createChartSyncStore(() => storage),
    );
    const stored = JSON.parse(
      storage.items.get('music-theory-lab-chart-sync')!,
    );
    delete stored.format;
    storage.items.set('music-theory-lab-chart-sync', JSON.stringify(stored));
    remote.reads.length = 0;
    await synchronizeBassCharts(
      local,
      remote,
      createChartSyncStore(() => storage),
    );
    expect(remote.reads[0].after).toBe(0);
  });

  it('sends the last counter and reads a page of the chart route', async () => {
    const record = { id: chart.id, updatedAt: chart.importedAt, chart };
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ records: [record], counter: 8, more: true }),
    });
    vi.stubGlobal('fetch', fetch);
    expect(await chartCloud.pull(7)).toEqual({
      records: [record],
      counter: 8,
      more: true,
    });
    expect(fetch).toHaveBeenCalledWith('/api/bass-charts?after=7');

    for (const body of [{ records: [record] }, { counter: 8, more: false }]) {
      fetch.mockResolvedValue({ ok: true, json: async () => body });
      await expect(chartCloud.pull(7)).rejects.toThrow('Invalid');
    }
  });

  it('reads the full response of an earlier chart route as one last page', async () => {
    const record = { id: chart.id, updatedAt: chart.importedAt, chart };
    vi.stubGlobal('localStorage', { getItem: () => 'device' });
    const fetch = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => [record] });
    vi.stubGlobal('fetch', fetch);
    expect(await chartCloud.pull(7)).toEqual({
      records: [record],
      counter: 7,
      more: false,
    });

    // The earlier route does not give the counter of a write.
    fetch.mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    expect(await chartCloud.push(record)).toBeNull();
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, counters: [12] }),
    });
    expect(await chartCloud.push(record)).toBe(12);
  });
});
