import {
  deleteProgression,
  deleteSong,
  deleteStructure,
  getAllProgressions,
  getAllSongs,
  getAllStructures,
  getAllLibraryAnnotations,
  getLibraryAnnotation,
  initDB,
  persistDB,
  saveProgression,
  saveSong,
  saveStructure,
  saveLibraryAnnotation,
  updateSong,
  updateStructure,
  upsertProgressionLocal,
  upsertSongLocal,
  upsertStructureLocal,
  upsertLibraryAnnotationLocal,
} from '@/services/db';
import {
  pushDeleteProgression,
  pushDeleteSong,
  pushDeleteStructure,
  pushProgression,
  pushSong,
  pushStructure,
  pushLibraryAnnotation,
  syncAll,
} from '@/services/sync';
import {
  adoptRejectedBoundarySuggestion,
  type AdoptableLibraryBoundarySuggestion,
  type LibraryAnnotationDocument,
  type LibraryAnnotationEditResult,
} from '@/domain/libraryAnnotation';

export type { SavedProgression } from '@/services/db';

async function withDb<T>(operation: () => T): Promise<T> {
  await initialize();
  return operation();
}

function pushAfter<T>(record: T | null, push: (record: T) => Promise<void>) {
  if (record) push(record).catch(() => {});
}

let syncPromise: Promise<void> | null = null;
let lastSyncStart = 0;

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
  annotations: {
    listLocal: getAllLibraryAnnotations,
    applyCloud: upsertLibraryAnnotationLocal,
    push: pushLibraryAnnotation,
  },
  persist: persistDB,
};

function runSync(): Promise<void> {
  const now = Date.now();
  if (syncPromise) return syncPromise;
  if (now - lastSyncStart < SYNC_COOLDOWN_MS) return Promise.resolve();
  lastSyncStart = now;
  syncPromise = syncAll(SYNC_DEPS)
    .catch(() => {})
    .finally(() => {
      syncPromise = null;
    });
  return syncPromise;
}

async function initialize(): Promise<void> {
  await initDB();
  void runSync();
}

async function syncOnFocus(): Promise<void> {
  await initDB();
  await runSync();
}

if (typeof window !== 'undefined') {
  window.addEventListener('focus', () => {
    syncOnFocus().catch(() => {});
  });
}

export const savedLibrary = {
  initialize,
  synchronize: syncOnFocus,
  waitUntilSynchronized: () => syncPromise ?? Promise.resolve(),

  progressions: {
    list: (mode?: 'major' | 'minor') => withDb(() => getAllProgressions(mode)),
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
    update: async (id: string, updates: Parameters<typeof updateSong>[1]) => {
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

  libraryAnnotations: {
    get: (sourceSha256: string, barCount: number) =>
      withDb(() => getLibraryAnnotation(sourceSha256, barCount)),
    save: async (document: Parameters<typeof saveLibraryAnnotation>[0]) => {
      await withDb(() => saveLibraryAnnotation(document));
      pushAfter(document, pushLibraryAnnotation);
    },
    adoptRejectedBoundary: async (
      document: LibraryAnnotationDocument,
      suggestion: AdoptableLibraryBoundarySuggestion,
    ): Promise<LibraryAnnotationEditResult> => {
      const result = adoptRejectedBoundarySuggestion(document, suggestion);
      if (result.error) return result;
      try {
        await withDb(() => saveLibraryAnnotation(result.document));
        pushAfter(result.document, pushLibraryAnnotation);
        return result;
      } catch {
        return {
          document,
          error: 'Falha ao salvar esta divisão manual localmente.',
        };
      }
    },
  },
};
