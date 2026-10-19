import { memo } from 'react';
import { BEAT_WIDTH, RepeatSign } from '@/components/library/BassTabBar';
import type { BassChartBar } from '@/domain/bassChart';
import {
  BAR_PAD_X,
  beatMarkX,
  DRUM_MARK_WIDTH,
  drumBarSpoken,
  DRUM_GRID_ROW_LABEL,
  DRUM_GRID_ROW_NAME,
  type DrumGridMark,
  type DrumGridRow,
} from '@/domain/drumGrid';

export const DRUM_BEAT_WIDTH = BEAT_WIDTH;
const PAD_X = BAR_PAD_X;
export const DRUM_BAR_CHROME = PAD_X * 2 + 2;
const SYMBOL_FONT_SIZE = 11;
const ACCENT_FONT_SIZE = 10;
export const DRUM_CHAR_WIDTH = DRUM_MARK_WIDTH;
export const DRUM_LABEL_GAP = 4;
const PAD_TOP = 22;
const PAD_BOTTOM = 9;
const ROW_GAP = 18;
const ACCENT_RISE = 9;
const DOT_RADIUS = 2.6;
const ACCENT_DOT_RADIUS = DRUM_CHAR_WIDTH / 2;
export const DRUM_LABEL_WIDTH = 52;

const rowY = (index: number) => PAD_TOP + index * ROW_GAP;

export function drumGridHeight(rowCount: number): number {
  return PAD_TOP + Math.max(0, rowCount - 1) * ROW_GAP + PAD_BOTTOM;
}

export function drumBarWidth(beatCount: number, beatWidth: number): number {
  return DRUM_BAR_CHROME + beatCount * beatWidth;
}

interface Props {
  bar: BassChartBar;
  rows: readonly DrumGridRow[];
  marks: DrumGridMark[];
  beatWidth: number;
  repeatOf?: number;
  playhead: number | null;
  fill?: boolean;
  onSeek: ((seconds: number) => void) | null;
}

function DrumGridBar({
  bar,
  rows,
  marks,
  beatWidth,
  repeatOf,
  playhead,
  fill = false,
  onSeek,
}: Props) {
  const repeat = repeatOf !== undefined;
  const width = PAD_X * 2 + bar.beatCount * beatWidth;
  const height = drumGridHeight(rows.length);
  const isActive = playhead !== null;
  const ground = isActive ? 'var(--color-live-tint)' : 'var(--color-bg-card)';
  const number = bar.index + 1;
  return (
    <button
      type="button"
      onClick={onSeek ? () => onSeek(bar.startTime) : undefined}
      disabled={onSeek === null}
      title={
        repeat
          ? `Compasso ${number} · igual ao compasso ${repeatOf + 1}, o de cima`
          : `Compasso ${number}`
      }
      data-bar={bar.index}
      data-beat-width={beatWidth}
      data-active={isActive}
      style={{ width: drumBarWidth(bar.beatCount, beatWidth) }}
      className={`relative shrink-0 border text-left ${
        isActive
          ? 'border-live bg-live-tint'
          : 'border-border-default bg-bg-card'
      } ${onSeek ? 'cursor-pointer hover:border-text-primary' : 'cursor-default'}`}
    >
      <span className="absolute left-1 top-0 font-heading text-micro leading-none text-text-muted tabular-nums">
        {number}
      </span>
      {fill && (
        <span
          data-fill-mark
          title="Virada: este compasso foge do groove da seção"
          className="absolute right-1 top-0 font-heading text-micro font-semibold leading-none text-accent"
        >
          Virada
        </span>
      )}
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="block"
        role="img"
        aria-label={
          repeat
            ? `Compasso ${number}: igual ao compasso ${repeatOf + 1}`
            : `Compasso ${number}: ${drumBarSpoken(marks, rows)}`
        }
      >
        {Array.from({ length: bar.beatCount - 1 }, (_, beat) => (
          <line
            key={`beat-${beat}`}
            x1={PAD_X + (beat + 1) * beatWidth}
            x2={PAD_X + (beat + 1) * beatWidth}
            y1={PAD_TOP - 6}
            y2={height - PAD_BOTTOM + 6}
            stroke="var(--color-border-default)"
            strokeDasharray="1 3"
          />
        ))}
        {rows.map((row, index) => (
          <line
            key={row}
            data-row={row}
            x1={0}
            x2={width}
            y1={rowY(index)}
            y2={rowY(index)}
            stroke="var(--color-border-default)"
            strokeOpacity={repeat ? 0.5 : 1}
          />
        ))}
        {repeat && <RepeatSign x={width / 2} y={height / 2} />}
        {playhead !== null && (
          <line
            data-playhead
            x1={PAD_X + playhead * bar.beatCount * beatWidth}
            x2={PAD_X + playhead * bar.beatCount * beatWidth}
            y1={2}
            y2={height - 2}
            stroke="var(--color-accent)"
            strokeWidth={1.5}
          />
        )}
        {!repeat &&
          marks.map((mark) => {
            const rowIndex = rows.indexOf(mark.row);
            if (rowIndex < 0) return null;
            const x = beatMarkX(mark.beat, beatWidth);
            const y = rowY(rowIndex);
            const accent = mark.dynamic === 'accent';
            const text = {
              y,
              textAnchor: 'middle' as const,
              dominantBaseline: 'central' as const,
              fontSize: SYMBOL_FONT_SIZE,
              className: 'font-heading',
              fill: 'var(--color-text-primary)',
              stroke: ground,
              strokeWidth: 3,
              paintOrder: 'stroke',
            };
            return (
              <g
                key={`${mark.row}@${mark.beat}`}
                data-mark={mark.row}
                data-beat={mark.beat}
                data-symbol={mark.symbol}
                data-dynamic={mark.dynamic}
              >
                {accent && (
                  <text
                    {...text}
                    x={x}
                    y={y - ACCENT_RISE}
                    fontSize={ACCENT_FONT_SIZE}
                    fontWeight={600}
                  >
                    &gt;
                  </text>
                )}
                {mark.dynamic === 'ghost' && (
                  <text {...text} x={x - DRUM_CHAR_WIDTH} fontWeight={400}>
                    (
                  </text>
                )}
                {mark.symbol === 'dot' ? (
                  <circle
                    cx={x}
                    cy={y}
                    r={accent ? ACCENT_DOT_RADIUS : DOT_RADIUS}
                    fill="var(--color-text-primary)"
                  />
                ) : (
                  <text {...text} x={x} fontWeight={accent ? 600 : 400}>
                    {mark.symbol}
                  </text>
                )}
                {mark.dynamic === 'ghost' && (
                  <text {...text} x={x + DRUM_CHAR_WIDTH} fontWeight={400}>
                    )
                  </text>
                )}
              </g>
            );
          })}
      </svg>
    </button>
  );
}

export default memo(DrumGridBar);

export function DrumRowLabels({ rows }: { rows: readonly DrumGridRow[] }) {
  return (
    <div
      data-row-labels
      role="list"
      aria-label="Peças da grade"
      style={{
        height: drumGridHeight(rows.length) + 2,
        paddingTop: 1 + PAD_TOP - ROW_GAP / 2,
      }}
    >
      {rows.map((row) => (
        <div
          key={row}
          role="listitem"
          title={DRUM_GRID_ROW_NAME[row]}
          style={{ height: ROW_GAP }}
          className="flex items-center justify-end pr-1 font-heading text-small leading-none text-text-muted"
        >
          {DRUM_GRID_ROW_LABEL[row]}
        </div>
      ))}
    </div>
  );
}
