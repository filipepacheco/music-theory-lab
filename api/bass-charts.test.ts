import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Client } from '@libsql/client';
import { fixtureChart } from '@/domain/bassChartFixture';

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
import liveHandler from './bass-charts';

let handler = liveHandler;

const chart = {
  ...fixtureChart(1, [{ bar: 0, beat: 0, midi: 33 }]),
  id: 'a'.repeat(64),
  source: 'gp' as const,
  originalFingering: [{ string: 1, fret: 0 }],
};
const record = { id: chart.id, updatedAt: '2026-10-05T10:00:00.000Z', chart };

/** A valid record with its own id; `minute` orders the update times. */
function numbered(index: number, minute = index) {
  const id = index.toString(16).padStart(64, '0');
  return {
    id,
    updatedAt: `2026-10-05T10:${String(minute).padStart(2, '0')}:00.000Z`,
    chart: { ...chart, id, title: `Chart ${index}` },
  };
}

interface Page {
  records: { id: string }[];
  counter: number;
  more: boolean;
}

async function request(
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
  await handler({ method, body, query } as never, response as never);
  return result;
}

const write = (records: unknown[], device = 'first') =>
  request('POST', { device_id: device, records });

async function readAfter(counter: number): Promise<Page> {
  const result = await request('GET', undefined, { after: String(counter) });
  expect(result.status).toBe(200);
  return result.body as Page;
}

async function rows() {
  return (await state.client!.execute('SELECT * FROM bass_charts')).rows.map(
    (row) => ({ ...row }),
  );
}

async function counters(): Promise<Record<string, number>> {
  return Object.fromEntries(
    (await rows()).map((row) => [String(row.id), Number(row.sync_counter)]),
  );
}

/** A new instance of the function: its first request runs the migration. */
async function coldStart() {
  vi.resetModules();
  handler = (await import('./bass-charts')).default;
}

// The write of the function version before the counter, word for word.
const EARLIER_WRITE = `INSERT INTO bass_charts (id, device_id, chart, updated_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              device_id = excluded.device_id,
              chart = excluded.chart,
              updated_at = excluded.updated_at
            WHERE excluded.updated_at > bass_charts.updated_at
               OR (excluded.updated_at = bass_charts.updated_at
                   AND excluded.chart IS NULL)`;

function earlierWrite(
  item: { id: string; updatedAt: string; chart: unknown },
  device = 'earlier',
) {
  return state.client!.execute({
    sql: EARLIER_WRITE,
    args: [
      item.id,
      device,
      item.chart === null ? null : JSON.stringify(item.chart),
      item.updatedAt,
    ],
  });
}

beforeEach(async () => {
  handler = liveHandler;
  await request('GET');
  await state.client!.execute('DELETE FROM bass_charts');
});

describe('bass chart API', () => {
  it('shares validated charts across devices and keeps the latest write', async () => {
    expect(
      (await request('POST', { device_id: 'first', records: [record] })).status,
    ).toBe(200);
    await request('POST', {
      device_id: 'second',
      records: [
        {
          ...record,
          updatedAt: '2026-10-04T10:00:00.000Z',
          chart: { ...chart, title: 'Stale' },
        },
      ],
    });
    expect((await request('GET')).body).toEqual([record]);
  });

  it('keeps tombstones against stale uploads, including timestamp ties', async () => {
    await request('POST', { device_id: 'first', records: [record] });
    const deletion = { ...record, chart: null };
    await request('POST', { device_id: 'second', records: [deletion] });
    await request('POST', { device_id: 'offline', records: [record] });
    expect((await request('GET')).body).toEqual([deletion]);
  });

  it('rejects invalid charts, binary payloads and malformed JSON', async () => {
    const bad = await request('POST', {
      device_id: 'first',
      records: [{ ...record, chart: { ...chart, audio: 'private' } }],
    });
    expect(bad.status).toBe(400);
    expect((await request('POST', '{broken')).status).toBe(400);
    expect((await request('GET')).body).toEqual([]);
  });

  it('rejects a batch before writing any of it if one record is invalid', async () => {
    const result = await request('POST', {
      device_id: 'first',
      records: [record, { ...record, id: 'bad' }],
    });
    expect(result.status).toBe(400);
    expect((await request('GET')).body).toEqual([]);
  });
});

