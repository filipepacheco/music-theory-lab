import { memo } from 'react';
import {
  barChordSymbol,
  degreeLabel,
  describeEvidence,
  type AnalyzedNote,
  type BarAnalysis,
  type DegreeCategory,
} from '@/domain/bassAnalysis';
import type { BassChartBar, BassChartNote } from '@/domain/bassChart';
import type { HarmonicSegment } from '@/domain/bassHarmony';
import type { HarmonicFunction } from '@/constants/harmonicFields';

export interface IndexedNote {
  note: BassChartNote;
  /** Position in `chart.notes`. */
  index: number;
}

interface Props {
  bar: BassChartBar;
  notes: IndexedNote[];
  /** Chart note indexes sounding now; only meaningful for the active bar. */
  activeNotes: readonly number[];
  /** 0–1 position of the playhead inside this bar, or null elsewhere. */
  playhead: number | null;
  onSeek: ((seconds: number) => void) | null;
  /**
   * When set, frets take their degree's colour and a lane under the strings
   * names each note's degree over the bar's root.
   */
  analysis: BarAnalysis | null;
  /** The chord this bar belongs to, read in the chosen key. */
  segment: HarmonicSegment | null;
  /** Chart note indexes to mark as avoid notes. */
  avoidNotes: ReadonlySet<number> | null;
  /** Note names for chord symbols, spelled for the key in use. */
  noteNames: readonly string[];
  /**
   * The bar's share of its line as a CSS width, when the section is laid
   * out a fixed number of bars per line. The bar then shrinks to fit, down
   * to `MIN_FIT_SCALE` of its size, and never grows past it.
   */
  fitWidth?: string;
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
const PAD_X = 7;
const PAD_TOP = 9;
const LINE_GAP = 12;
const STRING_COUNT = 4;
const HEIGHT = PAD_TOP * 2 + LINE_GAP * (STRING_COUNT - 1);
/** Height of the degree lane drawn under the strings. */
const DEGREE_LANE = 12;
const DEGREE_Y = HEIGHT + DEGREE_LANE / 2 - 2;
/** How far a bar may shrink to keep a chosen line length before wrapping. */
export const MIN_FIT_SCALE = 0.8;

/** A bar's drawn width in pixels, border included. */
export function tabBarWidth(beatCount: number): number {
  return PAD_X * 2 + beatCount * BEAT_WIDTH + 2;
}

/** Tab label for one note: fret, `x` for a dead note, slide direction. */
function noteLabel(note: BassChartNote): string {
  const base = note.techniques.includes('mute') ? 'x' : String(note.fret);
  if (note.slideToFret === null) return base;
  return `${base}${note.slideToFret > note.fret ? '/' : '\\'}`;
}

/** Y of a string; the highest string (G) is drawn on top, as in tab. */
function stringY(string: number): number {
  return PAD_TOP + (STRING_COUNT - 1 - string) * LINE_GAP;
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
  fitWidth,
}: Props) {
  const width = PAD_X * 2 + bar.beatCount * BEAT_WIDTH;
  const outer = tabBarWidth(bar.beatCount);
  const fitStyle = fitWidth
    ? {
        width: fitWidth,
        maxWidth: outer,
        minWidth: Math.round(outer * MIN_FIT_SCALE),
      }
    : undefined;
  const isActive = playhead !== null;
  const degrees = new Map<number, AnalyzedNote>(
    analysis?.notes.map((n) => [n.index, n]),
  );
  const symbol = analysis ? barChordSymbol(analysis, noteNames) : null;
  const svgHeight = analysis ? HEIGHT + DEGREE_LANE : HEIGHT;
  const degreeOf = (index: number): AnalyzedNote | null => {
    const degree = degrees.get(index);
    return degree && degreeLabel(degree) ? degree : null;
  };
  // One lane entry per onset; a double stop lists its degrees low to high.
  const onsets = new Map<number, AnalyzedNote[]>();
  for (const { note, index } of notes) {
    const degree = degreeOf(index);
    if (!degree) continue;
    const atOnset = onsets.get(note.beatInBar) ?? [];
    atOnset.push(degree);
    onsets.set(note.beatInBar, atOnset);
  }
  const spoken = ({ note, index }: IndexedNote): string => {
    const degree = degreeOf(index);
    return degree
      ? `${noteLabel(note)} (${degreeLabel(degree)})`
      : noteLabel(note);
  };
  return (
    <button
      type="button"
      onClick={onSeek ? () => onSeek(bar.startTime) : undefined}
      disabled={onSeek === null}
      title={barTitle(bar, analysis, segment)}
      data-bar={bar.index}
      style={fitStyle}
      className={`relative shrink-0 rounded-button border text-left transition-colors ${
        isActive
          ? 'border-text-primary bg-bg-hover'
          : 'border-border-default bg-bg-card'
      } ${onSeek ? 'cursor-pointer hover:border-text-primary' : 'cursor-default'}`}
    >
      <span className="absolute left-1 top-0 font-heading text-[8px] leading-none text-text-muted tabular-nums">
        {bar.index + 1}
      </span>
      {analysis && (
        <span className="flex h-3 items-start justify-between gap-1 pl-5 pr-1 pt-0.5 font-heading text-[10px] leading-none">
          <span
            className="font-bold"
            style={{
              color: segment?.harmony.func
                ? FUNCTION_COLORS[segment.harmony.func]
                : 'var(--color-text-secondary)',
            }}
          >
            {segment?.harmony.numeral}
          </span>
          <span className="text-text-primary">
            {symbol}
            {symbol && !analysis.evidence.chordType && (
              <span
                className="text-text-muted"
                title={
                  analysis.evidence.third === null
                    ? 'O baixo não tocou a 3ª: pode ser maior ou menor'
                    : 'As notas tocadas permitem mais de um acorde'
                }
              >
                ?
              </span>
            )}
          </span>
        </span>
      )}
      <svg
        width={width}
        height={svgHeight}
        viewBox={`0 0 ${width} ${svgHeight}`}
        style={fitWidth ? { width: '100%', height: 'auto' } : undefined}
        role="img"
        aria-label={`Compasso ${bar.index + 1}${symbol ? ` (${symbol})` : ''}: ${
          notes.length === 0 ? 'pausa' : notes.map(spoken).join(' ')
        }`}
      >
        {Array.from({ length: bar.beatCount - 1 }, (_, beat) => (
          <line
            key={`beat-${beat}`}
            x1={PAD_X + (beat + 1) * BEAT_WIDTH}
            x2={PAD_X + (beat + 1) * BEAT_WIDTH}
            y1={PAD_TOP - 3}
            y2={analysis ? svgHeight - 2 : HEIGHT - PAD_TOP + 3}
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
            strokeOpacity={0.55}
          />
        ))}
        {playhead !== null && (
          <line
            x1={PAD_X + playhead * bar.beatCount * BEAT_WIDTH}
            x2={PAD_X + playhead * bar.beatCount * BEAT_WIDTH}
            y1={2}
            y2={svgHeight - 2}
            stroke="var(--color-accent)"
            strokeWidth={1.5}
          />
        )}
        {notes.map(({ note, index }) => {
          const active = activeNotes.includes(index);
          const category = degrees.get(index)?.category;
          return (
            <text
              key={index}
              x={PAD_X + note.beatInBar * BEAT_WIDTH + 1}
              y={stringY(note.string)}
              dominantBaseline="central"
              fontSize={11}
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
                isActive ? 'var(--color-bg-hover)' : 'var(--color-bg-card)'
              }
              strokeWidth={3}
              paintOrder="stroke"
            >
              {noteLabel(note)}
            </text>
          );
        })}
        {[...onsets].map(([beatInBar, atOnset]) => (
          <text
            key={`degree-${beatInBar}`}
            x={PAD_X + beatInBar * BEAT_WIDTH + 1}
            y={DEGREE_Y}
            dominantBaseline="central"
            fontSize={9}
            className="font-heading"
          >
            {[...atOnset]
              .sort((a, b) => (a.midi ?? 0) - (b.midi ?? 0))
              .map((degree, i) => {
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

export default memo(BassTabBar);
