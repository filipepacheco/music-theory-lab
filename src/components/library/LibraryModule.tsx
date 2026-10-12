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
import { DEFAULT_LIST_VIEW, type ListView } from '@/domain/libraryListView';
import { useLinkedRecordings } from '@/components/library/useLinkedRecordings';
import { useListScroll } from '@/components/library/useListScroll';
import { summarizeChart } from '@/domain/chartSummary';
import { isDrumChart } from '@/domain/drumChart';
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
import GroupOverrideControl from '@/components/library/GroupOverrideControl';
import { useGroupOverrides } from '@/components/library/useGroupOverrides';
import { useLineLengthMigration } from '@/components/library/useLineLengthMigration';
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
  // Lives here, not in the list, so it survives a visit to a song screen.
  const [listView, setListView] = useState<ListView>(DEFAULT_LIST_VIEW);
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
    settingsRevision,
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
  const lineLengthCopies = useLineLengthMigration();
  // The chart settings reload after each synchronization of them: one can
  // bring settings of a different device and leave `summaries` as it is.
  const settingsKey = useMemo(
    () => [summaries, lineLengthCopies, settingsRevision],
    [summaries, lineLengthCopies, settingsRevision],
  );
  const { overrides, setOverride } = useGroupOverrides(settingsKey);
  const songs = useMemo(
    () => groupLibrarySongs(summaries, analysedRefs, overrides),
    [summaries, analysedRefs, overrides],
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
  const listShown = !resolved;
  const linkedChartIds = useLinkedRecordings(listShown);
  useListScroll(listShown);

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

  /** Store a group override, then show the song that now holds the chart. */
  const correctGroup = async (chartId: string, override: string | null) => {
    setJoinMessage(null);
    await setOverride(chartId, override);
    const next = { ...overrides };
    if (override) next[chartId] = override;
    else delete next[chartId];
    const chart = summaries.find((item) => item.id === chartId);
    const song = groupLibrarySongs(summaries, analysedRefs, next).find((item) =>
      item.charts.some((c) => c.id === chartId),
    );
    if (song && chart)
      navigate(routeOfChart(song.key, chart.source, chart.part));
  };

  const handleImport = async (file: File) => {
    setJoinMessage(null);
    const before = summaries;
    const chart = await importFile(file);
    if (chart) {
      // The group overrides count here too: a chart that was moved or
      // separated opens on the song that holds it, not on the calculated one.
      const joined = songJoinedByImport(
        before,
        analysedRefs,
        summarizeChart(chart),
        overrides,
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
        overrides,
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
          {targetChartId && resolved && (
            <GroupOverrideControl
              song={resolved.song}
              targets={songs.filter(
                (item) =>
                  item.key !== resolved.song.key &&
                  !item.key.startsWith('separate:'),
              )}
              overridden={targetChartId in overrides}
              onMove={(key) => void correctGroup(targetChartId, key)}
              onSeparate={() => void correctGroup(targetChartId, 'separate')}
              onRemove={() => void correctGroup(targetChartId, null)}
            />
          )}
          {selectedChart && isDrumChart(selectedChart) ? (
            <p role="status" className="text-sm text-text-muted">
              Esta parte é de bateria. A visualização da bateria ainda não está
              disponível.
            </p>
          ) : selectedChart ? (
            <RocksmithTrackDetail
              key={selectedChart.id}
              settingsKey={settingsKey}
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
            view={listView}
            onViewChange={setListView}
            linkedChartIds={linkedChartIds}
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
