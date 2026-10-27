import { useCallback, useEffect, useMemo, useState } from 'react';
import { DegreeLegend } from '@/components/library/BassPartPanels';
import ChartFretboard from '@/components/library/ChartFretboard';
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
  activeNoteIndexes,
  bassBarDrawing,
  type BassChartSection,
} from '@/domain/bassChart';
import {
  keyNoteNames,
  suggestKeys,
  type ChordTone,
} from '@/domain/bassHarmony';
import {
  guitarAsBassChart,
  guitarNotesByBar,
  guitarTuningLabel,
  type GuitarChart,
} from '@/domain/guitarChart';
import { useRocksmithAudio } from '@/hooks/useRocksmithAudio';
import type { SongPartsPlayback } from '@/hooks/useSongPartsPlayback';
interface Props {
  chart: GuitarChart;
  settingsKey?: unknown;
  onRemove: () => void;
  parts?: SongPartsPlayback;
}

const PREVIEW_KEY = 'fretboard-preview';

// The engine loads on the first press, so the part opens with no audio code.
async function previewNote(midi: number): Promise<void> {
  const { ensureAudio, playbackEngine } = await import(
    '@/services/playbackEngine'
  );
  if (!(await ensureAudio())) return;
  playbackEngine.scheduleGuitarNote(
    PREVIEW_KEY,
    midi,
    0.45,
    0.8,
    playbackEngine.now(),
  );
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
const NO_TONES: ChordTone[] = [];

export default function GuitarPartDetail({
  chart,
  settingsKey,
  onRemove,
  parts,
}: Props) {
  const { audioState, attach, saveError } = useRocksmithAudio(chart.id);
  const audioUrl = audioState.status === 'ready' ? audioState.url : null;
  const recording = useLibraryAudio(audioUrl);
  const together = audioState.status === 'missing' && !!parts?.active;
  const audio = together && parts ? parts.audio : recording;
  const reportRecording = parts?.reportRecording;
  const recordingLinked = audioState.status !== 'missing';
  const recordingKnown = audioState.status !== 'loading';
  useEffect(() => {
    if (recordingKnown) reportRecording?.(chart.id, recordingLinked);
  }, [reportRecording, chart.id, recordingLinked, recordingKnown]);
  const hasPlayer = audioUrl !== null || together;
  const cursor = useSongCursor(chart, audio, hasPlayer);
  const { activeBar, seek, clock } = cursor;
  const soundBars = useMemo(() => guitarAsBassChart(chart), [chart]);
  const noteTimes = useMemo(() => chart.notes.map((n) => n.time), [chart]);
  const activeKey = activeNoteIndexes(soundBars, noteTimes, clock).join(',');
  const activeNotes = useMemo(
    () => (activeKey ? activeKey.split(',').map(Number) : NO_NOTES),
    [activeKey],
  );
  const activePositions = useMemo(
    () =>
      activeNotes.map((i) => ({
        string: chart.notes[i].string,
        fret: chart.notes[i].fret,
      })),
    [activeNotes, chart],
  );
  // The nut of the board is the capo: frets count from it.
  const boardPitches = useMemo(
    () => chart.openPitches.map((pitch) => pitch + chart.capo),
    [chart],
  );
  const fretCount = useMemo(
    () =>
      Math.min(
        24,
        chart.notes.reduce(
          (most, n) => Math.max(most, n.fret, n.slideToFret ?? 0),
          12,
        ),
      ),
    [chart],
  );
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
      partMutes={
        together && parts
          ? {
              mutes: parts.mutes,
              onToggle: parts.toggleMute,
              controls: parts.controls,
            }
          : undefined
      }
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
          activeNotes={barIndex === activeBar ? activeNotes : NO_NOTES}
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
          <ChartFretboard
            openPitches={boardPitches}
            fretCount={fretCount}
            rootPitchClass={null}
            tones={NO_TONES}
            active={activePositions}
            noteNames={noteNames}
            onPlayNote={(midi) => void previewNote(midi)}
          />
        ),
      }}
    />
  );
}
