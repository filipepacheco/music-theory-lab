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
 * debounced background cloud sync, which re-runs on tab focus.
 */
async function withDb<T>(operation: () => T): Promise<T> {
  await initialize();
  return operation();
}

function pushAfter<T>(record: T | null, push: (record: T) => Promise<void>) {
  if (record) push(record).catch(() => {});
}

let syncPromise: Promise<void> | null = null;
let lastSyncStart = 0;

/** Debounce between sync runs, so focus flapping never hammers the API. */
const SYNC_COOLDOWN_MS = 30_000;

const SYNC_DEPS = {
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
};

/**
 * Run a bidirectional merge. Idempotent: cloud upserts and local pushes are
 * all `INSERT OR REPLACE`, so re-running is safe. Failed pushes from one
 * run are retried by the next run.
 */
function runSync(): void {
  const now = Date.now();
  if (syncPromise || now - lastSyncStart < SYNC_COOLDOWN_MS) return;
  lastSyncStart = now;
  syncPromise = syncAll(SYNC_DEPS)
    .catch(() => {})
    .finally(() => {
      syncPromise = null;
    });
}

async function initialize(): Promise<void> {
  await initDB();
  runSync();
}

// Self-heal: re-sync whenever the tab regains focus, so data saved on other
// devices appears without a manual reload — the one-shot-per-load design
// left stale tabs permanently behind after a failed push. initDB() runs
// first inside syncAll's listLocal guards via initialize-on-first-op, so
// make sure the database is open before merging.
async function syncOnFocus(): Promise<void> {
  await initDB();
  runSync();
}

if (typeof window !== 'undefined') {
  window.addEventListener('focus', () => {
    syncOnFocus().catch(() => {});
  });
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
