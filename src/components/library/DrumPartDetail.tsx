import { useCallback, useMemo } from 'react';
import DrumGridBar, {
  DRUM_BAR_CHROME,
  DRUM_BEAT_WIDTH,
  DRUM_CHAR_WIDTH,
  DRUM_LABEL_GAP,
  DRUM_LABEL_WIDTH,
  DrumRowLabels,
} from '@/components/library/DrumGridBar';
import SongDetailFrame, {
  songStats,
  type LineStart,
} from '@/components/library/SongDetailFrame';
import { useLibraryAudio } from '@/components/library/useLibraryAudio';
import { useSongCursor } from '@/components/library/useSongCursor';
import { GrooveChart } from '@/components/structure/GrooveChart';
import type { DrumChart } from '@/domain/drumChart';
import {
  drumBarDrawing,
  drumBarSpoken,
  drumGridLanes,
  drumGridMarksByBar,
  drumGridRows,
  type DrumGridMark,
} from '@/domain/drumGrid';
import {
  grooveChartInput,
  sectionFillBars,
  sectionGroove,
} from '@/domain/drumSectionGroove';
import { useRocksmithAudio } from '@/hooks/useRocksmithAudio';

interface Props {
  chart: DrumChart;
  /** A new value reloads the line lengths (a synchronization brought some). */
  settingsKey?: unknown;
  onRemove: () => void;
}

const NO_MARKS: DrumGridMark[] = [];
/** The drum part works out nothing for a section. */
const noSectionLayout = () => null;

const LEGEND: [symbol: string, meaning: string][] = [
  ['●', 'tambor: bumbo, caixa, tom ou surdo'],
  ['x', 'prato ou chimbal fechado'],
  ['o', 'chimbal aberto'],
  ['(x)', 'nota fantasma'],
  ['>', 'acento, sobre o símbolo em negrito'],
];

/**
 * The drum part of the song detail. It supplies the bar of the drum grid and
 * the labels of its rows to the frame, which owns the rest of the screen. It
 * has no transposition, tuning, fingering, degrees, key, fretboard, or circle
 * of fifths. With a linked recording the cursor follows it; without one the
 * part has no player yet.
 */
export default function DrumPartDetail({
  chart,
  settingsKey,
  onRemove,
}: Props) {
  const { audioState, attach, saveError } = useRocksmithAudio(chart.id);
  const audioUrl = audioState.status === 'ready' ? audioState.url : null;
  const audio = useLibraryAudio(audioUrl);
  const hasPlayer = audioUrl !== null;
  const cursor = useSongCursor(chart, audio, hasPlayer);
  const { activeBar, seek } = cursor;

  const rows = useMemo(() => drumGridRows(chart.hits), [chart]);
  const marks = useMemo(() => drumGridMarksByBar(chart), [chart]);
  const filledBars = useMemo(
    () => new Set(chart.hits.map((hit) => hit.bar)),
    [chart],
  );
  const fillBars = useMemo(
    () =>
      new Set(
        chart.sections.flatMap((section) =>
          sectionFillBars(chart, marks, section),
        ),
      ),
    [chart, marks],
  );
  // The groove chart of each section; null when the section has no groove or
  // the chart cannot draw it.
  const grooves = useMemo(
    () =>
      chart.sections.map((section) => {
        const groove = sectionGroove(chart, marks, section);
        return groove ? grooveChartInput(chart, marks, groove) : null;
      }),
    [chart, marks],
  );
  const barLanes = useCallback(
    (barIndex: number) =>
      drumGridLanes(marks[barIndex] ?? NO_MARKS, rows, DRUM_CHAR_WIDTH),
    [marks, rows],
  );
  const barDrawing = useMemo(
    () => drumBarDrawing(chart, marks),
    [chart, marks],
  );
  const lineStart = useMemo(
    (): LineStart<null> => ({
      width: DRUM_LABEL_WIDTH,
      render: () => <DrumRowLabels rows={rows} />,
    }),
    [rows],
  );

  return (
    <SongDetailFrame
      chart={chart}
      chartId={chart.id}
      settingsKey={settingsKey}
      onRemove={onRemove}
      sourceNote={`Bateria importada de ${chart.sourceFileName}`}
      stats={[
        ...songStats(chart),
        { label: 'Toques', value: String(chart.hits.length) },
      ]}
      audio={audio}
      hasPlayer={hasPlayer}
      recording={{
        state: audioState,
        saveError,
        onAttach: attach,
        missingNote:
          'Nenhuma gravação vinculada. Vincule a gravação para o cursor acompanhar a bateria.',
      }}
      cursor={cursor}
      chartHeading="Grade da bateria por seção"
      filledBars={filledBars}
      baseBeatWidth={DRUM_BEAT_WIDTH}
      barChrome={DRUM_BAR_CHROME}
      labelGap={DRUM_LABEL_GAP}
      barLanes={barLanes}
      barDrawing={barDrawing}
      sectionLayout={noSectionLayout}
      sectionPanels={(index) => {
        const groove = grooves[index];
        return groove ? (
          <div data-section-groove className="flex flex-col gap-0.5">
            <span className="text-small text-text-muted">Groove da seção</span>
            <GrooveChart groove={groove} color="var(--color-accent)" />
          </div>
        ) : null;
      }}
      renderBar={(barIndex, layout) => (
        <DrumGridBar
          beatWidth={layout.beatWidth}
          repeatOf={layout.repeatOf}
          bar={chart.bars[barIndex]}
          rows={rows}
          marks={marks[barIndex] ?? NO_MARKS}
          fill={fillBars.has(barIndex)}
          playhead={cursor.playhead(barIndex)}
          onSeek={seek}
        />
      )}
      lineStart={lineStart}
      legend="Cada linha é uma peça, dos pratos (em cima) ao pedal do chimbal (embaixo); pontilhados marcam os tempos. ● = tambor, x = prato ou chimbal fechado, o = chimbal aberto, (x) = nota fantasma, > = acento."
      dock={{
        label: 'Bateria',
        showLabel: 'Mostrar legenda',
        hideLabel: 'Recolher legenda',
        title:
          activeBar >= 0
            ? `Compasso ${activeBar + 1}`
            : hasPlayer
              ? 'Toque a música ou clique num compasso'
              : 'Vincule a gravação para acompanhar a bateria',
        status:
          activeBar >= 0
            ? drumBarSpoken(marks[activeBar] ?? NO_MARKS, rows)
            : 'Cada linha da grade é uma peça da bateria',
        actions: null,
        panel: (
          <dl className="flex flex-wrap gap-x-4 gap-y-1 text-small text-text-muted">
            {LEGEND.map(([symbol, meaning]) => (
              <div key={symbol} className="flex items-baseline gap-1.5">
                <dt className="font-heading text-text-primary">{symbol}</dt>
                <dd>{meaning}</dd>
              </div>
            ))}
          </dl>
        ),
      }}
    />
  );
}
