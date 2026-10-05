import {
  isNewerChartRecord,
  parseBassChartRecord,
  type BassChartRecord,
} from '@/domain/bassChartRecord';
import { getDeviceId } from '@/services/deviceId';
import {
  rocksmithLibrary,
  type RocksmithLibraryRepository,
} from '@/services/rocksmithLibrary';

export interface ChartCloud {
  pull(): Promise<unknown[]>;
  push(record: BassChartRecord): Promise<void>;
}

export const chartCloud: ChartCloud = {
  async pull() {
    const response = await fetch('/api/bass-charts');
    if (!response.ok) throw new Error(`Chart sync: HTTP ${response.status}`);
    const records: unknown = await response.json();
    if (!Array.isArray(records)) throw new Error('Invalid chart sync response');
    return records;
  },
  async push(record) {
    const response = await fetch('/api/bass-charts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ device_id: getDeviceId(), records: [record] }),
    });
    if (!response.ok) throw new Error(`Chart sync: HTTP ${response.status}`);
  },
};

/** Local-first, last-write-wins chart sync, including durable deletions. */
export async function synchronizeBassCharts(
  local: Pick<RocksmithLibraryRepository, 'listRecords' | 'applyRecord'>,
  cloud: ChartCloud,
): Promise<void> {
  const remote = new Map<string, BassChartRecord>();
  for (const raw of await cloud.pull()) {
    const record = parseBassChartRecord(raw);
    if (record && isNewerChartRecord(record, remote.get(record.id))) {
      remote.set(record.id, record);
    }
  }
  // applyRecord compares inside the IndexedDB transaction, protecting edits
  // or deletions made while the network request was in flight.
  for (const record of remote.values()) await local.applyRecord(record);
  for (const raw of await local.listRecords()) {
    const record = parseBassChartRecord(raw);
    if (record && isNewerChartRecord(record, remote.get(record.id))) {
      await cloud.push(record);
    }
  }
}

// Serialize overlapping startup, focus and import syncs. A save queued during
// a running sync gets its own pass, so the new chart cannot be missed.
let pending: Promise<void> = Promise.resolve();
export function syncBassCharts(): Promise<void> {
  const next = pending
    .catch(() => {})
    .then(() => synchronizeBassCharts(rocksmithLibrary, chartCloud));
  pending = next;
  return next;
}
