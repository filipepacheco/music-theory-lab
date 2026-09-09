import type { VercelRequest, VercelResponse } from '@vercel/node';

interface AnnotationRow {
  source_sha256: string;
  device_id: string;
  schema_version: number;
  bar_count: number;
  review_required: number;
  sections: string;
  created_at: string;
  updated_at: string;
}

const RECORD_FIELDS = new Set([
  'source_sha256',
  'schema_version',
  'bar_count',
  'review_required',
  'sections',
  'created_at',
  'updated_at',
]);

let tursoClient: any = null;

async function database() {
  if (!tursoClient) {
    const { createClient } = await import('@libsql/client');
    tursoClient = createClient({
      url: process.env.TURSO_DATABASE_URL!,
      authToken: process.env.TURSO_AUTH_TOKEN!,
    });
  }
  return tursoClient;
}

async function ensureSchema(turso: any): Promise<void> {
  await turso.execute(`
    CREATE TABLE IF NOT EXISTS library_annotations (
      source_sha256 TEXT PRIMARY KEY,
      device_id TEXT NOT NULL,
      schema_version INTEGER NOT NULL,
      bar_count INTEGER NOT NULL,
      review_required INTEGER NOT NULL,
      sections TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
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

function validTimestamp(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    !Number.isNaN(Date.parse(value)) &&
    new Date(value).toISOString() === value
  );
}

function validSections(value: unknown, barCount: number): boolean {
  if (typeof value !== 'string') return false;
  let sections: unknown;
  try {
    sections = JSON.parse(value) as unknown;
  } catch {
    return false;
  }
  if (!Array.isArray(sections) || sections.length === 0) return false;
  let expectedStart = 0;
  for (const section of sections) {
    if (!section || typeof section !== 'object') return false;
    const record = section as Record<string, unknown>;
    if (
      typeof record.id !== 'string' ||
      !record.id ||
      typeof record.name !== 'string' ||
      !record.name.trim() ||
      !Number.isInteger(record.startBar) ||
      !Number.isInteger(record.endBar) ||
      record.startBar !== expectedStart ||
      (record.endBar as number) <= (record.startBar as number) ||
      (record.origin !== 'automatic' &&
        record.origin !== 'fallback' &&
        record.origin !== 'manual')
    ) {
      return false;
    }
    expectedStart = record.endBar as number;
  }
  return expectedStart === barCount;
}

function parseRecord(value: unknown, deviceId: string): AnnotationRow | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some((field) => !RECORD_FIELDS.has(field))) {
    return null;
  }
  if (
    typeof record.source_sha256 !== 'string' ||
    !record.source_sha256 ||
    record.schema_version !== 2 ||
    !Number.isInteger(record.bar_count) ||
    (record.bar_count as number) < 1 ||
    (record.review_required !== 0 && record.review_required !== 1) ||
    !validTimestamp(record.created_at) ||
    !validTimestamp(record.updated_at) ||
    !validSections(record.sections, record.bar_count as number)
  ) {
    return null;
  }
  return {
    source_sha256: record.source_sha256,
    device_id: deviceId,
    schema_version: 2,
    bar_count: record.bar_count as number,
    review_required: record.review_required,
    sections: record.sections as string,
    created_at: record.created_at,
    updated_at: record.updated_at,
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const turso = await database();
    await ensureSchema(turso);

    if (req.method === 'GET') {
      const result = await turso.execute('SELECT * FROM library_annotations');
      return res.status(200).json(result.rows);
    }

    if (req.method === 'POST') {
      const body = await readJsonBody(req);
      const deviceId = body.device_id;
      const rawRecords = body.records;
      if (
        typeof deviceId !== 'string' ||
        !deviceId ||
        !Array.isArray(rawRecords)
      ) {
        return res
          .status(400)
          .json({ error: 'device_id and records required' });
      }
      const records = rawRecords.map((record) => parseRecord(record, deviceId));
      if (records.some((record) => record === null)) {
        return res.status(400).json({ error: 'invalid annotation record' });
      }

      for (const record of records as AnnotationRow[]) {
        await turso.execute({
          sql: `INSERT INTO library_annotations
                (source_sha256, device_id, schema_version, bar_count,
                 review_required, sections, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(source_sha256) DO UPDATE SET
                  device_id = excluded.device_id,
                  schema_version = excluded.schema_version,
                  bar_count = excluded.bar_count,
                  review_required = excluded.review_required,
                  sections = excluded.sections,
                  updated_at = excluded.updated_at
                WHERE excluded.updated_at > library_annotations.updated_at`,
          args: [
            record.source_sha256,
            record.device_id,
            record.schema_version,
            record.bar_count,
            record.review_required,
            record.sections,
            record.created_at,
            record.updated_at,
          ],
        });
      }
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('library annotations API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
