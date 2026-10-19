import { PlayheadAnimation } from '@/components/library/ChartPlayhead';
import {
  Fragment,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import LibraryPlayer from '@/components/library/LibraryPlayer';
import PlaybackDiagnostics from '@/components/library/PlaybackDiagnostics';
import PartMuteControls from '@/components/library/PartMuteControls';
import PlaybackDock from '@/components/library/PlaybackDock';
import type { PartMutes, PlaybackPart } from '@/domain/songPartsPlayback';
import {
  formatDuration,
  sectionColorVar,
} from '@/components/library/libraryData';
import type { LibraryAudio } from '@/components/library/useLibraryAudio';
import { useSectionLineLengths } from '@/components/library/useSectionLineLengths';
import type { SongCursor } from '@/components/library/useSongCursor';
import {
  lineBeatWidth,
  neededBeatWidth,
  repeatsAbove,
  sectionBeatWidth,
  sectionBlocks,
  sectionLabel,
  sectionRows,
  timeSignatures,
  type BassChartSection,
  type BassChartSectionBlock,
  type ChartBars,
  type LabelLane,
  type SectionBlockItem,
} from '@/domain/bassChart';
import type { LineLength } from '@/domain/chartSettings';
import type { RocksmithAudioState } from '@/hooks/useRocksmithAudio';
import { confirmDialog } from '@/services/confirm';

export interface SongFrameChart extends ChartBars {
  title: string;
  artist: string;
  album: string;
  year: number | null;
  averageTempoBpm: number;
  songLengthSeconds: number;
}

export interface SongStat {
  label: string;
  value: string;
}

export function songStats(chart: SongFrameChart): SongStat[] {
  return [
    { label: 'Andamento', value: `~${Math.round(chart.averageTempoBpm)} bpm` },
    { label: 'Compasso', value: timeSignatures(chart).join(' · ') },
    { label: 'Duração', value: formatDuration(chart.songLengthSeconds) },
    { label: 'Compassos', value: String(chart.bars.length) },
  ];
}

export interface BarLayout<L> {
  beatWidth: number;
  repeatOf: number | undefined;
  section: L;
}

export interface LineStart<L> {
  width: number;
  render: (section: L) => ReactNode;
}

export interface FloatingRoom {
  anchorBottom: number;
  viewportWidth: number;
}

interface Props<L> {
  chart: SongFrameChart;
  chartId: string;
  settingsKey?: unknown;
  onRemove: () => void;
  sourceNote: string;
  stats: SongStat[];
  panels?: ReactNode;
  audio: LibraryAudio;
  hasPlayer: boolean;
  playerPanels?: ReactNode;
  recording: {
    state: RocksmithAudioState;
    saveError: boolean;
    onAttach: (file: File) => Promise<void>;
    missingNote: string;
  };
  cursor: SongCursor;
  chartHeading: string;
  chartOptions?: ReactNode;
  chartPanels?: ReactNode;
  sectionPanels?: (sectionIndex: number) => ReactNode;
  filledBars: ReadonlySet<number>;
  baseBeatWidth: number;
  barChrome: number;
  labelGap: number;
  barLanes: (barIndex: number) => LabelLane[];
  barDrawing: (barIndex: number) => string | null;
  sectionLayout: (section: BassChartSection, beatWidth: number) => L;
  renderBar: (barIndex: number, layout: BarLayout<L>) => ReactNode;
  lineStart?: LineStart<L>;
  legend: string;
  dock: {
    label: string;
    title: ReactNode;
    status: string;
    actions: ReactNode;
    panel: ReactNode;
    showLabel: string;
    hideLabel: string;
  };
  partMutes?: { mutes: PartMutes; onToggle: (part: PlaybackPart) => void };
  floating?: (room: FloatingRoom) => ReactNode;
}

const BAR_GAP = 4;
const LINE_LENGTH_OPTIONS = Array.from({ length: 16 }, (_, i) => i + 1);

const MARK_REPEATS_KEY = 'music-theory-lab:mark-repeats';

function readMarkRepeats(): boolean {
  try {
    return localStorage.getItem(MARK_REPEATS_KEY) === 'true';
  } catch {
    return false;
  }
}

function writeMarkRepeats(on: boolean): void {
  try {
    localStorage.setItem(MARK_REPEATS_KEY, String(on));
  } catch {}
}

const NO_REPEATS: ReadonlyMap<number, number> = new Map();

export default function SongDetailFrame<L>({
  chart,
  chartId,
  settingsKey,
  onRemove,
  sourceNote,
  stats,
  panels,
  audio,
  hasPlayer,
  playerPanels,
  recording,
  cursor,
  chartHeading,
  chartOptions,
  chartPanels,
  sectionPanels,
  filledBars,
  baseBeatWidth,
  barChrome,
  labelGap,
  barLanes,
  barDrawing,
  sectionLayout,
  renderBar,
  lineStart,
  legend,
  dock,
  partMutes,
  floating,
}: Props<L>) {
  const [follow, setFollow] = useState(true);
  const [markRepeats, setMarkRepeats] = useState(readMarkRepeats);
  const {
    lengthOf,
    setLength,
    setSongLength,
    clearLength,
    isOwn,
    songLength,
    hasSectionLengths,
  } = useSectionLineLengths(chartId, settingsKey);
  const chartRef = useRef<HTMLDivElement>(null);
  const dockRef = useRef<HTMLDivElement>(null);
  const [dockHeight, setDockHeight] = useState(0);
  const [viewport, setViewport] = useState(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }));
  useEffect(() => {
    const onResize = () =>
      setViewport({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const [floatingAnchor, setFloatingAnchor] = useState(16);
  useEffect(() => {
    const dockTop = dockRef.current?.getBoundingClientRect().top;
    setFloatingAnchor(
      dockTop === undefined ? 16 : viewport.height - dockTop + 12,
    );
  }, [dockHeight, viewport.height]);

  const blocks = useMemo(
    () => sectionBlocks(chart, filledBars),
    [chart, filledBars],
  );
  const { activeBar, activeSection, playing, seek } = cursor;

  useEffect(() => {
    if (!follow || !playing || activeBar < 0) return;
    const element = chartRef.current?.querySelector(
      `[data-bar="${activeBar}"]`,
    );
    if (!element) return;
    const bar = element.getBoundingClientRect();
    const top = Math.max(
      0,
      document.querySelector('header')?.getBoundingClientRect().bottom ?? 0,
    );
    const bottom =
      dockRef.current?.getBoundingClientRect().top ?? window.innerHeight;
    if (bar.top >= top && bar.top + bar.height <= bottom) return;
    window.scrollTo({
      top: Math.max(
        0,
        window.scrollY + bar.top + bar.height / 2 - (top + bottom) / 2,
      ),
      behavior: 'smooth',
    });
  }, [activeBar, playing, follow]);

  return (
    <PlayheadAnimation chart={chart} audio={audio}>
      <section className="flex min-w-0 flex-col gap-4">
        {new URLSearchParams(window.location.search).has('playback-debug') && (
          <PlaybackDiagnostics chartRef={chartRef} playing={playing} />
        )}
        <header className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="font-heading text-base text-text-primary">
              {chart.title}
            </h3>
            <p className="text-sm text-text-secondary">
              {[chart.artist, chart.album, chart.year]
                .filter(Boolean)
                .join(' · ')}
            </p>
            <p className="text-small text-text-muted">{sourceNote}</p>
          </div>
          <button
            type="button"
            onClick={async () => {
              const confirmed = await confirmDialog({
                title: `Remover "${chart.title}" deste navegador?`,
                confirmLabel: 'Remover',
                danger: true,
              });
              if (confirmed) onRemove();
            }}
            className="font-heading text-xs px-3 py-1.5 border border-border-strong text-text-secondary hover:bg-danger hover:text-on-accent hover:border-danger cursor-pointer"
          >
            Remover
          </button>
        </header>

        <dl className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
          {stats.map((stat) => (
            <Stat key={stat.label} label={stat.label} value={stat.value} />
          ))}
        </dl>

        {panels}

        {hasPlayer && <LibraryPlayer audio={audio} title={chart.title} />}
        {playerPanels}

        <LinkedRecording
          state={recording.state}
          saveError={recording.saveError}
          onAttach={recording.onAttach}
          missingNote={recording.missingNote}
        />

        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h4 className="font-heading text-sm text-text-secondary">
              {chartHeading}
            </h4>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-1 text-small text-text-muted">
                todas as seções
                <select
                  value={songLength === 'auto' ? '' : songLength}
                  onChange={async (e) => {
                    const next: LineLength =
                      e.target.value === '' ? 'auto' : Number(e.target.value);
                    if (hasSectionLengths) {
                      const confirmed = await confirmDialog({
                        title: 'Aplicar a todas as seções?',
                        message:
                          'Os compassos por linha próprios de cada seção serão removidos.',
                        confirmLabel: 'Aplicar',
                      });
                      if (!confirmed) return;
                    }
                    void setSongLength(next);
                  }}
                  aria-label="Compassos por linha de todas as seções"
                  title="Define os compassos por linha de todas as seções e remove os valores próprios"
                  className="border border-border-default bg-bg-card px-1 py-0.5 font-heading text-small text-text-secondary cursor-pointer"
                >
                  <option value="">auto</option>
                  {LINE_LENGTH_OPTIONS.map((count) => (
                    <option key={count} value={count}>
                      {count}
                    </option>
                  ))}
                </select>
              </label>
              {chartOptions}
              <label className="flex items-center gap-1.5 text-small text-text-muted cursor-pointer">
                <input
                  type="checkbox"
                  checked={follow}
                  onChange={(e) => setFollow(e.target.checked)}
                  className="accent-text-primary"
                />
                Acompanhar a reprodução
              </label>
              <label className="flex items-center gap-1.5 text-small text-text-muted cursor-pointer">
                <input
                  type="checkbox"
                  checked={markRepeats}
                  aria-describedby="repeat-rule"
                  onChange={(e) => {
                    setMarkRepeats(e.target.checked);
                    writeMarkRepeats(e.target.checked);
                  }}
                  className="accent-text-primary"
                />
                Marcar repetições
              </label>
              <p id="repeat-rule" className="text-meta text-text-muted">
                Nas seções com “por linha”, o compasso igual ao de cima vira o
                sinal de repetição
              </p>
            </div>
          </div>
          {chartPanels}
          <div ref={chartRef} className="flex flex-col gap-3">
            {blocks.map((block) => {
              const length = lengthOf(block.section.startBar);
              return (
                <FrameSection
                  key={block.index}
                  chart={chart}
                  block={block}
                  isActive={block.index === activeSection}
                  panels={sectionPanels?.(block.index)}
                  lineLength={length === 'auto' ? null : length}
                  onLineLengthChange={(count) =>
                    void setLength(block.section.startBar, count ?? 'auto')
                  }
                  ownLength={isOwn(block.section.startBar)}
                  onClearOwnLength={() =>
                    void clearLength(block.section.startBar)
                  }
                  markRepeats={markRepeats}
                  baseBeatWidth={baseBeatWidth}
                  barChrome={barChrome}
                  labelGap={labelGap}
                  barLanes={barLanes}
                  barDrawing={barDrawing}
                  sectionLayout={sectionLayout}
                  renderBar={renderBar}
                  lineStart={lineStart}
                  onSeek={seek}
                />
              );
            })}
          </div>
          <p className="text-small text-text-muted">
            Um bloco = um compasso, na grade de tempos do próprio arquivo.{' '}
            {legend}
            {seek
              ? ' Clique num compasso para saltar a reprodução até ele.'
              : ''}{' '}
            Com “Marcar repetições” e um número em “por linha”, o compasso igual
            ao de cima fica vazio, com o sinal de repetição.
          </p>
        </div>

        <div aria-hidden style={{ height: dockHeight }} />
        <PlaybackDock
          dockRef={dockRef}
          label={dock.label}
          onHeightChange={setDockHeight}
          title={dock.title}
          status={dock.status}
          playing={playing}
          canPlay={cursor.canPlay}
          onTogglePlay={cursor.togglePlay}
          actions={
            <>
              {partMutes && (
                <PartMuteControls
                  mutes={partMutes.mutes}
                  onToggle={partMutes.onToggle}
                />
              )}
              {dock.actions}
            </>
          }
          panel={dock.panel}
          showLabel={dock.showLabel}
          hideLabel={dock.hideLabel}
        />
        {floating?.({
          anchorBottom: floatingAnchor,
          viewportWidth: viewport.width,
        })}
      </section>
    </PlayheadAnimation>
  );
}

function FrameSection<L>({
  chart,
  block,
  isActive,
  panels,
  lineLength,
  onLineLengthChange,
  ownLength,
  onClearOwnLength,
  markRepeats,
  baseBeatWidth,
  barChrome,
  labelGap,
  barLanes,
  barDrawing,
  sectionLayout,
  renderBar,
  lineStart,
  onSeek,
}: {
  chart: ChartBars;
  block: BassChartSectionBlock;
  isActive: boolean;
  panels: ReactNode;
  lineLength: number | null;
  onLineLengthChange: (count: number | null) => void;
  ownLength: boolean;
  onClearOwnLength: () => void;
  markRepeats: boolean;
  baseBeatWidth: number;
  barChrome: number;
  labelGap: number;
  barLanes: (barIndex: number) => LabelLane[];
  barDrawing: (barIndex: number) => string | null;
  sectionLayout: (section: BassChartSection, beatWidth: number) => L;
  renderBar: (barIndex: number, layout: BarLayout<L>) => ReactNode;
  lineStart: LineStart<L> | undefined;
  onSeek: ((seconds: number) => void) | null;
}) {
  const { section } = block;
  const linesRef = useRef<HTMLDivElement>(null);
  const [lineWidth, setLineWidth] = useState<number | null>(null);
  useEffect(() => {
    const element = linesRef.current;
    if (lineLength === null || !element) return;
    const observer = new ResizeObserver(() =>
      setLineWidth(element.getBoundingClientRect().width),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [lineLength]);
  const mostBeats = Math.max(
    ...chart.bars
      .slice(section.startBar, section.endBar)
      .map((b) => b.beatCount),
  );
  const needed = useMemo(
    () =>
      neededBeatWidth(
        chart.bars
          .slice(section.startBar, section.endBar)
          .flatMap((_, i) => barLanes(section.startBar + i)),
        labelGap,
      ),
    [chart, section, barLanes, labelGap],
  );
  const startWidth = lineStart ? lineStart.width + BAR_GAP : 0;
  const beatWidth =
    lineLength === null || lineWidth === null
      ? sectionBeatWidth(baseBeatWidth, needed)
      : lineBeatWidth({
          lineWidth: lineWidth - startWidth,
          barsPerLine: lineLength,
          beatCount: mostBeats,
          barChrome,
          gap: BAR_GAP,
          baseBeatWidth,
        });
  const layout = useMemo(
    () => sectionLayout(section, beatWidth),
    [sectionLayout, section, beatWidth],
  );
  const repeats: ReadonlyMap<number, number> = useMemo(
    () =>
      markRepeats && lineLength
        ? repeatsAbove(block, lineLength, barDrawing)
        : NO_REPEATS,
    [markRepeats, lineLength, block, barDrawing],
  );
  const wrapRef = useRef<HTMLDivElement>(null);
  const [lineTops, setLineTops] = useState<number[]>([]);
  const hasLineStart = lineStart !== undefined;
  useLayoutEffect(() => {
    const element = wrapRef.current;
    if (!hasLineStart || lineLength !== null || !element) return;
    const measure = () => {
      const tops = [
        ...new Set(
          [...element.children]
            .filter((child) => child.hasAttribute('data-bar'))
            .map((child) => (child as HTMLElement).offsetTop),
        ),
      ];
      setLineTops((before) =>
        before.length === tops.length &&
        before.every((top, i) => top === tops[i])
          ? before
          : tops,
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [hasLineStart, lineLength, block, beatWidth, layout]);
  const renderItem = (item: SectionBlockItem) =>
    item.kind === 'bar' ? (
      <Fragment key={item.bar}>
        {renderBar(item.bar, {
          beatWidth,
          repeatOf: repeats.get(item.bar),
          section: layout,
        })}
      </Fragment>
    ) : (
      <button
        key={`rest-${item.startBar}`}
        type="button"
        onClick={
          onSeek ? () => onSeek(chart.bars[item.startBar].startTime) : undefined
        }
        disabled={onSeek === null}
        className={`border border-border-default bg-bg-card px-3 py-1 flex flex-col items-start justify-center text-left ${
          onSeek ? 'cursor-pointer hover:border-text-primary' : 'cursor-default'
        }`}
      >
        <span className="font-heading text-sm text-text-secondary">
          Pausa ×{item.count}
        </span>
        <span className="text-micro text-text-muted tabular-nums">
          compassos {item.startBar + 1}–{item.startBar + item.count}
        </span>
      </button>
    );
  const start = chart.bars[section.startBar].startTime;
  const end = chart.bars[section.endBar - 1].endTime;
  const barCount = section.endBar - section.startBar;
  return (
    <div
      className="flex flex-col gap-1.5 pl-2.5"
      style={{ borderLeft: `3px solid ${sectionColorVar(block.colorIndex)}` }}
    >
      <div className="flex items-baseline gap-2 flex-wrap">
        <span
          className={`font-heading text-sm ${
            isActive ? 'text-text-primary' : 'text-text-secondary'
          }`}
        >
          {sectionLabel(section.name)}
        </span>
        {block.occurrenceTotal > 1 && (
          <span className="text-small text-text-muted">
            {block.occurrence}ª de {block.occurrenceTotal}
          </span>
        )}
        <span className="text-small text-text-muted ml-auto tabular-nums">
          {formatDuration(start)}–{formatDuration(end)} · {barCount}{' '}
          {barCount === 1 ? 'compasso' : 'compassos'}
        </span>
        <label className="flex items-center gap-1 text-small text-text-muted">
          por linha
          <select
            value={lineLength ?? ''}
            onChange={(e) =>
              onLineLengthChange(
                e.target.value === '' ? null : Number(e.target.value),
              )
            }
            aria-label={`Compassos por linha em ${sectionLabel(section.name)}`}
            title="Quantos compassos cabem em cada linha desta seção"
            className="border border-border-default bg-bg-card px-1 py-0.5 font-heading text-small text-text-secondary cursor-pointer"
          >
            <option value="">auto</option>
            {LINE_LENGTH_OPTIONS.map((count) => (
              <option key={count} value={count}>
                {count}
              </option>
            ))}
          </select>
        </label>
        {ownLength && (
          <>
            <span
              data-own-length
              className="text-small text-text-primary"
              title="Esta seção tem um valor próprio"
            >
              ● própria
            </span>
            <button
              type="button"
              onClick={onClearOwnLength}
              aria-label={`Usar o valor de todas as seções em ${sectionLabel(section.name)}`}
              className="font-heading text-small px-1.5 py-0.5 border border-border-default text-text-secondary hover:bg-accent hover:text-on-accent cursor-pointer"
            >
              Remover
            </button>
          </>
        )}
      </div>
      {panels}
      {lineLength === null && lineStart ? (
        <div
          ref={wrapRef}
          className="relative flex flex-wrap gap-1"
          style={{ paddingLeft: startWidth }}
        >
          {lineTops.map((top) => (
            <div
              key={top}
              data-line-start
              className="absolute left-0"
              style={{ top, width: lineStart.width }}
            >
              {lineStart.render(layout)}
            </div>
          ))}
          {block.items.map(renderItem)}
        </div>
      ) : lineLength === null ? (
        <div className="flex flex-wrap gap-1">
          {block.items.map(renderItem)}
        </div>
      ) : (
        <div ref={linesRef} className="flex flex-col gap-1">
          {sectionRows(block, lineLength).map((row) => {
            const first = row[0];
            return (
              // The line length decides which bars a row holds, so a measured
              // row does not wrap: a browser that rounds the bar widths up (a
              // fraction of a pixel in Firefox) would send its last bar to
              // the next line. Before the measure the bars have the base
              // width and may not fit, so the row still wraps.
              <div
                key={first.kind === 'bar' ? first.bar : first.startBar}
                data-line
                className={
                  lineWidth === null ? 'flex flex-wrap gap-1' : 'flex gap-1'
                }
              >
                {lineStart && (
                  <div
                    data-line-start
                    className="shrink-0"
                    style={{ width: lineStart.width }}
                  >
                    {row.some((item) => item.kind === 'bar') &&
                      lineStart.render(layout)}
                  </div>
                )}
                {row.map(renderItem)}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function LinkedRecording({
  state,
  saveError,
  onAttach,
  missingNote,
}: {
  state: RocksmithAudioState;
  saveError: boolean;
  onAttach: (file: File) => Promise<void>;
  missingNote: string;
}) {
  const inputId = 'rocksmith-local-audio';
  const ready = state.status === 'ready' ? state : null;
  return (
    <div className="border border-border-default bg-bg-card px-3 py-2 flex flex-col items-start gap-2">
      <div>
        <p className="text-xs text-text-secondary">
          {state.status === 'loading'
            ? 'Carregando áudio…'
            : ready
              ? ready.origin === 'psarc'
                ? `Áudio extraído do pacote: ${ready.fileName}`
                : `Áudio local: ${ready.fileName}`
              : missingNote}
        </p>
        <p className="text-small text-text-muted">
          O áudio fica somente neste navegador e não é enviado para a nuvem.
        </p>
      </div>
      {ready && !ready.playable && (
        <p role="alert" className="text-small text-text-error">
          Este navegador não toca Ogg Vorbis. Vincule uma versão em MP3 da mesma
          gravação.
        </p>
      )}
      <label
        htmlFor={inputId}
        className="font-heading text-xs px-3 py-1.5 bg-bg-tertiary text-text-primary hover:bg-accent hover:text-on-accent cursor-pointer"
      >
        {ready ? 'Trocar áudio' : 'Vincular áudio'}
      </label>
      <input
        id={inputId}
        type="file"
        accept="audio/*"
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) void onAttach(file);
        }}
      />
      {saveError && (
        <p role="alert" className="text-small text-text-error">
          Não foi possível salvar o áudio neste navegador. Verifique o espaço
          disponível e tente novamente.
        </p>
      )}
    </div>
  );
}

function Stat({ label, value }: SongStat) {
  return (
    <div className="bg-bg-card border border-border-default px-3 py-2 min-w-0">
      <dt className="lh-label">{label}</dt>
      <dd className="font-heading text-sm text-text-primary mt-0.5 truncate">
        {value}
      </dd>
    </div>
  );
}
