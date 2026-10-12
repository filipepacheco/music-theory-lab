// The synchronization that the chart route and the chart settings route
// share: a read from the last counter, page after page, then a write of the
// local records that are newer than the record of the cloud.

/** One page of a read with a counter. */
export interface SyncPage {
  records: unknown[];
  /** The counter of the last record of the page, for the next read. */
  counter: number;
  /** True when the page is full, so a next page can exist. */
  more: boolean;
}

export interface SyncCloud<R> {
  /** The records with a counter larger than `after`, in counter order. */
  pull(after: number): Promise<SyncPage>;
  /** The most records in one write. */
  writeLimit: number;
  /**
   * Resolves, for each record, to its counter when the cloud now holds it, or
   * to null when the cloud does not say.
   */
  push(records: R[]): Promise<(number | null)[]>;
}

/** What this device knows of the cloud, between two synchronizations. */
export interface SyncState<V> {
  /** The last counter that this device got. */
  counter: number;
  /** For each record id, the newest record that the cloud got or gave. */
  cloud: Record<string, V>;
}

export interface SyncStore<V> {
  read(): SyncState<V>;
  write(state: SyncState<V>): void;
}

/** The records of this device. */
export interface SyncLocal<R> {
  list(): Promise<R[]>;
  /** Store the record when it is newer than the stored one. */
  apply(record: R): Promise<void>;
}

/** The rules of one type of record. `V` is what orders two records. */
export interface SyncRecords<R, V> {
  parse(raw: unknown): R | null;
  id(record: R): string;
  version(record: R): V;
  /** True when `incoming` wins over `current`, as the local store decides. */
  isNewer(incoming: V, current: V): boolean;
}

export function isCounter(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** A page of a route, or null when the response is not a page. */
export function parseSyncPage(page: unknown): SyncPage | null {
  if (
    !isObject(page) ||
    !Array.isArray(page.records) ||
    !isCounter(page.counter) ||
    typeof page.more !== 'boolean'
  ) {
    return null;
  }
  return { records: page.records, counter: page.counter, more: page.more };
}

/**
 * Keeps the last counter in the storage of the browser. It is a small value
 * beside the local database, so the local database keeps its version. When
 * the storage holds no valid value, the device reads all records again.
 *
 * `format` is the version of the records that this client can read. A read
 * skips a record that the client cannot read, and the counter moves past it.
 * So a client that reads more must have a larger `format`: the stored state
 * of a different format is not valid, and the device reads from counter 0.
 */
export function createSyncStore<V>(
  storage: () => Pick<Storage, 'getItem' | 'setItem'>,
  key: string,
  format: number,
  isVersion: (value: unknown) => boolean,
): SyncStore<V> {
  // With blocked or full storage, the state lasts until the page closes.
  let unsaved: SyncState<V> | null = null;
  const parse = (text: string | null): SyncState<V> | null => {
    const value: unknown = text === null ? null : JSON.parse(text);
    if (
      !isObject(value) ||
      value.format !== format ||
      !isCounter(value.counter) ||
      !isObject(value.cloud) ||
      !Object.values(value.cloud).every(isVersion)
    ) {
      return null;
    }
    return { counter: value.counter, cloud: value.cloud as Record<string, V> };
  };
  return {
    read() {
      try {
        const state = parse(storage().getItem(key));
        if (state) return state;
      } catch {
        // Blocked storage or a corrupt value.
      }
      return unsaved ?? { counter: 0, cloud: {} };
    },
    write(state) {
      try {
        const text = JSON.stringify({
          format,
          counter: state.counter,
          cloud: state.cloud,
        });
        if (storage().getItem(key) !== text) storage().setItem(key, text);
        unsaved = null;
      } catch {
        unsaved = state;
      }
    },
  };
}

/** Read page after page from `from.counter` until a page is not full. */
async function readChanges<R, V>(
  rules: SyncRecords<R, V>,
  local: SyncLocal<R>,
  cloud: SyncCloud<R>,
  from: SyncState<V>,
): Promise<SyncState<V>> {
  const state = { counter: from.counter, cloud: { ...from.cloud } };
  for (;;) {
    const page = await cloud.pull(state.counter);
    for (const raw of page.records) {
      const record = rules.parse(raw);
      if (!record) continue;
      // `apply` compares inside the IndexedDB transaction, protecting edits
      // or deletions made while the network request was in flight.
      await local.apply(record);
      state.cloud[rules.id(record)] = rules.version(record);
    }
    // A full page must move the counter, or the read would never end.
    if (page.counter < state.counter + (page.more ? 1 : 0)) {
      throw new Error('Invalid sync response');
    }
    state.counter = page.counter;
    if (!page.more) return state;
  }
}

/**
 * Local-first, last-write-wins synchronization. The read moves only the
 * records that the cloud got after the last counter of this device. The write
 * moves only the local records that are newer than the record that the cloud
 * has. When the local database does not agree with what the device knows of
 * the cloud, the device reads all records again.
 */
export async function synchronizeRecords<R, V>(
  rules: SyncRecords<R, V>,
  local: SyncLocal<R>,
  cloud: SyncCloud<R>,
  store: SyncStore<V>,
): Promise<void> {
  /** The valid local records, each with what the device knows of the cloud. */
  const compare = (records: R[], known: Record<string, V>) =>
    records.flatMap((raw) => {
      const record = rules.parse(raw);
      if (!record) return [];
      const id = rules.id(record);
      return [{ record, version: rules.version(record), cloud: known[id] }];
    });

  const stored = store.read();
  let state = await readChanges(rules, local, cloud, stored);
  const records = await local.list();
  let items = compare(records, state.cloud);
  const localIds = new Set(records.map(rules.id));
  // The local database lost records that the cloud has, for example after a
  // deletion of the browser data.
  const lost = Object.keys(stored.cloud).some((id) => !localIds.has(id));
  // A local record loses to the record of the cloud, for example a change
  // from a device with a slow clock. The write would skip it, and a read from
  // the last counter would never bring the record of the cloud back.
  const behind = items.some(
    (item) =>
      item.cloud !== undefined && rules.isNewer(item.cloud, item.version),
  );
  if (lost || behind) {
    // The stored counter is too far. A read from the start applies each
    // record of the cloud again, so the device agrees with the cloud.
    state = await readChanges(rules, local, cloud, { counter: 0, cloud: {} });
    items = compare(await local.list(), state.cloud);
  }
  store.write(state);
  const ahead = items.flatMap((item) =>
    item.cloud === undefined || rules.isNewer(item.version, item.cloud)
      ? [item.record]
      : [],
  );
  try {
    for (let start = 0; start < ahead.length; start += cloud.writeLimit) {
      const batch = ahead.slice(start, start + cloud.writeLimit);
      const counters = await cloud.push(batch);
      batch.forEach((record, index) => {
        state.cloud[rules.id(record)] = rules.version(record);
        // Counters have no equal values. When this write got the next one, no
        // write of a different device is before it, and the device does not
        // read its own record again.
        if (counters[index] === state.counter + 1) state.counter += 1;
      });
    }
  } finally {
    store.write(state);
  }
}
