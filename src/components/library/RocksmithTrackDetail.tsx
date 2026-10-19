import { useCallback, useEffect, useMemo, useState } from 'react';
import BassDegreeGuide from '@/components/library/BassDegreeGuide';
import {
  BassMixPicker,
  DegreeLegend,
  FingeringPanel,
  KeyPicker,
  SectionProgression,
  SectionSummary,
  TranspositionPanel,
  type SectionHarmony,
} from '@/components/library/BassPartPanels';
import BarOctavePanel from '@/components/library/BarOctavePanel';
import { useBarOctaves } from '@/components/library/useBarOctaves';
import { useSameFileKick } from '@/components/library/useSameFileKick';
import type { ChartSummary } from '@/domain/chartSummary';
import BassTabBar, {
  FUNCTION_COLORS,
  BAR_CHROME,
  BEAT_WIDTH,
  LABEL_GAP,
  barDegreeLevels,
  barLabelLanes,
  type IndexedNote,
} from '@/components/library/BassTabBar';
import ChartFretboard from '@/components/library/ChartFretboard';
import FifthsCircle, {
  type CircleMark,
} from '@/components/library/FifthsCircle';
import FloatingWindow from '@/components/library/FloatingWindow';
import SongDetailFrame, {
  songStats,
} from '@/components/library/SongDetailFrame';
import { useLibraryAudio } from '@/components/library/useLibraryAudio';
import { useSongCursor } from '@/components/library/useSongCursor';
import {
  analyzeBassChart,
  barChordSymbol,
  degreeLabel,
  summarizeBars,
  type BarAnalysis,
} from '@/domain/bassAnalysis';
import {
  activeNoteIndexes,
  bassBarDrawing,
  isStandardTuning,
  notesByBar,
  STANDARD_OPEN_MIDI,
  tuningLabel,
  type BassChart,
  type BassChartSection,
} from '@/domain/bassChart';
import {
  analyzeHarmony,
  barChordTones,
  keyLabel,
  keyNoteNames,
  suggestKeys,
  type HarmonicSegment,
  type MusicalKey,
} from '@/domain/bassHarmony';
import { bassCrossoverHz, type BassMixMode } from '@/domain/bassMix';
import { useBassSynthPlayback } from '@/hooks/useBassSynthPlayback';
import type { SongPartsPlayback } from '@/hooks/useSongPartsPlayback';
import { NOTE_NAMES } from '@/constants/notes';
import {
  chordCell,
  describeRootMotion,
  describeThird,
  isMinorChordType,
} from '@/domain/circleOfFifths';
import { useRocksmithAudio } from '@/hooks/useRocksmithAudio';
import { withOriginalGpFingering } from '@/domain/bassFingering';
import { MAX_BAR_OCTAVE } from '@/domain/chartSettings';
import {
  barOctaveFits,
  barsLike,
  canTransposeBassChart,
  DROP_D_TUNING,
  E_STANDARD_TUNING,
  lineOctaveOffset,
  supportsBassTransposition,
  transposeBassChart,
  transposeMusicalKey,
} from '@/domain/bassTransposition';

interface Props {
  chart: BassChart;
  settingsKey?: unknown;
  onRemove: () => void;
  songCharts?: readonly ChartSummary[];
  parts?: SongPartsPlayback;
}

const CIRCLE_OPEN_KEY = 'music-theory-lab:fifths-window-open';
const CIRCLE_SIZE = 300;

function readCircleOpen(): boolean {
  try {
    const stored = localStorage.getItem(CIRCLE_OPEN_KEY);
    if (stored !== null) return stored === 'true';
  } catch {}
  return window.innerWidth >= 1024;
}

function writeCircleOpen(open: boolean): void {
  try {
    localStorage.setItem(CIRCLE_OPEN_KEY, String(open));
  } catch {}
}

const NO_NOTES: readonly number[] = [];
const NO_CHARTS: readonly ChartSummary[] = [];

