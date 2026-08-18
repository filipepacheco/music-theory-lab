import { useCollection } from '@/hooks/useCollection';
import { savedLibrary } from '@/services/savedLibrary';
import type { SongSection } from '@/types';

export type SongInput = {
  title: string;
  artist: string;
  key: number;
  mode: 'major' | 'minor';
  originalBpm: number;
  presetId: string;
  sections: SongSection[];
};

export type SongUpdates = Partial<SongInput>;

const songsCollection = {
  list: () => savedLibrary.songs.list(),
  save: (song: SongInput) => savedLibrary.songs.save(song),
  update: (id: string, updates: SongUpdates) =>
    savedLibrary.songs.update(id, updates),
  remove: (id: string) => savedLibrary.songs.remove(id),
};

const songsLabels = {
  load: 'Erro ao carregar músicas',
  save: 'Erro ao salvar música',
  update: 'Erro ao atualizar música',
  remove: 'Erro ao remover música',
};

export function useSongs() {
  const { items, isLoading, error, save, update, remove } = useCollection(
    songsCollection,
    songsLabels,
  );

  const saveSong = async (song: SongInput): Promise<string | undefined> => {
    const id = await save(song);
    return id ?? undefined;
  };

  return {
    songs: items,
    isLoading,
    error,
    save: saveSong,
    update,
    remove,
  };
}
