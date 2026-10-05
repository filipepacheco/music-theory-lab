// Local chart cache and deletion journal. Only derived charts synchronize;
// original packages and audio blobs remain in this browser.

import type { BassChart } from '@/domain/bassChart';
import {
  isNewerChartRecord,
  type BassChartRecord,
} from '@/domain/bassChartRecord';

const DATABASE_NAME = 'music-theory-lab-rocksmith';
const DATABASE_VERSION = 2;
const CHART_STORE = 'charts';
const AUDIO_STORE = 'audio';
const RECORD_STORE = 'records';

export interface StoredChartAudio {
  chartId: string;
  fileName: string;
  blob: Blob;
  /** `psarc` when extracted from the package, `local` when the user chose it. */
  origin: 'psarc' | 'local';
}

export interface RocksmithLibraryRepository {
  listCharts(): Promise<BassChart[]>;
  getAudio(chartId: string): Promise<StoredChartAudio | null>;
  save(chart: BassChart, audio: StoredChartAudio | null): Promise<void>;
  saveAudio(audio: StoredChartAudio): Promise<void>;
  remove(chartId: string): Promise<void>;
  listRecords(): Promise<BassChartRecord[]>;
  applyRecord(record: BassChartRecord): Promise<void>;
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

function openDatabase(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(CHART_STORE)) {
        database.createObjectStore(CHART_STORE, { keyPath: 'id' });
      }
      if (!database.objectStoreNames.contains(AUDIO_STORE)) {
        database.createObjectStore(AUDIO_STORE, { keyPath: 'chartId' });
      }
      if (!database.objectStoreNames.contains(RECORD_STORE)) {
        const records = database.createObjectStore(RECORD_STORE, {
          keyPath: 'id',
        });
        // Upgrade existing MIDI/Rocksmith imports so they also synchronize.
        const cursor = request
          .transaction!.objectStore(CHART_STORE)
          .openCursor();
        cursor.onsuccess = () => {
          const current = cursor.result;
          if (!current) return;
          const chart = current.value as BassChart;
          records.put({
            id: chart.id,
            updatedAt: new Date(chart.importedAt).toISOString(),
            chart,
          });
          current.continue();
        };
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('IndexedDB open blocked'));
  });
}

async function withDatabase<T>(
  factory: IDBFactory,
  run: (database: IDBDatabase) => Promise<T>,
): Promise<T> {
  const database = await openDatabase(factory);
  try {
    return await run(database);
  } finally {
    database.close();
  }
}

export function createIndexedDbRocksmithLibrary(
  factory: IDBFactory,
): RocksmithLibraryRepository {
  return {
    listCharts: () =>
      withDatabase(factory, async (database) => {
        const transaction = database.transaction(CHART_STORE, 'readonly');
        const charts = await requestResult<BassChart[]>(
          transaction.objectStore(CHART_STORE).getAll(),
        );
        return charts.sort((a, b) => b.importedAt.localeCompare(a.importedAt));
      }),

    getAudio: (chartId) =>
      withDatabase(factory, async (database) => {
        const transaction = database.transaction(AUDIO_STORE, 'readonly');
        const audio = await requestResult<StoredChartAudio | undefined>(
          transaction.objectStore(AUDIO_STORE).get(chartId),
        );
        return audio ?? null;
      }),

    save: (chart, audio) =>
      withDatabase(factory, async (database) => {
        const transaction = database.transaction(
          [CHART_STORE, AUDIO_STORE, RECORD_STORE],
          'readwrite',
        );
        transaction.objectStore(CHART_STORE).put(chart);
        transaction.objectStore(RECORD_STORE).put({
          id: chart.id,
          updatedAt: new Date().toISOString(),
          chart,
        });
        if (audio) transaction.objectStore(AUDIO_STORE).put(audio);
        await transactionComplete(transaction);
      }),

    saveAudio: (audio) =>
      withDatabase(factory, async (database) => {
        const transaction = database.transaction(AUDIO_STORE, 'readwrite');
        transaction.objectStore(AUDIO_STORE).put(audio);
        await transactionComplete(transaction);
      }),

    remove: (chartId) =>
      withDatabase(factory, async (database) => {
        const transaction = database.transaction(
          [CHART_STORE, AUDIO_STORE, RECORD_STORE],
          'readwrite',
        );
        transaction.objectStore(CHART_STORE).delete(chartId);
        transaction.objectStore(AUDIO_STORE).delete(chartId);
        transaction.objectStore(RECORD_STORE).put({
          id: chartId,
          updatedAt: new Date().toISOString(),
          chart: null,
        });
        await transactionComplete(transaction);
      }),

    listRecords: () =>
      withDatabase(factory, async (database) => {
        const transaction = database.transaction(RECORD_STORE, 'readonly');
        return requestResult<BassChartRecord[]>(
          transaction.objectStore(RECORD_STORE).getAll(),
        );
      }),

    applyRecord: (record) =>
      withDatabase(factory, async (database) => {
        const transaction = database.transaction(
          [CHART_STORE, AUDIO_STORE, RECORD_STORE],
          'readwrite',
        );
        const done = transactionComplete(transaction);
        const records = transaction.objectStore(RECORD_STORE);
        const request = records.get(record.id);
        request.onsuccess = () => {
          if (!isNewerChartRecord(record, request.result)) return;
          records.put(record);
          if (record.chart)
            transaction.objectStore(CHART_STORE).put(record.chart);
          else {
            transaction.objectStore(CHART_STORE).delete(record.id);
            transaction.objectStore(AUDIO_STORE).delete(record.id);
          }
        };
        await done;
      }),
  };
}

export const rocksmithLibrary: RocksmithLibraryRepository = {
  listCharts: () => createIndexedDbRocksmithLibrary(indexedDB).listCharts(),
  getAudio: (id) => createIndexedDbRocksmithLibrary(indexedDB).getAudio(id),
  save: (chart, audio) =>
    createIndexedDbRocksmithLibrary(indexedDB).save(chart, audio),
  saveAudio: (audio) =>
    createIndexedDbRocksmithLibrary(indexedDB).saveAudio(audio),
  remove: (id) => createIndexedDbRocksmithLibrary(indexedDB).remove(id),
  listRecords: () => createIndexedDbRocksmithLibrary(indexedDB).listRecords(),
  applyRecord: (record) =>
    createIndexedDbRocksmithLibrary(indexedDB).applyRecord(record),
};
