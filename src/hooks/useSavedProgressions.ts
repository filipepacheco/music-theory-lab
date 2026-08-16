import { useCallback, useEffect, useRef, useState } from 'react';
import { savedLibrary, type SavedProgression } from '@/services/savedLibrary';
import type { ProgressionStep } from '@/constants/progressions';

export function useSavedProgressions(mode?: 'major' | 'minor') {
  const [progressions, setProgressions] = useState<SavedProgression[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const cancelled = useRef(false);

  const refresh = useCallback(async () => {
    await savedLibrary.initialize();
    if (cancelled.current) return;
    setProgressions(savedLibrary.progressions.list(mode));
    savedLibrary.waitUntilSynchronized().then(() => {
      if (!cancelled.current) {
        setProgressions(savedLibrary.progressions.list(mode));
      }
    });
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
        await savedLibrary.initialize();
        savedLibrary.progressions.save(prog);
        if (!cancelled.current) {
          setProgressions(savedLibrary.progressions.list(mode));
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
        await savedLibrary.initialize();
        savedLibrary.progressions.remove(id);
        if (!cancelled.current) {
          setProgressions(savedLibrary.progressions.list(mode));
        }
      } catch {
        throw new Error('Erro ao remover progressao');
      }
    },
    [mode],
  );

  return { progressions, isLoading, error, save, remove };
}
