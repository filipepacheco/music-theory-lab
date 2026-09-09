import type { Database } from 'sql.js';
import {
  migrateLibraryAnnotation,
  parseLibraryAnnotation,
  type LibraryAnnotationDocument,
} from '@/domain/libraryAnnotation';

export interface LoadedLibraryAnnotation {
  document: LibraryAnnotationDocument;
  migrated: boolean;
}

export function listLibraryAnnotations(
  database: Database,
): LibraryAnnotationDocument[] {
  const statement = database.prepare(
    `SELECT source_sha256, document,
            strftime('%Y-%m-%dT%H:%M:%fZ', updated_at) AS updated_at
       FROM library_annotations
      ORDER BY source_sha256`,
  );
  const documents: LibraryAnnotationDocument[] = [];
  const migrations: LibraryAnnotationDocument[] = [];
  try {
    while (statement.step()) {
      const row = statement.getAsObject();
      try {
        const raw = JSON.parse(row.document as string) as unknown;
        const current = parseLibraryAnnotation(raw);
        const document = current ?? migrateStoredV1Annotation(row, raw);
        if (document) documents.push(document);
        if (!current && document) migrations.push(document);
      } catch {
        // Malformed local rows are never candidates for cloud replacement.
      }
    }
  } finally {
    statement.free();
  }
  for (const document of migrations) {
    storeLibraryAnnotation(database, document);
  }
  return documents;
}

export function initializeLibraryAnnotationStorage(database: Database): void {
  database.run(`
    CREATE TABLE IF NOT EXISTS library_annotations (
      source_sha256 TEXT PRIMARY KEY,
      schema_version INTEGER NOT NULL DEFAULT 1,
      document TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
}

export function loadLibraryAnnotation(
  database: Database,
  sourceSha256: string,
  barCount: number,
): LoadedLibraryAnnotation | null {
  const statement = database.prepare(
    `SELECT source_sha256, document,
            strftime('%Y-%m-%dT%H:%M:%fZ', updated_at) AS updated_at
       FROM library_annotations
      WHERE source_sha256 = ?`,
  );
  statement.bind([sourceSha256]);
  if (!statement.step()) {
    statement.free();
    return null;
  }
  const row = statement.getAsObject();
  statement.free();
  const storedJson = row.document as string;
  let raw: unknown;
  try {
    raw = JSON.parse(storedJson) as unknown;
  } catch {
    raw = null;
  }
  const migrationRaw = withStoredTimestamps(raw, row.updated_at);
  const document = migrateLibraryAnnotation(
    migrationRaw,
    sourceSha256,
    barCount,
  );
  const currentJson = JSON.stringify(document);
  const migrated = storedJson !== currentJson;
  if (migrated) storeLibraryAnnotation(database, document);
  return { document, migrated };
}

function migrateStoredV1Annotation(
  row: Record<string, unknown>,
  raw: unknown,
): LibraryAnnotationDocument | null {
  if (!isRecord(raw) || raw.schemaVersion !== 1) return null;
  const rawSections = raw.sections;
  if (!Array.isArray(rawSections) || rawSections.length === 0) return null;
  const last = rawSections[rawSections.length - 1];
  if (!isRecord(last)) return null;
  const endBar = last.endBar ?? last.end_bar;
  if (!Number.isInteger(endBar) || (endBar as number) < 1) return null;
  const sourceSha256 = row.source_sha256;
  if (typeof sourceSha256 !== 'string' || !sourceSha256) return null;
  const document = migrateLibraryAnnotation(
    withStoredTimestamps(raw, row.updated_at),
    sourceSha256,
    endBar as number,
  );
  return document;
}

function withStoredTimestamps(raw: unknown, timestamp: unknown): unknown {
  if (!isRecord(raw) || typeof timestamp !== 'string') return raw;
  return {
    ...raw,
    createdAt: raw.createdAt ?? timestamp,
    updatedAt: raw.updatedAt ?? timestamp,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function storeLibraryAnnotation(
  database: Database,
  document: LibraryAnnotationDocument,
): void {
  const statement = database.prepare(
    `INSERT INTO library_annotations
       (source_sha256, schema_version, document, updated_at)
     VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT(source_sha256) DO UPDATE SET
       schema_version = excluded.schema_version,
       document = excluded.document,
       updated_at = excluded.updated_at`,
  );
  try {
    statement.run([
      document.sourceSha256,
      document.schemaVersion,
      JSON.stringify(document),
    ]);
  } finally {
    statement.free();
  }
}
