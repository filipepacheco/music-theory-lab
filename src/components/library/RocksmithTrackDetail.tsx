import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import BassNeck from '@/components/instruments/BassNeck';
import BassTabBar, {
  DEGREE_COLORS,
  type IndexedNote,
} from '@/components/library/BassTabBar';
import LibraryPlayer from '@/components/library/LibraryPlayer';
import {
  formatDuration,
  sectionColorVar,
} from '@/components/library/libraryData';
import { useLibraryAudio } from '@/components/library/useLibraryAudio';
import {
  analyzeBassChart,
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
  midiNoteName,
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
  BASS_MIX_MODES,
  bassCrossoverHz,
  bassMixLabel,
  type BassMixMode,
} from '@/domain/bassMix';
import { useBassSynthPlayback } from '@/hooks/useBassSynthPlayback';
import { useRocksmithAudio } from '@/hooks/useRocksmithAudio';

interface Props {
  chart: BassChart;
  onRemove: () => void;
}

const STRING_NAMES = ['E', 'A', 'D', 'G'];
const NO_NOTES: readonly number[] = [];

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

  // The audio hooks hand out fresh closures every render; a stable seek
  // keeps the memoised bars from re-rendering on every animation frame.
  const audioRef = useRef(audio);
  audioRef.current = audio;
  const stableSeek = useCallback(
    (seconds: number) => audioRef.current.seek(seconds),
    [],
  );
  const seek = hasPlayer && audio.ready ? stableSeek : null;

  useEffect(() => {
    if (!follow || !audio.playing || activeBar < 0) return;
    chartRef.current
      ?.querySelector(`[data-bar="${activeBar}"]`)
      ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [activeBar, audio.playing, follow]);

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

      <div className="rounded-card border border-border-default bg-bg-card p-3 sm:p-4">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h4 className="font-heading text-sm text-text-secondary">
            Braço sincronizado
          </h4>
          <p className="font-heading text-sm text-text-primary tabular-nums">
            {current.length > 0
              ? `Nota atual: ${current
                  .map(
                    (n) =>
                      `${midiNoteName(n.midi)} (corda ${STRING_NAMES[n.string]}, casa ${n.fret})`,
                  )
                  .join(' + ')}`
              : 'Nenhuma nota ativa'}
          </p>
        </div>
        <BassNeck
          highlight={{
            pitchClasses: current.map((n) => n.midi % 12),
            rootPitchClass: current[0] ? current[0].midi % 12 : null,
            positions: current.map((n) => ({ string: n.string, fret: n.fret })),
          }}
        />
        {!isStandardTuning(chart.tuning) && (
          <p className="mt-2 text-[11px] text-text-muted">
            O braço mostra a afinação padrão; as casas seguem a tablatura.
          </p>
        )}
      </div>

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
        <div ref={chartRef} className="flex flex-col gap-3">
          {blocks.map((block) => (
            <SectionBlock
              key={block.index}
              chart={chart}
              block={block}
              isActive={block.index === activeSection}
              summary={showDegrees ? summaries[block.index] : null}
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
        {showDegrees && (
          <p className="text-[11px] text-text-muted">
            Graus lidos só do baixo: a raiz é a nota do tempo 1 de cada
            compasso. Tempos fortes contam como harmonia; passagens, bordaduras,
            aproximações cromáticas e antecipações em tempo fraco são
            ornamentos. O acorde só é nomeado quando as notas tocadas não deixam
            outra leitura; senão aparece a raiz com “?”. Passe o mouse num
            compasso para ver a 3ª, 5ª e 7ª encontradas.
          </p>
        )}
      </div>
    </section>
  );
}

function SectionBlock({
  chart,
  block,
  isActive,
  summary,
  renderBar,
  onSeek,
}: {
  chart: BassChart;
  block: BassChartSectionBlock;
  isActive: boolean;
  summary: AnalysisSummary | null;
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
