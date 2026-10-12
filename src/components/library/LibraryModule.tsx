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
import { useLibraryRoute } from '@/components/library/useLibraryRoute';
import {
  choiceOfTarget,
  formatLibraryRoute,
  resolveSongRoute,
  routeOfChart,
  routeOfSong,
  routeOfSource,
  songSourceChoices,
  type SourceChoice,
} from '@/domain/libraryRoute';
import Segmented from '@/components/shared/Segmented';
import {
  readLastSource,
  writeLastSource,
} from '@/components/library/lastSource';

const SOURCE_CHOICE_LABEL: Record<SourceChoice, string> = {
  gp: 'Guitar Pro',
  rocksmith: 'Rocksmith',
  midi: 'MIDI',
  analise: 'Análise',
};

export default function LibraryModule() {
  const [tracks, setTracks] = useState<LibraryIndexEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [joinMessage, setJoinMessage] = useState<string | null>(null);
  const [settled, setSettled] = useState(false);
  const { route, navigate } = useLibraryRoute();
  const {
    summaries,
    openId,
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
  const resolved = useMemo(
    () => (route.screen === 'song' ? resolveSongRoute(songs, route) : null),
    [songs, route],
  );
  const target = resolved?.target ?? null;
  const currentChoice =
    resolved && target ? choiceOfTarget(resolved.song, target) : null;
  const choices = resolved ? songSourceChoices(resolved.song) : [];
  const songKeyOpen = resolved?.song.key ?? null;
  const targetChartId = target?.kind === 'chart' ? target.id : null;

  // The first load is over when the index answered and one sync ended.
  useEffect(() => {
    if ((tracks !== null || error !== null) && syncStatus !== 'syncing') {
      setSettled(true);
    }
  }, [tracks, error, syncStatus]);

  useEffect(() => {
    if (targetChartId && openId !== targetChartId) void open(targetChartId);
  }, [targetChartId, openId, open]);

  // The device keeps the source that the song screen shows, for each song.
  useEffect(() => {
    if (songKeyOpen && currentChoice)
      writeLastSource(songKeyOpen, currentChoice);
  }, [songKeyOpen, currentChoice]);

  const selectSong = (song: LibrarySong) => {
    setJoinMessage(null);
    navigate(routeOfSong(song, readLastSource(song.key)));
  };

  const selectSource = (choice: SourceChoice) => {
    if (!resolved) return;
    navigate(
      routeOfSource(
        resolved.song,
        choice,
        route.screen === 'song' ? route.part : undefined,
      ),
    );
  };

  const selectedTrack =
    target?.kind === 'analysis'
      ? (tracks?.find((t) => t.source_sha256 === target.sha) ?? null)
      : null;
  const selectedChart =
    targetChartId && openChart?.id === targetChartId ? openChart : null;

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
      const added = summarizeChart(chart);
      const song = groupLibrarySongs(
        [...before.filter((item) => item.id !== added.id), added],
        analysedRefs,
      ).find((item) => item.charts.some((c) => c.id === added.id));
      if (song) navigate(routeOfChart(song.key, added.source, added.part));
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

      {resolved ? (
        <div className="flex min-w-0 flex-col gap-4">
          <a
            href={formatLibraryRoute({ screen: 'list' })}
            className="self-start text-small text-accent underline"
          >
            ← Voltar para a lista
          </a>
          {joinMessage && (
            <p role="status" className="text-small text-text-muted">
              {joinMessage}
            </p>
          )}
          {choices.length > 1 && currentChoice && (
            <Segmented<SourceChoice>
              label="Fonte"
              value={currentChoice}
              onChange={selectSource}
              options={choices.map((choice) => ({
                value: choice,
                label: SOURCE_CHOICE_LABEL[choice],
              }))}
              className="self-start"
            />
          )}
          {selectedChart ? (
            <RocksmithTrackDetail
              key={selectedChart.id}
              chart={selectedChart}
              onRemove={() => {
                navigate({ screen: 'list' });
                void remove(selectedChart.id);
              }}
            />
          ) : selectedTrack ? (
            <LibraryTrackDetail
              key={selectedTrack.source_sha256}
              track={selectedTrack}
            />
          ) : (
            <p role="status" className="text-sm text-text-muted">
              Abrindo a música…
            </p>
          )}
        </div>
      ) : (
        <div className="flex min-w-0 flex-col gap-4">
          {route.screen === 'song' && settled && (
            <p role="alert" className="text-sm text-danger">
              Nenhuma música da biblioteca tem este endereço. Escolha uma na
              lista.
            </p>
          )}
          {route.screen === 'song' && !settled && (
            <p role="status" className="text-small text-text-muted">
              Abrindo a música…
            </p>
          )}
          <RocksmithChartList
            songs={songs}
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
      )}
    </Frame>
  );
}