export default function RocksmithTrackDetail({
  chart: originalChart,
  settingsKey,
  onRemove,
  songCharts = NO_CHARTS,
  parts,
}: Props) {
  const kickBeats = useSameFileKick(originalChart.id, songCharts);
  const { audioState, attach, saveError } = useRocksmithAudio(originalChart.id);
  const [semitones, setSemitones] = useState(0);
  const [practiceTuning, setPracticeTuning] = useState('original');
  const [fingering, setFingering] = useState('original');
  const supportsTransposition = supportsBassTransposition(originalChart);
  const canTranspose = supportsTransposition && audioState.status === 'missing';
  const shift = canTranspose ? semitones : 0;
  const tuning =
    !canTranspose || practiceTuning === 'original'
      ? originalChart.tuning
      : practiceTuning === 'drop-d'
        ? DROP_D_TUNING
        : E_STANDARD_TUNING;
  const canLower = useMemo(
    () => canTransposeBassChart(originalChart, shift - 1, tuning),
    [originalChart, shift, tuning],
  );
  const canRaise = useMemo(
    () => canTransposeBassChart(originalChart, shift + 1, tuning),
    [originalChart, shift, tuning],
  );
  const originalFingeringAvailable = !!originalChart.originalFingering;
  const fingeringRecalculated =
    shift !== 0 ||
    tuning.some((offset, string) => offset !== originalChart.tuning[string]);
  const showingOriginalFingering =
    originalChart.source === 'gp' &&
    originalFingeringAvailable &&
    !fingeringRecalculated &&
    fingering === 'original';
  const sourceChart = useMemo(
    () =>
      fingering === 'original'
        ? withOriginalGpFingering(originalChart)
        : originalChart,
    [originalChart, fingering],
  );
  const barOctaves = useBarOctaves(originalChart.id, settingsKey);
  const [octaveMode, setOctaveMode] = useState(false);
  const [octaveBar, setOctaveBar] = useState<number | null>(null);
  const [octaveAlike, setOctaveAlike] = useState(false);
  useEffect(() => setOctaveBar(null), [originalChart.id]);
  const octaves = useMemo(() => {
    const held: Record<number, number> = {};
    if (!supportsTransposition) return held;
    for (const [bar, octave] of Object.entries(barOctaves.octaves)) {
      if (barOctaveFits(originalChart, Number(bar), octave, shift, tuning))
        held[Number(bar)] = octave;
    }
    return held;
  }, [supportsTransposition, barOctaves.octaves, originalChart, shift, tuning]);
  const octavesKey = JSON.stringify(octaves);
  const chart = useMemo(
    () => transposeBassChart(sourceChart, shift, tuning, octaves),
    [sourceChart, shift, tuning, octaves],
  );
  const octaveOffset = useMemo(
    () => lineOctaveOffset(originalChart, shift, tuning),
    [originalChart, shift, tuning],
  );
  const octaveOfBar = octaveBar === null ? 0 : (octaves[octaveBar] ?? 0);
  const likeBars = useMemo(
    () => (octaveBar === null ? [] : barsLike(originalChart, octaveBar)),
    [originalChart, octaveBar],
  );
  const octaveFits = (octave: number) =>
    octaveBar !== null &&
    Math.abs(octave) <= MAX_BAR_OCTAVE &&
    barOctaveFits(originalChart, octaveBar, octave, shift, tuning);
  const audioUrl = audioState.status === 'ready' ? audioState.url : null;
  const [mixMode, setMixMode] = useState<BassMixMode>('full');
  const crossoverHz = useMemo(() => bassCrossoverHz(chart), [chart]);
  const recording = useLibraryAudio(audioUrl, { mode: mixMode, crossoverHz });
  const synthOnly = audioState.status === 'missing';
  const together = synthOnly && !!parts?.active;
  const synth = useBassSynthPlayback(chart, synthOnly && !together, shift);
  const audio = together && parts ? parts.audio : synthOnly ? synth : recording;
  const reportRecording = parts?.reportRecording;
  const reportBass = parts?.reportBass;
  const recordingLinked = audioState.status !== 'missing';
  const recordingKnown = audioState.status !== 'loading';
  useEffect(() => {
    if (recordingKnown) reportRecording?.(originalChart.id, recordingLinked);
  }, [reportRecording, originalChart.id, recordingLinked, recordingKnown]);
  useEffect(() => {
    reportBass?.(chart, shift, octavesKey);
  }, [reportBass, chart, shift, octavesKey]);
  const hasPlayer = audioUrl !== null || synthOnly;
  const [showDegrees, setShowDegrees] = useState(false);
  const [circleOpen, setCircleOpen] = useState(readCircleOpen);
  const toggleCircle = useCallback(() => {
    setCircleOpen((open) => {
      writeCircleOpen(!open);
      return !open;
    });
  }, []);

  const noteTimes = useMemo(() => chart.notes.map((n) => n.time), [chart]);
  const barNotes = useMemo(() => notesByBar(chart), [chart]);
  const originalAnalysis = useMemo(
    () => analyzeBassChart(originalChart),
    [originalChart],
  );
  const analysis = useMemo(
    () => (shift === 0 ? originalAnalysis : analyzeBassChart(chart)),
    [chart, shift, originalAnalysis],
  );
  const summaries = useMemo(
    () =>
      chart.sections.map((section) =>
        summarizeBars(analysis, section.startBar, section.endBar),
      ),
    [analysis, chart],
  );
  const originalSuggestions = useMemo(
    () => suggestKeys(originalChart, originalAnalysis),
    [originalChart, originalAnalysis],
  );
  const keySuggestions = useMemo(
    () => originalSuggestions.map((key) => transposeMusicalKey(key, shift)),
    [originalSuggestions, shift],
  );
  const [chosenKey, setChosenKey] = useState<MusicalKey | null>(null);
  const musicalKey = useMemo(
    () =>
      chosenKey
        ? transposeMusicalKey(chosenKey, shift)
        : (keySuggestions[0] ?? null),
    [chosenKey, shift, keySuggestions],
  );
  const noteNames = musicalKey ? keyNoteNames(musicalKey) : NOTE_NAMES;
  const harmony = useMemo(
    () => (musicalKey ? analyzeHarmony(chart, analysis, musicalKey) : null),
    [chart, analysis, musicalKey],
  );
  const sectionHarmonies = useMemo(
    () =>
      chart.sections.map((section): SectionHarmony => {
        const inSection = (bar: number) =>
          bar >= section.startBar && bar < section.endBar;
        return {
          segments:
            harmony?.segments.filter((s) => inSection(s.startBar)) ?? [],
          events: harmony?.events.filter((e) => inSection(e.startBar)) ?? [],
        };
      }),
    [chart, harmony],
  );

  const cursor = useSongCursor(chart, audio, hasPlayer);
  const { clock, activeBar, seek } = cursor;
  const activeKey = activeNoteIndexes(chart, noteTimes, clock).join(',');
  const activeNotes = useMemo(
    () => (activeKey ? activeKey.split(',').map(Number) : NO_NOTES),
    [activeKey],
  );
  const current = activeNotes.map((i) => chart.notes[i]);

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
  const shownBar = activeBar >= 0 ? (analysis[activeBar] ?? null) : null;
  const segmentIndex =
    harmony && activeBar >= 0 ? (harmony.barSegments[activeBar] ?? -1) : -1;
  const segment =
    harmony && segmentIndex >= 0
      ? (harmony.segments[segmentIndex] ?? null)
      : null;
  const tones = useMemo(
    () => (shownBar ? barChordTones(shownBar, segment) : []),
    [shownBar, segment],
  );
  const activePositions = useMemo(
    () =>
      activeNotes.map((i) => ({
        string: chart.notes[i].string,
        fret: chart.notes[i].fret,
      })),
    [activeNotes, chart],
  );
  const circle = useMemo(() => {
    if (!harmony || !segment) {
      return {
        current: null,
        next: null,
        nextChord: null,
        caption: null,
        note: null,
      };
    }
    const settled = (s: HarmonicSegment) =>
      s.evidence.third === 'minor' || s.evidence.third === 'major';
    const minor = (s: HarmonicSegment) =>
      settled(s)
        ? s.evidence.third === 'minor'
        : isMinorChordType(s.harmony.chordType);
    const mark = (s: HarmonicSegment): CircleMark => ({
      ...chordCell(s.root, minor(s)),
      guess: !settled(s),
    });
    const next =
      harmony.segments
        .slice(segmentIndex + 1)
        .find((s) => s.root !== segment.root) ?? null;
    return {
      current: mark(segment),
      next: next ? mark(next) : null,
      nextChord: next
        ? `${barChordSymbol(next, noteNames)}${next.evidence.chordType ? '' : '?'}`
        : null,
      caption: next
        ? `A seguir, ${describeRootMotion(segment.root, next.root, noteNames)}`
        : null,
      note: describeThird(
        noteNames[segment.root],
        segment.evidence.third,
        minor(segment),
        segment.harmony.chordType !== null,
      ),
    };
  }, [harmony, segment, segmentIndex, noteNames]);

  const filledBars = useMemo(
    () => new Set(chart.notes.map((n) => n.bar)),
    [chart],
  );
  const shownAnalysis = showDegrees ? analysis : null;
  const barLanes = useCallback(
    (barIndex: number) =>
      barLabelLanes(
        barNotes[barIndex] ?? [],
        shownAnalysis?.[barIndex] ?? null,
      ),
    [barNotes, shownAnalysis],
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
              shownAnalysis?.[section.startBar + i] ?? null,
              beatWidth,
            ),
          ),
      ),
    [chart, barNotes, shownAnalysis],
  );

  return (
    <SongDetailFrame
      chart={chart}
      chartId={originalChart.id}
      settingsKey={settingsKey}
      onRemove={onRemove}
      sourceNote={`Baixo importado de ${chart.sourceFileName}`}
      stats={[
        {
          label: 'Afinação',
          value: isStandardTuning(chart.tuning)
            ? 'Padrão (E A D G)'
            : tuningLabel(chart.tuning),
        },
        ...songStats(chart),
        { label: 'Notas', value: String(chart.notes.length) },
      ]}
      panels={
        <>
          {originalChart.source === 'gp' && (
            <FingeringPanel
              available={originalFingeringAvailable}
              recalculated={fingeringRecalculated}
              value={fingering}
              onChange={setFingering}
            />
          )}
          {supportsTransposition && (
            <TranspositionPanel
              chart={originalChart}
              shift={shift}
              canTranspose={canTranspose}
              canLower={canLower}
              canRaise={canRaise}
              practiceTuning={practiceTuning}
              hasRecording={audioState.status === 'ready'}
              octaveOffset={octaveOffset}
              onShift={(by) => setSemitones((value) => value + by)}
              onPracticeTuning={setPracticeTuning}
              onReset={() => {
                setSemitones(0);
                setPracticeTuning('original');
              }}
            />
          )}
        </>
      }
      audio={audio}
      hasPlayer={hasPlayer}
      partMutes={
        together && parts
          ? { mutes: parts.mutes, onToggle: parts.toggleMute }
          : undefined
      }
      playerPanels={
        <>
          {synth.failed && (
            <p role="alert" className="text-small text-text-error">
              Não foi possível carregar o som do baixo. Verifique a conexão e
              tente de novo.
            </p>
          )}
          {audioUrl && (
            <BassMixPicker
              mode={mixMode}
              crossoverHz={crossoverHz}
              onChange={setMixMode}
            />
          )}
        </>
      }
      recording={{
        state: audioState,
        saveError,
        onAttach: (file) => {
          setSemitones(0);
          setPracticeTuning('original');
          return attach(file);
        },
        missingNote:
          'Este arquivo não trouxe áudio: o sintetizador toca a linha de baixo. Vincule a gravação para tocar junto com ela.',
      }}
      cursor={cursor}
      chartHeading="Tablatura por seção"
      chartOptions={
        <>
          <label className="flex items-center gap-1.5 text-small text-text-muted cursor-pointer">
            <input
              type="checkbox"
              checked={showDegrees}
              onChange={(e) => setShowDegrees(e.target.checked)}
              className="accent-text-primary"
            />
            Mostrar graus
          </label>
          {supportsTransposition && (
            <label className="flex items-center gap-1.5 text-small text-text-muted cursor-pointer">
              <input
                type="checkbox"
                checked={octaveMode}
                onChange={(e) => setOctaveMode(e.target.checked)}
                className="accent-text-primary"
              />
              Oitava por compasso
            </label>
          )}
        </>
      }
      chartPanels={
        (showDegrees || octaveMode) && (
          <>
            {octaveMode && (
              <BarOctavePanel
                bar={octaveBar}
                octave={octaveOfBar}
                canLower={octaveFits(octaveOfBar - 1)}
                canRaise={octaveFits(octaveOfBar + 1)}
                likeCount={likeBars.length}
                alike={octaveAlike}
                movedCount={Object.keys(barOctaves.octaves).length}
                onAlike={setOctaveAlike}
                onOctave={(octave) => {
                  if (octaveBar === null) return;
                  void barOctaves.setOctave(
                    octaveAlike ? likeBars : [octaveBar],
                    octave,
                  );
                }}
                onClear={() => void barOctaves.clear()}
              />
            )}
            {showDegrees && <DegreeLegend />}
            {showDegrees && musicalKey && (
              <KeyPicker
                value={musicalKey}
                suggestions={keySuggestions}
                onChange={(key) =>
                  setChosenKey(transposeMusicalKey(key, -shift))
                }
              />
            )}
            {showDegrees && <BassDegreeGuide musicalKey={musicalKey} />}
          </>
        )
      }
      sectionPanels={(index) =>
        showDegrees && (
          <>
            <SectionProgression harmony={sectionHarmonies[index]} />
            <SectionSummary summary={summaries[index]} />
          </>
        )
      }
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
          onSeek={
            octaveMode
              ? (seconds) => {
                  setOctaveBar(barIndex);
                  if (!audio.playing) seek?.(seconds);
                }
              : seek
          }
          octave={octaves[barIndex] ?? 0}
          selected={octaveMode && barIndex === octaveBar}
          analysis={showDegrees ? (analysis[barIndex] as BarAnalysis) : null}
          segment={
            showDegrees && harmony
              ? (harmony.segments[harmony.barSegments[barIndex] as number] ??
                null)
              : null
          }
          avoidNotes={showDegrees ? (harmony?.avoidNotes ?? null) : null}
          noteNames={noteNames}
          kickBeats={kickBeats ? (kickBeats[barIndex] ?? NO_NOTES) : undefined}
        />
      )}
      legend={`As linhas vão da corda G (em cima) à E (embaixo); pontilhados marcam os tempos. x = nota abafada, / e \\ = slide.${
        chart.source === 'midi' || chart.source === 'gp'
          ? showingOriginalFingering
            ? ' Cordas e casas seguem a digitação original do GP.'
            : ' Cordas e casas são uma sugestão automática para a linha importada.'
          : ''
      }`}
      dock={{
        label: 'Braço do baixo',
        showLabel: 'Mostrar braço',
        hideLabel: 'Recolher braço',
        title: shownBar ? (
          <>
            Compasso {shownBar.bar + 1}
            {shownBar.root !== null && (
              <>
                {' · '}
                {barChordSymbol(shownBar, noteNames)}
                {!shownBar.evidence.chordType && (
                  <span className="text-text-muted">?</span>
                )}
              </>
            )}
            {segment && (
              <>
                {' · '}
                <span
                  className="font-bold"
                  style={{
                    color: segment.harmony.func
                      ? FUNCTION_COLORS[segment.harmony.func]
                      : 'var(--color-text-secondary)',
                  }}
                >
                  {segment.harmony.numeral}
                </span>
              </>
            )}
          </>
        ) : (
          'Toque a música ou clique num compasso'
        ),
        status:
          current.length > 0
            ? `Tocando: ${current
                .map((note, i) => {
                  const degree = shownBar?.notes.find(
                    (n) => n.index === activeNotes[i],
                  );
                  const label = degree ? degreeLabel(degree) : '';
                  const openMidi =
                    STANDARD_OPEN_MIDI[note.string] + chart.tuning[note.string];
                  const stringName = noteNames[((openMidi % 12) + 12) % 12];
                  return `${noteNames[note.midi % 12]}${Math.floor(note.midi / 12) - 1}${label ? ` (${label})` : ''} · corda ${stringName}, casa ${note.fret}`;
                })
                .join(' + ')}`
            : 'Contorno cheio: o baixo tocou · tracejado: nota do acorde suposta pelo tom',
        actions: (
          <button
            type="button"
            onClick={toggleCircle}
            aria-pressed={circleOpen}
            className={`shrink-0 px-2 py-1 border text-small cursor-pointer ${
              circleOpen
                ? 'border-accent bg-accent text-on-accent'
                : 'border-border-default text-text-muted hover:text-text-primary'
            }`}
          >
            Ciclo
          </button>
        ),
        panel: (
          <ChartFretboard
            tuning={chart.tuning}
            fretCount={fretCount}
            rootPitchClass={shownBar?.root ?? null}
            tones={tones}
            active={activePositions}
            noteNames={noteNames}
          />
        ),
      }}
      floating={({ anchorBottom, viewportWidth }) =>
        circleOpen && (
          <FloatingWindow
            title="Ciclo de quintas"
            storageKey="music-theory-lab:fifths-window-position"
            anchorBottom={anchorBottom}
            anchorSide="left"
            onClose={toggleCircle}
          >
            <FifthsCircle
              musicalKey={musicalKey}
              current={circle.current}
              next={circle.next}
              caption={circle.caption}
              note={circle.note}
              centerLabel={musicalKey ? keyLabel(musicalKey) : null}
              centerChord={
                shownBar && shownBar.root !== null
                  ? `${barChordSymbol(shownBar, noteNames)}${shownBar.evidence.chordType ? '' : '?'}`
                  : null
              }
              nextChord={circle.nextChord}
              size={Math.min(CIRCLE_SIZE, viewportWidth - 56)}
            />
          </FloatingWindow>
        )
      }
    />
  );
}
