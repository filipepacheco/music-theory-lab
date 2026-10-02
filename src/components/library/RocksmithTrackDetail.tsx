import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import BassDegreeGuide from '@/components/library/BassDegreeGuide';
import BassTabBar, {
  DEGREE_COLORS,
  FUNCTION_COLORS,
  type IndexedNote,
} from '@/components/library/BassTabBar';
import ChartFretboard from '@/components/library/ChartFretboard';
import FifthsCircle from '@/components/library/FifthsCircle';
import LibraryPlayer from '@/components/library/LibraryPlayer';
import PlaybackDock from '@/components/library/PlaybackDock';
import {
  formatDuration,
  sectionColorVar,
} from '@/components/library/libraryData';
import { useLibraryAudio } from '@/components/library/useLibraryAudio';
import {
  analyzeBassChart,
  barChordSymbol,
  degreeLabel,
  DEGREE_CATEGORIES,
  summarizeBars,
  type AnalysisSummary,
  type BarAnalysis,
  type DegreeCategory,
} from '@/domain/bassAnalysis';
import {
  activeNoteIndexes,
  barIndexAt,
  isStandardTuning,
  notesByBar,
  sectionBlocks,
  sectionIndexOfBar,
  sectionLabel,
  timeSignatures,
  tuningLabel,
  type BassChart,
  type BassChartSectionBlock,
} from '@/domain/bassChart';
import {
  analyzeHarmony,
  barChordTones,
  describeKeyEvidence,
  keyLabel,
  keyNoteNames,
  repeatingCycle,
  suggestKeys,
  type HarmonicEvent,
  type HarmonicSegment,
  type KeySuggestion,
  type MusicalKey,
} from '@/domain/bassHarmony';
import {
  BASS_MIX_MODES,
  bassCrossoverHz,
  bassMixLabel,
  type BassMixMode,
} from '@/domain/bassMix';
import { useBassSynthPlayback } from '@/hooks/useBassSynthPlayback';
import { NOTE_NAMES } from '@/constants/notes';
import {
  chordCell,
  describeRootMotion,
  isMinorChordType,
} from '@/domain/circleOfFifths';
import { useRocksmithAudio } from '@/hooks/useRocksmithAudio';

interface Props {
  chart: BassChart;
  onRemove: () => void;
}

const STRING_NAMES = ['E', 'A', 'D', 'G'];
const NO_NOTES: readonly number[] = [];

const ALL_KEYS: MusicalKey[] = (['major', 'minor'] as const).flatMap((mode) =>
  Array.from({ length: 12 }, (_, tonic) => ({ tonic, mode })),
);

function keyValue(key: MusicalKey): string {
  return `${key.tonic}-${key.mode}`;
}

interface SectionHarmony {
  segments: HarmonicSegment[];
  events: HarmonicEvent[];
}

const CATEGORY_LABELS: Record<DegreeCategory, string> = {
  root: 'R',
  third: '3ª',
  fifth: '5ª',
  seventh: '7ª',
  tension: 'tensões',
  ornament: 'ornamentos',
};

