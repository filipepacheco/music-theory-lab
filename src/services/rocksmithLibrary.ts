import type { Chart } from '@/domain/drumChart';
import {
  isNewerChartRecord,
  type BassChartRecord,
} from '@/domain/bassChartRecord';
import {
  isNewerChartSettings,
  laterChartSettings,
  parseChartSettings,
  type ChartSettings,
} from '@/domain/chartSettings';
import { summarizeChart, type ChartSummary } from '@/domain/chartSummary';

const DATABASE_NAME = 'music-theory-lab-rocksmith';
const DATABASE_VERSION = 3;
const CHART_STORE = 'charts';
const AUDIO_STORE = 'audio';
const RECORD_STORE = 'records';
const SUMMARY_STORE = 'summaries';
const SETTINGS_STORE = 'settings';
const CHART_WRITE_STORES = [
  CHART_STORE,
  AUDIO_STORE,
  RECORD_STORE,
  SUMMARY_STORE,
];

export interface StoredChartAudio {
  chartId: string;
  fileName: string;
  blob: Blob;
  origin: 'psarc' | 'local';
}

export interface RocksmithLibraryRepository {
  listCharts(): Promise<Chart[]>;
  getChart(chartId: string): Promise<Chart | null>;
  getAudio(chartId: string): Promise<StoredChartAudio | null>;
  listAudioIds(): Promise<string[]>;
  save(chart: Chart, audio: StoredChartAudio | null): Promise<void>;
  saveAudio(audio: StoredChartAudio): Promise<void>;
  remove(chartId: string): Promise<void>;
  listRecords(): Promise<BassChartRecord[]>;
  applyRecord(record: BassChartRecord): Promise<void>;
  listSummaries(): Promise<ChartSummary[]>;
  getSettings(chartId: string): Promise<ChartSettings | null>;
  saveSettings(settings: ChartSettings): Promise<void>;
  listSettings(): Promise<ChartSettings[]>;
  applySettings(settings: ChartSettings): Promise<void>;
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
        const cursor = request
          .transaction!.objectStore(CHART_STORE)
          .openCursor();
        cursor.onsuccess = () => {
          const current = cursor.result;
          if (!current) return;
          const chart = current.value as Chart;
          records.put({
            id: chart.id,
            updatedAt: new Date(chart.importedAt).toISOString(),
            chart,
          });
          current.continue();
        };
      }
      if (!database.objectStoreNames.contains(SETTINGS_STORE)) {
        database.createObjectStore(SETTINGS_STORE, { keyPath: 'chartId' });
      }
      if (!database.objectStoreNames.contains(SUMMARY_STORE)) {
        const summaries = database.createObjectStore(SUMMARY_STORE, {
          keyPath: 'id',
        });
        const cursor = request
          .transaction!.objectStore(CHART_STORE)
          .openCursor();
        cursor.onsuccess = () => {
          const current = cursor.result;
          if (!current) return;
          summaries.put(summarizeChart(current.value as Chart));
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
        const charts = await requestResult<Chart[]>(
          transaction.objectStore(CHART_STORE).getAll(),
        );
        return charts.sort((a, b) => b.importedAt.localeCompare(a.importedAt));
      }),

    getChart: (chartId) =>
      withDatabase(factory, async (database) => {
        const transaction = database.transaction(CHART_STORE, 'readonly');
        const chart = await requestResult<Chart | undefined>(
          transaction.objectStore(CHART_STORE).get(chartId),
        );
        return chart ?? null;
      }),

    getAudio: (chartId) =>
      withDatabase(factory, async (database) => {
        const transaction = database.transaction(AUDIO_STORE, 'readonly');
        const audio = await requestResult<StoredChartAudio | undefined>(
          transaction.objectStore(AUDIO_STORE).get(chartId),
        );
        return audio ?? null;
      }),

    listAudioIds: () =>
      withDatabase(factory, async (database) => {
        const transaction = database.transaction(AUDIO_STORE, 'readonly');
        const keys = await requestResult<IDBValidKey[]>(
          transaction.objectStore(AUDIO_STORE).getAllKeys(),
        );
        return keys.map(String);
      }),

    save: (chart, audio) =>
      withDatabase(factory, async (database) => {
        const transaction = database.transaction(
          CHART_WRITE_STORES,
          'readwrite',
        );
        transaction.objectStore(CHART_STORE).put(chart);
        transaction.objectStore(SUMMARY_STORE).put(summarizeChart(chart));
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
          CHART_WRITE_STORES,
          'readwrite',
        );
        transaction.objectStore(CHART_STORE).delete(chartId);
        transaction.objectStore(SUMMARY_STORE).delete(chartId);
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
          CHART_WRITE_STORES,
          'readwrite',
        );
        const done = transactionComplete(transaction);
        const records = transaction.objectStore(RECORD_STORE);
        const request = records.get(record.id);
        request.onsuccess = () => {
          if (!isNewerChartRecord(record, request.result)) return;
          records.put(record);
          if (record.chart) {
            transaction.objectStore(CHART_STORE).put(record.chart);
            transaction
              .objectStore(SUMMARY_STORE)
              .put(summarizeChart(record.chart));
          } else {
            transaction.objectStore(CHART_STORE).delete(record.id);
            transaction.objectStore(SUMMARY_STORE).delete(record.id);
            transaction.objectStore(AUDIO_STORE).delete(record.id);
          }
        };
        await done;
      }),

    listSummaries: () =>
      withDatabase(factory, async (database) => {
        const transaction = database.transaction(SUMMARY_STORE, 'readonly');
        const summaries = await requestResult<ChartSummary[]>(
          transaction.objectStore(SUMMARY_STORE).getAll(),
        );
        return summaries.sort((a, b) =>
          b.importedAt.localeCompare(a.importedAt),
        );
      }),

    getSettings: (chartId) =>
      withDatabase(factory, async (database) => {
        const transaction = database.transaction(SETTINGS_STORE, 'readonly');
        const settings = await requestResult<ChartSettings | undefined>(
          transaction.objectStore(SETTINGS_STORE).get(chartId),
        );
        return settings ?? null;
      }),

    saveSettings: async (settings) => {
      const change = parseChartSettings(settings);
      if (!change) throw new Error('Invalid chart settings');
      await withDatabase(factory, async (database) => {
        const transaction = database.transaction(SETTINGS_STORE, 'readwrite');
        const done = transactionComplete(transaction);
        const store = transaction.objectStore(SETTINGS_STORE);
        const request = store.get(change.chartId);
        request.onsuccess = () => {
          store.put(laterChartSettings(change, request.result));
        };
        await done;
      });
    },

    listSettings: () =>
      withDatabase(factory, async (database) => {
        const transaction = database.transaction(SETTINGS_STORE, 'readonly');
        return requestResult<ChartSettings[]>(
          transaction.objectStore(SETTINGS_STORE).getAll(),
        );
      }),

    applySettings: (settings) =>
      withDatabase(factory, async (database) => {
        const transaction = database.transaction(SETTINGS_STORE, 'readwrite');
        const done = transactionComplete(transaction);
        const store = transaction.objectStore(SETTINGS_STORE);
        const request = store.get(settings.chartId);
        request.onsuccess = () => {
          if (isNewerChartSettings(settings, request.result)) {
            store.put(settings);
          }
        };
        await done;
      }),
  };
}

