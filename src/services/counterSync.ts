export interface SyncPage {
  records: unknown[];
  counter: number;
  more: boolean;
}

export interface SyncCloud<R> {
  pull(after: number): Promise<SyncPage>;
  writeLimit: number;
  push(records: R[]): Promise<(number | null)[]>;
}

export interface SyncState<V> {
  counter: number;
  cloud: Record<string, V>;
}

export interface SyncStore<V> {
  read(): SyncState<V>;
  write(state: SyncState<V>): void;
}

export interface SyncLocal<R> {
  list(): Promise<R[]>;
  apply(record: R): Promise<void>;
}

export interface SyncRecords<R, V> {
  parse(raw: unknown): R | null;
  id(record: R): string;
  version(record: R): V;
  isNewer(incoming: V, current: V): boolean;
}

export function isCounter(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

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

export function createSyncStore<V>(
  storage: () => Pick<Storage, 'getItem' | 'setItem'>,
  key: string,
  format: number,
  isVersion: (value: unknown) => boolean,
): SyncStore<V> {
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
      } catch {}
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
      await local.apply(record);
      state.cloud[rules.id(record)] = rules.version(record);
    }
    if (page.counter < state.counter + (page.more ? 1 : 0)) {
      throw new Error('Invalid sync response');
    }
    state.counter = page.counter;
    if (!page.more) return state;
  }
}

export async function synchronizeRecords<R, V>(
  rules: SyncRecords<R, V>,
  local: SyncLocal<R>,
  cloud: SyncCloud<R>,
  store: SyncStore<V>,
): Promise<void> {
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
  const lost = Object.keys(stored.cloud).some((id) => !localIds.has(id));
  const behind = items.some(
    (item) =>
      item.cloud !== undefined && rules.isNewer(item.cloud, item.version),
  );
  if (lost || behind) {
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
        if (counters[index] === state.counter + 1) state.counter += 1;
      });
    }
  } finally {
    store.write(state);
  }
}
