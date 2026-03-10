import { useCallback, useEffect, useRef, useState } from 'react';
import {
  initDB,
  waitForSync,
  getAllStructures,
  saveStructure,
  updateStructure,
  deleteStructure,
} from '@/services/db';
import type { SongStructure, StructureBar, StructureSection } from '@/types';

export function useStructures() {
  const [structures, setStructures] = useState<SongStructure[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const cancelled = useRef(false);

  const refresh = useCallback(async () => {
    await initDB();
    if (cancelled.current) return;
    setStructures(getAllStructures());
    // Re-read after cloud sync merges remote data
    waitForSync().then(() => {
      if (!cancelled.current) {
        setStructures(getAllStructures());
      }
    });
  }, []);

  useEffect(() => {
    cancelled.current = false;
    setIsLoading(true);
    setError(null);
    refresh()
      .catch(() => {
        if (!cancelled.current) setError('Erro ao carregar estruturas');
      })
      .finally(() => {
        if (!cancelled.current) setIsLoading(false);
      });
    return () => {
      cancelled.current = true;
    };
  }, [refresh]);

  const save = useCallback(
    async (structure: {
      title: string;
      artist: string;
      bpm: number;
      bars: StructureBar[];
      sections: StructureSection[];
    }) => {
      try {
        await initDB();
        const id = saveStructure(structure);
        if (!cancelled.current) {
          setStructures(getAllStructures());
        }
        return id;
      } catch {
        throw new Error('Erro ao salvar estrutura');
      }
    },
    []
  );

  const update = useCallback(
    async (
      id: string,
      updates: Partial<{
        title: string;
        artist: string;
        bpm: number;
        bars: StructureBar[];
        sections: StructureSection[];
      }>
    ) => {
      try {
        await initDB();
        updateStructure(id, updates);
        if (!cancelled.current) {
          setStructures(getAllStructures());
        }
      } catch {
        throw new Error('Erro ao atualizar estrutura');
      }
    },
    []
  );

  const remove = useCallback(async (id: string) => {
    try {
      await initDB();
      deleteStructure(id);
      if (!cancelled.current) {
        setStructures(getAllStructures());
      }
    } catch {
      throw new Error('Erro ao remover estrutura');
    }
  }, []);

  return { structures, isLoading, error, save, update, remove };
}
