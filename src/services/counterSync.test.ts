import { describe, expect, it } from 'vitest';
import {
  createSyncStore,
  synchronizeRecords,
  type SyncCloud,
  type SyncLocal,
  type SyncRecords,
} from '@/services/counterSync';

interface Note {
  id: string;
  at: number;
  kind: string;
}

function rulesFor(kinds: string[]): SyncRecords<Note, number> {
  return {
    parse: (raw) => {
      const note = raw as Note;
      return kinds.includes(note.kind) ? note : null;
    },
    id: (note) => note.id,
    version: (note) => note.at,
    isNewer: (incoming, current) => incoming > current,
  };
}
const basic = rulesFor(['basic']);

function memory() {
  const notes = new Map<string, Note>();
  return {
    notes,
    list: async () => [...notes.values()],
    apply: async (note: Note) => {
      const current = notes.get(note.id);
      if (!current || note.at > current.at) notes.set(note.id, note);
    },
  } satisfies SyncLocal<Note> & { notes: Map<string, Note> };
}

function cloud() {
  const rows = new Map<string, { note: Note; counter: number }>();
  let last = 0;
  const fake = {
    writeLimit: 100,
    reads: [] as number[],
    writes: [] as string[],
    note: (id: string) => rows.get(id)?.note,
    async pull(after: number) {
      fake.reads.push(after);
      const page = [...rows.values()]
        .filter((row) => row.counter > after)
        .sort((a, b) => a.counter - b.counter);
      return {
        records: page.map((row) => row.note) as unknown[],
        counter: page.length > 0 ? page[page.length - 1].counter : after,
        more: false,
      };
    },
    async push(notes: Note[]) {
      return notes.map((note) => {
        fake.writes.push(note.id);
        const current = rows.get(note.id);
        if (!current || note.at > current.note.at) {
          rows.set(note.id, { note, counter: ++last });
        }
        const row = rows.get(note.id)!;
        return row.note.at === note.at ? row.counter : null;
      });
    },
  };
  return fake satisfies SyncCloud<Note>;
}

function storage() {
  const items = new Map<string, string>();
  return {
    items,
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
  };
}

const store = (items: ReturnType<typeof storage>, format: number) =>
  createSyncStore<number>(
    () => items,
    'notes',
    format,
    (value) => typeof value === 'number',
  );

describe('the format version of the stored sync state', () => {
  async function withSkippedRecord() {
    const remote = cloud();
    await remote.push([
      { id: 'a', at: 1, kind: 'basic' },
      { id: 'b', at: 1, kind: 'drums' },
      { id: 'c', at: 1, kind: 'basic' },
    ]);
    const local = memory();
    const items = storage();
    await synchronizeRecords(basic, local, remote, store(items, 1));
    expect([...local.notes.keys()]).toEqual(['a', 'c']);
    remote.reads.length = 0;
    remote.writes.length = 0;
    return { remote, local, items };
  }

  it('holds the format beside the counter', async () => {
    const { items } = await withSkippedRecord();
    expect(JSON.parse(items.items.get('notes')!)).toEqual({
      format: 1,
      counter: 3,
      cloud: { a: 1, c: 1 },
    });
  });

  it('reads from the last counter when the format is the same, so a skipped record stays away', async () => {
    const { remote, local, items } = await withSkippedRecord();
    const later = rulesFor(['basic', 'drums']);
    await synchronizeRecords(later, local, remote, store(items, 1));
    expect(remote.reads).toEqual([3]);
    expect(local.notes.has('b')).toBe(false);
  });

  it('reads from counter 0 when the format of the client changes, and gets the record that the earlier client skipped', async () => {
    const { remote, local, items } = await withSkippedRecord();
    const later = rulesFor(['basic', 'drums']);
    await synchronizeRecords(later, local, remote, store(items, 2));
    expect(remote.reads).toEqual([0]);
    expect([...local.notes.keys()].sort()).toEqual(['a', 'b', 'c']);
    expect(remote.writes).toEqual([]);
    expect(JSON.parse(items.items.get('notes')!)).toMatchObject({
      format: 2,
      counter: 3,
    });

    remote.reads.length = 0;
    await synchronizeRecords(later, local, remote, store(items, 2));
    expect(remote.reads).toEqual([3]);
  });

  it('reads from counter 0 with the state of a client that stored no format', async () => {
    const { remote, local, items } = await withSkippedRecord();
    items.items.set('notes', JSON.stringify({ counter: 3, cloud: { a: 1 } }));
    await synchronizeRecords(basic, local, remote, store(items, 1));
    expect(remote.reads).toEqual([0]);
  });
});

describe('a local record that loses to the record of the cloud', () => {
  it('gets the record of the cloud again with a read from the start', async () => {
    const remote = cloud();
    const [first, second] = [memory(), memory()];
    const [firstItems, secondItems] = [storage(), storage()];
    await first.apply({ id: 'a', at: 50, kind: 'basic' });
    await first.apply({ id: 'b', at: 50, kind: 'basic' });
    await synchronizeRecords(basic, first, remote, store(firstItems, 1));
    await synchronizeRecords(basic, second, remote, store(secondItems, 1));

    second.notes.set('a', { id: 'a', at: 10, kind: 'basic' });
    remote.reads.length = 0;
    remote.writes.length = 0;
    await synchronizeRecords(basic, second, remote, store(secondItems, 1));
    expect(remote.reads).toEqual([2, 0]);
    expect(second.notes.get('a')).toEqual({ id: 'a', at: 50, kind: 'basic' });
    expect(remote.note('a')?.at).toBe(50);
    expect(remote.writes).toEqual([]);

    remote.reads.length = 0;
    await synchronizeRecords(basic, second, remote, store(secondItems, 1));
    expect(remote.reads).toEqual([2]);
  });

  it('reads from the last counter when each local record is equal to the record of the cloud or newer', async () => {
    const remote = cloud();
    const local = memory();
    const items = storage();
    await local.apply({ id: 'a', at: 50, kind: 'basic' });
    await synchronizeRecords(basic, local, remote, store(items, 1));
    local.notes.set('a', { id: 'a', at: 60, kind: 'basic' });
    remote.reads.length = 0;
    await synchronizeRecords(basic, local, remote, store(items, 1));
    expect(remote.reads).toEqual([1]);
    expect(remote.note('a')?.at).toBe(60);
  });
});
