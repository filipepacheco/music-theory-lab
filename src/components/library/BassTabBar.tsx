import { memo } from 'react';
import type { BassChartBar, BassChartNote } from '@/domain/bassChart';

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
}

export const BEAT_WIDTH = 34;
const PAD_X = 7;
const PAD_TOP = 9;
const LINE_GAP = 12;
const STRING_COUNT = 4;
const HEIGHT = PAD_TOP * 2 + LINE_GAP * (STRING_COUNT - 1);

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

function BassTabBar({ bar, notes, activeNotes, playhead, onSeek }: Props) {
  const width = PAD_X * 2 + bar.beatCount * BEAT_WIDTH;
  const isActive = playhead !== null;
  return (
    <button
      type="button"
      onClick={onSeek ? () => onSeek(bar.startTime) : undefined}
      disabled={onSeek === null}
      title={`Compasso ${bar.index + 1} · ${bar.beatCount}/4`}
      data-bar={bar.index}
      className={`relative shrink-0 rounded-button border text-left transition-colors ${
        isActive
          ? 'border-text-primary bg-bg-hover'
          : 'border-border-default bg-bg-card'
      } ${onSeek ? 'cursor-pointer hover:border-text-primary' : 'cursor-default'}`}
    >
      <span className="absolute left-1 top-0 font-heading text-[8px] leading-none text-text-muted tabular-nums">
        {bar.index + 1}
      </span>
      <svg
        width={width}
        height={HEIGHT}
        viewBox={`0 0 ${width} ${HEIGHT}`}
        role="img"
        aria-label={`Compasso ${bar.index + 1}: ${
          notes.length === 0
            ? 'pausa'
            : notes.map(({ note }) => noteLabel(note)).join(' ')
        }`}
      >
        {Array.from({ length: bar.beatCount - 1 }, (_, beat) => (
          <line
            key={`beat-${beat}`}
            x1={PAD_X + (beat + 1) * BEAT_WIDTH}
            x2={PAD_X + (beat + 1) * BEAT_WIDTH}
            y1={PAD_TOP - 3}
            y2={HEIGHT - PAD_TOP + 3}
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
            y2={HEIGHT - 2}
            stroke="var(--color-accent)"
            strokeWidth={1.5}
          />
        )}
        {notes.map(({ note, index }) => {
          const active = activeNotes.includes(index);
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
      </svg>
    </button>
  );
}

export default memo(BassTabBar);
