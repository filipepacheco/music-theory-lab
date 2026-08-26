import { describe, expect, it, vi } from 'vitest';

vi.mock('@/services/db', () => ({
  initDB: vi.fn().mockResolvedValue(undefined),
  persistDB: vi.fn(),
  getAllProgressions: vi.fn(() => []),
  getAllSongs: vi.fn(() => []),
  getAllStructures: vi.fn(() => []),
  upsertProgressionLocal: vi.fn(),
  upsertSongLocal: vi.fn(),
  upsertStructureLocal: vi.fn(),
  saveProgression: vi.fn(),
  saveSong: vi.fn(),
  saveStructure: vi.fn(),
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
});
