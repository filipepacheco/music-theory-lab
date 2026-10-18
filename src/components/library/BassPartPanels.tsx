import {
  DEGREE_COLORS,
  FUNCTION_COLORS,
} from '@/components/library/BassTabBar';
import {
  DEGREE_CATEGORIES,
  type AnalysisSummary,
  type DegreeCategory,
} from '@/domain/bassAnalysis';
import {
  isStandardTuning,
  tuningLabel,
  type BassChart,
} from '@/domain/bassChart';
import {
  describeKeyEvidence,
  keyLabel,
  repeatingCycle,
  type HarmonicEvent,
  type HarmonicSegment,
  type KeySuggestion,
  type MusicalKey,
} from '@/domain/bassHarmony';
import {
  BASS_MIX_MODES,
  bassMixLabel,
  type BassMixMode,
} from '@/domain/bassMix';
import {
  canTransposeBassChart,
  DROP_D_TUNING,
  E_STANDARD_TUNING,
} from '@/domain/bassTransposition';

const ALL_KEYS: MusicalKey[] = (['major', 'minor'] as const).flatMap((mode) =>
  Array.from({ length: 12 }, (_, tonic) => ({ tonic, mode })),
);

function keyValue(key: MusicalKey): string {
  return `${key.tonic}-${key.mode}`;
}

