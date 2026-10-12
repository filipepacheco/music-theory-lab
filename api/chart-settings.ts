import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { Client, Row } from '@libsql/client';
// Vercel emits ESM without Vite's aliases; use the emitted .js module path.
import {
  chartSettingsBody,
  parseChartSettings,
  type ChartSettings,
} from '../src/domain/chartSettings.js';

/** The most records in one page of a read. A settings record is small. */
const PAGE_LIMIT = 100;
/** The most records in one write. */
const WRITE_LIMIT = 100;

// The counter only increases: no route deletes a row, so the largest value
// never goes down, and each write takes the value after it.
const NEXT_COUNTER = `(SELECT COALESCE(MAX(sync_counter), 0) + 1 FROM chart_settings)`;

// The table is new, and each statement does nothing when it ran before. So
// the migration is safe on each cold start and from two instances at one
// time. It reads and writes no other table. The triggers give the counter in
// the transaction of the write, and an upsert that loses changes no row and
// fires no trigger. An update of the counter alone fires neither trigger.
const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS chart_settings (
    chart_id TEXT PRIMARY KEY,
    device_id TEXT NOT NULL,
    settings TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    sync_counter INTEGER
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS chart_settings_sync_counter
    ON chart_settings (sync_counter)`,
  `CREATE TRIGGER IF NOT EXISTS chart_settings_count_insert
    AFTER INSERT ON chart_settings
    BEGIN
      UPDATE chart_settings SET sync_counter = ${NEXT_COUNTER}
        WHERE chart_id = NEW.chart_id;
    END`,
  `CREATE TRIGGER IF NOT EXISTS chart_settings_count_update
    AFTER UPDATE OF device_id, settings, updated_at ON chart_settings
    BEGIN
      UPDATE chart_settings SET sync_counter = ${NEXT_COUNTER}
        WHERE chart_id = NEW.chart_id;
    END`,
];

let ready: Promise<Client> | null = null;
/** The client, after the migration ran one time in this instance. */
function database(): Promise<Client> {
  ready ??= (async () => {
    const { createClient } = await import('@libsql/client');
    const turso = createClient({
      url: process.env.TURSO_DATABASE_URL!,
      authToken: process.env.TURSO_AUTH_TOKEN!,
    });
    await turso.batch(SCHEMA, 'write');
    return turso;
  })().catch((error) => {
    // The next request tries the migration again.
    ready = null;
    throw error;
  });
  return ready;
}

function toRecords(rows: Row[]): ChartSettings[] {
  return rows.flatMap((row) => {
    try {
      const record = parseChartSettings({
        ...JSON.parse(String(row.settings)),
        chartId: row.chart_id,
        updatedAt: row.updated_at,
      });
      return record ? [record] : [];
    } catch {
      return [];
    }
  });
}

/**
 * The chart settings of the shared library: no login, and the last write
 * wins. The read and the write follow the contract of the chart route.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    if (req.method === 'GET') {
      // A read without a counter starts at the first record.
      const after: unknown = req.query?.after ?? '0';
      if (typeof after !== 'string' || !/^\d{1,15}$/.test(after)) {
        return res.status(400).json({ error: 'invalid counter' });
      }
      const turso = await database();
      const result = await turso.execute({
        sql: `SELECT chart_id, settings, updated_at, sync_counter
          FROM chart_settings
          WHERE sync_counter > ? ORDER BY sync_counter LIMIT ?`,
        args: [Number(after), PAGE_LIMIT],
      });
      const last = result.rows[result.rows.length - 1];
      return res.status(200).json({
        records: toRecords(result.rows),
        // The counter of the last row of the page, for the next read.
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
      typeof body !== 'object' ||
      body === null ||
      typeof body.device_id !== 'string' ||
      !body.device_id ||
      body.device_id.length > 200 ||
      !Array.isArray(body.records)
    )
      return res.status(400).json({ error: 'device_id and records required' });
    if (body.records.length > WRITE_LIMIT) {
      return res
        .status(400)
        .json({ error: `a write holds ${WRITE_LIMIT} records at most` });
    }
    const records: (ChartSettings | null)[] =
      body.records.map(parseChartSettings);
    if (records.some((record) => record === null)) {
      return res.status(400).json({ error: 'invalid chart settings record' });
    }
    const valid = records as ChartSettings[];
    if (valid.length === 0) {
      return res.status(200).json({ ok: true, counters: [] });
    }
    const turso = await database();
    const results = await turso.batch(
      valid.flatMap((record) => {
        const settings = chartSettingsBody(record);
        return [
          {
            // The later update time wins. Two writes with one update time
            // have the order of their text, as `isNewerChartSettings` has.
            sql: `INSERT INTO chart_settings
              (chart_id, device_id, settings, updated_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(chart_id) DO UPDATE SET
              device_id = excluded.device_id,
              settings = excluded.settings,
              updated_at = excluded.updated_at
            WHERE excluded.updated_at > chart_settings.updated_at
               OR (excluded.updated_at = chart_settings.updated_at
                   AND excluded.settings > chart_settings.settings)`,
            args: [record.chartId, body.device_id, settings, record.updatedAt],
          },
          {
            sql: `SELECT sync_counter FROM chart_settings
            WHERE chart_id = ? AND updated_at = ? AND settings = ?`,
            args: [record.chartId, record.updatedAt, settings],
          },
        ];
      }),
      'write',
    );
    return res.status(200).json({
      ok: true,
      // For each record of the request: its counter when the table now holds
      // that record, or null when a newer record won.
      counters: valid.map((_, index) => {
        const counter = results[index * 2 + 1].rows[0]?.sync_counter;
        return counter == null ? null : Number(counter);
      }),
    });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return res.status(400).json({ error: 'invalid JSON' });
    }
    console.error('chart settings API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
