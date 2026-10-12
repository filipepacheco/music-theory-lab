import { useEffect, useMemo, useState } from 'react';
import LibraryTrackDetail from './LibraryTrackDetail';
import RocksmithChartList from './RocksmithChartList';
import RocksmithTrackDetail from './RocksmithTrackDetail';
import { fetchLibraryIndex, type LibraryIndexEntry } from './libraryData';
import { useRocksmithCharts } from '@/hooks/useRocksmithCharts';
import {
  groupLibrarySongs,
  songJoinedByImport,
  type LibrarySong,
} from '@/domain/librarySong';
import { summarizeChart } from '@/domain/chartSummary';
import Frame from '@/components/shared/Frame';

type Selection =
  | { kind: 'analysis'; sha: string }
  | { kind: 'rocksmith'; id: string };

export default function LibraryModule() {
  const [tracks, setTracks] = useState<LibraryIndexEntry[] | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [joinMessage, setJoinMessage] = useState<string | null>(null);
  const {
    summaries,
    openChart,
    open,
    importStatus,
    importFile,
    remove,
    syncStatus,
    synchronize,
  } = useRocksmithCharts();

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

  const analysedRefs = useMemo(
    () =>
      (tracks ?? []).map((track) => ({
        sha: track.source_sha256,
        title: track.title,
        artist: track.artist,
        durationSeconds: track.duration_seconds,
      })),
    [tracks],
  );
  const songs = useMemo(
    () => groupLibrarySongs(summaries, analysedRefs),
    [summaries, analysedRefs],
  );
  const selectedKey =
    songs.find((song) =>
      selection?.kind === 'analysis'
        ? song.analysed.some((track) => track.sha === selection.sha)
        : song.charts.some((chart) => chart.id === selection?.id),
    )?.key ?? null;

  const selectSong = (song: LibrarySong) => {
    setJoinMessage(null);
    if (song.best.kind === 'chart') {
      setSelection({ kind: 'rocksmith', id: song.best.id });
      void open(song.best.id);
    } else {
      setSelection({ kind: 'analysis', sha: song.best.sha });
    }
  };

  const selectedTrack =
    selection?.kind === 'analysis'
      ? (tracks?.find((t) => t.source_sha256 === selection.sha) ?? null)
      : null;
  const selectedChart =
    selection?.kind === 'rocksmith' && openChart?.id === selection.id
      ? openChart
      : null;

  const handleImport = async (file: File) => {
    setJoinMessage(null);
    const before = summaries;
    const chart = await importFile(file);
    if (chart) {
      const joined = songJoinedByImport(
        before,
        analysedRefs,
        summarizeChart(chart),
      );
      if (joined) {
        setJoinMessage(
          `O arquivo entrou na música existente "${joined.title}".`,
        );
      }
      setSelection({ kind: 'rocksmith', id: chart.id });
      void open(chart.id);
    }
  };

  return (
    <Frame
      as="section"
      title="Biblioteca"
      titleAs="h2"
      className="flex flex-col gap-4"
    >
      <p className="text-xs text-text-muted">
        Análise automática de cifra, tom e andamento das faixas processadas pelo
        pipeline off-line, e linhas de baixo importadas do Rocksmith ou de
        arquivos MIDI e Guitar Pro (.gp).
      </p>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,280px)_minmax(0,1fr)]">
        <div className="flex flex-col gap-4 min-w-0">
          <RocksmithChartList
            songs={songs}
            selectedKey={selectedKey}
            importStatus={importStatus}
            onSelect={selectSong}
            onImport={(file) => void handleImport(file)}
          />
          {error && (
            <p className="text-sm text-danger">
              Falha ao carregar o índice da biblioteca: {error}
            </p>
          )}
          {joinMessage && (
            <p role="status" className="text-small text-text-muted">
              {joinMessage}
            </p>
          )}
          <p role="status" className="text-small text-text-muted">
            {syncStatus === 'syncing'
              ? 'Sincronizando linhas de baixo…'
              : syncStatus === 'synced'
                ? 'Linhas de baixo salvas on-line. Áudio vinculado fica neste dispositivo.'
                : 'Sem sincronização: as linhas salvas neste dispositivo serão reenviadas.'}
            {syncStatus === 'offline' && (
              <button
                type="button"
                onClick={() => void synchronize()}
                className="ml-1 text-accent underline"
              >
                Tentar novamente
              </button>
            )}
          </p>
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
    </Frame>
  );
}
