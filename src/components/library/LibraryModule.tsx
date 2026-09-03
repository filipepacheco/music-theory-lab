import { useEffect, useState } from 'react';
import LibraryTrackList from './LibraryTrackList';
import LibraryTrackDetail from './LibraryTrackDetail';
import { fetchLibraryIndex, type LibraryIndexEntry } from './libraryData';

export default function LibraryModule() {
  const [tracks, setTracks] = useState<LibraryIndexEntry[] | null>(null);
  const [selectedSha, setSelectedSha] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetchLibraryIndex(controller.signal)
      .then((index) => {
        setTracks(index.tracks);
        setSelectedSha((current) => current ?? index.tracks[0]?.source_sha256 ?? null);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
      });
    return () => controller.abort();
  }, []);

  const selected =
    tracks?.find((t) => t.source_sha256 === selectedSha) ?? null;

  return (
    <section className="section-panel flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="font-heading text-lg text-text-primary">Biblioteca</h2>
        <p className="text-xs text-text-muted">
          Análise automática de cifra, tom e andamento das faixas processadas
          pelo pipeline off-line.
        </p>
      </div>

      {error && (
        <p className="text-sm text-red-400">
          Falha ao carregar o índice da biblioteca: {error}
        </p>
      )}

      {!tracks && !error && (
        <p className="text-sm text-text-muted">Carregando biblioteca…</p>
      )}

      {tracks && (
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,280px)_1fr] gap-4">
          <LibraryTrackList
            tracks={tracks}
            selectedSha={selectedSha}
            onSelect={(t) => setSelectedSha(t.source_sha256)}
          />
          {selected ? (
            <LibraryTrackDetail track={selected} />
          ) : (
            <p className="text-sm text-text-muted">
              Selecione uma faixa para ver a cifra detectada.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