export const rocksmithLibrary: RocksmithLibraryRepository = {
  listCharts: () => createIndexedDbRocksmithLibrary(indexedDB).listCharts(),
  getChart: (id) => createIndexedDbRocksmithLibrary(indexedDB).getChart(id),
  getAudio: (id) => createIndexedDbRocksmithLibrary(indexedDB).getAudio(id),
  listAudioIds: () => createIndexedDbRocksmithLibrary(indexedDB).listAudioIds(),
  save: (chart, audio) =>
    createIndexedDbRocksmithLibrary(indexedDB).save(chart, audio),
  saveAudio: (audio) =>
    createIndexedDbRocksmithLibrary(indexedDB).saveAudio(audio),
  remove: (id) => createIndexedDbRocksmithLibrary(indexedDB).remove(id),
  listRecords: () => createIndexedDbRocksmithLibrary(indexedDB).listRecords(),
  applyRecord: (record) =>
    createIndexedDbRocksmithLibrary(indexedDB).applyRecord(record),
  listSummaries: () =>
    createIndexedDbRocksmithLibrary(indexedDB).listSummaries(),
  getSettings: (chartId) =>
    createIndexedDbRocksmithLibrary(indexedDB).getSettings(chartId),
  saveSettings: (settings) =>
    createIndexedDbRocksmithLibrary(indexedDB).saveSettings(settings),
  listSettings: () => createIndexedDbRocksmithLibrary(indexedDB).listSettings(),
  applySettings: (settings) =>
    createIndexedDbRocksmithLibrary(indexedDB).applySettings(settings),
};
