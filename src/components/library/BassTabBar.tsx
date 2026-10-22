import { memo } from 'react';
import {
  barChordSymbol,
  degreeLabel,
  describeEvidence,
  type AnalyzedNote,
  type BarAnalysis,
  type DegreeCategory,
} from '@/domain/bassAnalysis';
import {
  degreeLanePlaces,
  MAX_BEAT_WIDTH_SCALE,
  type BassChartBar,
  type BassChartNote,
  type LabelLane,
} from '@/domain/bassChart';
import { BAR_PAD_X, beatMarkX } from '@/domain/drumGrid';
import type { HarmonicSegment } from '@/domain/bassHarmony';
import type { HarmonicFunction } from '@/constants/harmonicFields';

export interface IndexedNote {
  note: BassChartNote;
  index: number;
}

interface Props {
  bar: BassChartBar;
  notes: IndexedNote[];
  activeNotes: readonly number[];
  playhead: number | null;
  onSeek: ((seconds: number) => void) | null;
  analysis: BarAnalysis | null;
  segment: HarmonicSegment | null;
  avoidNotes: ReadonlySet<number> | null;
  noteNames: readonly string[];
  beatWidth?: number;
  repeatOf?: number;
  degreeLevels?: number;
  kickBeats?: readonly number[];
  octave?: number;
  selected?: boolean;
}

export const FUNCTION_COLORS: Record<HarmonicFunction, string> = {
  T: 'var(--color-tonic-text)',
  SD: 'var(--color-subdominant-text)',
  D: 'var(--color-dominant-text)',
};

export const DEGREE_COLORS: Record<DegreeCategory, string> = {
  root: 'var(--color-text-primary)',
  third: 'var(--color-degree-third)',
  fifth: 'var(--color-degree-fifth)',
  seventh: 'var(--color-degree-seventh)',
  tension: 'var(--color-degree-tension)',
  ornament: 'var(--color-text-muted)',
};

const ROOT_SOURCE_NOTES = {
  downbeat: '',
  tied: 'raiz ligada do compasso anterior',
  estimated: 'sem nota no tempo 1: raiz estimada',
} as const;

function barTitle(
  bar: BassChartBar,
  analysis: BarAnalysis | null,
  segment: HarmonicSegment | null,
): string {
  const base = `Compasso ${bar.index + 1} · ${bar.beatCount}/4`;
  if (!analysis?.rootSource) return base;
  const harmony = segment?.harmony;
  return [
    base,
    harmony ? `${harmony.numeral}: ${harmony.detail}` : '',
    harmony && !harmony.confirmed && harmony.kind === 'diatonic'
      ? 'qualidade suposta pelo campo harmônico'
      : '',
    describeEvidence(analysis.evidence),
    ROOT_SOURCE_NOTES[analysis.rootSource],
  ]
    .filter(Boolean)
    .join(' · ');
}

export const BEAT_WIDTH = 34;
const MAX_SHIFT_WIDTH = BEAT_WIDTH * MAX_BEAT_WIDTH_SCALE;
const PAD_X = BAR_PAD_X;
export const BAR_CHROME = PAD_X * 2 + 2;
const FRET_FONT_SIZE = 11;
const DEGREE_FONT_SIZE = 10;
const PAD_TOP = 9;
const LINE_GAP = 12;
const STRING_COUNT = 4;
const HEIGHT = PAD_TOP * 2 + LINE_GAP * (STRING_COUNT - 1);
const DEGREE_LANE = 12;
const KICK_LANE = 14;
const KICK_RADIUS = 3.5;

export function tabBarWidth(
  beatCount: number,
  beatWidth: number = BEAT_WIDTH,
): number {
  return BAR_CHROME + beatCount * beatWidth;
}

export function RepeatSign({ x, y }: { x: number; y: number }) {
  return (
    <g aria-hidden fill="var(--color-text-secondary)">
      <line
        x1={x - 9}
        y1={y + 11}
        x2={x + 9}
        y2={y - 11}
        stroke="var(--color-text-secondary)"
        strokeWidth={3.5}
        strokeLinecap="round"
      />
      <circle cx={x - 8} cy={y - 6} r={2.6} />
      <circle cx={x + 8} cy={y + 6} r={2.6} />
    </g>
  );
}

