import { useCallback, useEffect, useRef, useState } from 'react';
import { savedLibrary } from '@/services/savedLibrary';
import type { Song, SongSection } from '@/types';

export function useSongs() {
  const [songs, setSongs] = useState<Song[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const cancelled = useRef(false);

  const refresh = useCallback(async () => {
    await savedLibrary.initialize();
    if (cancelled.current) return;
    setSongs(savedLibrary.songs.list());
    savedLibrary.waitUntilSynchronized().then(() => {
      if (!cancelled.current) setSongs(savedLibrary.songs.list());
    });
  }, []);

  useEffect(() => {
    cancelled.current = false;
    setIsLoading(true);
    setError(null);
    refresh()
      .catch(() => {
        if (!cancelled.current) setError('Erro ao carregar musicas');
      })
      .finally(() => {
        if (!cancelled.current) setIsLoading(false);
      });
    return () => {
      cancelled.current = true;
    };
  }, [refresh]);

  const save = useCallback(
    async (song: {
      title: string;
      artist: string;
      key: number;
      mode: 'major' | 'minor';
      originalBpm: number;
      presetId: string;
      sections: SongSection[];
    }) => {
      try {
        await savedLibrary.initialize();
        const id = savedLibrary.songs.save(song);
        if (!cancelled.current) {
          setSongs(savedLibrary.songs.list());
        }
        return id;
      } catch {
        throw new Error('Erro ao salvar musica');
      }
    },
    [],
  );

  const update = useCallback(
    async (
      id: string,
      updates: Partial<{
        title: string;
        artist: string;
        key: number;
        mode: 'major' | 'minor';
        originalBpm: number;
        presetId: string;
        sections: SongSection[];
      }>,
    ) => {
      try {
        await savedLibrary.initialize();
        savedLibrary.songs.update(id, updates);
        if (!cancelled.current) {
          setSongs(savedLibrary.songs.list());
        }
      } catch {
        throw new Error('Erro ao atualizar musica');
      }
    },
    [],
  );

  const remove = useCallback(async (id: string) => {
    try {
      await savedLibrary.initialize();
      savedLibrary.songs.remove(id);
      if (!cancelled.current) {
        setSongs(savedLibrary.songs.list());
      }
    } catch {
      throw new Error('Erro ao remover musica');
    }
  }, []);

  return { songs, isLoading, error, save, update, remove };
}
