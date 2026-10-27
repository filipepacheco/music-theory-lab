import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { Client, Row } from '@libsql/client';
// Vercel emits ESM without Vite's aliases; use the emitted .js module path.
import {
  isUnknownKindRecord,
  parseBassChartRecord,
} from '../src/domain/bassChartRecord.js';

const PAGE_LIMIT = 10;

const NEXT_COUNTER = `(SELECT COALESCE(MAX(sync_counter), 0) + 1 FROM bass_charts)`;

const COUNTER_SCHEMA = [
  `CREATE UNIQUE INDEX IF NOT EXISTS bass_charts_sync_counter
    ON bass_charts (sync_counter)`,
  `CREATE TRIGGER IF NOT EXISTS bass_charts_count_insert
    AFTER INSERT ON bass_charts
    BEGIN
      UPDATE bass_charts SET sync_counter = ${NEXT_COUNTER} WHERE id = NEW.id;
    END`,
  `CREATE TRIGGER IF NOT EXISTS bass_charts_count_update
    AFTER UPDATE OF device_id, chart, updated_at ON bass_charts
    BEGIN
      UPDATE bass_charts SET sync_counter = ${NEXT_COUNTER} WHERE id = NEW.id;
    END`,
];

async function hasCounterColumn(turso: Client): Promise<boolean> {
  try {
    await turso.execute('SELECT sync_counter FROM bass_charts LIMIT 0');
    return true;
  } catch {
    return false;
  }
}

async function migrate(turso: Client): Promise<void> {
  await turso.execute(`CREATE TABLE IF NOT EXISTS bass_charts (
    id TEXT PRIMARY KEY,
    device_id TEXT NOT NULL,
    chart TEXT,
    updated_at TEXT NOT NULL
  )`);
  if (!(await hasCounterColumn(turso))) {
    try {
      await turso.execute(
        'ALTER TABLE bass_charts ADD COLUMN sync_counter INTEGER',
      );
    } catch (error) {
      if (!(await hasCounterColumn(turso))) throw error;
    }
  }
  await turso.batch(COUNTER_SCHEMA, 'write');
  const pending = await turso.execute(
    `SELECT id FROM bass_charts WHERE sync_counter IS NULL
      ORDER BY updated_at, id`,
  );
  if (pending.rows.length > 0) {
    await turso.batch(
      pending.rows.map((row) => ({
        sql: `UPDATE bass_charts SET sync_counter = ${NEXT_COUNTER}
          WHERE id = ? AND sync_counter IS NULL`,
        args: [row.id],
      })),
      'write',
    );
  }
}

let ready: Promise<Client> | null = null;
function database(): Promise<Client> {
  ready ??= (async () => {
    const { createClient } = await import('@libsql/client');
    const turso = createClient({
      url: process.env.TURSO_DATABASE_URL!,
      authToken: process.env.TURSO_AUTH_TOKEN!,
    });
    await migrate(turso);
    return turso;
  })().catch((error) => {
    ready = null;
    throw error;
  });
  return ready;
}

function toRecords(rows: Row[]) {
  return rows.flatMap((row) => {
    try {
      const record = parseBassChartRecord({
        id: row.id,
        updatedAt: row.updated_at,
        chart: row.chart === null ? null : JSON.parse(String(row.chart)),
      });
      return record ? [record] : [];
    } catch {
      return [];
    }
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const turso = await database();
    if (req.method === 'GET') {
      const after: unknown = req.query?.after;
      if (after === undefined) {
        const result = await turso.execute('SELECT * FROM bass_charts');
        return res.status(200).json(toRecords(result.rows));
      }
      if (typeof after !== 'string' || !/^\d{1,15}$/.test(after)) {
        return res.status(400).json({ error: 'invalid counter' });
      }
      const result = await turso.execute({
        sql: `SELECT id, chart, updated_at, sync_counter FROM bass_charts
          WHERE sync_counter > ? ORDER BY sync_counter LIMIT ?`,
        args: [Number(after), PAGE_LIMIT],
      });
      const last = result.rows[result.rows.length - 1];
      return res.status(200).json({
        records: toRecords(result.rows),
        counter: last ? Number(last.sync_counter) : Number(after),
        more: result.rows.length === PAGE_LIMIT,
      });
    }

    let body = req.body;
    if (typeof body === 'string') body = JSON.parse(body);
    if (!body) {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    }
    if (
      typeof body.device_id !== 'string' ||
      !body.device_id ||
      !Array.isArray(body.records) ||
      body.records.length > 100
    )
      return res.status(400).json({ error: 'device_id and records required' });
    // A chart of an unknown kind is skipped, so a later kind never blocks sync.
    const skipped = body.records.map(isUnknownKindRecord);
    const parsed = body.records.map((r: unknown, i: number) =>
      skipped[i] ? null : parseBassChartRecord(r),
    );
    if (parsed.some((r: unknown, i: number) => r === null && !skipped[i])) {
      return res.status(400).json({ error: 'invalid chart record' });
    }
    type Record_ = NonNullable<ReturnType<typeof parseBassChartRecord>>;
    const records: Record_[] = parsed.filter(
      (r: Record_ | null) => r !== null,
    );
    const results = await turso.batch(
      records.flatMap(
        (record: NonNullable<ReturnType<typeof parseBassChartRecord>>) => [
          {
            sql: `INSERT INTO bass_charts (id, device_id, chart, updated_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              device_id = excluded.device_id,
              chart = excluded.chart,
              updated_at = excluded.updated_at
            WHERE excluded.updated_at > bass_charts.updated_at
               OR (excluded.updated_at = bass_charts.updated_at
                   AND excluded.chart IS NULL
                   AND bass_charts.chart IS NOT NULL)`,
            args: [
              record.id,
              body.device_id,
              record.chart === null ? null : JSON.stringify(record.chart),
              record.updatedAt,
            ],
          },
          {
            sql: `SELECT sync_counter FROM bass_charts
            WHERE id = ? AND updated_at = ? AND (chart IS NULL) = ?`,
            args: [record.id, record.updatedAt, record.chart === null ? 1 : 0],
          },
        ],
      ),
      'write',
    );
    let next = 0;
    return res.status(200).json({
      ok: true,
      counters: skipped.map((skip: boolean) => {
        if (skip) return null;
        const counter = results[next++ * 2 + 1].rows[0]?.sync_counter;
        return counter == null ? null : Number(counter);
      }),
    });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return res.status(400).json({ error: 'invalid JSON' });
    }
    console.error('bass charts API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