export interface SectionHarmony {
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

export function FingeringPanel({
  available,
  recalculated,
  value,
  onChange,
}: {
  available: boolean;
  recalculated: boolean;
  value: string;
  onChange: (fingering: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="flex flex-wrap items-center gap-2 text-xs text-text-secondary">
        Digitação
        <select
          value={available && !recalculated ? value : 'suggested'}
          disabled={!available || recalculated}
          onChange={(event) => onChange(event.target.value)}
          className="border border-border-default bg-bg-card px-2 py-1 font-heading text-text-primary disabled:opacity-40"
        >
          <option value="original">Original do GP</option>
          <option value="suggested">Sugerida pelo Music Lab</option>
        </select>
      </label>
      <p className="text-small text-text-muted">
        {!available
          ? 'Este GP só tem a digitação sugerida. Reimporte o arquivo para recuperar as posições originais quando disponíveis.'
          : recalculated
            ? 'Digitação recalculada para o tom e a afinação escolhidos. Ao voltar ao tom e à afinação originais, sua escolha será restaurada.'
            : 'Original do GP mantém as cordas e casas da partitura. A sugerida procura reduzir os deslocamentos da mão. As notas e a análise são as mesmas.'}
      </p>
    </div>
  );
}

export function TranspositionPanel({
  chart,
  shift,
  canTranspose,
  canLower,
  canRaise,
  practiceTuning,
  hasRecording,
  octaveOffset,
  onShift,
  onPracticeTuning,
  onReset,
}: {
  chart: BassChart;
  shift: number;
  canTranspose: boolean;
  canLower: boolean;
  canRaise: boolean;
  practiceTuning: string;
  hasRecording: boolean;
  octaveOffset: number;
  onShift: (semitones: number) => void;
  onPracticeTuning: (tuning: string) => void;
  onReset: () => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div
        role="group"
        aria-label="Transposição da música"
        className="flex flex-wrap items-center gap-2 text-xs"
      >
        <span className="text-text-secondary">Transpor</span>
        <button
          type="button"
          aria-label="Diminuir meio tom"
          disabled={!canTranspose || !canLower}
          onClick={() => onShift(-1)}
          className="border border-border-default bg-bg-card px-3 py-1.5 font-heading text-text-primary hover:bg-accent hover:text-on-accent cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
        >
          −½ tom
        </button>
        <span
          role="status"
          className="min-w-20 text-center font-heading tabular-nums text-text-primary"
        >
          {shift === 0
            ? 'Original'
            : `${shift > 0 ? '+' : ''}${shift} ${Math.abs(shift) === 1 ? 'semitom' : 'semitons'}`}
        </span>
        <button
          type="button"
          aria-label="Aumentar meio tom"
          disabled={!canTranspose || !canRaise}
          onClick={() => onShift(1)}
          className="border border-border-default bg-bg-card px-3 py-1.5 font-heading text-text-primary hover:bg-accent hover:text-on-accent cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
        >
          +½ tom
        </button>
        {(shift !== 0 || practiceTuning !== 'original') && (
          <button
            type="button"
            onClick={onReset}
            className="text-text-muted underline hover:text-text-primary cursor-pointer"
          >
            Tom original
          </button>
        )}
      </div>
      <label className="flex flex-wrap items-center gap-2 text-xs text-text-secondary">
        Afinação para tocar
        <select
          value={canTranspose ? practiceTuning : 'original'}
          disabled={!canTranspose}
          onChange={(event) => onPracticeTuning(event.target.value)}
          className="border border-border-default bg-bg-card px-2 py-1 font-heading text-text-primary disabled:opacity-40"
        >
          <option
            value="original"
            disabled={!canTransposeBassChart(chart, shift)}
          >
            {isStandardTuning(chart.tuning)
              ? 'E Standard (E A D G)'
              : `Original (${tuningLabel(chart.tuning)})`}
          </option>
          {!isStandardTuning(chart.tuning) && (
            <option
              value="standard"
              disabled={!canTransposeBassChart(chart, shift, E_STANDARD_TUNING)}
            >
              E Standard (E A D G)
            </option>
          )}
          <option
            value="drop-d"
            disabled={!canTransposeBassChart(chart, shift, DROP_D_TUNING)}
          >
            Drop D (D A D G)
          </option>
        </select>
      </label>
      <p className="text-small text-text-muted">
        {hasRecording
          ? 'Transposição indisponível com uma gravação vinculada. O áudio toca no tom original.'
          : 'Cada clique muda o tom em meio tom e recalcula as casas na afinação escolhida. Se necessário, a linha inteira muda de oitava, preservando os intervalos.'}
      </p>
      {canTranspose && practiceTuning === 'drop-d' && (
        <p className="text-small text-text-muted">
          Drop D: afine apenas a corda E em D; mantenha A, D e G.
        </p>
      )}
      {canTranspose && octaveOffset !== 0 && (
        <p role="status" className="text-small text-text-muted">
          Linha inteira {Math.abs(octaveOffset)}{' '}
          {Math.abs(octaveOffset) === 1 ? 'oitava' : 'oitavas'}{' '}
          {octaveOffset > 0 ? 'acima' : 'abaixo'} para caber na afinação
          escolhida, preservando os intervalos.
        </p>
      )}
      {canTranspose &&
        ((!canLower && shift > -12) || (!canRaise && shift < 12)) && (
          <p role="status" className="text-small text-text-muted">
            Um dos próximos tons não comporta a linha inteira nesta afinação. A
            transposição foi limitada para preservar os intervalos.
          </p>
        )}
    </div>
  );
}

function percent(part: number, total: number): string {
  return `${total > 0 ? Math.round((part / total) * 100) : 0}%`;
}

export function SectionSummary({ summary }: { summary: AnalysisSummary }) {
  const { counts, motion } = summary;
  const total = DEGREE_CATEGORIES.reduce((sum, c) => sum + counts[c], 0);
  const moves = motion.repeats + motion.steps + motion.leaps;
  if (total === 0) return null;
  return (
    <p className="flex flex-wrap gap-x-2 gap-y-0.5 font-heading text-micro text-text-muted tabular-nums">
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

export function SectionProgression({ harmony }: { harmony: SectionHarmony }) {
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
      <p className="flex flex-wrap items-baseline gap-x-1 font-heading text-small leading-snug">
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
              className="border border-border-default bg-bg-card px-1.5 py-0.5 text-micro text-text-secondary"
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

export function KeyPicker({
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
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-small text-text-muted">
      <label className="flex items-center gap-1.5">
        Tom para análise
        <select
          value={keyValue(value)}
          onChange={(e) => {
            const key = ALL_KEYS.find((k) => keyValue(k) === e.target.value);
            if (key) onChange(key);
          }}
          className="border border-border-default bg-bg-card px-2 py-1 font-heading text-xs text-text-primary cursor-pointer"
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

export function DegreeLegend() {
  return (
    <p className="flex flex-wrap gap-x-3 gap-y-0.5 font-heading text-micro text-text-muted">
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

export function BassMixPicker({
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
              className={`font-heading text-xs px-3 py-1.5 border cursor-pointer ${
                selected
                  ? 'border-text-primary bg-bg-tertiary text-text-primary'
                  : 'border-border-default text-text-muted hover:text-text-primary'
              }`}
            >
              {bassMixLabel(option)}
            </button>
          );
        })}
      </div>
      {mode !== 'full' && (
        <p className="text-small text-text-muted">
          Separação por frequência, com corte em ~{crossoverHz} Hz: o bumbo
          continua no "Só baixo" e os harmônicos agudos do baixo vazam no "Sem
          baixo".
        </p>
      )}
    </div>
  );
}
