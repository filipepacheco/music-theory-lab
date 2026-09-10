import { describe, expect, it, vi } from 'vitest';
import {
  createLibraryAnnotation,
  type LibraryAnnotationDocument,
} from '@/domain/libraryAnnotation';
import type { RejectedBoundarySuggestion } from '@/domain/rejectedBoundarySuggestions';

const dbState = vi.hoisted(() => ({ annotation: null as unknown }));

vi.mock('@/services/db', () => ({
  initDB: vi.fn().mockResolvedValue(undefined),
  persistDB: vi.fn(),
  getAllProgressions: vi.fn(() => []),
  getAllSongs: vi.fn(() => []),
  getAllStructures: vi.fn(() => []),
  getLibraryAnnotation: vi.fn(() => dbState.annotation),
  upsertProgressionLocal: vi.fn(),
  upsertSongLocal: vi.fn(),
  upsertStructureLocal: vi.fn(),
  saveProgression: vi.fn(),
  saveSong: vi.fn(),
  saveStructure: vi.fn(),
  saveLibraryAnnotation: vi.fn((document: unknown) => {
    dbState.annotation = document;
  }),
  updateSong: vi.fn(),
  updateStructure: vi.fn(),
  deleteProgression: vi.fn(),
  deleteSong: vi.fn(),
  deleteStructure: vi.fn(),
}));

vi.mock('@/services/sync', () => ({
  syncAll: vi.fn().mockResolvedValue(undefined),
  pushProgression: vi.fn().mockResolvedValue(undefined),
  pushSong: vi.fn().mockResolvedValue(undefined),
  pushStructure: vi.fn().mockResolvedValue(undefined),
  pushDeleteProgression: vi.fn().mockResolvedValue(undefined),
  pushDeleteSong: vi.fn().mockResolvedValue(undefined),
  pushDeleteStructure: vi.fn().mockResolvedValue(undefined),
}));

import { savedLibrary } from '@/services/savedLibrary';
import { syncAll } from '@/services/sync';
import { saveLibraryAnnotation } from '@/services/db';

describe('savedLibrary sync trigger', () => {
  it('kicks the background sync on first use and not again within the cooldown', async () => {
    await savedLibrary.songs.list();
    await savedLibrary.structures.list();
    await savedLibrary.progressions.list();

    expect(syncAll).toHaveBeenCalledTimes(1);
  });

  it('adopts and persists a rejected boundary through the saved-library facade', async () => {
    const document = createLibraryAnnotation('source-sha', 8, []);
    const suggestion: RejectedBoundarySuggestion = {
      id: 'candidate-1',
      boundarySeconds: 16,
      support: 0.61,
      reasonCodes: ['section.boundary_unsupported'],
      barIndex: 4,
      unavailableReason: null,
    };

    const result = await savedLibrary.libraryAnnotations.adoptRejectedBoundary(
      document,
      suggestion,
    );

    expect(result.error).toBeNull();
    expect(result.document.sections[1].startBoundaryOrigin).toBe('manual');
    expect(dbState.annotation).toEqual(result.document);
  });

  it('keeps the candidate view actionable when adoption cannot be persisted', async () => {
    const document = createLibraryAnnotation('source-sha', 8, []);
    vi.mocked(saveLibraryAnnotation).mockImplementationOnce(() => {
      throw new Error('disk full');
    });

    const result = await savedLibrary.libraryAnnotations.adoptRejectedBoundary(
      document,
      {
        barIndex: 4,
        unavailableReason: null,
      },
    );

    expect(result).toEqual({
      document,
      error: 'Falha ao salvar esta divisão manual localmente.',
    });
    expect(document.sections).toHaveLength(1);
  });

  it('restores a locally saved Library annotation after reload', async () => {
    const document: LibraryAnnotationDocument = {
      schemaVersion: 1,
      sourceSha256: 'source-sha',
      sections: [{ id: 'section-1', name: 'Parte 1', startBar: 0, endBar: 8 }],
    };

    await savedLibrary.libraryAnnotations.save(document);
    vi.resetModules();
    const reloaded = (await import('@/services/savedLibrary')).savedLibrary;
    const restored = await reloaded.libraryAnnotations.get('source-sha', 8);

    expect(restored).toEqual(document);
  });
});
