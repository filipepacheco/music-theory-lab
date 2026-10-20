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

    void savedLibrary.waitUntilSynchronized().then(async () => {
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
