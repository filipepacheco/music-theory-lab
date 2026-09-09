import { describe, expect, it, vi } from 'vitest';
import type { LibraryAnnotationDocument } from '@/domain/libraryAnnotation';

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

describe('savedLibrary sync trigger', () => {
  it('kicks the background sync on first use and not again within the cooldown', async () => {
    await savedLibrary.songs.list();
    await savedLibrary.structures.list();
    await savedLibrary.progressions.list();

    expect(syncAll).toHaveBeenCalledTimes(1);
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