export function noteLabel(note: BassChartNote): string {
  const base = note.techniques.includes('mute') ? 'x' : String(note.fret);
  if (note.slideToFret === null) return base;
  return `${base}${note.slideToFret > note.fret ? '/' : '\\'}`;
}

const CHAR_EM = 0.6;
export const LABEL_GAP = 4;

export function barLabelLanes(
  notes: IndexedNote[],
  analysis: BarAnalysis | null,
): LabelLane[] {
  const lanes: LabelLane[] = [];
  for (let string = 0; string < STRING_COUNT; string += 1) {
    lanes.push({
      charWidth: FRET_FONT_SIZE * CHAR_EM,
      labels: notes
        .filter(({ note }) => note.string === string)
        .map(({ note }) => ({
          beat: note.beatInBar,
          chars: noteLabel(note).length,
        })),
    });
  }
  if (analysis) lanes.push(degreeLane(degreeOnsets(notes, analysis)));
  return lanes;
}

type DegreeOnset = [beatInBar: number, degrees: AnalyzedNote[]];

function degreeOnsets(
  notes: IndexedNote[],
  analysis: BarAnalysis | null,
): DegreeOnset[] {
  if (!analysis) return [];
  const degrees = new Map(analysis.notes.map((n) => [n.index, n]));
  const onsets = new Map<number, AnalyzedNote[]>();
  for (const { note, index } of notes) {
    const degree = degrees.get(index);
    if (!degree || !degreeLabel(degree)) continue;
    onsets.set(note.beatInBar, [...(onsets.get(note.beatInBar) ?? []), degree]);
  }
  return [...onsets].map(([beat, atOnset]) => [
    beat,
    atOnset.sort((a, b) => (a.midi ?? 0) - (b.midi ?? 0)),
  ]);
}

function degreeLane(onsets: DegreeOnset[]): LabelLane {
  return {
    charWidth: DEGREE_FONT_SIZE * CHAR_EM,
    labels: onsets.map(([beat, atOnset]) => ({
      beat,
      chars: atOnset.map(degreeLabel).join('/').length,
    })),
  };
}

export function barDegreeLevels(
  notes: IndexedNote[],
  analysis: BarAnalysis | null,
  beatWidth: number,
): number {
  const lane = degreeLane(degreeOnsets(notes, analysis));
  return Math.max(
    1,
    ...degreeLanePlaces(lane, beatWidth, LABEL_GAP, MAX_SHIFT_WIDTH).map(
      (p) => p.level + 1,
    ),
  );
}

function stringY(string: number): number {
  return PAD_TOP + (STRING_COUNT - 1 - string) * LINE_GAP;
}

function spokenKicks(beats: readonly number[]): string {
  return beats.length === 0
    ? 'Bumbo: nenhum'
    : `Bumbo no tempo ${beats.map((beat) => beat + 1).join(', ')}`;
}

export function barUncertainty(
  analysis: BarAnalysis | null,
  noteNames: readonly string[],
): string {
  if (!analysis || analysis.evidence.chordType) return '';
  if (!barChordSymbol(analysis, noteNames)) return '';
  return analysis.evidence.third === null
    ? 'O baixo não tocou a 3ª: pode ser maior ou menor'
    : 'As notas tocadas permitem mais de um acorde';
}

export function barDetails({
  bar,
  notes,
  analysis,
  segment,
  avoidNotes,
  noteNames,
  repeatOf,
  octave = 0,
}: {
  bar: BassChartBar;
  notes: IndexedNote[];
  analysis: BarAnalysis | null;
  segment: HarmonicSegment | null;
  avoidNotes: ReadonlySet<number> | null;
  noteNames: readonly string[];
  repeatOf?: number;
  octave?: number;
}): string {
  const avoided = analysis
    ? notes.some(({ index }) => {
        const degree = analysis.notes.find((n) => n.index === index);
        return avoidNotes?.has(index) && degree && degreeLabel(degree);
      })
    : false;
  return [
    barTitle(bar, analysis, segment),
    barUncertainty(analysis, noteNames),
    avoided
      ? 'Graus sublinhados — Nota evitada: forma b9 com uma nota do acorde'
      : '',
    repeatOf !== undefined
      ? `igual ao compasso ${repeatOf + 1}, o de cima`
      : '',
    octave
      ? `${Math.abs(octave)} ${Math.abs(octave) === 1 ? 'oitava' : 'oitavas'} ${octave > 0 ? 'acima' : 'abaixo'}`
      : '',
  ]
    .filter(Boolean)
    .join(' · ');
}

