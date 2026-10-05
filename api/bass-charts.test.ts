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
import handler from './bass-charts';

const chart = {
  ...fixtureChart(1, [{ bar: 0, beat: 0, midi: 33 }]),
  id: 'a'.repeat(64),
  source: 'gp' as const,
};
const record = { id: chart.id, updatedAt: '2026-10-05T10:00:00.000Z', chart };

async function request(method: string, body?: unknown) {
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
  await handler({ method, body } as never, response as never);
  return result;
}

beforeEach(async () => {
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