describe('bass chart counter', () => {
  it('gives each accepted write a counter larger than all earlier values', async () => {
    const [first, second] = [numbered(1), numbered(2)];
    const seen: number[] = [];
    const accept = async (id: string, change: object = {}) => {
      const item = { ...(id === first.id ? first : second), ...change };
      const result = await write([item]);
      const counter = (await counters())[id];
      expect(result.body).toEqual({ ok: true, counters: [counter] });
      expect(counter).toBeGreaterThan(Math.max(0, ...seen));
      seen.push(counter);
    };
    await accept(first.id);
    await accept(second.id);
    // A newer record of a chart that exists.
    await accept(first.id, { updatedAt: '2026-10-05T11:00:00.000Z' });
    await accept(second.id, { updatedAt: '2026-10-05T12:00:00.000Z' });
    // A deletion record on a tie of update times.
    await accept(second.id, {
      updatedAt: '2026-10-05T12:00:00.000Z',
      chart: null,
    });
    expect(seen).toEqual([1, 2, 3, 4, 5]);
  });

  it('gives each record of one write its own counter, in the order of the write', async () => {
    const items = [numbered(3), numbered(1), numbered(2)];
    expect((await write(items)).body).toEqual({
      ok: true,
      counters: [1, 2, 3],
    });
    expect((await readAfter(0)).records).toEqual(items);
  });

  it('changes no row and no counter for a write that loses to a newer record', async () => {
    await write([record, numbered(1)]);
    const before = await rows();
    const stale = {
      ...record,
      updatedAt: '2026-10-04T10:00:00.000Z',
      chart: { ...chart, title: 'Stale' },
    };
    const tie = { ...record, chart: { ...chart, title: 'Tie' } };
    expect((await write([stale], 'second')).body).toEqual({
      ok: true,
      counters: [null],
    });
    expect((await write([tie], 'second')).status).toBe(200);
    expect(await rows()).toEqual(before);
    expect((await readAfter(2)).records).toEqual([]);
  });

  it('changes no row and no counter for a deletion record that arrives again', async () => {
    const deletion = { ...record, chart: null };
    await write([record, numbered(1)]);
    expect((await write([deletion], 'second')).body).toEqual({
      ok: true,
      counters: [3],
    });
    const before = await rows();
    // The same deletion again, from the same device and from a different one.
    for (const device of ['second', 'third']) {
      expect((await write([deletion], device)).body).toEqual({
        ok: true,
        counters: [3],
      });
    }
    expect(await rows()).toEqual(before);
    expect(await readAfter(3)).toEqual({
      records: [],
      counter: 3,
      more: false,
    });
  });

  it('reads only the records with a larger counter, in counter order, 10 at most', async () => {
    const items = Array.from({ length: 12 }, (_, index) => numbered(index + 1));
    // The update times run against the write order: the read follows the
    // counter, not the clock of a device.
    for (const item of [...items].reverse()) await write([item]);
    const newest = { ...items[11], updatedAt: '2026-10-05T11:00:00.000Z' };
    await write([newest]);
    const written = [...items.slice(0, 11).reverse(), newest];

    const first = await readAfter(0);
    expect(first.records).toEqual(written.slice(0, 10));
    expect(first.more).toBe(true);
    expect(first.counter).toBe((await counters())[written[9].id]);

    const second = await readAfter(first.counter);
    expect(second.records).toEqual(written.slice(10));
    expect(second.more).toBe(false);
    expect(second.counter).toBe((await counters())[newest.id]);

    expect(await readAfter(second.counter)).toEqual({
      records: [],
      counter: second.counter,
      more: false,
    });
  });

  it('reports a full page when the last record of the library ends it', async () => {
    const items = Array.from({ length: 10 }, (_, index) => numbered(index + 1));
    await write(items);
    const page = await readAfter(0);
    expect(page.records).toHaveLength(10);
    expect(page.more).toBe(true);
    expect(await readAfter(page.counter)).toEqual({
      records: [],
      counter: page.counter,
      more: false,
    });
  });

  it('returns the full response of the present client for a read without a counter', async () => {
    const items = Array.from({ length: 12 }, (_, index) => numbered(index + 1));
    await write(items);
    const deletion = { ...items[0], chart: null };
    await write([deletion]);
    const result = await request('GET');
    expect(result.status).toBe(200);
    // All records in one array, in the row order of the table, with no
    // counter field.
    expect(result.body).toEqual([deletion, ...items.slice(1)]);
  });

  it('moves a deletion record through the read with a counter', async () => {
    await write([record, numbered(1)]);
    const { counter } = await readAfter(0);
    const deletion = { ...record, chart: null };
    await write([deletion], 'second');
    expect(await readAfter(counter)).toEqual({
      records: [deletion],
      counter: counter + 1,
      more: false,
    });
  });

  it('refuses a counter that is not a whole number', async () => {
    await write([record]);
    for (const after of ['', '-1', '1.5', 'abc', '1 OR 1=1', ['1', '2']]) {
      const result = await request('GET', undefined, { after });
      expect(result.status).toBe(400);
    }
  });
});

