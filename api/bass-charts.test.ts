import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Client } from '@libsql/client';
import { fixtureChart } from '@/domain/bassChartFixture';
import { fixtureDrumChart } from '@/domain/drumChartFixture';
import { fixtureGuitarChart } from '@/domain/guitarChartFixture';
import { fixtureVocalChart } from '@/domain/vocalChartFixture';

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
const drums = fixtureDrumChart(1, [
  { bar: 0, beat: 0, midi: 36 },
  { bar: 0, beat: 1, midi: 38, dynamic: 'ghost', intensity: 79 },
]);
const drumRecord = {
  id: drums.id,
  updatedAt: '2026-10-05T10:00:00.000Z',
  chart: drums,
};

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

async function coldStart() {
  vi.resetModules();
  handler = (await import('./bass-charts')).default;
}

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

describe('drum chart on the chart route', () => {
  it('gives a drum chart of one device to a second device, in the table of the bass charts', async () => {
    expect((await write([record, drumRecord], 'first')).status).toBe(200);
    expect((await request('GET')).body).toEqual([record, drumRecord]);
    const page = await readAfter(0);
    expect(page.records).toEqual([record, drumRecord]);
    expect(page.counter).toBe(2);
    const stored = (await rows()).find((row) => row.id === drums.id)!;
    expect(JSON.parse(String(stored.chart))).toEqual(drums);
  });

  it('keeps a deletion record of a drum chart against a stale upload', async () => {
    await write([drumRecord]);
    const deletion = { ...drumRecord, chart: null };
    await write([deletion], 'second');
    await write([drumRecord], 'offline');
    expect((await request('GET')).body).toEqual([deletion]);
  });

  it('refuses a bad drum chart and writes nothing', async () => {
    const hit = drums.hits[0];
    const bad: unknown[] = [
      { ...chart, id: drums.id, part: 'drums' },
      { ...drums, tuning: [0, 0, 0, 0] },
      { ...drums, notes: chart.notes },
      { ...drums, audio: 'binary' },
      { ...drums, hits: [] },
      { ...drums, hits: [{ ...hit, piece: 'cowbell' }] },
      { ...drums, hits: [{ ...hit, articulation: 'rimshot' }] },
      { ...drums, hits: [{ ...hit, dynamic: 'loud' }] },
      { ...drums, hits: [{ ...hit, intensity: 200 }] },
      { ...drums, hits: [{ ...hit, midi: 128 }] },
      { ...drums, hits: [{ ...hit, bar: 5 }] },
      { ...drums, hits: [{ ...hit, sample: 'binary' }] },
      { ...drums, hits: [...drums.hits].reverse() },
      { ...drums, bars: [] },
    ];
    for (const [index, item] of bad.entries()) {
      const result = await write([{ ...drumRecord, chart: item }]);
      expect([index, result.status]).toEqual([index, 400]);
    }
    expect(
      (await write([record, { ...drumRecord, chart: bad[1] }])).status,
    ).toBe(400);
    expect((await request('GET')).body).toEqual([]);
  });

  it('skips a chart of an unknown kind and saves the other charts', async () => {
    const id = 'c'.repeat(64);
    const unknown = { ...drumRecord, id, chart: { ...drums, id, part: 'keys' } };
    const result = await write([record, unknown, drumRecord]);
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ ok: true });
    expect((result.body as { counters: unknown[] }).counters[1]).toBeNull();
    expect((await rows()).map((row) => row.id).sort()).toEqual(
      [record.id, drums.id].sort(),
    );
  });

  it('still refuses a malformed chart of a known kind beside an unknown kind', async () => {
    const unknown = { ...drumRecord, chart: { ...drums, part: 'keys' } };
    const result = await write([
      unknown,
      { ...drumRecord, chart: { ...drums, hits: [] } },
    ]);
    expect(result.status).toBe(400);
    expect(await rows()).toEqual([]);
  });

  it('refuses a drum chart with the id of a different record', async () => {
    const result = await write([{ ...drumRecord, id: 'b'.repeat(64) }]);
    expect(result.status).toBe(400);
    expect(await rows()).toEqual([]);
  });
});

