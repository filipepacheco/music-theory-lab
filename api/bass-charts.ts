import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { Client } from '@libsql/client';
// Vercel emits ESM without Vite's aliases; use the emitted .js module path.
import { parseBassChartRecord } from '../src/domain/bassChartRecord.js';

let client: Client | null = null;
async function database(): Promise<Client> {
  if (!client) {
    const { createClient } = await import('@libsql/client');
    client = createClient({
      url: process.env.TURSO_DATABASE_URL!,
      authToken: process.env.TURSO_AUTH_TOKEN!,
    });
  }
  await client.execute(`CREATE TABLE IF NOT EXISTS bass_charts (
    id TEXT PRIMARY KEY,
    device_id TEXT NOT NULL,
    chart TEXT,
    updated_at TEXT NOT NULL
  )`);
  return client;
}

/** Same shared, single-user library model as songs and annotations. */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const turso = await database();
    if (req.method === 'GET') {
      const result = await turso.execute('SELECT * FROM bass_charts');
      const records = result.rows.flatMap((row) => {
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
      return res.status(200).json(records);
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
    const records = body.records.map(parseBassChartRecord);
    if (records.some((r: unknown) => r === null)) {
      return res.status(400).json({ error: 'invalid chart record' });
    }
    await turso.batch(
      records.map(
        (record: NonNullable<ReturnType<typeof parseBassChartRecord>>) => ({
          sql: `INSERT INTO bass_charts (id, device_id, chart, updated_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              device_id = excluded.device_id,
              chart = excluded.chart,
              updated_at = excluded.updated_at
            WHERE excluded.updated_at > bass_charts.updated_at
               OR (excluded.updated_at = bass_charts.updated_at
                   AND excluded.chart IS NULL)`,
          args: [
            record.id,
            body.device_id,
            record.chart === null ? null : JSON.stringify(record.chart),
            record.updatedAt,
          ],
        }),
      ),
      'write',
    );
    return res.status(200).json({ ok: true });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return res.status(400).json({ error: 'invalid JSON' });
    }
    console.error('bass charts API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
