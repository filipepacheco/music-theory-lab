import { describe, expect, it, vi } from 'vitest';
import {
  createLibraryAnnotation,
  type LibraryAnnotationDocument,
} from '@/domain/libraryAnnotation';

const dbState = vi.hoisted(() => ({ annotation: null as unknown }));

vi.mock('@/services/db', () => ({
  initDB: vi.fn().mockResolvedValue(undefined),
  persistDB: vi.fn(),
  getAllProgressions: vi.fn(() => []),
  getAllSongs: vi.fn(() => []),
  getAllStructures: vi.fn(() => []),
  getAllLibraryAnnotations: vi.fn(() => []),
  getLibraryAnnotation: vi.fn(() => dbState.annotation),
  upsertProgressionLocal: vi.fn(),
  upsertSongLocal: vi.fn(),
  upsertStructureLocal: vi.fn(),
  upsertLibraryAnnotationLocal: vi.fn(),
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
  pushLibraryAnnotation: vi.fn().mockResolvedValue(undefined),
  pushDeleteProgression: vi.fn().mockResolvedValue(undefined),
  pushDeleteSong: vi.fn().mockResolvedValue(undefined),
  pushDeleteStructure: vi.fn().mockResolvedValue(undefined),
}));

import { savedLibrary } from '@/services/savedLibrary';
import { saveLibraryAnnotation } from '@/services/db';
import { syncAll } from '@/services/sync';
import { pushLibraryAnnotation } from '@/services/sync';

describe('savedLibrary sync trigger', () => {
  it('kicks the background sync on first use and not again within the cooldown', async () => {
    await savedLibrary.songs.list();
    await savedLibrary.structures.list();
    await savedLibrary.progressions.list();

    expect(syncAll).toHaveBeenCalledTimes(1);
    expect(syncAll).toHaveBeenCalledWith(
      expect.objectContaining({
        annotations: expect.objectContaining({
          listLocal: expect.any(Function),
          applyCloud: expect.any(Function),
          push: pushLibraryAnnotation,
        }),
      }),
    );
  });

  it('adopts and persists a rejected boundary through the facade', async () => {
    const document = createLibraryAnnotation('source-sha', 8, []);

    const result = await savedLibrary.libraryAnnotations.adoptRejectedBoundary(
      document,
      { barIndex: 4, unavailableReason: null },
    );

    expect(result.error).toBeNull();
    expect(result.document.sections[1].origin).toBe('manual');
    expect(dbState.annotation).toEqual(result.document);
    expect(pushLibraryAnnotation).toHaveBeenCalledWith(result.document);
  });

  it('keeps the candidate actionable when adoption cannot persist', async () => {
    const document = createLibraryAnnotation('source-sha', 8, []);
    vi.mocked(saveLibraryAnnotation).mockImplementationOnce(() => {
      throw new Error('disk full');
    });

    const result = await savedLibrary.libraryAnnotations.adoptRejectedBoundary(
      document,
      { barIndex: 4, unavailableReason: null },
    );

    expect(result).toEqual({
      document,
      error: 'Falha ao salvar esta divisão manual localmente.',
    });
    expect(document.sections).toHaveLength(1);
  });

  it('restores a locally saved Library annotation after reload', async () => {
    const document: LibraryAnnotationDocument = {
      schemaVersion: 2,
      sourceSha256: 'source-sha',
      barCount: 8,
      reviewRequired: true,
      createdAt: '2026-09-09T12:00:00.000Z',
      updatedAt: '2026-09-09T12:00:00.000Z',
      sections: [
        {
          id: 'section-1',
          name: 'Parte 1',
          startBar: 0,
          endBar: 8,
          origin: 'fallback',
        },
      ],
    };

    await savedLibrary.libraryAnnotations.save(document);
    vi.resetModules();
    const reloaded = (await import('@/services/savedLibrary')).savedLibrary;
    const restored = await reloaded.libraryAnnotations.get('source-sha', 8);

    expect(restored).toEqual(document);
    expect(pushLibraryAnnotation).toHaveBeenCalledWith(document);
  });

  it('keeps an offline annotation edit locally after its cloud push fails', async () => {
    vi.mocked(pushLibraryAnnotation).mockRejectedValueOnce(
      new Error('offline'),
    );
    const document: LibraryAnnotationDocument = {
      schemaVersion: 2,
      sourceSha256: 'offline-sha',
      barCount: 4,
      reviewRequired: false,
      createdAt: '2026-09-09T12:00:00.000Z',
      updatedAt: '2026-09-09T13:00:00.000Z',
      sections: [
        {
          id: 'section-1',
          name: 'Refrão',
          startBar: 0,
          endBar: 4,
          origin: 'manual',
        },
      ],
    };

    await savedLibrary.libraryAnnotations.save(document);

    expect(await savedLibrary.libraryAnnotations.get('offline-sha', 4)).toEqual(
      document,
    );
  });
});
