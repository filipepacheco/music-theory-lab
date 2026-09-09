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
    `SELECT document FROM library_annotations ORDER BY source_sha256`,
  );
  const documents: LibraryAnnotationDocument[] = [];
  try {
    while (statement.step()) {
      const row = statement.getAsObject();
      try {
        const document = parseLibraryAnnotation(
          JSON.parse(row.document as string) as unknown,
        );
        if (document) documents.push(document);
      } catch {
        // Malformed local rows are never candidates for cloud replacement.
      }
    }
  } finally {
    statement.free();
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
    `SELECT document FROM library_annotations WHERE source_sha256 = ?`,
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
  const document = migrateLibraryAnnotation(raw, sourceSha256, barCount);
  const currentJson = JSON.stringify(document);
  const migrated = storedJson !== currentJson;
  if (migrated) storeLibraryAnnotation(database, document);
  return { document, migrated };
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
