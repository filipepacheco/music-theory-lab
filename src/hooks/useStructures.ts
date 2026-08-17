import { useCollection } from '@/hooks/useCollection';
import { savedLibrary } from '@/services/savedLibrary';
import type { StructureBar, StructureSection } from '@/types';

export type StructureInput = {
  title: string;
  artist: string;
  bpm: number;
  bars: StructureBar[];
  sections: StructureSection[];
};

const structuresCollection = {
  list: () => savedLibrary.structures.list(),
  save: (structure: StructureInput) => savedLibrary.structures.save(structure),
  update: (id: string, updates: Partial<StructureInput>) =>
    savedLibrary.structures.update(id, updates),
  remove: (id: string) => savedLibrary.structures.remove(id),
};

const structureLabels = {
  load: 'Erro ao carregar estruturas',
  save: 'Erro ao salvar estrutura',
  update: 'Erro ao atualizar estrutura',
  remove: 'Erro ao remover estrutura',
};

export function useStructures() {
  return useCollection(structuresCollection, structureLabels);
}