describe('guitar chart on the chart route', () => {
  const guitar = fixtureGuitarChart(
    2,
    [
      { bar: 0, beat: 0, string: 0, fret: 3 },
      { bar: 0, beat: 0, string: 1, fret: 2, techniques: ['bend'] },
      { bar: 1, beat: 1, string: 6, fret: 5, slideToFret: 7 },
    ],
    { openPitches: [35, 40, 45, 50, 55, 59, 64], capo: 2 },
  );
  const guitarRecord = {
    id: guitar.id,
    updatedAt: '2026-10-05T10:00:00.000Z',
    chart: guitar,
  };

  it('gives a guitar chart of one device to a second device, in the same table', async () => {
    expect((await write([record, drumRecord, guitarRecord])).status).toBe(200);
    const page = await readAfter(0);
    expect(page.records).toEqual([record, drumRecord, guitarRecord]);
    const stored = (await rows()).find((row) => row.id === guitar.id)!;
    expect(JSON.parse(String(stored.chart))).toEqual(guitar);
  });

  it('keeps a deletion record of a guitar chart against a stale upload', async () => {
    await write([guitarRecord]);
    const deletion = { ...guitarRecord, chart: null };
    await write([deletion], 'second');
    await write([guitarRecord], 'offline');
    expect((await request('GET')).body).toEqual([deletion]);
  });

  it('refuses a malformed guitar chart and writes nothing', async () => {
    const note = guitar.notes[0];
    const bad: unknown[] = [
      { ...guitar, partName: 3 },
      { ...guitar, strings: 4, openPitches: [40, 45, 50, 55] },
      { ...guitar, openPitches: [35, 40, 45] },
      { ...guitar, capo: -1 },
      { ...guitar, tuning: [0, 0, 0, 0] },
      { ...guitar, audio: 'binary' },
      { ...guitar, notes: [] },
      { ...guitar, notes: [{ ...note, string: 7 }] },
      { ...guitar, notes: [{ ...note, midi: note.midi + 1 }] },
      { ...guitar, notes: [{ ...note, techniques: ['whammy'] }] },
      { ...guitar, notes: [{ ...note, bar: 9 }] },
      { ...guitar, bars: [] },
    ];
    for (const [index, item] of bad.entries()) {
      const result = await write([{ ...guitarRecord, chart: item }]);
      expect([index, result.status]).toEqual([index, 400]);
    }
    expect(
      (await write([record, { ...guitarRecord, chart: bad[0] }])).status,
    ).toBe(400);
    expect((await request('GET')).body).toEqual([]);
  });
});

describe('vocal chart on the chart route', () => {
  const vocals = fixtureVocalChart(2, [
    { bar: 0, beat: 0, midi: 64, lyric: 'Hel-' },
    { bar: 0, beat: 0, midi: 67, lyric: 'Hel-' },
    { bar: 0, beat: 2, midi: 72 },
    { bar: 1, beat: 1, midi: 62, lyric: 'lo' },
  ]);
  const vocalRecord = {
    id: vocals.id,
    updatedAt: '2026-10-05T10:00:00.000Z',
    chart: vocals,
  };

  it('gives a vocal chart of one device to a second device, in the same table', async () => {
    expect((await write([record, drumRecord, vocalRecord])).status).toBe(200);
    const page = await readAfter(0);
    expect(page.records).toEqual([record, drumRecord, vocalRecord]);
    const stored = (await rows()).find((row) => row.id === vocals.id)!;
    expect(JSON.parse(String(stored.chart))).toEqual(vocals);
  });

  it('keeps a deletion record of a vocal chart against a stale upload', async () => {
    await write([vocalRecord]);
    const deletion = { ...vocalRecord, chart: null };
    await write([deletion], 'second');
    await write([vocalRecord], 'offline');
    expect((await request('GET')).body).toEqual([deletion]);
  });

  it('refuses a malformed vocal chart and writes nothing', async () => {
    const note = vocals.notes[0];
    const bad: unknown[] = [
      { ...vocals, partName: 3 },
      { ...vocals, trackIndex: -1 },
      { ...vocals, strings: 6 },
      { ...vocals, audio: 'binary' },
      { ...vocals, notes: [] },
      { ...vocals, notes: [{ ...note, midi: 130 }] },
      { ...vocals, notes: [{ ...note, midi: 60.5 }] },
      { ...vocals, notes: [{ ...note, lyric: 4 }] },
      { ...vocals, notes: [{ ...note, lyric: 'x'.repeat(201) }] },
      { ...vocals, notes: [{ ...note, string: 1 }] },
      { ...vocals, notes: [{ ...note, bar: 9 }] },
      { ...vocals, notes: [{ ...note, endTime: note.time - 1 }] },
      { ...vocals, notes: [vocals.notes[2], vocals.notes[0]] },
      { ...vocals, bars: [] },
    ];
    for (const [index, item] of bad.entries()) {
      const result = await write([{ ...vocalRecord, chart: item }]);
      expect([index, result.status]).toEqual([index, 400]);
    }
    expect(
      (await write([record, { ...vocalRecord, chart: bad[0] }])).status,
    ).toBe(400);
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
    await accept(first.id, { updatedAt: '2026-10-05T11:00:00.000Z' });
    await accept(second.id, { updatedAt: '2026-10-05T12:00:00.000Z' });
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
    await state.client!.execute({
      sql: 'UPDATE bass_charts SET sync_counter = NULL WHERE id = ?',
      args: [old[1].id],
    });
    await coldStart();
    expect((await readAfter(4)).records).toEqual([records[1]]);
  });
});