export default function RocksmithTrackDetail({ chart, onRemove }: Props) {
  const { audioState, attach, saveError } = useRocksmithAudio(chart.id);
  const audioUrl = audioState.status === 'ready' ? audioState.url : null;
  const [mixMode, setMixMode] = useState<BassMixMode>('full');
  const crossoverHz = useMemo(() => bassCrossoverHz(chart), [chart]);
  const recording = useLibraryAudio(audioUrl, { mode: mixMode, crossoverHz });
  // With no recording to follow, the sampled bass plays the chart itself.
  const synthOnly = audioState.status === 'missing';
  const synth = useBassSynthPlayback(chart, synthOnly);
  const audio = synthOnly ? synth : recording;
  const hasPlayer = audioUrl !== null || synthOnly;
  const [follow, setFollow] = useState(true);
  const [showDegrees, setShowDegrees] = useState(false);
  const chartRef = useRef<HTMLDivElement>(null);
  const dockRef = useRef<HTMLDivElement>(null);
  const [dockHeight, setDockHeight] = useState(0);

  const noteTimes = useMemo(() => chart.notes.map((n) => n.time), [chart]);
  const barNotes = useMemo(() => notesByBar(chart), [chart]);
  const blocks = useMemo(() => sectionBlocks(chart), [chart]);
  const analysis = useMemo(() => analyzeBassChart(chart), [chart]);
  const summaries = useMemo(
    () =>
      blocks.map((block) =>
        summarizeBars(analysis, block.section.startBar, block.section.endBar),
      ),
    [analysis, blocks],
  );
  const keySuggestions = useMemo(
    () => suggestKeys(chart, analysis),
    [chart, analysis],
  );
  const [chosenKey, setChosenKey] = useState<MusicalKey | null>(null);
  const musicalKey = chosenKey ?? keySuggestions[0] ?? null;
  const noteNames = musicalKey ? keyNoteNames(musicalKey) : NOTE_NAMES;
  const harmony = useMemo(
    () => (musicalKey ? analyzeHarmony(chart, analysis, musicalKey) : null),
    [chart, analysis, musicalKey],
  );
  const sectionHarmonies = useMemo(
    () =>
      blocks.map(({ section }): SectionHarmony => {
        const inSection = (bar: number) =>
          bar >= section.startBar && bar < section.endBar;
        return {
          segments:
            harmony?.segments.filter((s) => inSection(s.startBar)) ?? [],
          events: harmony?.events.filter((e) => inSection(e.startBar)) ?? [],
        };
      }),
    [blocks, harmony],
  );

  const clock =
    hasPlayer && audio.ready && (audio.playing || audio.currentSeconds > 0)
      ? audio.currentSeconds
      : Number.NaN;
  const activeBar = barIndexAt(chart, clock);
  const activeSection =
    activeBar >= 0 ? sectionIndexOfBar(chart, activeBar) : -1;
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
      return { current: null, previous: null, caption: null };
    }
    const minor = (s: HarmonicSegment) =>
      s.harmony.chordType !== null
        ? isMinorChordType(s.harmony.chordType)
        : s.evidence.third === 'minor';
    const previous =
      harmony.segments
        .slice(0, segmentIndex)
        .reverse()
        .find((s) => s.root !== segment.root) ?? null;
    return {
      current: chordCell(segment.root, minor(segment)),
      previous: previous ? chordCell(previous.root, minor(previous)) : null,
      caption: previous
        ? describeRootMotion(previous.root, segment.root, noteNames)
        : null,
    };
  }, [harmony, segment, segmentIndex, noteNames]);

  // The audio hooks hand out fresh closures every render; a stable seek
  // keeps the memoised bars from re-rendering on every animation frame.
  const audioRef = useRef(audio);
  audioRef.current = audio;
  const stableSeek = useCallback(
    (seconds: number) => audioRef.current.seek(seconds),
    [],
  );
  const seek = hasPlayer && audio.ready ? stableSeek : null;

  // Keep the playing bar in the middle of what is visible: below the app
  // header while it is on screen and above the floating dock.
  useEffect(() => {
    if (!follow || !audio.playing || activeBar < 0) return;
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
  }, [activeBar, audio.playing, follow]);

  const togglePlay = useCallback(() => {
    if (audioRef.current.playing) audioRef.current.pause();
    else void audioRef.current.play();
  }, []);

  const playhead = (barIndex: number): number | null => {
    if (barIndex !== activeBar) return null;
    const bar = chart.bars[barIndex];
    return (clock - bar.startTime) / (bar.endTime - bar.startTime);
  };

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
          <p className="text-[11px] text-text-muted">
            Baixo importado de {chart.sourceFileName}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            if (window.confirm(`Remover "${chart.title}" deste navegador?`)) {
              onRemove();
            }
          }}
          className="font-heading text-xs px-3 py-1.5 rounded-button border border-border-default text-text-muted hover:text-text-error hover:border-text-error cursor-pointer"
        >
          Remover
        </button>
      </header>

      <dl className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
        <Stat
          label="Afinação"
          value={
            isStandardTuning(chart.tuning)
              ? 'Padrão (E A D G)'
              : tuningLabel(chart.tuning)
          }
        />
        <Stat
          label="Andamento"
          value={`~${Math.round(chart.averageTempoBpm)} bpm`}
        />
        <Stat label="Compasso" value={timeSignatures(chart).join(' · ')} />
        <Stat label="Duração" value={formatDuration(chart.songLengthSeconds)} />
        <Stat label="Compassos" value={String(chart.bars.length)} />
        <Stat label="Notas" value={String(chart.notes.length)} />
      </dl>

      {hasPlayer && <LibraryPlayer audio={audio} />}
      {synth.failed && (
        <p role="alert" className="text-[11px] text-text-error">
          Não foi possível carregar o som do baixo. Verifique a conexão e tente
          de novo.
        </p>
      )}
      {audioUrl && (
        <BassMixPicker
          mode={mixMode}
          crossoverHz={crossoverHz}
          onChange={setMixMode}
        />
      )}

      <AudioSource state={audioState} saveError={saveError} onAttach={attach} />

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h4 className="font-heading text-sm text-text-secondary">
            Tablatura por seção
          </h4>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-1.5 text-[11px] text-text-muted cursor-pointer">
              <input
                type="checkbox"
                checked={showDegrees}
                onChange={(e) => setShowDegrees(e.target.checked)}
                className="accent-text-primary"
              />
              Mostrar graus
            </label>
            <label className="flex items-center gap-1.5 text-[11px] text-text-muted cursor-pointer">
              <input
                type="checkbox"
                checked={follow}
                onChange={(e) => setFollow(e.target.checked)}
                className="accent-text-primary"
              />
              Acompanhar a reprodução
            </label>
          </div>
        </div>
        {showDegrees && <DegreeLegend />}
        {showDegrees && musicalKey && (
          <KeyPicker
            value={musicalKey}
            suggestions={keySuggestions}
            onChange={setChosenKey}
          />
        )}
        {showDegrees && <BassDegreeGuide musicalKey={musicalKey} />}
        <div ref={chartRef} className="flex flex-col gap-3">
          {blocks.map((block) => (
            <SectionBlock
              key={block.index}
              chart={chart}
              block={block}
              isActive={block.index === activeSection}
              summary={showDegrees ? summaries[block.index] : null}
              harmony={showDegrees ? sectionHarmonies[block.index] : null}
              renderBar={(barIndex) => (
                <BassTabBar
                  key={barIndex}
                  bar={chart.bars[barIndex]}
                  notes={barNotes[barIndex] as IndexedNote[]}
                  activeNotes={barIndex === activeBar ? activeNotes : NO_NOTES}
                  playhead={playhead(barIndex)}
                  onSeek={seek}
                  analysis={
                    showDegrees ? (analysis[barIndex] as BarAnalysis) : null
                  }
                  segment={
                    showDegrees && harmony
                      ? (harmony.segments[
                          harmony.barSegments[barIndex] as number
                        ] ?? null)
                      : null
                  }
                  avoidNotes={
                    showDegrees ? (harmony?.avoidNotes ?? null) : null
                  }
                  noteNames={noteNames}
                />
              )}
              onSeek={seek}
            />
          ))}
        </div>
        <p className="text-[11px] text-text-muted">
          Um bloco = um compasso, na grade de tempos do próprio arquivo. As
          linhas vão da corda G (em cima) à E (embaixo); pontilhados marcam os
          tempos. x = nota abafada, / e \ = slide.
          {chart.source === 'midi'
            ? ' O MIDI não traz digitação: cordas e casas são uma sugestão automática.'
            : ''}
          {seek ? ' Clique num compasso para saltar a reprodução até ele.' : ''}
        </p>
      </div>

      {/* Room under the last bars so the fixed dock never hides them. */}
      <div aria-hidden style={{ height: dockHeight }} />
      <PlaybackDock
        dockRef={dockRef}
        onHeightChange={setDockHeight}
        title={
          shownBar ? (
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
          )
        }
        status={
          current.length > 0
            ? `Tocando: ${current
                .map((note, i) => {
                  const degree = shownBar?.notes.find(
                    (n) => n.index === activeNotes[i],
                  );
                  const label = degree ? degreeLabel(degree) : '';
                  return `${noteNames[note.midi % 12]}${Math.floor(note.midi / 12) - 1}${label ? ` (${label})` : ''} · corda ${STRING_NAMES[note.string]}, casa ${note.fret}`;
                })
                .join(' + ')}`
            : 'Contorno cheio: o baixo tocou · tracejado: nota do acorde suposta pelo tom'
        }
        playing={audio.playing}
        canPlay={hasPlayer && audio.ready}
        onTogglePlay={togglePlay}
        neck={
          <ChartFretboard
            tuning={chart.tuning}
            fretCount={fretCount}
            rootPitchClass={shownBar?.root ?? null}
            tones={tones}
            active={activePositions}
            noteNames={noteNames}
          />
        }
        circle={
          <FifthsCircle
            musicalKey={musicalKey}
            current={circle.current}
            previous={circle.previous}
            caption={circle.caption}
          />
        }
      />
    </section>
  );
}

