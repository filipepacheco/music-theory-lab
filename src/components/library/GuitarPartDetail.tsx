import { useCallback, useMemo, useState } from 'react';
import { DegreeLegend } from '@/components/library/BassPartPanels';
import BassTabBar, {
  BAR_CHROME,
  BEAT_WIDTH,
  LABEL_GAP,
  barDegreeLevels,
  barLabelLanes,
  type IndexedNote,
} from '@/components/library/BassTabBar';
import SongDetailFrame, {
  songStats,
} from '@/components/library/SongDetailFrame';
import { useLibraryAudio } from '@/components/library/useLibraryAudio';
import { useSongCursor } from '@/components/library/useSongCursor';
import Tag from '@/components/shared/Tag';
import { NOTE_NAMES } from '@/constants/notes';
import { analyzeBassChart, type BarAnalysis } from '@/domain/bassAnalysis';
import {
  bassBarDrawing,
  midiNoteName,
  type BassChartSection,
} from '@/domain/bassChart';
import { keyNoteNames, suggestKeys } from '@/domain/bassHarmony';
import {
  guitarAsBassChart,
  guitarNotesByBar,
  guitarTuningLabel,
  type GuitarChart,
} from '@/domain/guitarChart';
import { useRocksmithAudio } from '@/hooks/useRocksmithAudio';

interface Props {
  chart: GuitarChart;
  settingsKey?: unknown;
  onRemove: () => void;
}

const DEGREES_KEY = 'music-theory-lab:guitar-show-degrees';

function readShowDegrees(): boolean {
  try {
    return localStorage.getItem(DEGREES_KEY) === 'true';
  } catch {
    return false;
  }
}

function writeShowDegrees(on: boolean): void {
  try {
    localStorage.setItem(DEGREES_KEY, String(on));
  } catch {}
}

const NO_NOTES: readonly number[] = [];

export default function GuitarPartDetail({
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
  const [showDegrees, setShowDegrees] = useState(readShowDegrees);

  const barNotes = useMemo(() => guitarNotesByBar(chart), [chart]);
  const analysis = useMemo(
    () => (showDegrees ? analyzeBassChart(guitarAsBassChart(chart)) : null),
    [chart, showDegrees],
  );
  const noteNames = useMemo(() => {
    if (!analysis) return NOTE_NAMES;
    const [key] = suggestKeys(guitarAsBassChart(chart), analysis);
    return key ? keyNoteNames(key) : NOTE_NAMES;
  }, [chart, analysis]);
  const filledBars = useMemo(
    () => new Set(chart.notes.map((note) => note.bar)),
    [chart],
  );
  const barLanes = useCallback(
    (barIndex: number) =>
      barLabelLanes(
        barNotes[barIndex] ?? [],
        analysis?.[barIndex] ?? null,
        chart.strings,
        true,
      ),
    [barNotes, analysis, chart.strings],
  );
  const barDrawing = useMemo(
    () => bassBarDrawing(chart, barNotes),
    [chart, barNotes],
  );
  const degreeLevels = useCallback(
    (section: BassChartSection, beatWidth: number) =>
      Math.max(
        1,
        ...chart.bars
          .slice(section.startBar, section.endBar)
          .map((_, i) =>
            barDegreeLevels(
              barNotes[section.startBar + i] ?? [],
              analysis?.[section.startBar + i] ?? null,
              beatWidth,
            ),
          ),
      ),
    [chart, barNotes, analysis],
  );
  const capoNote = chart.capo > 0 ? `capo na casa ${chart.capo}` : '';
  const stringNames = [...chart.openPitches]
    .reverse()
    .map(midiNoteName)
    .join(' ');

  return (
    <SongDetailFrame
      chart={chart}
      chartId={chart.id}
      settingsKey={settingsKey}
      onRemove={onRemove}
      sourceNote={`Guitarra importada de ${chart.sourceFileName}`}
      stats={[
        { label: 'Parte', value: chart.partName },
        { label: 'Afinação', value: guitarTuningLabel(chart) },
        { label: 'Cordas', value: String(chart.strings) },
        ...songStats(chart),
        { label: 'Notas', value: String(chart.notes.length) },
      ]}
      audio={audio}
      hasPlayer={hasPlayer}
      recording={{
        state: audioState,
        saveError,
        onAttach: attach,
        missingNote:
          'Nenhuma gravação vinculada. Vincule a gravação para tocar junto com a tablatura.',
      }}
      cursor={cursor}
      chartHeading="Tablatura por seção"
      chartViews={
        chart.capo > 0 ? <Tag tone="bright">{`Capo ${chart.capo}`}</Tag> : null
      }
      chartOptions={
        <label className="flex items-center gap-1.5 text-small text-text-muted cursor-pointer">
          <input
            type="checkbox"
            checked={showDegrees}
            onChange={(e) => {
              setShowDegrees(e.target.checked);
              writeShowDegrees(e.target.checked);
            }}
            className="accent-text-primary"
          />
          Mostrar graus
        </label>
      }
      chartPanels={showDegrees && <DegreeLegend />}
      filledBars={filledBars}
      baseBeatWidth={BEAT_WIDTH}
      barChrome={BAR_CHROME}
      labelGap={LABEL_GAP}
      barLanes={barLanes}
      barDrawing={barDrawing}
      sectionLayout={degreeLevels}
      renderBar={(barIndex, layout) => (
        <BassTabBar
          key={barIndex}
          beatWidth={layout.beatWidth}
          repeatOf={layout.repeatOf}
          degreeLevels={layout.section}
          bar={chart.bars[barIndex]}
          notes={barNotes[barIndex] as IndexedNote[]}
          activeNotes={NO_NOTES}
          playhead={cursor.playhead(barIndex)}
          onSeek={seek}
          analysis={analysis ? (analysis[barIndex] as BarAnalysis) : null}
          segment={null}
          avoidNotes={null}
          noteNames={noteNames}
          strings={chart.strings}
          bends
        />
      )}
      legend="As linhas vão da corda mais aguda (em cima) à mais grave (embaixo); pontilhados marcam os tempos. Os números são as casas contadas a partir do capo. x = nota abafada, / e \ = slide, b = bend."
      dock={{
        label: 'Guitarra',
        showLabel: 'Mostrar cordas',
        hideLabel: 'Recolher cordas',
        title:
          activeBar >= 0
            ? `Compasso ${activeBar + 1}`
            : hasPlayer
              ? 'Toque a música ou clique num compasso'
              : 'Clique num compasso',
        status: capoNote
          ? `${chart.strings} cordas, ${capoNote}`
          : `${chart.strings} cordas`,
        actions: null,
        panel: (
          <p className="text-small text-text-muted">
            Cordas, da mais aguda à mais grave: {stringNames}
          </p>
        ),
      }}
    />
  );
}
