import { useCallback, useMemo, useState } from 'react';
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
import { NOTE_NAMES } from '@/constants/notes';
import {
  chordCell,
  describeRootMotion,
  describeThird,
  isMinorChordType,
} from '@/domain/circleOfFifths';
import { useRocksmithAudio } from '@/hooks/useRocksmithAudio';
import { withOriginalGpFingering } from '@/domain/bassFingering';
import {
  canTransposeBassChart,
  DROP_D_TUNING,
  E_STANDARD_TUNING,
  supportsBassTransposition,
  transposeBassChart,
  transposeMusicalKey,
} from '@/domain/bassTransposition';

interface Props {
  chart: BassChart;
  /** A new value reloads the line lengths (a synchronization brought some). */
  settingsKey?: unknown;
  onRemove: () => void;
}

const CIRCLE_OPEN_KEY = 'music-theory-lab:fifths-window-open';
/** The circle's largest size; narrower screens get what fits. */
const CIRCLE_SIZE = 300;

/** Open as last left; by default open on wide screens, closed on phones. */
function readCircleOpen(): boolean {
  try {
    const stored = localStorage.getItem(CIRCLE_OPEN_KEY);
    if (stored !== null) return stored === 'true';
  } catch {
    // Blocked storage: fall back to the screen-size default.
  }
  return window.innerWidth >= 1024;
}

function writeCircleOpen(open: boolean): void {
  try {
    localStorage.setItem(CIRCLE_OPEN_KEY, String(open));
  } catch {
    // Blocked storage: the default applies next time.
  }
}

const NO_NOTES: readonly number[] = [];

/**
 * The bass part of the song detail. It supplies the bass tab bar and the
 * bass panels (transposition, tuning, fingering, degrees, key, fretboard,
 * circle of fifths) to the frame, which owns the rest of the screen.
 */
export default function RocksmithTrackDetail({
  chart: originalChart,
  settingsKey,
  onRemove,
}: Props) {
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
  const canLower = canTransposeBassChart(originalChart, shift - 1, tuning);
  const canRaise = canTransposeBassChart(originalChart, shift + 1, tuning);
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
  const chart = useMemo(
    () => transposeBassChart(sourceChart, shift, tuning),
    [sourceChart, shift, tuning],
  );
  const octaveOffset = chart.notes.length
    ? (chart.notes[0].midi - originalChart.notes[0].midi - shift) / 12
    : 0;
  const audioUrl = audioState.status === 'ready' ? audioState.url : null;
  const [mixMode, setMixMode] = useState<BassMixMode>('full');
  const crossoverHz = useMemo(() => bassCrossoverHz(chart), [chart]);
  const recording = useLibraryAudio(audioUrl, { mode: mixMode, crossoverHz });
  // With no recording to follow, the sampled bass plays the chart itself.
  const synthOnly = audioState.status === 'missing';
  const synth = useBassSynthPlayback(chart, synthOnly, shift);
  const audio = synthOnly ? synth : recording;
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
  // One summary and one harmony for each section, by its index in the chart.
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
  const musicalKey = chosenKey
    ? transposeMusicalKey(chosenKey, shift)
    : (keySuggestions[0] ?? null);
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

  // The floating fretboard and circle follow the bar under the playhead.
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
    // A third the bass played decides the ring; with none, or both, the
    // key's reading of the chord stands in and is marked as a guess.
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
  // The degree lane has labels only while the degrees are shown.
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
  // The degree lane takes a second level where a label touches the label
  // before it; all bars of the section keep room for it, at one height.
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
        <label className="flex items-center gap-1.5 text-small text-text-muted cursor-pointer">
          <input
            type="checkbox"
            checked={showDegrees}
            onChange={(e) => setShowDegrees(e.target.checked)}
            className="accent-text-primary"
          />
          Mostrar graus
        </label>
      }
      chartPanels={
        showDegrees && (
          <>
            <DegreeLegend />
            {musicalKey && (
              <KeyPicker
                value={musicalKey}
                suggestions={keySuggestions}
                onChange={(key) =>
                  setChosenKey(transposeMusicalKey(key, -shift))
                }
              />
            )}
            <BassDegreeGuide musicalKey={musicalKey} />
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
          onSeek={seek}
          analysis={showDegrees ? (analysis[barIndex] as BarAnalysis) : null}
          segment={
            showDegrees && harmony
              ? (harmony.segments[harmony.barSegments[barIndex] as number] ??
                null)
              : null
          }
          avoidNotes={showDegrees ? (harmony?.avoidNotes ?? null) : null}
          noteNames={noteNames}
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