function SectionBlock({
  chart,
  block,
  isActive,
  summary,
  harmony,
  renderBar,
  onSeek,
}: {
  chart: BassChart;
  block: BassChartSectionBlock;
  isActive: boolean;
  summary: AnalysisSummary | null;
  harmony: SectionHarmony | null;
  renderBar: (barIndex: number) => ReactNode;
  onSeek: ((seconds: number) => void) | null;
}) {
  const { section } = block;
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
          <span className="text-[11px] text-text-muted">
            {block.occurrence}ª de {block.occurrenceTotal}
          </span>
        )}
        <span className="text-[11px] text-text-muted ml-auto tabular-nums">
          {formatDuration(start)}–{formatDuration(end)} · {barCount}{' '}
          {barCount === 1 ? 'compasso' : 'compassos'}
        </span>
      </div>
      {harmony && <SectionProgression harmony={harmony} />}
      {summary && <SectionSummary summary={summary} />}
      <div className="flex flex-wrap gap-1">
        {block.items.map((item) =>
          item.kind === 'bar' ? (
            renderBar(item.bar)
          ) : (
            <button
              key={`rest-${item.startBar}`}
              type="button"
              onClick={
                onSeek
                  ? () => onSeek(chart.bars[item.startBar].startTime)
                  : undefined
              }
              disabled={onSeek === null}
              className={`rounded-button border border-border-default bg-bg-card px-3 py-1 flex flex-col items-start justify-center text-left ${
                onSeek
                  ? 'cursor-pointer hover:border-text-primary'
                  : 'cursor-default'
              }`}
            >
              <span className="font-heading text-sm text-text-secondary">
                Pausa ×{item.count}
              </span>
              <span className="text-[9px] text-text-muted tabular-nums">
                compassos {item.startBar + 1}–{item.startBar + item.count}
              </span>
            </button>
          ),
        )}
      </div>
    </div>
  );
}

