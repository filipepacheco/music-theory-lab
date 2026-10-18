import type { VercelRequest, VercelResponse } from '@vercel/node';

let _turso: any = null;
async function db() {
  if (!_turso) {
    const { createClient } = await import('@libsql/client');
    _turso = createClient({
      url: process.env.TURSO_DATABASE_URL!,
      authToken: process.env.TURSO_AUTH_TOKEN!,
    });
  }
  return _turso;
}

async function readJsonBody(
  req: VercelRequest,
): Promise<Record<string, unknown>> {
  if (req.body && typeof req.body === 'object') {
    return req.body as Record<string, unknown>;
  }
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const turso = await db();

    if (req.method === 'GET') {
      const result = await turso.execute('SELECT * FROM structures');

      return res.status(200).json(result.rows);
    }

    if (req.method === 'POST') {
      const body = await readJsonBody(req);
      const { device_id, records } = body;
      if (!device_id || !records)
        return res
          .status(400)
          .json({ error: 'device_id and records required' });

      try {
        await turso.execute(
          'ALTER TABLE structures ADD COLUMN bpm INTEGER NOT NULL DEFAULT 120',
        );
      } catch {}

      for (const r of records) {
        await turso.execute({
          sql: `INSERT OR REPLACE INTO structures
                (id, device_id, title, artist, bpm, bars, sections, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [
            r.id,
            device_id,
            r.title,
            r.artist ?? '',
            r.bpm ?? 120,
            r.bars,
            r.sections,
            r.created_at ?? new Date().toISOString(),
            r.updated_at ?? new Date().toISOString(),
          ],
        });
      }

      return res.status(200).json({ ok: true });
    }

    if (req.method === 'DELETE') {
      const id = req.query.id as string;
      if (!id) return res.status(400).json({ error: 'id required' });

      await turso.execute({
        sql: 'DELETE FROM structures WHERE id = ?',
        args: [id],
      });

      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('structures API error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
