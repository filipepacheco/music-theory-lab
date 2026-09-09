import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  parseCloudLibraryAnnotation,
  serializeCloudLibraryAnnotation,
} from '../src/domain/libraryAnnotation';

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

function parseRecord(value: unknown, deviceId: string): AnnotationRow | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some((field) => !RECORD_FIELDS.has(field))) {
    return null;
  }
  const document = parseCloudLibraryAnnotation({
    source_sha256: record.source_sha256,
    schema_version: record.schema_version,
    bar_count: record.bar_count,
    review_required: record.review_required,
    sections: record.sections,
    created_at: record.created_at,
    updated_at: record.updated_at,
  });
  if (!document) return null;
  const serialized = serializeCloudLibraryAnnotation(document);
  return {
    ...serialized,
    device_id: deviceId,
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