function percent(part: number, total: number): string {
  return `${total > 0 ? Math.round((part / total) * 100) : 0}%`;
}

/** Share of the section's notes per degree, and how the line moves. */
function SectionSummary({ summary }: { summary: AnalysisSummary }) {
  const { counts, motion } = summary;
  const total = DEGREE_CATEGORIES.reduce((sum, c) => sum + counts[c], 0);
  const moves = motion.repeats + motion.steps + motion.leaps;
  if (total === 0) return null;
  return (
    <p className="flex flex-wrap gap-x-2 gap-y-0.5 font-heading text-[10px] text-text-muted tabular-nums">
      {DEGREE_CATEGORIES.map((category) => (
        <span key={category} style={{ color: DEGREE_COLORS[category] }}>
          {CATEGORY_LABELS[category]} {percent(counts[category], total)}
        </span>
      ))}
      {moves > 0 && (
        <span>
          · graus conjuntos {percent(motion.steps, moves)} · saltos{' '}
          {percent(motion.leaps, moves)} · repetições{' '}
          {percent(motion.repeats, moves)}
        </span>
      )}
    </p>
  );
}

/** The section's chords as numerals, a repeated cycle shown once ×n. */
function SectionProgression({ harmony }: { harmony: SectionHarmony }) {
  // A rest between two bars of one chord splits it; show it once.
  const chords = harmony.segments.filter(
    (segment, i) =>
      segment.harmony.numeral !== harmony.segments[i - 1]?.harmony.numeral,
  );
  if (chords.length === 0) return null;
  const { cycle, repeats } = repeatingCycle(
    chords,
    (a, b) => a.harmony.numeral === b.harmony.numeral,
  );
  return (
    <div className="flex flex-col gap-0.5">
      <p className="flex flex-wrap items-baseline gap-x-1 font-heading text-[11px] leading-snug">
        {repeats > 1 && <span className="text-text-muted">(</span>}
        {cycle.map((segment, i) => (
          <span key={segment.startBar} className="flex items-baseline gap-1">
            {i > 0 && <span className="text-text-muted">–</span>}
            <span
              title={segment.harmony.detail}
              className="font-bold"
              style={{
                color: segment.harmony.func
                  ? FUNCTION_COLORS[segment.harmony.func]
                  : 'var(--color-text-secondary)',
              }}
            >
              {segment.harmony.numeral}
            </span>
          </span>
        ))}
        {repeats > 1 && <span className="text-text-muted">) ×{repeats}</span>}
      </p>
      {harmony.events.length > 0 && (
        <p className="flex flex-wrap gap-1">
          {harmony.events.map((event) => (
            <span
              key={`${event.kind}-${event.startBar}`}
              className="rounded-control border border-border-default bg-bg-card px-1.5 py-0.5 text-[10px] text-text-secondary"
            >
              {event.label}
              <span className="text-text-muted tabular-nums">
                {' '}
                · c. {event.startBar + 1}–{event.endBar}
              </span>
            </span>
          ))}
        </p>
      )}
    </div>
  );
}

