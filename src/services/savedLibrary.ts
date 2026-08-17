import {
  deleteProgression,
  deleteSong,
  deleteStructure,
  getAllProgressions,
  getAllSongs,
  getAllStructures,
  initDB,
  saveProgression,
  saveSong,
  saveStructure,
  updateSong,
  updateStructure,
  waitForSync,
} from '@/services/db';
import {
  pushDeleteProgression,
  pushDeleteSong,
  pushDeleteStructure,
  pushProgression,
  pushSong,
  pushStructure,
} from '@/services/sync';

export type { SavedProgression } from '@/services/db';

/**
 * Every operation self-initializes the database, so callers never need to
 * know the initialization protocol. CRUD also fires a best-effort cloud
 * push; db.ts stays a pure persistence adapter.
 */
async function withDb<T>(operation: () => T): Promise<T> {
  await initDB();
  return operation();
}

function pushAfter<T>(record: T | null, push: (record: T) => Promise<void>) {
  if (record) push(record).catch(() => {});
}

export const savedLibrary = {
  initialize: initDB,
  waitUntilSynchronized: waitForSync,

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
