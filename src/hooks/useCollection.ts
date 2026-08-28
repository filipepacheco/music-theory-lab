import { useCallback, useEffect, useRef, useState } from 'react';
import { savedLibrary } from '@/services/savedLibrary';

export interface CollectionAdapter<T, SaveInput, UpdateInput> {
  list: () => Promise<T[]>;
  save?: (input: SaveInput) => Promise<string | void>;
  update?: (id: string, updates: UpdateInput) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export interface CollectionLabels {
  load: string;
  save: string;
  update: string;
  remove: string;
}

/**
 * The one collection-observation adapter: loads on mount, re-reads after
 * cloud sync merges, and re-lists after each CRUD operation. Replace
 * per-entity hook copies with one generated hook per collection.
 */
export function useCollection<T, SaveInput, UpdateInput = never>(
  collection: CollectionAdapter<T, SaveInput, UpdateInput>,
  labels: CollectionLabels,
) {
  const [items, setItems] = useState<T[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const cancelled = useRef(false);

  const refresh = useCallback(async () => {
    const first = await collection.list();
    if (cancelled.current) return;
    setItems(first);

    // Re-read after the background cloud sync merges remote records.
    // Deliberately not chained into the outer promise: loading must clear
    // on the first read, not wait for the network.
    savedLibrary.waitUntilSynchronized().then(async () => {
      if (!cancelled.current) setItems(await collection.list());
    });
  }, [collection]);

  useEffect(() => {
    cancelled.current = false;
    setIsLoading(true);
    setError(null);
    refresh()
      .catch(() => {
        if (!cancelled.current) setError(labels.load);
      })
      .finally(() => {
        if (!cancelled.current) setIsLoading(false);
      });
    return () => {
      cancelled.current = true;
    };
  }, [refresh, labels.load]);

  // The library re-syncs when the tab regains focus (savedLibrary); keep the
  // visible list in step. refresh() itself re-reads after the sync settles,
  // so the final state always lands.
  useEffect(() => {
    const onFocus = () => {
      refresh().catch(() => {});
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refresh]);

  const save = useCallback(
    async (input: SaveInput) => {
      if (!collection.save) return;
      try {
        const id = await collection.save(input);
        if (!cancelled.current) setItems(await collection.list());
        return id;
      } catch {
        throw new Error(labels.save);
      }
    },
    [collection, labels.save],
  );

  const update = useCallback(
    async (id: string, updates: UpdateInput) => {
      if (!collection.update) return;
      try {
        await collection.update(id, updates);
        if (!cancelled.current) setItems(await collection.list());
      } catch {
        throw new Error(labels.update);
      }
    },
    [collection, labels.update],
  );

  const remove = useCallback(
    async (id: string) => {
      try {
        await collection.remove(id);
        if (!cancelled.current) setItems(await collection.list());
      } catch {
        throw new Error(labels.remove);
      }
    },
    [collection, labels.remove],
  );

  return { items, isLoading, error, save, update, remove };
}
