import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  rows: new Map<string, Record<string, unknown>>(),
  writes: 0,
}));

vi.mock('@libsql/client', () => ({
  createClient: () => ({
    execute: vi.fn(async (query: string | { sql: string; args: unknown[] }) => {
      const sql = typeof query === 'string' ? query : query.sql;
      if (sql.includes('SELECT *')) return { rows: [...state.rows.values()] };
      if (typeof query !== 'string' && sql.includes('INSERT INTO')) {
        state.writes += 1;
        const [
          source_sha256,
          device_id,
          schema_version,
          bar_count,
          review_required,
          sections,
          created_at,
          updated_at,
        ] = query.args;
        const current = state.rows.get(source_sha256 as string);
        if (!current || String(updated_at) >= String(current.updated_at)) {
          state.rows.set(source_sha256 as string, {
            source_sha256,
            device_id,
            schema_version,
            bar_count,
            review_required,
            sections,
            created_at: current?.created_at ?? created_at,
            updated_at,
          });
        }
      }
      return { rows: [] };
    }),
  }),
}));

import handler from './library-annotations';

function record(updatedAt: string, name = 'Parte 1') {
  return {
    source_sha256: 'source-sha',
    schema_version: 2,
    bar_count: 4,
    review_required: 0,
    sections: JSON.stringify([
      {
        id: 'section-1',
        name,
        startBar: 0,
        endBar: 4,
        origin: 'manual',
      },
    ]),
    created_at: '2026-09-01T00:00:00.000Z',
    updated_at: updatedAt,
  };
}

function response() {
  const result = { statusCode: 0, body: undefined as unknown };
  return {
    result,
    res: {
      status(code: number) {
        result.statusCode = code;
        return this;
      },
      json(body: unknown) {
        result.body = body;
        return this;
      },
    },
  };
}

async function request(method: string, body?: unknown) {
  const { result, res } = response();
  await handler({ method, body, query: {} } as never, res as never);
  return result;
}

describe('Library annotations API', () => {
  beforeEach(() => {
    state.rows.clear();
    state.writes = 0;
  });

  it('rejects malformed records and original audio fields', async () => {
    const malformed = await request('POST', {
      device_id: 'device-1',
      records: [{ ...record('2026-09-09T12:00:00.000Z'), sections: '[]' }],
    });
    const audio = await request('POST', {
      device_id: 'device-1',
      records: [
        { ...record('2026-09-09T12:00:00.000Z'), audio_bytes: 'forbidden' },
      ],
    });

    expect(malformed.statusCode).toBe(400);
    expect(audio.statusCode).toBe(400);
    expect(state.writes).toBe(0);
  });

  it('idempotently upserts and refuses a stale replacement', async () => {
    const current = record('2026-09-09T13:00:00.000Z', 'Refrão');
    await request('POST', { device_id: 'device-1', records: [current] });
    await request('POST', { device_id: 'device-1', records: [current] });
    await request('POST', {
      device_id: 'device-2',
      records: [record('2026-09-09T12:00:00.000Z', 'Antigo')],
    });

    const result = await request('GET');

    expect(result.statusCode).toBe(200);
    expect(result.body).toEqual([
      expect.objectContaining({
        source_sha256: 'source-sha',
        sections: current.sections,
        updated_at: current.updated_at,
      }),
    ]);
  });
});
