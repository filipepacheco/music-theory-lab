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

export type ChartPage = SyncPage;

export interface ChartCloud {
  pull(after: number): Promise<ChartPage>;
  push(record: BassChartRecord): Promise<number | null>;
}

interface ChartVersion {
  updatedAt: string;
  deleted: boolean;
}

export type ChartSyncState = SyncState<ChartVersion>;
export type ChartSyncStore = SyncStore<ChartVersion>;

const SYNC_STATE_KEY = 'music-theory-lab-chart-sync';
export const CHART_SYNC_FORMAT = 2;

function isChartVersion(value: unknown): boolean {
  return (
    isObject(value) &&
    typeof value.updatedAt === 'string' &&
    typeof value.deleted === 'boolean'
  );
}

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

let pending: Promise<void> = Promise.resolve();
export function syncBassCharts(): Promise<void> {
  const next = pending
    .catch(() => {})
    .then(() => synchronizeBassCharts(rocksmithLibrary, chartCloud, syncStore));
  pending = next;
  return next;
}
