import {
  parseBassChartRecord,
  type BassChartRecord,
} from '@/domain/bassChartRecord';
import { getDeviceId } from '@/services/deviceId';
import {
  rocksmithLibrary,
  type RocksmithLibraryRepository,
} from '@/services/rocksmithLibrary';

/** One page of a read with a counter. */
export interface ChartPage {
  records: unknown[];
  /** The counter of the last record of the page, for the next read. */
  counter: number;
  /** True when the page is full, so a next page can exist. */
  more: boolean;
}

export interface ChartCloud {
  /** The records with a counter larger than `after`, in counter order. */
  pull(after: number): Promise<ChartPage>;
  /**
   * Resolves to the counter of the record when the cloud now holds it, or to
   * null when the cloud does not say.
   */
  push(record: BassChartRecord): Promise<number | null>;
}

/** What orders two records of one chart. */
interface ChartVersion {
  updatedAt: string;
  deleted: boolean;
}

/** What this device knows of the cloud, between two synchronizations. */
export interface ChartSyncState {
  /** The last counter that this device got. */
  counter: number;
  /** For each chart id, the newest record that the cloud got or gave. */
  cloud: Record<string, ChartVersion>;
}

export interface ChartSyncStore {
  read(): ChartSyncState;
  write(state: ChartSyncState): void;
}

const SYNC_STATE_KEY = 'music-theory-lab-chart-sync';

function isCounter(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseSyncState(text: string | null): ChartSyncState | null {
  const value: unknown = text === null ? null : JSON.parse(text);
  if (!isObject(value) || !isCounter(value.counter) || !isObject(value.cloud)) {
    return null;
  }
  const valid = Object.values(value.cloud).every(
    (version) =>
      isObject(version) &&
      typeof version.updatedAt === 'string' &&
      typeof version.deleted === 'boolean',
  );
  return valid ? (value as unknown as ChartSyncState) : null;
}

/**
 * Keeps the last counter in the storage of the browser. It is a small value
 * beside the local database, so the local database keeps its version. When
 * the storage holds no valid value, the device reads all records again.
 */
export function createChartSyncStore(
  storage: () => Pick<Storage, 'getItem' | 'setItem'>,
): ChartSyncStore {
  // With blocked or full storage, the state lasts until the page closes.
  let unsaved: ChartSyncState | null = null;
  return {
    read() {
      try {
        const state = parseSyncState(storage().getItem(SYNC_STATE_KEY));
        if (state) return state;
      } catch {
        // Blocked storage or a corrupt value.
      }
      return unsaved ?? { counter: 0, cloud: {} };
    },
    write(state) {
      try {
        const text = JSON.stringify(state);
        if (storage().getItem(SYNC_STATE_KEY) !== text) {
          storage().setItem(SYNC_STATE_KEY, text);
        }
        unsaved = null;
      } catch {
        unsaved = state;
      }
    },
  };
}

export const chartCloud: ChartCloud = {
  async pull(after) {
    const response = await fetch(`/api/bass-charts?after=${after}`);
    if (!response.ok) throw new Error(`Chart sync: HTTP ${response.status}`);
    const page: unknown = await response.json();
    // An earlier version of the route ignores the counter and returns all
    // records. They are a last page that moves no counter.
    if (Array.isArray(page)) {
      return { records: page, counter: after, more: false };
    }
    if (
      !isObject(page) ||
      !Array.isArray(page.records) ||
      !isCounter(page.counter) ||
      typeof page.more !== 'boolean'
    ) {
      throw new Error('Invalid chart sync response');
    }
    return { records: page.records, counter: page.counter, more: page.more };
  },
  async push(record) {
    const response = await fetch('/api/bass-charts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ device_id: getDeviceId(), records: [record] }),
    });
    if (!response.ok) throw new Error(`Chart sync: HTTP ${response.status}`);
    const result: unknown = await response.json().catch(() => null);
    const counter =
      isObject(result) && Array.isArray(result.counters)
        ? result.counters[0]
        : null;
    return isCounter(counter) ? counter : null;
  },
};

function versionOf(record: BassChartRecord): ChartVersion {
  return { updatedAt: record.updatedAt, deleted: record.chart === null };
}

/** The order of `isNewerChartRecord`, against the record that the cloud has. */
function isAheadOfCloud(
  record: BassChartRecord,
  cloud: ChartVersion | undefined,
): boolean {
  return (
    !cloud ||
    record.updatedAt > cloud.updatedAt ||
    (record.updatedAt === cloud.updatedAt &&
      record.chart === null &&
      !cloud.deleted)
  );
}

type LocalRecords = Pick<
  RocksmithLibraryRepository,
  'listRecords' | 'applyRecord'
>;

/** Read page after page from `from.counter` until a page is not full. */
async function readChanges(
  local: LocalRecords,
  cloud: ChartCloud,
  from: ChartSyncState,
): Promise<ChartSyncState> {
  const state = { counter: from.counter, cloud: { ...from.cloud } };
  for (;;) {
    const page = await cloud.pull(state.counter);
    for (const raw of page.records) {
      const record = parseBassChartRecord(raw);
      if (!record) continue;
      // applyRecord compares inside the IndexedDB transaction, protecting
      // edits or deletions made while the network request was in flight.
      await local.applyRecord(record);
      state.cloud[record.id] = versionOf(record);
    }
    // A full page must move the counter, or the read would never end.
    if (page.counter < state.counter + (page.more ? 1 : 0)) {
      throw new Error('Invalid chart sync response');
    }
    state.counter = page.counter;
    if (!page.more) return state;
  }
}

/**
 * Local-first, last-write-wins chart sync, including durable deletions. The
 * read moves only the records that the cloud got after the last counter of
 * this device. The write moves only the local records that are newer than the
 * record that the cloud has.
 */
export async function synchronizeBassCharts(
  local: LocalRecords,
  cloud: ChartCloud,
  store: ChartSyncStore,
): Promise<void> {
  const stored = store.read();
  let state = await readChanges(local, cloud, stored);
  let records = await local.listRecords();
  const localIds = new Set(records.map((record) => record.id));
  if (Object.keys(stored.cloud).some((id) => !localIds.has(id))) {
    // The local database lost records that the cloud has, for example after
    // a deletion of the browser data. The stored counter is then too far.
    state = await readChanges(local, cloud, { counter: 0, cloud: {} });
    records = await local.listRecords();
  }
  store.write(state);
  try {
    for (const raw of records) {
      const record = parseBassChartRecord(raw);
      if (!record || !isAheadOfCloud(record, state.cloud[record.id])) continue;
      const counter = await cloud.push(record);
      state.cloud[record.id] = versionOf(record);
      // Counters have no equal values. When this write got the next one, no
      // write of a different device is before it, and the device does not
      // read its own record again.
      if (counter === state.counter + 1) state.counter = counter;
    }
  } finally {
    store.write(state);
  }
}

const syncStore = createChartSyncStore(() => localStorage);

// Serialize overlapping startup, focus and import syncs. A save queued during
// a running sync gets its own pass, so the new chart cannot be missed.
let pending: Promise<void> = Promise.resolve();
export function syncBassCharts(): Promise<void> {
  const next = pending
    .catch(() => {})
    .then(() => synchronizeBassCharts(rocksmithLibrary, chartCloud, syncStore));
  pending = next;
  return next;
}