function KeyPicker({
  value,
  suggestions,
  onChange,
}: {
  value: MusicalKey;
  suggestions: KeySuggestion[];
  onChange: (key: MusicalKey) => void;
}) {
  const suggested = new Set(suggestions.map(keyValue));
  const others = ALL_KEYS.filter((key) => !suggested.has(keyValue(key)));
  const current = suggestions.find((s) => keyValue(s) === keyValue(value));
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-text-muted">
      <label className="flex items-center gap-1.5">
        Tom
        <select
          value={keyValue(value)}
          onChange={(e) => {
            const key = ALL_KEYS.find((k) => keyValue(k) === e.target.value);
            if (key) onChange(key);
          }}
          className="rounded-control border border-border-default bg-bg-card px-2 py-1 font-heading text-xs text-text-primary cursor-pointer"
        >
          <optgroup label="Sugeridos pelo baixo">
            {suggestions.map((key) => (
              <option key={keyValue(key)} value={keyValue(key)}>
                {keyLabel(key)}
              </option>
            ))}
          </optgroup>
          <optgroup label="Outros tons">
            {others.map((key) => (
              <option key={keyValue(key)} value={keyValue(key)}>
                {keyLabel(key)}
              </option>
            ))}
          </optgroup>
        </select>
      </label>
      <span>
        {current ? describeKeyEvidence(current) : 'Tom escolhido manualmente'}
      </span>
    </div>
  );
}

