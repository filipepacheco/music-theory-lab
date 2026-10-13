import {
  chartSettingsVersion,
  isNewerSettingsVersion,
  parseChartSettings,
  type ChartSettings,
  type ChartSettingsVersion,
} from '@/domain/chartSettings';
import { getDeviceId } from '@/services/deviceId';
import {
  createSyncStore,
  isCounter,
  isObject,
  parseSyncPage,
  synchronizeRecords,
  type SyncCloud,
  type SyncRecords,
  type SyncStore,
} from '@/services/counterSync';
import {
  rocksmithLibrary,
  type RocksmithLibraryRepository,
} from '@/services/rocksmithLibrary';

/** The settings route: a read with a counter, and a write of many records. */
export type ChartSettingsCloud = SyncCloud<ChartSettings>;
export type ChartSettingsSyncStore = SyncStore<ChartSettingsVersion>;

const SYNC_STATE_KEY = 'music-theory-lab-chart-settings-sync';
/**
 * The version of the settings records that this client can read. Raise it
 * when the client starts to read a record that an earlier client skipped (a
 * new field, a new value): each device then reads from counter 0 one time.
 */
export const CHART_SETTINGS_SYNC_FORMAT = 2;
const ROUTE = '/api/chart-settings';
/** The settings route refuses a write with more records. */
const WRITE_LIMIT = 100;

function isSettingsVersion(value: unknown): boolean {
  return (
    isObject(value) &&
    typeof value.updatedAt === 'string' &&
    typeof value.body === 'string'
  );
}

/** The last counter of the settings route, in the storage of the browser. */
export function createChartSettingsSyncStore(
  storage: () => Pick<Storage, 'getItem' | 'setItem'>,
  format = CHART_SETTINGS_SYNC_FORMAT,
): ChartSettingsSyncStore {
  return createSyncStore(storage, SYNC_STATE_KEY, format, isSettingsVersion);
}

export const chartSettingsCloud: ChartSettingsCloud = {
  writeLimit: WRITE_LIMIT,
  async pull(after) {
    const response = await fetch(`${ROUTE}?after=${after}`);
    if (!response.ok) {
      throw new Error(`Chart settings sync: HTTP ${response.status}`);
    }
    const page = parseSyncPage(await response.json());
    if (!page) throw new Error('Invalid chart settings sync response');
    return page;
  },
  async push(records) {
    const response = await fetch(ROUTE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ device_id: getDeviceId(), records }),
    });
    if (!response.ok) {
      throw new Error(`Chart settings sync: HTTP ${response.status}`);
    }
    const result: unknown = await response.json().catch(() => null);
    const counters =
      isObject(result) && Array.isArray(result.counters) ? result.counters : [];
    return records.map((_, index) =>
      isCounter(counters[index]) ? counters[index] : null,
    );
  },
};

const settingsRecords: SyncRecords<ChartSettings, ChartSettingsVersion> = {
  parse: parseChartSettings,
  id: (settings) => settings.chartId,
  version: chartSettingsVersion,
  isNewer: isNewerSettingsVersion,
};

type LocalSettings = Pick<
  RocksmithLibraryRepository,
  'listSettings' | 'applySettings'
>;

/**
 * Local-first, last-write-wins synchronization of the chart settings. It
 * reads and writes only settings records: no chart goes with them, and a
 * chart deletion removes none.
 */
export function synchronizeChartSettings(
  local: LocalSettings,
  cloud: ChartSettingsCloud,
  store: ChartSettingsSyncStore,
): Promise<void> {
  return synchronizeRecords(
    settingsRecords,
    {
      list: () => local.listSettings(),
      apply: (settings) => local.applySettings(settings),
    },
    cloud,
    store,
  );
}

const syncStore = createChartSettingsSyncStore(() => localStorage);

// One synchronization at a time. A change that a screen saves during a
// running synchronization gets its own pass.
let pending: Promise<void> = Promise.resolve();
export function syncChartSettings(): Promise<void> {
  const next = pending
    .catch(() => {})
    .then(() =>
      synchronizeChartSettings(rocksmithLibrary, chartSettingsCloud, syncStore),
    );
  pending = next;
  return next;
}
