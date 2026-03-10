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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const turso = await db();

    if (req.method === 'GET') {
      const deviceId = req.query.device_id as string;

      const result = deviceId
        ? await turso.execute({
            sql: 'SELECT * FROM structures WHERE device_id = ?',
            args: [deviceId],
          })
        : await turso.execute('SELECT * FROM structures');

      return res.status(200).json(result.rows);
    }

    if (req.method === 'POST') {
      const { device_id, records } = req.body;
      if (!device_id || !records) return res.status(400).json({ error: 'device_id and records required' });

      for (const r of records) {
        await turso.execute({
          sql: `INSERT OR REPLACE INTO structures
                (id, device_id, title, artist, bars, sections, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [
            r.id,
            device_id,
            r.title,
            r.artist ?? '',
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
      const deviceId = req.query.device_id as string;
      if (!id || !deviceId) return res.status(400).json({ error: 'id and device_id required' });

      await turso.execute({
        sql: 'DELETE FROM structures WHERE id = ? AND device_id = ?',
        args: [id, deviceId],
      });

      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('structures API error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
