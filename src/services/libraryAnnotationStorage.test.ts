import initSqlJs from 'sql.js';
import { describe, expect, it } from 'vitest';
import {
  createLibraryAnnotation,
  renameLibrarySection,
} from '@/domain/libraryAnnotation';
import {
  initializeLibraryAnnotationStorage,
  loadLibraryAnnotation,
  storeLibraryAnnotation,
} from '@/services/libraryAnnotationStorage';
import {
  sectionBoundaryBars,
  type ChordChartBar,
  type SectionSegment,
} from '@/components/library/libraryData';

const WASM_PATH = `${process.cwd()}/node_modules/sql.js/dist/sql-wasm.wasm`;

async function sql() {
  return initSqlJs({ locateFile: () => WASM_PATH });
}

describe('Library annotation local storage', () => {
  it('restores an edited document after reopening without changing analysis bytes', async () => {
    const SQL = await sql();
    const database = new SQL.Database();
    initializeLibraryAnnotationStorage(database);
    const analysisSections: SectionSegment[] = [
      { start_seconds: 0, end_seconds: 4, label: 'A' },
      { start_seconds: 4, end_seconds: 8, label: 'B' },
    ];
    const analysisBytes = JSON.stringify(analysisSections);
    const bars: ChordChartBar[] = [
      {
        index: 0,
        startSeconds: 0,
        endSeconds: 4,
        chords: [{ chord: 'C', romanNumeral: 'I', raw: null }],
      },
      {
        index: 1,
        startSeconds: 4,
        endSeconds: 8,
        chords: [{ chord: 'F', romanNumeral: 'IV', raw: null }],
      },
    ];
    const initial = createLibraryAnnotation(
      'source-sha',
      bars.length,
      sectionBoundaryBars(bars, analysisSections),
    );
    const edited = renameLibrarySection(initial, 'section-1', 'Abertura');
    storeLibraryAnnotation(database, edited.document);

    const reopened = new SQL.Database(database.export());
    const loaded = loadLibraryAnnotation(reopened, 'source-sha', bars.length);

    expect(loaded?.document).toEqual(edited.document);
    expect(loaded?.migrated).toBe(false);
    expect(JSON.stringify(analysisSections)).toBe(analysisBytes);
  });

  it('migrates a legacy stored document and writes back the current schema', async () => {
    const SQL = await sql();
    const database = new SQL.Database();
    initializeLibraryAnnotationStorage(database);
    database.run(
      `INSERT INTO library_annotations
       (source_sha256, schema_version, document)
       VALUES (?, 0, ?)`,
      [
        'source-sha',
        JSON.stringify({
          source_sha256: 'source-sha',
          sections: [
            { id: 'old-a', label: 'Primeira', start_bar: 0, end_bar: 2 },
            { id: 'old-b', label: 'Segunda', start_bar: 2, end_bar: 4 },
          ],
        }),
      ],
    );

    const migrated = loadLibraryAnnotation(database, 'source-sha', 4);
    const reopened = new SQL.Database(database.export());
    const current = loadLibraryAnnotation(reopened, 'source-sha', 4);

    expect(migrated?.migrated).toBe(true);
    expect(migrated?.document.sections[0]).toEqual({
      id: 'old-a',
      name: 'Primeira',
      startBar: 0,
      endBar: 2,
    });
    expect(current?.migrated).toBe(false);
  });
});
