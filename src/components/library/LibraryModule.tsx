import { useEffect, useState } from 'react';
import LibraryTrackList from './LibraryTrackList';
import LibraryTrackDetail from './LibraryTrackDetail';
import RocksmithChartList from './RocksmithChartList';
import RocksmithTrackDetail from './RocksmithTrackDetail';
import { fetchLibraryIndex, type LibraryIndexEntry } from './libraryData';
import { useRocksmithCharts } from '@/hooks/useRocksmithCharts';

type Selection =
  | { kind: 'analysis'; sha: string }
  | { kind: 'rocksmith'; id: string };

export default function LibraryModule() {
  const [tracks, setTracks] = useState<LibraryIndexEntry[] | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { charts, importStatus, importFile, remove } = useRocksmithCharts();

  useEffect(() => {
    const controller = new AbortController();
    fetchLibraryIndex(controller.signal)
      .then((index) => {
        setTracks(index.tracks);
        setSelection((current) => {
          if (current) return current;
          const first = index.tracks[0]?.source_sha256;
          return first ? { kind: 'analysis', sha: first } : null;
        });
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
      });
    return () => controller.abort();
  }, []);

  const selectedTrack =
    selection?.kind === 'analysis'
      ? (tracks?.find((t) => t.source_sha256 === selection.sha) ?? null)
      : null;
  const selectedChart =
    selection?.kind === 'rocksmith'
      ? (charts.find((c) => c.id === selection.id) ?? null)
      : null;

  const handleImport = async (file: File) => {
    const chart = await importFile(file);
    if (chart) setSelection({ kind: 'rocksmith', id: chart.id });
  };

  return (
    <section className="section-panel flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="font-heading text-lg text-text-primary">Biblioteca</h2>
        <p className="text-xs text-text-muted">
          Análise automática de cifra, tom e andamento das faixas processadas
          pelo pipeline off-line, e linhas de baixo importadas do Rocksmith.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,280px)_minmax(0,1fr)]">
        <div className="flex flex-col gap-4 min-w-0">
          <RocksmithChartList
            charts={charts}
            selectedId={selection?.kind === 'rocksmith' ? selection.id : null}
            importStatus={importStatus}
            onSelect={(c) => setSelection({ kind: 'rocksmith', id: c.id })}
            onImport={(file) => void handleImport(file)}
          />

          <div className="flex flex-col gap-2">
            <h3 className="font-heading text-xs uppercase tracking-wide text-text-muted">
              Faixas analisadas
            </h3>
            {error && (
              <p className="text-sm text-red-400">
                Falha ao carregar o índice da biblioteca: {error}
              </p>
            )}
            {!tracks && !error && (
              <p className="text-sm text-text-muted">Carregando biblioteca…</p>
            )}
            {tracks && (
              <LibraryTrackList
                tracks={tracks}
                selectedSha={
                  selection?.kind === 'analysis' ? selection.sha : null
                }
                onSelect={(t) =>
                  setSelection({ kind: 'analysis', sha: t.source_sha256 })
                }
              />
            )}
          </div>
        </div>

        {selectedChart ? (
          <RocksmithTrackDetail
            key={selectedChart.id}
            chart={selectedChart}
            onRemove={() => {
              setSelection(null);
              void remove(selectedChart.id);
            }}
          />
        ) : selectedTrack ? (
          <LibraryTrackDetail
            key={selectedTrack.source_sha256}
            track={selectedTrack}
          />
        ) : (
          <p className="text-sm text-text-muted">
            Selecione uma faixa para ver a cifra detectada.
          </p>
        )}
      </div>
    </section>
  );
}
