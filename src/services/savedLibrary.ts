import {
  deleteProgression,
  deleteSong,
  deleteStructure,
  getAllProgressions,
  getAllSongs,
  getAllStructures,
  initDB,
  persistDB,
  saveProgression,
  saveSong,
  saveStructure,
  updateSong,
  updateStructure,
  upsertProgressionLocal,
  upsertSongLocal,
  upsertStructureLocal,
} from '@/services/db';
import {
  pushDeleteProgression,
  pushDeleteSong,
  pushDeleteStructure,
  pushProgression,
  pushSong,
  pushStructure,
  syncAll,
} from '@/services/sync';

export type { SavedProgression } from '@/services/db';

/**
 * Every operation self-initializes the database, so callers never need to
 * know the initialization protocol. CRUD also fires a best-effort cloud
 * push; db.ts stays a pure persistence adapter. Initialize also kicks the
 * one-shot background cloud sync.
 */
async function withDb<T>(operation: () => T): Promise<T> {
  // initialize() both opens the database and kicks the one-shot background
  // cloud sync, so the very first operation triggers the sync — callers
  // must never need to remember either protocol.
  await initialize();
  return operation();
}

function pushAfter<T>(record: T | null, push: (record: T) => Promise<void>) {
  if (record) push(record).catch(() => {});
}

let syncPromise: Promise<void> | null = null;

async function initialize(): Promise<void> {
  await initDB();
  if (!syncPromise) {
    syncPromise = syncAll({
      progressions: {
        listLocal: getAllProgressions,
        applyCloud: upsertProgressionLocal,
        push: pushProgression,
      },
      songs: {
        listLocal: getAllSongs,
        applyCloud: upsertSongLocal,
        push: pushSong,
      },
      structures: {
        listLocal: getAllStructures,
        applyCloud: upsertStructureLocal,
        push: pushStructure,
      },
      persist: persistDB,
    }).catch(() => {});
  }
}

export const savedLibrary = {
  initialize,
  waitUntilSynchronized: () => syncPromise ?? Promise.resolve(),

  progressions: {
    list: (mode?: 'major' | 'minor') =>
      withDb(() => getAllProgressions(mode)),
    save: async (prog: Parameters<typeof saveProgression>[0]) => {
      const saved = await withDb(() => saveProgression(prog));
      pushAfter(saved, pushProgression);
    },
    remove: async (id: string) => {
      await withDb(() => deleteProgression(id));
      pushDeleteProgression(id).catch(() => {});
    },
  },

  songs: {
    list: () => withDb(getAllSongs),
    save: async (song: Parameters<typeof saveSong>[0]) => {
      const saved = await withDb(() => saveSong(song));
      pushAfter(saved, pushSong);
      return saved?.id;
    },
    update: async (
      id: string,
      updates: Parameters<typeof updateSong>[1],
    ) => {
      const saved = await withDb(() => updateSong(id, updates));
      pushAfter(saved, pushSong);
    },
    remove: async (id: string) => {
      await withDb(() => deleteSong(id));
      pushDeleteSong(id).catch(() => {});
    },
  },

  structures: {
    list: () => withDb(getAllStructures),
    save: async (structure: Parameters<typeof saveStructure>[0]) => {
      const saved = await withDb(() => saveStructure(structure));
      pushAfter(saved, pushStructure);
      return saved?.id;
    },
    update: async (
      id: string,
      updates: Parameters<typeof updateStructure>[1],
    ) => {
      const saved = await withDb(() => updateStructure(id, updates));
      pushAfter(saved, pushStructure);
    },
    remove: async (id: string) => {
      await withDb(() => deleteStructure(id));
      pushDeleteStructure(id).catch(() => {});
    },
  },
};
