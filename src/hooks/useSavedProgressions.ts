import { useMemo } from 'react';
import { useCollection } from '@/hooks/useCollection';
import { savedLibrary } from '@/services/savedLibrary';
import type { ProgressionStep } from '@/constants/progressions';

export type ProgressionInput = {
  name: string;
  description: string;
  steps: ProgressionStep[];
  mode: 'major' | 'minor';
  presetId: string;
  bpm: number;
};

const progressionLabels = {
  load: 'Erro ao carregar progressoes',
  save: 'Erro ao salvar progressao',
  update: 'Erro ao atualizar progressao',
  remove: 'Erro ao remover progressao',
};

export function useSavedProgressions(mode?: 'major' | 'minor') {
  const collection = useMemo(
    () => ({
      list: () => savedLibrary.progressions.list(mode),
      save: (prog: ProgressionInput) => savedLibrary.progressions.save(prog),
      remove: (id: string) => savedLibrary.progressions.remove(id),
    }),
    [mode],
  );

  const { items, isLoading, error, save, remove } = useCollection(
    collection,
    progressionLabels,
  );

  const saveProgression = async (prog: ProgressionInput): Promise<void> => {
    await save(prog);
  };

  return {
    progressions: items,
    isLoading,
    error,
    save: saveProgression,
    remove,
  };
}
