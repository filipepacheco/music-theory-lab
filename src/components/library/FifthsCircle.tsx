import { memo } from 'react';
import { FUNCTION_COLORS } from '@/components/library/BassTabBar';
import type { MusicalKey } from '@/domain/bassHarmony';
import {
  keyDegreesOnCircle,
  MAJOR_RING,
  MINOR_RING,
  type CircleCell,
} from '@/domain/circleOfFifths';

interface Props {
  musicalKey: MusicalKey | null;
  current: CircleCell | null;
  previous: CircleCell | null;
  /** pt-BR description of the last root move, shown under the circle. */
  caption: string | null;
  /** Shown small in the middle, e.g. `D menor`. */
  centerLabel: string | null;
  /** Shown large in the middle: the current chord, e.g. `Am`. */
  centerChord: string | null;
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
 * the current chord in amber, an arrow from the chord before it, and the
 * key and current chord written in the middle.
 */
function FifthsCircle({
  musicalKey,
  current,
  previous,
  caption,
  centerLabel,
  centerChord,
  size,
}: Props) {
  const degrees = musicalKey ? keyDegreesOnCircle(musicalKey) : [];
  const cells: CircleCell[] = (['major', 'minor'] as const).flatMap((ring) =>
    Array.from({ length: 12 }, (_, position) => ({ ring, position })),
  );
  const arrow =
    current && previous && !sameCell(current, previous)
      ? arrowBetween(previous, current)
      : null;

  return (
    <figure className="flex flex-col items-center gap-2">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${VIEW} ${VIEW}`}
        role="img"
        aria-label={`Ciclo de quintas${centerChord ? `, acorde atual ${centerChord}` : ''}`}
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
          const [x, y] = cellCentre(cell);
          const name = (cell.ring === 'major' ? MAJOR_RING : MINOR_RING)[
            cell.position
          ];
          const fill = isCurrent
            ? 'var(--color-bass-root-highlight)'
            : degree
              ? `color-mix(in srgb, ${FUNCTION_COLORS[degree.func]} 22%, var(--color-bg-card))`
              : 'var(--color-bg-card)';
          const textColor = isCurrent
            ? ON_HIGHLIGHT
            : degree
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
                fontWeight={isCurrent || degree ? 700 : 500}
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
                  fill={isCurrent ? ON_HIGHLIGHT : FUNCTION_COLORS[degree.func]}
                >
                  {degree.numeral}
                </text>
              )}
            </g>
          );
        })}
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
        {caption ??
          'Cada passo no sentido horário sobe uma quinta; no anti-horário, uma quarta.'}
      </figcaption>
    </figure>
  );
}

export default memo(FifthsCircle);
