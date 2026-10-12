import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Client } from '@libsql/client';
import { IDBFactory } from 'fake-indexeddb';
import { fixtureChart } from '@/domain/bassChartFixture';
import {
  isNewerChartSettings,
  type ChartSettings,
} from '@/domain/chartSettings';
import { createIndexedDbRocksmithLibrary } from '@/services/rocksmithLibrary';
import {
  chartSettingsCloud,
  createChartSettingsSyncStore,
  synchronizeChartSettings,
} from '@/services/chartSettingsSync';

const state = vi.hoisted(() => ({ client: null as Client | null }));
vi.mock('@libsql/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@libsql/client')>();
  return {
    ...actual,
    createClient: () => {
      state.client ??= actual.createClient({ url: 'file::memory:' });
      return state.client;
    },
  };
});
import liveHandler from './chart-settings';
import chartHandler from './bass-charts';

let handler = liveHandler;

/** A valid record with its own chart id; `minute` orders the update times. */
function numbered(index: number, minute = index): ChartSettings {
  return {
    chartId: index.toString(16).padStart(64, '0'),
    updatedAt: `2026-10-05T10:${String(minute).padStart(2, '0')}:00.000Z`,
    songLineLength: 4,
    sectionLineLengths: { 0: 'auto', 8: 2 },
    groupOverride: null,
  };
}
const record = numbered(1);

interface Page {
  records: ChartSettings[];
  counter: number;
  more: boolean;
}

async function call(
  route: typeof handler,
  method: string,
  body?: unknown,
  query?: Record<string, unknown>,
) {
  const result = { status: 0, body: undefined as unknown };
  const response = {
    status(code: number) {
      result.status = code;
      return this;
    },
    json(value: unknown) {
      result.body = value;
      return this;
    },
  };
  await route({ method, body, query } as never, response as never);
  return result;
}

const request = (
  method: string,
  body?: unknown,
  query?: Record<string, unknown>,
) => call(handler, method, body, query);

const write = (records: unknown[], device = 'first') =>
  request('POST', { device_id: device, records });

async function readAfter(counter: number): Promise<Page> {
  const result = await request('GET', undefined, { after: String(counter) });
  expect(result.status).toBe(200);
  return result.body as Page;
}

async function tableRows(table: string) {
  return (await state.client!.execute(`SELECT * FROM ${table}`)).rows.map(
    (row) => ({ ...row }),
  );
}
const rows = () => tableRows('chart_settings');

async function counters(): Promise<Record<string, number>> {
  return Object.fromEntries(
    (await rows()).map((row) => [
      String(row.chart_id),
      Number(row.sync_counter),
    ]),
  );
}

/** A new instance of the function: its first request runs the migration. */
async function coldStart() {
  vi.resetModules();
  handler = (await import('./chart-settings')).default;
}