function DegreeLegend() {
  return (
    <p className="flex flex-wrap gap-x-3 gap-y-0.5 font-heading text-[10px] text-text-muted">
      <span style={{ color: DEGREE_COLORS.root }}>R fundamental</span>
      <span style={{ color: DEGREE_COLORS.third }}>3ª b3 / 3</span>
      <span style={{ color: DEGREE_COLORS.fifth }}>5ª b5 / 5 / #5</span>
      <span style={{ color: DEGREE_COLORS.seventh }}>7ª bb7 / b7 / 7</span>
      <span style={{ color: DEGREE_COLORS.tension }}>
        tensões b9 9 11 #11 b13 13
      </span>
      <span style={{ color: DEGREE_COLORS.ornament }}>
        ornamentos (passagem, bordadura, aproximação, antecipação)
      </span>
      <span>
        funções: <span style={{ color: FUNCTION_COLORS.T }}>T tônica</span>{' '}
        <span style={{ color: FUNCTION_COLORS.SD }}>SD subdominante</span>{' '}
        <span style={{ color: FUNCTION_COLORS.D }}>D dominante</span>
      </span>
      <span className="underline">nota evitada</span>
    </p>
  );
}

function AudioSource({
  state,
  saveError,
  onAttach,
}: {
  state: ReturnType<typeof useRocksmithAudio>['audioState'];
  saveError: boolean;
  onAttach: (file: File) => Promise<void>;
}) {
  const inputId = 'rocksmith-local-audio';
  const ready = state.status === 'ready' ? state : null;
  return (
    <div className="rounded-button border border-border-default bg-bg-card px-3 py-2 flex flex-col items-start gap-2">
      <div>
        <p className="text-xs text-text-secondary">
          {state.status === 'loading'
            ? 'Carregando áudio…'
            : ready
              ? ready.origin === 'psarc'
                ? `Áudio extraído do pacote: ${ready.fileName}`
                : `Áudio local: ${ready.fileName}`
              : 'Este arquivo não trouxe áudio: o sintetizador toca a linha de baixo. Vincule a gravação para tocar junto com ela.'}
        </p>
        <p className="text-[11px] text-text-muted">
          Tudo fica somente neste navegador e não é enviado para a nuvem.
        </p>
      </div>
      {ready && !ready.playable && (
        <p role="alert" className="text-[11px] text-text-error">
          Este navegador não toca Ogg Vorbis. Vincule uma versão em MP3 da mesma
          gravação.
        </p>
      )}
      <label
        htmlFor={inputId}
        className="font-heading text-xs px-3 py-1.5 rounded-button bg-bg-elevated text-text-primary hover:bg-bg-hover cursor-pointer"
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
        <p role="alert" className="text-[11px] text-text-error">
          Não foi possível salvar o áudio neste navegador. Verifique o espaço
          disponível e tente novamente.
        </p>
      )}
    </div>
  );
}

function BassMixPicker({
  mode,
  crossoverHz,
  onChange,
}: {
  mode: BassMixMode;
  crossoverHz: number;
  onChange: (mode: BassMixMode) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div
        role="radiogroup"
        aria-label="Mixagem para praticar"
        className="flex flex-wrap gap-1"
      >
        {BASS_MIX_MODES.map((option) => {
          const selected = option === mode;
          return (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(option)}
              className={`font-heading text-xs px-3 py-1.5 rounded-button border cursor-pointer ${
                selected
                  ? 'border-text-primary bg-bg-elevated text-text-primary'
                  : 'border-border-default text-text-muted hover:text-text-primary'
              }`}
            >
              {bassMixLabel(option)}
            </button>
          );
        })}
      </div>
      {mode !== 'full' && (
        <p className="text-[11px] text-text-muted">
          Separação por frequência, com corte em ~{crossoverHz} Hz: o bumbo
          continua no "Só baixo" e os harmônicos agudos do baixo vazam no "Sem
          baixo".
        </p>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-button bg-bg-card border border-border-default px-3 py-2 min-w-0">
      <dt className="text-[10px] uppercase tracking-wide text-text-muted">
        {label}
      </dt>
      <dd className="font-heading text-sm text-text-primary mt-0.5 truncate">
        {value}
      </dd>
    </div>
  );
}
