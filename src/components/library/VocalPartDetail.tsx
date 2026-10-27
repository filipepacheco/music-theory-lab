import { useCallback, useMemo, useState } from 'react';
import ChartFretboard from '@/components/library/ChartFretboard';
import SongDetailFrame, {
  songStats,
} from '@/components/library/SongDetailFrame';
import { useLibraryAudio } from '@/components/library/useLibraryAudio';
import { useSameFileBass } from '@/components/library/useSameFileBass';
import { useSongCursor } from '@/components/library/useSongCursor';
import VocalBar, {
  VOCAL_BAR_CHROME,
  VOCAL_BEAT_WIDTH,
  VOCAL_LABEL_GAP,
  vocalBarLanes,
} from '@/components/library/VocalBar';
import { NOTE_NAMES } from '@/constants/notes';
import { keyLabel, keyNoteNames } from '@/domain/bassHarmony';
import type { ChartSummary } from '@/domain/chartSummary';
import {
  vocalBarDrawing,
  vocalOnsetsByBar,
  vocalRange,
  type VocalChart,
} from '@/domain/vocalChart';
import { bassKeyOf } from '@/domain/vocalDegree';
import { useRocksmithAudio } from '@/hooks/useRocksmithAudio';
import Tag from '@/components/shared/Tag';

interface Props {
  chart: VocalChart;
  settingsKey?: unknown;
  /** The charts of the song, to find the bass chart of the same file. */
  songCharts?: readonly ChartSummary[];
  onRemove: () => void;
}

const DEGREES_KEY = 'music-theory-lab:vocal-show-degrees';

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
const NO_CHARTS: readonly ChartSummary[] = [];
const BASS_TUNING = [0, 0, 0, 0];
const BASS_FRETS = 20;

export default function VocalPartDetail({
  chart,
  settingsKey,
  songCharts = NO_CHARTS,
  onRemove,
}: Props) {
  const { audioState, attach, saveError } = useRocksmithAudio(chart.id);
  const audioUrl = audioState.status === 'ready' ? audioState.url : null;
  const audio = useLibraryAudio(audioUrl);
  const hasPlayer = audioUrl !== null;
  const cursor = useSongCursor(chart, audio, hasPlayer);
  const { activeBar, seek } = cursor;
  const [showDegrees, setShowDegrees] = useState(readShowDegrees);

  const bass = useSameFileBass(chart.id, chart.trackIndex, songCharts);
  const key = useMemo(() => bassKeyOf(bass), [bass]);
  const names = useMemo(() => (key ? keyNoteNames(key) : NOTE_NAMES), [key]);
  const tonic = showDegrees && key ? key.tonic : null;

  const onsets = useMemo(() => vocalOnsetsByBar(chart), [chart]);
  const range = useMemo(
    () => vocalRange(chart) ?? { low: 60, high: 60 },
    [chart],
  );
  const filledBars = useMemo(
    () => new Set(chart.notes.map((note) => note.bar)),
    [chart],
  );
  const barLanes = useCallback(
    (barIndex: number) => vocalBarLanes(onsets[barIndex] ?? [], names, tonic),
    [onsets, names, tonic],
  );
  const barDrawing = useMemo(
    () => vocalBarDrawing(chart, onsets),
    [chart, onsets],
  );
  const lyricCount = chart.notes.filter((note) => note.lyric).length;

  return (
    <SongDetailFrame
      chart={chart}
      chartId={chart.id}
      settingsKey={settingsKey}
      onRemove={onRemove}
      sourceNote={`Vocais importados de ${chart.sourceFileName}`}
      stats={[
        { label: 'Parte', value: chart.partName },
        ...songStats(chart),
        { label: 'Notas', value: String(chart.notes.length) },
        {
          label: 'Letra',
          value: lyricCount > 0 ? `${lyricCount} sílabas` : 'sem letra',
        },
      ]}
      audio={audio}
      hasPlayer={hasPlayer}
      recording={{
        state: audioState,
        saveError,
        onAttach: attach,
        missingNote:
          'Nenhuma gravação vinculada. Vincule a gravação para tocar junto com a melodia.',
      }}
      cursor={cursor}
      chartHeading="Melodia por seção"
      chartViews={key ? <Tag tone="bright">{keyLabel(key)}</Tag> : null}
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
      chartPanels={
        showDegrees && !key ? (
          <p role="status" className="text-small text-text-muted">
            Sem tom: a música não tem um baixo para dar o tom dos graus.
          </p>
        ) : null
      }
      filledBars={filledBars}
      baseBeatWidth={VOCAL_BEAT_WIDTH}
      barChrome={VOCAL_BAR_CHROME}
      labelGap={VOCAL_LABEL_GAP}
      barLanes={barLanes}
      barDrawing={barDrawing}
      sectionLayout={() => null}
      renderBar={(barIndex, layout) => (
        <VocalBar
          key={barIndex}
          beatWidth={layout.beatWidth}
          repeatOf={layout.repeatOf}
          bar={chart.bars[barIndex]}
          onsets={onsets[barIndex] ?? []}
          range={range}
          names={names}
          tonic={tonic}
          activeNotes={NO_NOTES}
          playhead={cursor.playhead(barIndex)}
          onSeek={seek}
        />
      )}
      legend="Cada barra é uma nota: quanto mais alta, mais aguda. O nome da nota fica em cima e a sílaba da letra embaixo. As linhas marcam os dós."
      dock={{
        label: 'Baixo',
        showLabel: 'Mostrar braço do baixo',
        hideLabel: 'Recolher braço do baixo',
        title:
          activeBar >= 0
            ? `Compasso ${activeBar + 1}`
            : hasPlayer
              ? 'Toque a música ou clique num compasso'
              : 'Clique num compasso',
        status: key ? `Tom: ${keyLabel(key)}` : 'Sem tom do baixo',
        actions: null,
        panel: (
          <ChartFretboard
            tuning={BASS_TUNING}
            fretCount={BASS_FRETS}
            rootPitchClass={null}
            tones={[]}
            active={[]}
            noteNames={names}
          />
        ),
      }}
    />
  );
}
