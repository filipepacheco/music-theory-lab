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
      if (!deviceId) return res.status(400).json({ error: 'device_id required' });

      const result = await turso.execute({
        sql: 'SELECT * FROM saved_progressions WHERE device_id = ?',
        args: [deviceId],
      });

      return res.status(200).json(result.rows);
    }

    if (req.method === 'POST') {
      const { device_id, records } = req.body;
      if (!device_id || !records) return res.status(400).json({ error: 'device_id and records required' });

      for (const r of records) {
        await turso.execute({
          sql: `INSERT OR REPLACE INTO saved_progressions
                (id, device_id, name, description, steps, mode, preset_id, bpm, is_example, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [
            r.id,
            device_id,
            r.name,
            r.description ?? '',
            r.steps,
            r.mode,
            r.preset_id,
            r.bpm,
            r.is_example ?? 0,
            r.created_at ?? new Date().toISOString(),
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
        sql: 'DELETE FROM saved_progressions WHERE id = ? AND device_id = ?',
        args: [id, deviceId],
      });

      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('progressions API error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
