import { describe, expect, it } from 'vitest';
import {
  createLibraryAnnotation,
  mergeLibrarySections,
  migrateLibraryAnnotation,
  getBoundaryMoveError,
  getMergeError,
  getSplitError,
  renameLibrarySection,
  moveLibraryBoundary,
  splitLibrarySection,
  validateLibraryAnnotation,
} from '@/domain/libraryAnnotation';

describe('Library annotation document', () => {
  it('starts a track without accepted boundaries as one neutral full-track section', () => {
    const document = createLibraryAnnotation('source-sha', 12, []);

    expect(document).toEqual({
      schemaVersion: 2,
      sourceSha256: 'source-sha',
      barCount: 12,
      reviewRequired: true,
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
      sections: [
        {
          id: 'section-1',
          name: 'Parte 1',
          startBar: 0,
          endBar: 12,
          origin: 'fallback',
        },
      ],
    });
  });

  it('turns accepted boundaries into neutral continuous sections', () => {
    const document = createLibraryAnnotation('source-sha', 12, [8, 4, 4]);

    expect(
      document.sections.map(({ name, startBar, endBar }) => ({
        name,
        startBar,
        endBar,
      })),
    ).toEqual([
      { name: 'Parte 1', startBar: 0, endBar: 4 },
      { name: 'Parte 2', startBar: 4, endBar: 8 },
      { name: 'Parte 3', startBar: 8, endBar: 12 },
    ]);
    expect(document.reviewRequired).toBe(false);
    expect(document.sections.map((section) => section.origin)).toEqual([
      'automatic',
      'automatic',
      'automatic',
    ]);
  });

  it('renames one section without changing its bars', () => {
    const original = createLibraryAnnotation('source-sha', 12, [4]);

    const result = renameLibrarySection(original, 'section-2', 'Interlúdio');

    expect(result.error).toBeNull();
    expect(result.document.sections[1]).toEqual({
      id: 'section-2',
      name: 'Interlúdio',
      startBar: 4,
      endBar: 12,
      origin: 'automatic',
    });
    expect(original.sections[1].name).toBe('Parte 2');
  });

  it('splits before the selected bar and keeps chronological coverage', () => {
    const original = createLibraryAnnotation('source-sha', 8, []);

    const result = splitLibrarySection(original, 'section-1', 3);

    expect(result.error).toBeNull();
    expect(result.document.sections).toEqual([
      {
        id: 'section-1',
        name: 'Parte 1',
        startBar: 0,
        endBar: 3,
        origin: 'fallback',
      },
      {
        id: 'section-2',
        name: 'Parte 2',
        startBar: 3,
        endBar: 8,
        origin: 'manual',
      },
    ]);
  });

  it('moves a shared boundary exactly one bar in either direction', () => {
    const original = createLibraryAnnotation('source-sha', 8, [4]);

    const left = moveLibraryBoundary(original, 0, -1);
    const right = moveLibraryBoundary(left.document, 0, 1);

    expect(
      left.document.sections.map((section) => [
        section.startBar,
        section.endBar,
      ]),
    ).toEqual([
      [0, 3],
      [3, 8],
    ]);
    expect(
      right.document.sections.map((section) => [
        section.startBar,
        section.endBar,
      ]),
    ).toEqual([
      [0, 4],
      [4, 8],
    ]);
  });

  it('merges adjacent sections by removing their shared boundary', () => {
    const original = createLibraryAnnotation('source-sha', 8, [3, 6]);
    const renamed = renameLibrarySection(original, 'section-1', 'Abertura');

    const result = mergeLibrarySections(renamed.document, 'section-1');

    expect(result.error).toBeNull();
    expect(result.document.sections).toEqual([
      {
        id: 'section-1',
        name: 'Abertura',
        startBar: 0,
        endBar: 6,
        origin: 'automatic',
      },
      {
        id: 'section-3',
        name: 'Parte 3',
        startBar: 6,
        endBar: 8,
        origin: 'automatic',
      },
    ]);
  });

  it('explains invalid edge and minimum-size operations without changing the document', () => {
    const document = createLibraryAnnotation('source-sha', 2, [1]);

    expect(getSplitError(document, 'section-1', 0)).toBe(
      'Escolha um compasso interno para iniciar a nova seção.',
    );
    expect(getBoundaryMoveError(document, 0, -1)).toBe(
      'A seção anterior precisa manter um compasso.',
    );
    expect(getBoundaryMoveError(document, 0, 1)).toBe(
      'A próxima seção precisa manter um compasso.',
    );
    expect(getMergeError(document, 'section-2')).toBe(
      'A última seção não tem uma próxima para unir.',
    );
    expect(moveLibraryBoundary(document, 0, -1).document).toBe(document);
  });

  it('detects gaps, overlaps, reordering, and empty sections', () => {
    const invalid = {
      schemaVersion: 2 as const,
      sourceSha256: 'source-sha',
      barCount: 8,
      reviewRequired: false,
      createdAt: '2026-09-09T12:00:00.000Z',
      updatedAt: '2026-09-09T12:00:00.000Z',
      sections: [
        {
          id: 'a',
          name: 'Parte 1',
          startBar: 0,
          endBar: 3,
          origin: 'automatic' as const,
        },
        {
          id: 'b',
          name: 'Parte 2',
          startBar: 4,
          endBar: 4,
          origin: 'automatic' as const,
        },
        {
          id: 'c',
          name: 'Parte 3',
          startBar: 2,
          endBar: 8,
          origin: 'automatic' as const,
        },
      ],
    };

    expect(validateLibraryAnnotation(invalid, 8)).toEqual([
      'As seções precisam cobrir a faixa sem lacunas nem sobreposições.',
      'Toda seção precisa conter ao menos um compasso.',
      'As seções precisam cobrir a faixa sem lacunas nem sobreposições.',
    ]);
  });

  it('requires a positive bar count and integer bar indexes', () => {
    expect(() => createLibraryAnnotation('source-sha', 0, [])).toThrow(
      'Uma faixa anotável precisa conter ao menos um compasso.',
    );
    const fractional = {
      schemaVersion: 2 as const,
      sourceSha256: 'source-sha',
      barCount: 3,
      reviewRequired: false,
      createdAt: '2026-09-09T12:00:00.000Z',
      updatedAt: '2026-09-09T12:00:00.000Z',
      sections: [
        {
          id: 'a',
          name: 'Parte 1',
          startBar: 0,
          endBar: 1.5,
          origin: 'automatic' as const,
        },
        {
          id: 'b',
          name: 'Parte 2',
          startBar: 1.5,
          endBar: 3,
          origin: 'automatic' as const,
        },
      ],
    };

    expect(validateLibraryAnnotation(fractional, 3)).toContain(
      'Os limites das seções precisam ser índices inteiros de compassos.',
    );
  });

  it('migrates the legacy snake-case persistence shape on reload', () => {
    const migrated = migrateLibraryAnnotation(
      {
        source_sha256: 'source-sha',
        sections: [
          { id: 'old-a', label: 'Primeira', start_bar: 0, end_bar: 3 },
          { id: 'old-b', label: 'Segunda', start_bar: 3, end_bar: 8 },
        ],
      },
      'source-sha',
      8,
    );

    expect(migrated).toEqual({
      schemaVersion: 2,
      sourceSha256: 'source-sha',
      barCount: 8,
      reviewRequired: false,
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
      sections: [
        {
          id: 'old-a',
          name: 'Primeira',
          startBar: 0,
          endBar: 3,
          origin: 'automatic',
        },
        {
          id: 'old-b',
          name: 'Segunda',
          startBar: 3,
          endBar: 8,
          origin: 'automatic',
        },
      ],
    });
  });
});
