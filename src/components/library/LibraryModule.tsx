import { useEffect, useMemo, useState } from 'react';
import LibraryTrackDetail from './LibraryTrackDetail';
import RocksmithChartList from './RocksmithChartList';
import RocksmithTrackDetail from './RocksmithTrackDetail';
import DrumPartDetail from '@/components/library/DrumPartDetail';
import GuitarPartDetail from '@/components/library/GuitarPartDetail';
import { fetchLibraryIndex, type LibraryIndexEntry } from './libraryData';
import { useSongPartsPlayback } from '@/hooks/useSongPartsPlayback';
import { useRocksmithCharts } from '@/hooks/useRocksmithCharts';
import {
  groupLibrarySongs,
  moveTargets,
  songJoinedByImport,
  type LibrarySong,
} from '@/domain/librarySong';
import { DEFAULT_LIST_VIEW, type ListView } from '@/domain/libraryListView';
import { useLinkedRecordings } from '@/components/library/useLinkedRecordings';
import { useListScroll } from '@/components/library/useListScroll';
import {
  summarizeChart,
  type ChartPart,
  type ChartSummary,
} from '@/domain/chartSummary';
import { isDrumChart } from '@/domain/drumChart';
import { isGuitarChart } from '@/domain/guitarChart';
import Frame from '@/components/shared/Frame';
import '@/components/library/libraryLayout.css';
import { useLibraryRoute } from '@/components/library/useLibraryRoute';
import {
  choiceOfTarget,
  chartOfAddress,
  formatLibraryRoute,
  resolveSongRoute,
  chartsOfPart,
  routeOfChart,
  routeOfSong,
  routeOfSummary,
  routeOfSource,
  songPartChoices,
  songSourceChoices,
  type SourceChoice,
} from '@/domain/libraryRoute';
import GroupOverrideControl from '@/components/library/GroupOverrideControl';
import { useGroupOverrides } from '@/components/library/useGroupOverrides';
import { useLineLengthMigration } from '@/components/library/useLineLengthMigration';
import Segmented from '@/components/shared/Segmented';
import Select from '@/components/shared/Select';
import {
  readLastSource,
  writeLastSource,
} from '@/components/library/lastSource';

const NO_SONG_CHARTS: readonly ChartSummary[] = [];

const SOURCE_CHOICE_LABEL: Record<SourceChoice, string> = {
  gp: 'Guitar Pro',
  rocksmith: 'Rocksmith',
  midi: 'MIDI',
  analise: 'Análise',
};

const PART_CHOICE_LABEL: Record<ChartPart, string> = {
  bass: 'Baixo',
  drums: 'Bateria',
  guitar: 'Guitarra',
  vocals: 'Vocais',
};

interface BatchLine {
  name: string;
  text: string;
}

