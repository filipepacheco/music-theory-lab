import { useCallback, useEffect, useRef, useState } from 'react';
import {
  initDB,
  getAllProgressions,
  saveProgression,
  deleteProgression,
  type SavedProgression,
} from '@/services/db';
import type { ProgressionStep } from '@/constants/progressions';

export function useSavedProgressions(mode?: 'major' | 'minor') {
  const [progressions, setProgressions] = useState<SavedProgression[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const cancelled = useRef(false);

  const refresh = useCallback(async () => {
    await initDB();
    if (cancelled.current) return;
    setProgressions(getAllProgressions(mode));
  }, [mode]);

  useEffect(() => {
    cancelled.current = false;
    setIsLoading(true);
    setError(null);
    refresh()
      .catch(() => {
        if (!cancelled.current) setError('Erro ao carregar progressoes');
      })
      .finally(() => {
        if (!cancelled.current) setIsLoading(false);
      });
    return () => {
      cancelled.current = true;
    };
  }, [refresh]);

  const save = useCallback(
    async (prog: {
      name: string;
      description: string;
      steps: ProgressionStep[];
      mode: 'major' | 'minor';
      presetId: string;
      bpm: number;
    }) => {
      try {
        await initDB();
        saveProgression(prog);
        if (!cancelled.current) {
          setProgressions(getAllProgressions(mode));
        }
      } catch {
        throw new Error('Erro ao salvar progressao');
      }
    },
    [mode],
  );

  const remove = useCallback(
    async (id: string) => {
      try {
        await initDB();
        deleteProgression(id);
        if (!cancelled.current) {
          setProgressions(getAllProgressions(mode));
        }
      } catch {
        throw new Error('Erro ao remover progressao');
      }
    },
    [mode],
  );

  return { progressions, isLoading, error, save, remove };
}
