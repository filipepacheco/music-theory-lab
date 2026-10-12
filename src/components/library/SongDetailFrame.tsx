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

/** What the frame reads of a chart; a chart of any part has it. */
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

/** The stats that a chart of any part has: tempo, meter, length, bars. */
export function songStats(chart: SongFrameChart): SongStat[] {
  return [
    { label: 'Andamento', value: `~${Math.round(chart.averageTempoBpm)} bpm` },
    { label: 'Compasso', value: timeSignatures(chart).join(' · ') },
    { label: 'Duração', value: formatDuration(chart.songLengthSeconds) },
    { label: 'Compassos', value: String(chart.bars.length) },
  ];
}

/** What the frame gives a part to draw one bar. */
export interface BarLayout<L> {
  /** Pixels per beat; all bars of the section share it. */
  beatWidth: number;
  /** The bar right above when it draws the same: draw the repeat mark. */
  repeatOf: number | undefined;
  /** What the part worked out for the section of the bar. */
  section: L;
}

/**
 * What a part draws at the start of each line of bars, such as the labels
 * of the rows of a grid. The frame keeps `width` pixels for it at the start
 * of each line, so the bars of all lines start at the same place.
 */
export interface LineStart<L> {
  width: number;
  /** As tall as a bar of the section. Keep it stable. */
  render: (section: L) => ReactNode;
}

/** Where a floating panel of a part has room. */
export interface FloatingRoom {
  /** Pixels from the bottom of the viewport to just above the dock. */
  anchorBottom: number;
  viewportWidth: number;
}

/**
 * The frame of the song detail, shared by the parts. It owns the sections,
 * the line length controls, the lines of bars, the repeat marks, the cursor
 * on the screen (the active section, the scroll that follows the playback,
 * the click on a rest), the player, the linked recording, and the dock.
 * A part supplies its bar and its panels; the frame holds no control of one
 * part. `L` is what a part works out one time for a section.
 */
interface Props<L> {
  chart: SongFrameChart;
  /** The chart whose chart settings hold the line lengths. */
  chartId: string;
  /** A new value reloads the line lengths (a synchronization brought some). */
  settingsKey?: unknown;
  onRemove: () => void;
  /** Under the artist: where the part came from. */
  sourceNote: string;
  stats: SongStat[];
  /** The panels of the part between the stats and the player. */
  panels?: ReactNode;
  audio: LibraryAudio;
  hasPlayer: boolean;
  /** The notices and the controls of the part right under the player. */
  playerPanels?: ReactNode;
  recording: {
    state: RocksmithAudioState;
    saveError: boolean;
    onAttach: (file: File) => Promise<void>;
    /** What plays while no recording is linked. */
    missingNote: string;
  };
  cursor: SongCursor;
  chartHeading: string;
  /** The options of the part, next to the options of the frame. */
  chartOptions?: ReactNode;
  /** The panels of the part above the sections. */
  chartPanels?: ReactNode;
  /** The panels of the part at the head of a section, by section index. */
  sectionPanels?: (sectionIndex: number) => ReactNode;
  /** The bars that the part fills; a run of the others is one rest. */
  filledBars: ReadonlySet<number>;
  /** The base beat width of the bar of the part, in pixels. */
  baseBeatWidth: number;
  /** The pixels of a bar that do not grow with its beats. */
  barChrome: number;
  /** Clear space kept between two labels of a lane, in pixels. */
  labelGap: number;
  /** The label lanes of a bar. Keep it stable: it sizes the beats. */
  barLanes: (barIndex: number) => LabelLane[];
  /** What a bar draws, for the repeat marks. Keep it stable. */
  barDrawing: (barIndex: number) => string | null;
  /** Worked out one time for a section at its beat width. Keep it stable. */
  sectionLayout: (section: BassChartSection, beatWidth: number) => L;
  /**
   * The bar of the part. The frame relies on the element that this returns:
   * - it carries `data-bar={barIndex}`, or the scroll that follows the
   *   playback does nothing;
   * - a click on it calls `cursor.seek` with the start time of the bar, and
   *   it is disabled while `cursor.seek` is null;
   * - it draws the repeat mark for `layout.repeatOf`, and the playhead of
   *   `cursor.playhead(barIndex)`. The frame draws neither.
   */
  renderBar: (barIndex: number, layout: BarLayout<L>) => ReactNode;
  /** What the part draws at the start of each line of bars. */
  lineStart?: LineStart<L>;
  /** How to read a bar of the part, in the note under the chart. */
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
  /** Mute buttons of the two parts; present while they play together. */
  partMutes?: { mutes: PartMutes; onToggle: (part: PlaybackPart) => void };
  /** A floating panel of the part, such as the circle of fifths. */
  floating?: (room: FloatingRoom) => ReactNode;
}

/** Tailwind's gap-1 between bars, in pixels. */
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
  } catch {
    // Blocked storage: repeats go back to being drawn in full next time.
  }
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
  // A floating panel of the part starts just above the dock.
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

  // Keep the playing bar in the middle of what is visible: below the app
  // header while it is on screen and above the floating dock.
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
    window.scrollTo({
      top: window.scrollY + bar.top + bar.height / 2 - (top + bottom) / 2,
      behavior: 'smooth',
    });
  }, [activeBar, playing, follow]);

  return (
    <section className="flex min-w-0 flex-col gap-4">
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

      {hasPlayer && <LibraryPlayer audio={audio} />}
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
            <label
              className="flex items-center gap-1.5 text-small text-text-muted cursor-pointer"
              title="Nas seções com “por linha”, o compasso igual ao de cima vira o sinal de repetição"
            >
              <input
                type="checkbox"
                checked={markRepeats}
                onChange={(e) => {
                  setMarkRepeats(e.target.checked);
                  writeMarkRepeats(e.target.checked);
                }}
                className="accent-text-primary"
              />
              Marcar repetições
            </label>
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

      {/* Room under the last bars so the fixed dock never hides them. */}
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
  /** The line length of the section, or null to wrap at the screen's edge. */
  lineLength: number | null;
  onLineLengthChange: (count: number | null) => void;
  ownLength: boolean;
  onClearOwnLength: () => void;
  /** Leave a bar that repeats the one above empty, under a repeat sign. */
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
    // The exact width: a rounded one could be wider than the line, and the
    // last bar would wrap.
    const observer = new ResizeObserver(() =>
      setLineWidth(element.getBoundingClientRect().width),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [lineLength]);
  // The beats of the widest bar of the section size the line.
  const mostBeats = Math.max(
    ...chart.bars
      .slice(section.startBar, section.endBar)
      .map((b) => b.beatCount),
  );
  // The widest beat any bar of the section needs, so that no two labels
  // touch; all bars of the section share it.
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
  // One beat width for the whole section, so the beats align from line to
  // line: the one that makes a line of its widest bars fill the line. A set
  // line length always holds: the bars take the width that fits.
  // The start of a line takes its width, and one gap, from the bars.
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
  // "Above" only means something once the lines have a set length.
  const repeats: ReadonlyMap<number, number> = useMemo(
    () =>
      markRepeats && lineLength
        ? repeatsAbove(block, lineLength, barDrawing)
        : NO_REPEATS,
    [markRepeats, lineLength, block, barDrawing],
  );
  // In the automatic layout the browser wraps the bars, so the frame reads
  // where each line of bars starts: the top of each line that holds a bar.
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
                  // A line with only a rest keeps the room, with no labels.
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

/** The recording linked to the song: what plays, and the file picker. */
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
