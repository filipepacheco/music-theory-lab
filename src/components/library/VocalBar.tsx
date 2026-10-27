import { memo } from 'react';
import { RepeatSign } from '@/components/library/BassTabBar';
import type { LabelLane } from '@/domain/bassChart';
import type { BassChartBar } from '@/domain/bassChart';
import { BAR_PAD_X } from '@/domain/drumGrid';
import { vocalDegree } from '@/domain/vocalDegree';
import type { VocalOnset } from '@/domain/vocalChart';

export const VOCAL_BEAT_WIDTH = 34;
export const VOCAL_BAR_CHROME = BAR_PAD_X * 2 + 2;
export const VOCAL_LABEL_GAP = 4;

const SEMITONE = 6;
const NOTE_HEIGHT = 4;
const LANE_PAD = 14;
const NAME_SIZE = 10;
const LYRIC_SIZE = 11;
const DEGREE_SIZE = 10;
const ROW = 14;
const CHAR_EM = 0.6;

interface Range {
  low: number;
  high: number;
}

/** Semitones the lane shows, with one above and one below the melody. */
function laneSemitones({ low, high }: Range): number {
  return high - low + 2;
}

function laneHeight(range: Range): number {
  return LANE_PAD * 2 + laneSemitones(range) * SEMITONE;
}

function noteY(midi: number, range: Range): number {
  return LANE_PAD + (range.high + 1 - midi) * SEMITONE;
}

export function vocalBarLanes(
  onsets: VocalOnset[],
  names: readonly string[],
  tonic: number | null,
): LabelLane[] {
  const nameChars = (onset: VocalOnset) =>
    Math.max(
      ...onset.notes.map(({ note }) => names[note.midi % 12].length),
    );
  const lanes: LabelLane[] = [
    {
      charWidth: NAME_SIZE * CHAR_EM,
      labels: onsets.map((onset) => ({
        beat: onset.beatInBar,
        chars: nameChars(onset),
      })),
    },
    {
      charWidth: LYRIC_SIZE * CHAR_EM,
      labels: onsets
        .filter((onset) => onset.lyric)
        .map((onset) => ({
          beat: onset.beatInBar,
          chars: onset.lyric!.length,
        })),
    },
  ];
  if (tonic !== null) {
    lanes.push({
      charWidth: DEGREE_SIZE * CHAR_EM,
      labels: onsets.map((onset) => ({
        beat: onset.beatInBar,
        chars: degreesOf(onset, tonic).length,
      })),
    });
  }
  return lanes;
}

function degreesOf(onset: VocalOnset, tonic: number): string {
  return onset.notes.map(({ note }) => vocalDegree(note.midi, tonic)).join('/');
}

interface Props {
  bar: BassChartBar;
  onsets: VocalOnset[];
  range: Range;
  /** The note names of the key, or the sharp names. */
  names: readonly string[];
  /** The tonic of the key from the bass analysis, when degrees show. */
  tonic: number | null;
  activeNotes: readonly number[];
  playhead: number | null;
  onSeek: ((seconds: number) => void) | null;
  beatWidth?: number;
  repeatOf?: number;
}

function spoken(onset: VocalOnset, names: readonly string[]): string {
  const notes = onset.notes
    .map(({ note }) => names[note.midi % 12])
    .join(' e ');
  return onset.lyric ? `${notes} (${onset.lyric})` : notes;
}