describe('bass chart counter migration', () => {
  const old = [
    { ...numbered(1, 30), device: 'phone' },
    { ...numbered(2, 10), device: 'laptop' },
    { ...numbered(3, 20), chart: null, device: 'phone' },
    { ...numbered(4, 10), device: 'laptop' },
  ];

  /** A database as the function version before the counter left it. */
  async function earlierDatabase() {
    const actual =
      await vi.importActual<typeof import('@libsql/client')>('@libsql/client');
    state.client = actual.createClient({ url: 'file::memory:' });
    await state.client.execute(`CREATE TABLE IF NOT EXISTS bass_charts (
      id TEXT PRIMARY KEY,
      device_id TEXT NOT NULL,
      chart TEXT,
      updated_at TEXT NOT NULL
    )`);
    for (const item of old) await earlierWrite(item, item.device);
  }

  const withoutCounter = async () =>
    (await rows()).map(({ id, device_id, chart, updated_at }) => ({
      id,
      device_id,
      chart,
      updated_at,
    }));

  const records = old.map(({ id, updatedAt, chart }) => ({
    id,
    updatedAt,
    chart,
  }));

  beforeEach(earlierDatabase);

  it('gives the rows that exist counters in update-time order and changes nothing else', async () => {
    const before = await rows();
    await coldStart();
    expect((await request('GET')).body).toEqual(records);
    // Same rows, same values, same order.
    expect(await withoutCounter()).toEqual(before);
    expect(await counters()).toEqual({
      [old[1].id]: 1,
      [old[3].id]: 2,
      [old[2].id]: 3,
      [old[0].id]: 4,
    });
    expect((await readAfter(0)).records).toEqual([
      records[1],
      records[3],
      records[2],
      records[0],
    ]);
  });

  it('changes nothing when the migration runs again', async () => {
    await coldStart();
    await request('GET');
    await write([numbered(5)]);
    const before = await rows();
    await coldStart();
    await request('GET');
    await coldStart();
    await readAfter(0);
    expect(await rows()).toEqual(before);
  });

  it('runs from two instances at one time', async () => {
    await coldStart();
    const first = handler;
    await coldStart();
    const second = handler;
    const call = async (instance: typeof handler) => {
      handler = instance;
      return request('GET');
    };
    const results = await Promise.all([call(first), call(second)]);
    expect(results.map((result) => result.status)).toEqual([200, 200]);
    expect(Object.values(await counters()).sort()).toEqual([1, 2, 3, 4]);
  });

  it('counts a write of the earlier function version after the migration', async () => {
    await coldStart();
    const { counter } = await readAfter(0);
    expect(counter).toBe(4);
    const added = numbered(6);
    const deletion = {
      ...records[1],
      updatedAt: '2026-10-05T11:00:00.000Z',
      chart: null,
    };
    await earlierWrite(added);
    await earlierWrite(deletion);
    // A write that loses, through the earlier version.
    await earlierWrite({
      ...records[0],
      updatedAt: '2026-10-05T09:00:00.000Z',
    });
    expect(await readAfter(counter)).toEqual({
      records: [added, deletion],
      counter: 6,
      more: false,
    });
  });

  it('gives a row without a counter the next value at a cold start', async () => {
    await coldStart();
    await request('GET');
    // A row with no counter: the next cold start gives it the next value.
    await state.client!.execute({
      sql: 'UPDATE bass_charts SET sync_counter = NULL WHERE id = ?',
      args: [old[1].id],
    });
    await coldStart();
    expect((await readAfter(4)).records).toEqual([records[1]]);
  });
});