beforeEach(async () => {
  handler = liveHandler;
  await request('GET');
  await call(chartHandler, 'GET');
  await state.client!.execute('DELETE FROM chart_settings');
  await state.client!.execute('DELETE FROM bass_charts');
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('chart settings API', () => {
  it('holds the chart id, the update time, and the three fields of a record', async () => {
    const full: ChartSettings = {
      chartId: 'c'.repeat(64),
      updatedAt: '2026-10-05T10:00:00.000Z',
      songLineLength: 'auto',
      sectionLineLengths: { 0: 16, 12: 'auto', 40: 1 },
      groupOverride: 'agua de beber|tom jobim',
    };
    expect((await write([full, record])).body).toEqual({
      ok: true,
      counters: [1, 2],
    });
    expect(await readAfter(0)).toEqual({
      records: [full, record],
      counter: 2,
      more: false,
    });
  });

  it('shares the records of all devices and keeps the later write', async () => {
    await write([{ ...record, songLineLength: 8 }], 'first');
    const later = { ...numbered(1, 5), songLineLength: 2 };
    await write([later], 'second');
    // An earlier write that arrives late changes nothing.
    await write([{ ...numbered(1, 3), songLineLength: 16 }], 'offline');
    expect((await readAfter(0)).records).toEqual([later]);
  });

  it('keeps one of two writes with one update time, in any arrival order', async () => {
    const four = { ...record, songLineLength: 4 };
    const eight = { ...record, songLineLength: 8 };
    await write([four], 'first');
    await write([eight], 'second');
    const kept = (await readAfter(0)).records;
    await state.client!.execute('DELETE FROM chart_settings');
    await write([eight], 'second');
    await write([four], 'first');
    expect((await readAfter(0)).records).toEqual(kept);
    expect(kept).toHaveLength(1);
  });

  it('refuses a record with a value that the table does not allow, and writes none of the request', async () => {
    const refused: unknown[] = [
      { ...record, songLineLength: 17 },
      { ...record, songLineLength: 0 },
      { ...record, songLineLength: '4' },
      { ...record, sectionLineLengths: { 0: 32 } },
      { ...record, sectionLineLengths: { intro: 4 } },
      { ...record, sectionLineLengths: [4] },
      { ...record, groupOverride: 'Not A Song Key' },
      { ...record, groupOverride: '' },
      { ...record, chartId: 'short' },
      { ...record, updatedAt: 'yesterday' },
      { ...record, chart: { title: 'A chart' } },
      { chartId: record.chartId, updatedAt: record.updatedAt },
      null,
      'text',
    ];
    for (const bad of refused) {
      const result = await write([numbered(2), bad]);
      expect(result.status, JSON.stringify(bad)).toBe(400);
    }
    expect(await rows()).toEqual([]);
  });

  it('holds a group override with a song key of another script', async () => {
    const keys = [
      '夜に駆ける|yoasobi',
      'ありがとう|いきものがかり',
      'группа крови|кино',
      'ζορμπας|θεοδωρακης',
      'ירושלים של זהב|נעמי שמר',
    ];
    const moved = keys.map((groupOverride, index) => ({
      ...numbered(index + 1),
      groupOverride,
    }));
    expect((await write(moved)).status).toBe(200);
    expect((await readAfter(0)).records).toEqual(moved);
    // The stored text holds only ASCII, as the order of two writes needs.
    for (const row of await rows()) {
      expect(String(row.settings)).toMatch(/^[\x20-\x7e]+$/);
    }
  });

  it('refuses a group override in another script that is not a song key', async () => {
    for (const groupOverride of [
      'Группа крови|кино',
      'ζορμπάς|',
      'ありがとう|'.normalize('NFD'),
      '夜に駆ける!|yoasobi',
      '群青\u202e|yoasobi',
      '群青|yoasobi|',
      '🎸|yoasobi',
    ]) {
      const result = await write([{ ...record, groupOverride }]);
      expect(result.status, JSON.stringify(groupOverride)).toBe(400);
    }
    expect(await rows()).toEqual([]);
  });

  it('keeps the same one of two song keys of another script with one update time, as the browser does', async () => {
    // 𠀀 goes before ｶ in the text order of the browser and after it in the
    // byte order of the database.
    const astral = { ...record, groupOverride: '\u{20000}|' };
    const halfWidth = { ...record, groupOverride: '\uff76|' };
    const winner = isNewerChartSettings(astral, halfWidth) ? astral : halfWidth;
    await write([astral], 'first');
    await write([halfWidth], 'second');
    expect((await readAfter(0)).records).toEqual([winner]);
    await state.client!.execute('DELETE FROM chart_settings');
    await write([halfWidth], 'second');
    await write([astral], 'first');
    expect((await readAfter(0)).records).toEqual([winner]);
  });

  it('refuses a request without a device id or a list of records, and malformed JSON', async () => {
    for (const body of [
      { records: [record] },
      { device_id: '', records: [record] },
      { device_id: 7, records: [record] },
      { device_id: 'd'.repeat(201), records: [record] },
      { device_id: 'first' },
      { device_id: 'first', records: record },
      [record],
      7,
      '{broken',
    ]) {
      expect((await request('POST', body)).status).toBe(400);
    }
    expect(await rows()).toEqual([]);
  });

  it('refuses a write with more than 100 records and accepts 100', async () => {
    const many = Array.from({ length: 101 }, (_, index) => numbered(index, 0));
    const result = await write(many);
    expect(result.status).toBe(400);
    expect(await rows()).toEqual([]);

    const accepted = await write(many.slice(0, 100));
    expect(accepted.status).toBe(200);
    expect((accepted.body as { counters: number[] }).counters).toEqual(
      Array.from({ length: 100 }, (_, index) => index + 1),
    );
    expect(await rows()).toHaveLength(100);
  });

  it('accepts only a read and a write', async () => {
    await write([record]);
    for (const method of ['DELETE', 'PUT', 'PATCH']) {
      expect((await request(method, undefined)).status).toBe(405);
    }
    expect(await rows()).toHaveLength(1);
  });

  it('logs only the error object of a failure, with no record body', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const failure = new Error('database is not there');
    vi.spyOn(state.client!, 'batch').mockRejectedValue(failure);
    const secret = { ...record, groupOverride: 'do not log this|artist' };
    expect((await write([secret])).status).toBe(500);
    expect(logged.mock.calls).toEqual([['chart settings API error:', failure]]);
    // A refused record is not a failure, and it leaves no log.
    logged.mockClear();
    await write([{ ...secret, songLineLength: 99 }]);
    expect(logged).not.toHaveBeenCalled();
  });
});

describe('chart settings counter', () => {
  it('gives each accepted write a counter larger than all earlier values', async () => {
    const seen: number[] = [];
    const accept = async (item: ChartSettings) => {
      const result = await write([item]);
      const counter = (await counters())[item.chartId];
      expect(result.body).toEqual({ ok: true, counters: [counter] });
      expect(counter).toBeGreaterThan(Math.max(0, ...seen));
      seen.push(counter);
    };
    await accept(numbered(1));
    await accept(numbered(2));
    // A later write of a record that exists.
    await accept({ ...numbered(1, 30), songLineLength: 8 });
    await accept({ ...numbered(2, 40), groupOverride: 'separate' });
    expect(seen).toEqual([1, 2, 3, 4]);
  });

  it('changes no row and no counter for a write that loses, and for the same write again', async () => {
    await write([numbered(1, 30), numbered(2)]);
    const before = await rows();
    const stale = { ...numbered(1, 10), songLineLength: 8 };
    expect((await write([stale], 'second')).body).toEqual({
      ok: true,
      counters: [null],
    });
    // The same record again: the route answers with the counter that it has.
    expect((await write([numbered(1, 30)], 'second')).body).toEqual({
      ok: true,
      counters: [1],
    });
    expect(await rows()).toEqual(before);
    expect((await readAfter(2)).records).toEqual([]);
  });

  it('reads only the records with a larger counter, in counter order, up to the page limit', async () => {
    const items = Array.from({ length: 205 }, (_, index) =>
      // The update times run against the write order: the read follows the
      // counter, not the clock of a device.
      numbered(index + 1, 59 - (index % 60)),
    );
    await write(items.slice(0, 100));
    await write(items.slice(100, 200));
    await write(items.slice(200));

    const first = await readAfter(0);
    expect(first.records).toEqual(items.slice(0, 100));
    expect(first).toMatchObject({ counter: 100, more: true });

    const second = await readAfter(first.counter);
    expect(second.records).toEqual(items.slice(100, 200));
    expect(second).toMatchObject({ counter: 200, more: true });

    const third = await readAfter(second.counter);
    expect(third).toEqual({
      records: items.slice(200),
      counter: 205,
      more: false,
    });
    expect(await readAfter(203)).toEqual({
      records: items.slice(203),
      counter: 205,
      more: false,
    });
    expect(await readAfter(205)).toEqual({
      records: [],
      counter: 205,
      more: false,
    });
  });

  it('moves a later write to the end of the read', async () => {
    await write([numbered(1), numbered(2), numbered(3)]);
    const { counter } = await readAfter(0);
    const changed = { ...numbered(2, 50), songLineLength: 8 };
    await write([changed], 'second');
    expect(await readAfter(counter)).toEqual({
      records: [changed],
      counter: counter + 1,
      more: false,
    });
    expect((await readAfter(0)).records).toEqual([
      numbered(1),
      numbered(3),
      changed,
    ]);
  });

  it('starts a read without a counter at the first record', async () => {
    await write([numbered(1), numbered(2)]);
    expect((await request('GET')).body).toEqual(await readAfter(0));
  });

  it('refuses a counter that is not a whole number', async () => {
    await write([record]);
    for (const after of ['', '-1', '1.5', 'abc', '1 OR 1=1', ['1', '2']]) {
      const result = await request('GET', undefined, { after });
      expect(result.status).toBe(400);
    }
  });
});

describe('chart settings and the chart route', () => {
  const chart = {
    ...fixtureChart(1, [{ bar: 0, beat: 0, midi: 33 }]),
    id: record.chartId,
    source: 'gp' as const,
  };
  const chartRecord = {
    id: chart.id,
    updatedAt: '2026-10-05T09:00:00.000Z',
    chart,
  };
  const writeChart = (item: unknown) =>
    call(chartHandler, 'POST', { device_id: 'first', records: [item] });

  it('keeps the settings in the cloud after the deletion of their chart', async () => {
    await writeChart(chartRecord);
    await write([record]);
    const before = await rows();
    const deletion = {
      ...chartRecord,
      updatedAt: record.updatedAt,
      chart: null,
    };
    expect((await writeChart(deletion)).status).toBe(200);
    expect((await call(chartHandler, 'GET')).body).toEqual([deletion]);
    expect(await rows()).toEqual(before);
    expect((await readAfter(0)).records).toEqual([record]);
  });

  it('accepts settings for a chart that the cloud does not have', async () => {
    expect((await write([record])).status).toBe(200);
    expect(await tableRows('bass_charts')).toEqual([]);
  });

  it('changes no chart row and no chart counter with a settings write', async () => {
    await writeChart(chartRecord);
    const before = await tableRows('bass_charts');
    await write([record]);
    await write([{ ...numbered(1, 30), songLineLength: 8 }], 'second');
    expect(await tableRows('bass_charts')).toEqual(before);
    const chartPage = await call(chartHandler, 'GET', undefined, {
      after: String(before[0].sync_counter),
    });
    expect(chartPage.body).toMatchObject({ records: [] });
  });
});

describe('chart settings migration', () => {
  // The write of the chart route before this version, as production has it.
  const EARLIER_CHART = `INSERT INTO bass_charts (id, device_id, chart, updated_at)
    VALUES (?, ?, ?, ?)`;

  /** A database as production holds it: charts, and no settings table. */
  async function productionDatabase() {
    const actual =
      await vi.importActual<typeof import('@libsql/client')>('@libsql/client');
    state.client = actual.createClient({ url: 'file::memory:' });
    await state.client.batch(
      [
        `CREATE TABLE bass_charts (
          id TEXT PRIMARY KEY,
          device_id TEXT NOT NULL,
          chart TEXT,
          updated_at TEXT NOT NULL
        )`,
        `CREATE TABLE songs (id TEXT PRIMARY KEY, title TEXT NOT NULL)`,
        `INSERT INTO songs VALUES ('song', 'A transcription')`,
      ],
      'write',
    );
    for (const [id, chart] of [
      ['1'.repeat(64), '{"title":"One"}'],
      ['2'.repeat(64), null],
    ]) {
      await state.client.execute({
        sql: EARLIER_CHART,
        args: [id, 'phone', chart, '2026-10-01T10:00:00.000Z'],
      });
    }
  }

  async function schema() {
    const result = await state.client!.execute(
      `SELECT type, name, tbl_name, sql FROM sqlite_master
        WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name`,
    );
    return result.rows.map((row) => ({ ...row }));
  }

  const otherTables = async () => ({
    charts: await tableRows('bass_charts'),
    songs: await tableRows('songs'),
  });

  // The other tests keep their database.
  let shared: Client | null = null;
  beforeEach(async () => {
    shared = state.client;
    await productionDatabase();
  });
  afterEach(() => {
    state.client = shared;
  });

  it('adds only the settings table, its index, and its triggers, and changes no row that exists', async () => {
    const tables = await otherTables();
    const before = await schema();
    await coldStart();
    expect(await readAfter(0)).toEqual({
      records: [],
      counter: 0,
      more: false,
    });
    expect(await otherTables()).toEqual(tables);
    const added = (await schema()).filter(
      (item) => !before.some((old) => old.name === item.name),
    );
    expect(added.map((item) => [item.type, item.name, item.tbl_name])).toEqual([
      ['index', 'chart_settings_sync_counter', 'chart_settings'],
      ['table', 'chart_settings', 'chart_settings'],
      ['trigger', 'chart_settings_count_insert', 'chart_settings'],
      ['trigger', 'chart_settings_count_update', 'chart_settings'],
    ]);
    // Each object that was there keeps its definition.
    expect(
      (await schema()).filter(
        (item) => !added.some((other) => other.name === item.name),
      ),
    ).toEqual(before);
  });

  it('changes nothing when the migration runs again', async () => {
    await coldStart();
    await write([numbered(1), numbered(2)]);
    const before = { schema: await schema(), rows: await rows() };
    const tables = await otherTables();
    await coldStart();
    await request('GET');
    await coldStart();
    await readAfter(0);
    expect({ schema: await schema(), rows: await rows() }).toEqual(before);
    expect(await otherTables()).toEqual(tables);
    // The counter continues after the largest value.
    expect((await write([numbered(3)])).body).toEqual({
      ok: true,
      counters: [3],
    });
  });

  it('runs from two instances at one time', async () => {
    await coldStart();
    const first = handler;
    await coldStart();
    const second = handler;
    const results = await Promise.all([
      call(first, 'POST', { device_id: 'first', records: [numbered(1)] }),
      call(second, 'POST', { device_id: 'second', records: [numbered(2)] }),
      call(first, 'GET'),
      call(second, 'GET'),
    ]);
    expect(results.map((result) => result.status)).toEqual([
      200, 200, 200, 200,
    ]);
    expect(Object.values(await counters()).sort()).toEqual([1, 2]);
  });

  it('tries the migration again after a failure', async () => {
    await coldStart();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const batch = vi
      .spyOn(state.client!, 'batch')
      .mockRejectedValueOnce(new Error('database is busy'));
    expect((await request('GET')).status).toBe(500);
    expect((await request('GET')).status).toBe(200);
    expect(batch).toHaveBeenCalledTimes(2);
  });
});

describe('two devices through the settings route', () => {
  /** The network of a browser, into the handler of this test. */
  function connect() {
    vi.stubGlobal('localStorage', { getItem: () => 'device' });
    const requests: { method: string; url: string; body: unknown }[] = [];
    vi.stubGlobal(
      'fetch',
      async (url: string, init?: { method?: string; body?: string }) => {
        const method = init?.method ?? 'GET';
        const body = init?.body ? JSON.parse(init.body) : undefined;
        requests.push({ method, url, body });
        const [path, search = ''] = url.split('?');
        expect(path).toBe('/api/chart-settings');
        const result = await request(
          method,
          body,
          Object.fromEntries(new URLSearchParams(search)),
        );
        return {
          ok: result.status === 200,
          status: result.status,
          // The response crosses the network as text.
          json: async () => JSON.parse(JSON.stringify(result.body)),
        };
      },
    );
    return requests;
  }

  function device() {
    const items = new Map<string, string>();
    return {
      library: createIndexedDbRocksmithLibrary(new IDBFactory()),
      store: createChartSettingsSyncStore(() => ({
        getItem: (key: string) => items.get(key) ?? null,
        setItem: (key: string, value: string) => void items.set(key, value),
      })),
    };
  }
  type Device = ReturnType<typeof device>;
  const sync = (item: Device) =>
    synchronizeChartSettings(item.library, chartSettingsCloud, item.store);

  it('brings a settings record from one device to a second device', async () => {
    const requests = connect();
    const [first, second] = [device(), device()];
    await first.library.saveSettings(record);
    await sync(first);
    await sync(second);
    expect(await second.library.getSettings(record.chartId)).toEqual(record);
    expect(second.store.read().counter).toBe(1);
    // One write with one settings record, and no chart.
    expect(requests.filter((item) => item.method === 'POST')).toEqual([
      {
        method: 'POST',
        url: '/api/chart-settings',
        body: { device_id: 'device', records: [record] },
      },
    ]);

    // With no change, a synchronization reads no record and writes none.
    requests.length = 0;
    await sync(first);
    await sync(second);
    expect(requests).toEqual([
      { method: 'GET', url: '/api/chart-settings?after=1', body: undefined },
      { method: 'GET', url: '/api/chart-settings?after=1', body: undefined },
    ]);
  });

  it('keeps the later write on the two devices and on the server', async () => {
    connect();
    const [first, second] = [device(), device()];
    await first.library.saveSettings({ ...record, songLineLength: 8 });
    await sync(first);
    await sync(second);
    const later = { ...numbered(1, 20), songLineLength: 2 };
    await second.library.saveSettings(later);
    await first.library.saveSettings({
      ...numbered(1, 10),
      songLineLength: 16,
    });
    await sync(first);
    await sync(second);
    await sync(first);
    expect(await first.library.getSettings(record.chartId)).toEqual(later);
    expect(await second.library.getSettings(record.chartId)).toEqual(later);
    expect((await readAfter(0)).records).toEqual([later]);
  });

  it('sends 250 records in writes of 100 at most, and a second device reads them in pages', async () => {
    const requests = connect();
    const [first, second] = [device(), device()];
    for (let index = 1; index <= 250; index++) {
      await first.library.saveSettings(numbered(index, 0));
    }
    await sync(first);
    const sizes = requests
      .filter((item) => item.method === 'POST')
      .map((item) => (item.body as { records: unknown[] }).records.length);
    expect(sizes).toEqual([100, 100, 50]);
    expect(first.store.read().counter).toBe(250);

    requests.length = 0;
    await sync(second);
    expect(requests.map((item) => item.url)).toEqual([
      '/api/chart-settings?after=0',
      '/api/chart-settings?after=100',
      '/api/chart-settings?after=200',
    ]);
    expect(await second.library.listSettings()).toHaveLength(250);
    expect(requests.every((item) => item.method === 'GET')).toBe(true);
  });
});