export default function LibraryModule() {
  const [tracks, setTracks] = useState<LibraryIndexEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [joinMessage, setJoinMessage] = useState<string | null>(null);
  const [batchReport, setBatchReport] = useState<BatchLine[] | null>(null);
  const [correctionError, setCorrectionError] = useState<string | null>(null);
  const [settled, setSettled] = useState(false);
  const { route, navigate } = useLibraryRoute();
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
  const parts =
    resolved && currentChoice
      ? songPartChoices(resolved.song, currentChoice)
      : [];
  const currentChart =
    resolved?.song.charts.find((chart) => chart.id === targetChartId) ?? null;
  const currentPart = currentChart?.part ?? null;
  const sameKind =
    resolved && currentChoice && currentPart
      ? chartsOfPart(resolved.song, currentChoice, currentPart)
      : [];
  const listShown = !resolved;
  const linkedChartIds = useLinkedRecordings(listShown);
  useListScroll(listShown);

  useEffect(() => {
    if ((tracks !== null || error !== null) && syncStatus !== 'syncing') {
      setSettled(true);
    }
  }, [tracks, error, syncStatus]);

  useEffect(() => {
    if (targetChartId && openId !== targetChartId) void open(targetChartId);
  }, [targetChartId, openId, open]);

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

  const selectPart = (part: ChartPart) => {
    const chart =
      resolved && currentChoice
        ? chartOfAddress(resolved.song, currentChoice, part)
        : undefined;
    if (resolved && chart)
      navigate(routeOfSummary(resolved.song.key, chart));
  };

  const selectPartName = (chartId: string) => {
    const chart = resolved?.song.charts.find((item) => item.id === chartId);
    if (resolved && chart) navigate(routeOfSummary(resolved.song.key, chart));
  };

  const selectedTrack =
    target?.kind === 'analysis'
      ? (tracks?.find((t) => t.source_sha256 === target.sha) ?? null)
      : null;
  const selectedChart =
    targetChartId && openChart?.id === targetChartId ? openChart : null;
  const selectedSummary =
    summaries.find((item) => item.id === targetChartId) ?? null;
  const songParts = useSongPartsPlayback(
    selectedSummary?.id ?? null,
    selectedSummary?.part ?? null,
    resolved?.song.charts ?? NO_SONG_CHARTS,
  );

  const correctGroup = async (chartId: string, override: string | null) => {
    setJoinMessage(null);
    setCorrectionError(null);
    try {
      await setOverride(chartId, override);
    } catch {
      setCorrectionError('Não foi possível salvar a correção. Tente de novo.');
      return;
    }
    const next = { ...overrides };
    if (override) next[chartId] = override;
    else delete next[chartId];
    const chart = summaries.find((item) => item.id === chartId);
    const song = groupLibrarySongs(summaries, analysedRefs, next).find((item) =>
      item.charts.some((c) => c.id === chartId),
    );
    if (song && chart) navigate(routeOfSummary(song.key, chart));
  };

  const handleImport = async (files: File[]) => {
    setJoinMessage(null);
    setBatchReport(null);
    let known = summaries;
    const report: BatchLine[] = [];
    let first: { song: LibrarySong; added: ChartSummary } | null = null;
    for (const file of files) {
      let failure = 'Não foi possível importar este arquivo.';
      const chart = await importFile(file, (reason) => {
        failure = reason;
      });
      if (!chart) {
        report.push({ name: file.name, text: `falhou. ${failure}` });
        continue;
      }
      const added = summarizeChart(chart);
      const joined = songJoinedByImport(known, analysedRefs, added, overrides);
      known = [...known.filter((item) => item.id !== added.id), added];
      report.push({
        name: file.name,
        text: joined
          ? `entrou na música existente "${joined.title}".`
          : 'importado.',
      });
      if (files.length === 1 && joined) {
        setJoinMessage(
          `O arquivo entrou na música existente "${joined.title}".`,
        );
      }
      if (!first) {
        const song = groupLibrarySongs(known, analysedRefs, overrides).find(
          (item) => item.charts.some((c) => c.id === added.id),
        );
        if (song) first = { song, added };
      }
    }
    if (files.length > 1) setBatchReport(report);
    if (first) {
      const { song, added } = first;
      navigate(routeOfChart(song.key, added.source, added.part));
    }
  };

  return (
    <Frame
      as="section"
      title="Biblioteca"
      titleAs="h2"
      className="library-module min-w-0 flex flex-col gap-4"
    >
      <p className="text-xs text-text-muted">
        Análise automática de cifra, tom e andamento das faixas processadas pelo
        pipeline off-line, e linhas de baixo importadas do Rocksmith ou de
        arquivos MIDI e Guitar Pro (.gp).
      </p>

      {batchReport && (
        <div
          role="status"
          data-testid="batch-report"
          className="text-small text-text-muted"
        >
          <p>Resultado da importação:</p>
          <ul>
            {batchReport.map((line, index) => (
              <li key={index}>
                {line.name}: {line.text}
              </li>
            ))}
          </ul>
        </div>
      )}

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
          {correctionError && (
            <p role="alert" className="text-sm text-danger">
              {correctionError}
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
          {currentPart &&
            currentChart &&
            (parts.length > 1 || sameKind.length > 1) && (
              <div className="flex flex-wrap items-center gap-2">
                {parts.length > 1 && (
                  <Segmented<ChartPart>
                    label="Parte"
                    value={currentPart}
                    onChange={selectPart}
                    options={parts.map((part) => ({
                      value: part,
                      label: PART_CHOICE_LABEL[part],
                    }))}
                    className="self-start"
                  />
                )}
                {sameKind.length > 1 && (
                  <Select
                    aria-label={`Nome da parte: ${PART_CHOICE_LABEL[currentPart].toLowerCase()}`}
                    value={currentChart.id}
                    onChange={(event) => selectPartName(event.target.value)}
                  >
                    {sameKind.map((chart) => (
                      <option key={chart.id} value={chart.id}>
                        {chart.partName ?? PART_CHOICE_LABEL[chart.part]}
                      </option>
                    ))}
                  </Select>
                )}
              </div>
            )}
          {targetChartId && resolved && (
            <GroupOverrideControl
              song={resolved.song}
              targets={
                selectedSummary
                  ? moveTargets(songs, selectedSummary, resolved.song.key)
                  : []
              }
              overridden={targetChartId in overrides}
              onMove={(key) => void correctGroup(targetChartId, key)}
              onSeparate={() => void correctGroup(targetChartId, 'separate')}
              onRemove={() => void correctGroup(targetChartId, null)}
            />
          )}
          {selectedChart && isDrumChart(selectedChart) ? (
            <DrumPartDetail
              key={selectedChart.id}
              settingsKey={settingsKey}
              chart={selectedChart}
              parts={songParts}
              onRemove={() => {
                navigate({ screen: 'list' });
                void remove(selectedChart.id);
              }}
            />
          ) : selectedChart && isGuitarChart(selectedChart) ? (
            <GuitarPartDetail
              key={selectedChart.id}
              settingsKey={settingsKey}
              chart={selectedChart}
              parts={songParts}
              onRemove={() => {
                navigate({ screen: 'list' });
                void remove(selectedChart.id);
              }}
            />
          ) : selectedChart ? (
            <RocksmithTrackDetail
              key={selectedChart.id}
              settingsKey={settingsKey}
              chart={selectedChart}
              songCharts={resolved?.song.charts}
              parts={songParts}
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
            onImport={(files) => void handleImport(files)}
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
