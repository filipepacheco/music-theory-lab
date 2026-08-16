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

export type { SavedProgression } from '@/services/db';

export const savedLibrary = {
  initialize: initDB,
  waitUntilSynchronized: waitForSync,
  progressions: {
    list: getAllProgressions,
    save: saveProgression,
    remove: deleteProgression,
  },
  songs: {
    list: getAllSongs,
    save: saveSong,
    update: updateSong,
    remove: deleteSong,
  },
  structures: {
    list: getAllStructures,
    save: saveStructure,
    update: updateStructure,
    remove: deleteStructure,
  },
};
