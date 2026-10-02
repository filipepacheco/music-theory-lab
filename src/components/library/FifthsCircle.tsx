import { memo } from 'react';
import { FUNCTION_COLORS } from '@/components/library/BassTabBar';
import type { MusicalKey } from '@/domain/bassHarmony';
import {
  keyDegreesOnCircle,
  MAJOR_RING,
  MINOR_RING,
  otherQualityCell,
  type CircleCell,
} from '@/domain/circleOfFifths';

export interface CircleMark extends CircleCell {
  /** The bass left the third open, so the ring is a guess. */
  guess: boolean;
}

interface Props {
  musicalKey: MusicalKey | null;
  current: CircleMark | null;
  /** Where the harmony goes next: outlined, with an arrow from `current`. */
  next: CircleMark | null;
  /** pt-BR description of the coming root move, shown under the circle. */
  caption: string | null;
  /** pt-BR note on whether the current chord's third was played. */
  note: string | null;
  /** Shown small in the middle, e.g. `D menor`. */
  centerLabel: string | null;
  /** Shown large in the middle: the current chord, e.g. `Am`. */
  centerChord: string | null;
  /** Shown small under it: the next chord, e.g. `Dm`. */
  nextChord: string | null;
  /** Rendered width and height in pixels. */
  size: number;
}

/** Drawing units; the SVG scales to `size`. */
const VIEW = 300;
const CENTER = VIEW / 2;
const RINGS = {
  major: { outer: 148, inner: 102 },
  minor: { outer: 102, inner: 62 },
} as const;
const FONT = { major: 15, minor: 12, numeral: 10 } as const;
/** Dark text that stays readable on the amber highlight in both themes. */
const ON_HIGHLIGHT = '#1a1f2e';

function point(radius: number, degrees: number): [number, number] {
  const radians = (degrees * Math.PI) / 180;
  return [
    CENTER + radius * Math.cos(radians),
    CENTER + radius * Math.sin(radians),
  ];
}

/** Angle of a cell's centre: C at the top, clockwise. */
function cellAngle(position: number): number {
  return -90 + position * 30;
}

function cellPath({ ring, position }: CircleCell): string {
  const { outer, inner } = RINGS[ring];
  const start = cellAngle(position) - 15;
  const end = cellAngle(position) + 15;
  const [x1, y1] = point(outer, start);
  const [x2, y2] = point(outer, end);
  const [x3, y3] = point(inner, end);
  const [x4, y4] = point(inner, start);
  return `M${x1} ${y1}A${outer} ${outer} 0 0 1 ${x2} ${y2}L${x3} ${y3}A${inner} ${inner} 0 0 0 ${x4} ${y4}Z`;
}

function cellCentre({ ring, position }: CircleCell): [number, number] {
  const { outer, inner } = RINGS[ring];
  return point((outer + inner) / 2, cellAngle(position));
}

/**
 * The arrow between two cell centres, pulled in at both ends so it does
 * not cover the chord names it connects.
 */
function arrowBetween(
  from: CircleCell,
  to: CircleCell,
): [[number, number], [number, number]] {
  const [x1, y1] = cellCentre(from);
  const [x2, y2] = cellCentre(to);
  const length = Math.hypot(x2 - x1, y2 - y1);
  const trim = Math.min(18, length / 3);
  const ux = (x2 - x1) / length;
  const uy = (y2 - y1) / length;
  return [
    [x1 + ux * trim, y1 + uy * trim],
    [x2 - ux * trim, y2 - uy * trim],
  ];
}

const sameCell = (a: CircleCell | null, b: CircleCell | null) =>
  a !== null && b !== null && a.ring === b.ring && a.position === b.position;

/**
 * The circle of fifths with the key's harmonic field shaded by function,
 * the current chord in amber, an arrow to the chord that comes next (its
 * cell outlined), and the key, current and next chords in the middle. A
 * guessed quality is marked `?`: the current chord is drawn lighter and the
 * same root with the other third gets a dotted outline.
 */
