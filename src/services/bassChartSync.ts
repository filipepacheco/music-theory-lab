import {
  parseBassChartRecord,
  type BassChartRecord,
} from '@/domain/bassChartRecord';
import { getDeviceId } from '@/services/deviceId';
import {
  createSyncStore,
  isCounter,
  isObject,
  parseSyncPage,
  synchronizeRecords,
  type SyncPage,
  type SyncRecords,
  type SyncState,
  type SyncStore,
} from '@/services/counterSync';
import {
  rocksmithLibrary,
  type RocksmithLibraryRepository,
} from '@/services/rocksmithLibrary';

/** One page of a read with a counter. */
export type ChartPage = SyncPage;

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
export type ChartSyncState = SyncState<ChartVersion>;
export type ChartSyncStore = SyncStore<ChartVersion>;

const SYNC_STATE_KEY = 'music-theory-lab-chart-sync';
/**
 * The version of the chart records that this client can read. Raise it when
 * the client starts to read a record that an earlier client skipped (a new
 * chart type, a new field): each device then reads from counter 0 one time.
 * Version 2 reads the drum chart records.
 */
export const CHART_SYNC_FORMAT = 2;

function isChartVersion(value: unknown): boolean {
  return (
    isObject(value) &&
    typeof value.updatedAt === 'string' &&
    typeof value.deleted === 'boolean'
  );
}

/** The last counter of the chart route, in the storage of the browser. */
export function createChartSyncStore(
  storage: () => Pick<Storage, 'getItem' | 'setItem'>,
  format = CHART_SYNC_FORMAT,
): ChartSyncStore {
  return createSyncStore(storage, SYNC_STATE_KEY, format, isChartVersion);
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
    const parsed = parseSyncPage(page);
    if (!parsed) throw new Error('Invalid chart sync response');
    return parsed;
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

const chartRecords: SyncRecords<BassChartRecord, ChartVersion> = {
  parse: parseBassChartRecord,
  id: (record) => record.id,
  version: (record) => ({
    updatedAt: record.updatedAt,
    deleted: record.chart === null,
  }),
  /** The order of `isNewerChartRecord`. */
  isNewer: (incoming, current) =>
    incoming.updatedAt > current.updatedAt ||
    (incoming.updatedAt === current.updatedAt &&
      incoming.deleted &&
      !current.deleted),
};

type LocalRecords = Pick<
  RocksmithLibraryRepository,
  'listRecords' | 'applyRecord'
>;

/**
 * Local-first, last-write-wins chart sync, including durable deletions. A
 * chart is large, so each write holds one record.
 */
export function synchronizeBassCharts(
  local: LocalRecords,
  cloud: ChartCloud,
  store: ChartSyncStore,
): Promise<void> {
  return synchronizeRecords(
    chartRecords,
    {
      list: () => local.listRecords(),
      apply: (record) => local.applyRecord(record),
    },
    {
      pull: (after) => cloud.pull(after),
      writeLimit: 1,
      push: async ([record]) => [await cloud.push(record)],
    },
    store,
  );
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
