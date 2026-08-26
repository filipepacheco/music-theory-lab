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
      // Transcriptions are shared globally: every device sees every song,
      // no authentication required. Progressions and structures remain
      // device-scoped.
      const result = await turso.execute('SELECT * FROM songs');

      return res.status(200).json(result.rows);
    }

    if (req.method === 'POST') {
      const { device_id, records } = req.body;
      if (!device_id || !records) return res.status(400).json({ error: 'device_id and records required' });

      for (const r of records) {
        await turso.execute({
          sql: `INSERT OR REPLACE INTO songs
                (id, device_id, title, artist, key_note, mode, original_bpm, preset_id, sections, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [
            r.id,
            device_id,
            r.title,
            r.artist ?? '',
            r.key_note,
            r.mode,
            r.original_bpm,
            r.preset_id ?? 'piano',
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

      // Deletes propagate globally, matching the global visibility above.
      await turso.execute({
        sql: 'DELETE FROM songs WHERE id = ?',
        args: [id],
      });

      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('songs API error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