function FifthsCircle({
  musicalKey,
  current,
  next,
  caption,
  note,
  centerLabel,
  centerChord,
  nextChord,
  size,
}: Props) {
  const degrees = musicalKey ? keyDegreesOnCircle(musicalKey) : [];
  const cells: CircleCell[] = (['major', 'minor'] as const).flatMap((ring) =>
    Array.from({ length: 12 }, (_, position) => ({ ring, position })),
  );
  const upcoming = next && !sameCell(current, next) ? next : null;
  const arrow = current && upcoming ? arrowBetween(current, upcoming) : null;
  const alternative = current?.guess ? otherQualityCell(current) : null;

  return (
    <figure className="flex flex-col items-center gap-2">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${VIEW} ${VIEW}`}
        role="img"
        aria-label={`Ciclo de quintas${centerChord ? `, acorde atual ${centerChord}` : ''}${nextChord ? `, próximo ${nextChord}` : ''}`}
      >
        <defs>
          <marker
            id="fifths-arrow"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="5"
            markerHeight="5"
            orient="auto-start-reverse"
          >
            <path d="M0 0L10 5L0 10Z" fill="var(--color-text-primary)" />
          </marker>
        </defs>
        {cells.map((cell) => {
          const degree = degrees.find(
            (d) => d.ring === cell.ring && d.position === cell.position,
          );
          const isCurrent = sameCell(cell, current);
          const isNext = sameCell(cell, upcoming);
          const isAlternative = sameCell(cell, alternative);
          const solid = isCurrent && !current?.guess;
          const unsure =
            isAlternative ||
            (isCurrent && current?.guess) ||
            (isNext && upcoming?.guess);
          const [x, y] = cellCentre(cell);
          const name = `${(cell.ring === 'major' ? MAJOR_RING : MINOR_RING)[cell.position]}${unsure ? '?' : ''}`;
          const fill = solid
            ? 'var(--color-bass-root-highlight)'
            : isCurrent
              ? 'color-mix(in srgb, var(--color-bass-root-highlight) 55%, var(--color-bg-card))'
              : isNext
                ? 'color-mix(in srgb, var(--color-bass-root-highlight) 30%, var(--color-bg-card))'
                : degree
                  ? `color-mix(in srgb, ${FUNCTION_COLORS[degree.func]} 22%, var(--color-bg-card))`
                  : 'var(--color-bg-card)';
          const textColor = solid
            ? ON_HIGHLIGHT
            : degree || isCurrent || isNext || isAlternative
              ? 'var(--color-text-primary)'
              : 'var(--color-text-secondary)';
          return (
            <g key={`${cell.ring}-${cell.position}`}>
              <path
                d={cellPath(cell)}
                fill={fill}
                stroke="var(--color-border-default)"
                strokeWidth={1}
              />
              <text
                x={x}
                y={degree ? y - 6 : y}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={FONT[cell.ring]}
                fontWeight={
                  isCurrent || isNext || isAlternative || degree ? 700 : 500
                }
                className="font-heading"
                fill={textColor}
              >
                {name}
              </text>
              {degree && (
                <text
                  x={x}
                  y={y + 9}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={FONT.numeral}
                  fontWeight={700}
                  className="font-heading"
                  fill={
                    solid
                      ? ON_HIGHLIGHT
                      : isCurrent
                        ? 'var(--color-text-primary)'
                        : FUNCTION_COLORS[degree.func]
                  }
                >
                  {degree.numeral}
                </text>
              )}
            </g>
          );
        })}
        {current?.guess && (
          <path
            d={cellPath(current)}
            fill="none"
            stroke="var(--color-bass-root-highlight)"
            strokeWidth={2.5}
            strokeLinejoin="round"
          />
        )}
        {alternative && (
          <path
            d={cellPath(alternative)}
            fill="none"
            stroke="var(--color-bass-root-highlight)"
            strokeWidth={2.5}
            strokeDasharray="0.1 5"
            strokeLinecap="round"
          />
        )}
        {upcoming && (
          <path
            d={cellPath(upcoming)}
            fill="none"
            stroke="var(--color-bass-root-highlight)"
            strokeWidth={2.5}
            strokeDasharray="5 3"
            strokeLinejoin="round"
          />
        )}
        {centerLabel && (
          <text
            x={CENTER}
            y={CENTER - 16}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={11}
            className="font-heading"
            fill="var(--color-text-muted)"
          >
            {centerLabel}
          </text>
        )}
        {centerChord && (
          <text
            x={CENTER}
            y={CENTER + 8}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={24}
            fontWeight={700}
            className="font-heading"
            fill="var(--color-text-primary)"
          >
            {centerChord}
          </text>
        )}
        {centerChord && nextChord && (
          <text
            x={CENTER}
            y={CENTER + 33}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={11}
            className="font-heading"
            fill="var(--color-text-secondary)"
          >
            {`→ ${nextChord}`}
          </text>
        )}
        {arrow && (
          <line
            x1={arrow[0][0]}
            y1={arrow[0][1]}
            x2={arrow[1][0]}
            y2={arrow[1][1]}
            stroke="var(--color-text-primary)"
            strokeWidth={2}
            strokeOpacity={0.75}
            markerEnd="url(#fifths-arrow)"
          />
        )}
      </svg>
      <figcaption
        className="text-center text-xs leading-snug text-text-secondary min-h-[2lh]"
        style={{ maxWidth: size }}
      >
        {note && <span className="block mb-1 text-text-muted">{note}</span>}
        {caption ??
          'Cada passo no sentido horário sobe uma quinta; no anti-horário, uma quarta.'}
      </figcaption>
    </figure>
  );
}

export default memo(FifthsCircle);