function VocalBar({
  bar,
  onsets,
  range,
  names,
  tonic,
  activeNotes,
  playhead,
  onSeek,
  beatWidth = VOCAL_BEAT_WIDTH,
  repeatOf,
}: Props) {
  const repeat = repeatOf !== undefined;
  const width = BAR_PAD_X * 2 + bar.beatCount * beatWidth;
  const lane = laneHeight(range);
  const lyricY = lane + ROW / 2;
  const degreeY = lane + ROW + ROW / 2;
  const height = lane + ROW + (tonic !== null ? ROW : 0) + 2;
  const isActive = playhead !== null;
  const beatSeconds = (bar.endTime - bar.startTime) / bar.beatCount;
  const octaveLines = Array.from(
    { length: laneSemitones(range) + 1 },
    (_, i) => range.low - 1 + i,
  ).filter((midi) => midi % 12 === 0);

  return (
    <button
      type="button"
      onClick={() => onSeek?.(bar.startTime)}
      title={`Compasso ${bar.index + 1} · ${bar.beatCount}/4${
        repeat ? ` · igual ao compasso ${repeatOf + 1}, o de cima` : ''
      }`}
      data-bar={bar.index}
      data-beat-width={beatWidth}
      style={{ width }}
      className={`relative shrink-0 border text-left ${
        isActive
          ? 'border-live bg-live-tint'
          : 'border-border-default bg-bg-card'
      } cursor-pointer hover:border-text-primary`}
    >
      <span className="absolute left-1 top-0 font-heading text-micro leading-none text-text-muted tabular-nums">
        {bar.index + 1}
      </span>
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="block"
        role="img"
        aria-label={`Compasso ${bar.index + 1}: ${
          repeat
            ? `igual ao compasso ${repeatOf + 1}`
            : onsets.length === 0
              ? 'pausa'
              : onsets.map((onset) => spoken(onset, names)).join(', ')
        }`}
      >
        {Array.from({ length: bar.beatCount - 1 }, (_, beat) => (
          <line
            key={`beat-${beat}`}
            x1={BAR_PAD_X + (beat + 1) * beatWidth}
            x2={BAR_PAD_X + (beat + 1) * beatWidth}
            y1={2}
            y2={height - 2}
            stroke="var(--color-border-default)"
            strokeDasharray="1 3"
          />
        ))}
        {octaveLines.map((midi) => (
          <line
            key={`pitch-${midi}`}
            data-pitch-line={midi}
            x1={0}
            x2={width}
            y1={noteY(midi, range) + NOTE_HEIGHT / 2}
            y2={noteY(midi, range) + NOTE_HEIGHT / 2}
            stroke="var(--color-string)"
            strokeOpacity={0.4}
          />
        ))}
        {repeat && <RepeatSign x={width / 2} y={lane / 2} />}
        {playhead !== null && (
          <line
            x1={BAR_PAD_X + playhead * bar.beatCount * beatWidth}
            x2={BAR_PAD_X + playhead * bar.beatCount * beatWidth}
            y1={2}
            y2={height - 2}
            stroke="var(--color-accent)"
            strokeWidth={1.5}
          />
        )}
        {!repeat &&
          onsets.flatMap((onset) =>
            onset.notes.map(({ note, index }) => {
              const x = BAR_PAD_X + note.beatInBar * beatWidth;
              const y = noteY(note.midi, range);
              const active = activeNotes.includes(index);
              const length = Math.max(
                6,
                Math.min(
                  ((note.endTime - note.time) / beatSeconds) * beatWidth,
                  (bar.beatCount - note.beatInBar) * beatWidth,
                ) - 2,
              );
              return (
                <g key={index} data-vocal-note={index}>
                  <rect
                    x={x}
                    y={y}
                    width={length}
                    height={NOTE_HEIGHT}
                    fill={
                      active
                        ? 'var(--color-bass-root-highlight)'
                        : 'var(--color-text-primary)'
                    }
                  />
                  <text
                    x={x}
                    y={y - 5}
                    fontSize={NAME_SIZE}
                    className="font-heading"
                    fill="var(--color-text-secondary)"
                    stroke={
                      isActive
                        ? 'var(--color-live-tint)'
                        : 'var(--color-bg-card)'
                    }
                    strokeWidth={3}
                    paintOrder="stroke"
                    data-note-name
                  >
                    {names[note.midi % 12]}
                  </text>
                </g>
              );
            }),
          )}
        {!repeat &&
          onsets
            .filter((onset) => onset.lyric)
            .map((onset) => (
              <text
                key={`lyric-${onset.beatInBar}`}
                x={BAR_PAD_X + onset.beatInBar * beatWidth}
                y={lyricY}
                dominantBaseline="central"
                fontSize={LYRIC_SIZE}
                className="font-heading"
                fill="var(--color-text-primary)"
                data-lyric
              >
                {onset.lyric}
              </text>
            ))}
        {!repeat &&
          tonic !== null &&
          onsets.map((onset) => (
            <text
              key={`degree-${onset.beatInBar}`}
              x={BAR_PAD_X + onset.beatInBar * beatWidth}
              y={degreeY}
              dominantBaseline="central"
              fontSize={DEGREE_SIZE}
              className="font-heading"
              fill="var(--color-text-muted)"
              data-degree-level={1}
            >
              {degreesOf(onset, tonic)}
            </text>
          ))}
      </svg>
    </button>
  );
}

export default memo(VocalBar);