function BassTabBar({
  bar,
  notes,
  activeNotes,
  playhead,
  onSeek,
  analysis,
  segment,
  avoidNotes,
  noteNames,
  beatWidth = BEAT_WIDTH,
  repeatOf,
  octave = 0,
  selected = false,
  degreeLevels,
  kickBeats,
}: Props) {
  const repeat = repeatOf !== undefined;
  const width = PAD_X * 2 + bar.beatCount * beatWidth;
  const isActive = playhead !== null;
  const degrees = new Map<number, AnalyzedNote>(
    analysis?.notes.map((n) => [n.index, n]),
  );
  const symbol = analysis ? barChordSymbol(analysis, noteNames) : null;
  const degreeOf = (index: number): AnalyzedNote | null => {
    const degree = degrees.get(index);
    return degree && degreeLabel(degree) ? degree : null;
  };
  const onsets = degreeOnsets(notes, analysis);
  const places = degreeLanePlaces(
    degreeLane(onsets),
    beatWidth,
    LABEL_GAP,
    MAX_SHIFT_WIDTH,
  );
  const levels = Math.max(
    degreeLevels ?? 1,
    ...places.map((place) => place.level + 1),
  );
  const kickLane = kickBeats ? KICK_LANE : 0;
  const degreeY = HEIGHT + kickLane + DEGREE_LANE / 2 - 2;
  const svgHeight = HEIGHT + kickLane + (analysis ? DEGREE_LANE * levels : 0);
  const spoken = ({ note, index }: IndexedNote): string => {
    const degree = degreeOf(index);
    return degree
      ? `${noteLabel(note)} (${degreeLabel(degree)})`
      : noteLabel(note);
  };
  const uncertainty = barUncertainty(analysis, noteNames);
  const details = barDetails({
    bar,
    notes,
    analysis,
    segment,
    avoidNotes,
    noteNames,
    repeatOf,
    octave,
  });
  return (
    <button
      type="button"
      onClick={() => onSeek?.(bar.startTime)}
      title={details}
      data-bar={bar.index}
      data-octave={octave || undefined}
      aria-pressed={selected || undefined}
      data-beat-width={beatWidth}
      style={{ width: tabBarWidth(bar.beatCount, beatWidth) }}
      className={`relative shrink-0 border text-left ${
        isActive
          ? 'border-live bg-live-tint'
          : selected
            ? 'border-text-primary bg-bg-card'
            : 'border-border-default bg-bg-card'
      } cursor-pointer hover:border-text-primary`}
    >
      <span className="absolute left-1 top-0 font-heading text-micro leading-none text-text-muted tabular-nums">
        {bar.index + 1}
        {octave !== 0 && (
          <span aria-hidden="true" className="text-text-primary">
            {octave > 0 ? '▲' : '▼'}
            {Math.abs(octave) > 1 ? Math.abs(octave) : ''}
          </span>
        )}
      </span>
      {analysis && repeat && <span className="block h-6" />}
      {analysis && !repeat && (
        <span className="flex h-6 items-center justify-between gap-1 pl-7 pr-1 font-heading">
          <span
            className="text-meta font-semibold leading-none"
            style={{
              color: segment?.harmony.func
                ? FUNCTION_COLORS[segment.harmony.func]
                : 'var(--color-text-secondary)',
            }}
          >
            {segment?.harmony.numeral}
          </span>
          {symbol && <ChordTag symbol={symbol} uncertainty={uncertainty} />}
        </span>
      )}
      <svg
        width={width}
        height={svgHeight}
        viewBox={`0 0 ${width} ${svgHeight}`}
        className="block"
        role="img"
        aria-label={`${
          repeat
            ? `Compasso ${bar.index + 1}: igual ao compasso ${repeatOf + 1}`
            : `Compasso ${bar.index + 1}${symbol ? ` (${symbol})` : ''}: ${
                notes.length === 0 ? 'pausa' : notes.map(spoken).join(' ')
              }`
        }${kickBeats ? `. ${spokenKicks(kickBeats)}` : ''}`}
      >
        {Array.from({ length: bar.beatCount - 1 }, (_, beat) => (
          <line
            key={`beat-${beat}`}
            x1={PAD_X + (beat + 1) * beatWidth}
            x2={PAD_X + (beat + 1) * beatWidth}
            y1={PAD_TOP - 3}
            y2={analysis || kickBeats ? svgHeight - 2 : HEIGHT - PAD_TOP + 3}
            stroke="var(--color-border-default)"
            strokeDasharray="1 3"
          />
        ))}
        {Array.from({ length: STRING_COUNT }, (_, string) => (
          <line
            key={`string-${string}`}
            x1={0}
            x2={width}
            y1={stringY(string)}
            y2={stringY(string)}
            stroke="var(--color-string)"
            strokeOpacity={repeat ? 0.25 : 0.55}
          />
        ))}
        {repeat && <RepeatSign x={width / 2} y={HEIGHT / 2} />}
        {playhead !== null && (
          <line
            x1={PAD_X + playhead * bar.beatCount * beatWidth}
            x2={PAD_X + playhead * bar.beatCount * beatWidth}
            y1={2}
            y2={svgHeight - 2}
            stroke="var(--color-accent)"
            strokeWidth={1.5}
          />
        )}
        {kickBeats && (
          <g data-kick-row aria-hidden>
            {kickBeats.map((beat) => (
              <circle
                key={beat}
                data-kick-beat={beat}
                cx={beatMarkX(beat, beatWidth)}
                cy={HEIGHT + KICK_LANE / 2 - 2}
                r={KICK_RADIUS}
                fill="var(--color-text-primary)"
              />
            ))}
          </g>
        )}
        {!repeat &&
          notes.map(({ note, index }) => {
            const active = activeNotes.includes(index);
            const category = degrees.get(index)?.category;
            return (
              <text
                key={index}
                x={PAD_X + note.beatInBar * beatWidth + 1}
                y={stringY(note.string)}
                dominantBaseline="central"
                fontSize={FRET_FONT_SIZE}
                fontWeight={
                  active || note.techniques.includes('accent') ? 700 : 500
                }
                className="font-heading"
                fill={
                  active
                    ? 'var(--color-bass-root-highlight)'
                    : category
                      ? DEGREE_COLORS[category]
                      : 'var(--color-text-primary)'
                }
                stroke={
                  isActive ? 'var(--color-live-tint)' : 'var(--color-bg-card)'
                }
                strokeWidth={3}
                paintOrder="stroke"
              >
                {noteLabel(note)}
              </text>
            );
          })}
        {!repeat &&
          onsets.map(([beatInBar, atOnset], onset) => (
            <text
              key={`degree-${beatInBar}`}
              x={PAD_X + places[onset].x + 1}
              y={degreeY + places[onset].level * DEGREE_LANE}
              dominantBaseline="central"
              fontSize={DEGREE_FONT_SIZE}
              className="font-heading"
              data-degree-level={places[onset].level + 1}
            >
              {atOnset.map((degree, i) => {
                const avoid = avoidNotes?.has(degree.index) ?? false;
                return (
                  <tspan
                    key={degree.index}
                    fill={
                      degree.category
                        ? DEGREE_COLORS[degree.category]
                        : 'var(--color-text-primary)'
                    }
                    fontWeight={degree.category === 'root' ? 700 : 500}
                    textDecoration={avoid ? 'underline' : undefined}
                  >
                    {i > 0 ? '/' : ''}
                    {degreeLabel(degree)}
                    {avoid && (
                      <title>
                        Nota evitada: forma b9 com uma nota do acorde
                      </title>
                    )}
                  </tspan>
                );
              })}
            </text>
          ))}
      </svg>
    </button>
  );
}

function ChordTag({
  symbol,
  uncertainty,
}: {
  symbol: string;
  uncertainty: string;
}) {
  if (!uncertainty) {
    return (
      <span
        data-chord-tag="certain"
        className="border border-text-primary px-1 text-ui font-semibold leading-tight text-text-primary"
      >
        {symbol}
      </span>
    );
  }
  return (
    <span
      data-chord-tag="guess"
      title={uncertainty}
      className="border border-dashed border-border-strong px-1 text-ui leading-tight text-text-secondary"
    >
      {symbol}
      <span className="font-semibold text-text-primary">?</span>
    </span>
  );
}

export default memo(BassTabBar);
