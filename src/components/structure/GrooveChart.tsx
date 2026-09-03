import {
  DEFAULT_GROOVE_SUBDIVISION,
  DRUM_PIECES,
  GROOVE_SUBDIVISIONS,
  grooveTotalStepCount,
} from '@/constants/groove';
import { grooveHits } from '@/domain/grooveSchedule';
import { grooveChartLayout } from '@/utils/grooveChartLayout';
import type { DrumPiece, GroovePattern } from '@/types';

interface GrooveChartProps {
  groove: GroovePattern;
  color: string;
  currentTick?: number;
}

function resolutionLabel(groove: GroovePattern): string {
  const subdivision = groove.subdivision ?? DEFAULT_GROOVE_SUBDIVISION;
  return (
    GROOVE_SUBDIVISIONS.find((option) => option.id === subdivision)
      ?.shortLabel ?? '1/16'
  );
}

function emptyBeatPath(x: number, y: number): string {
  return `M ${x - 2.5} ${y - 5} l 4 4 - 3 4 4 4`;
}

function isPieceHit(
  hits: DrumPiece[][],
  step: number,
  piece: DrumPiece,
): boolean {
  return hits[step]?.includes(piece) ?? false;
}

/** Compact standard-style percussion chart for a section groove. */
export function GrooveChart({
  groove,
  color,
  currentTick = -1,
}: GrooveChartProps) {
  const layout = grooveChartLayout(groove);
  const hits = grooveHits(groove);
  const totalTicks = grooveTotalStepCount('32n', groove.measureCount);
  const normalizedTick = ((currentTick % totalTicks) + totalTicks) % totalTicks;
  const ticksPerStep = totalTicks / layout.totalSteps;
  const activeStep =
    currentTick >= 0 ? Math.floor(normalizedTick / ticksPerStep) : -1;
  const noteRadius = Math.min(4, layout.stepWidth * 0.35);
  const crossHalf = Math.min(4, layout.stepWidth * 0.38);
  const stemOffset = Math.min(3, layout.stepWidth * 0.25);
  const label = `Chart de bateria, ${layout.measureCount} ${layout.measureCount === 1 ? 'compasso' : 'compassos'}, resolução ${resolutionLabel(groove)}`;

  return (
    <div className="min-w-0 max-w-full overflow-x-auto scrollbar-none">
      <svg
        className="block w-auto max-w-full h-auto"
        style={{ width: layout.width }}
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        role="img"
        aria-label={label}
      >
        <title>{label}</title>

        <text
          x={4}
          y={10}
          fill="var(--color-text-secondary)"
          fontFamily="var(--font-mono)"
          fontSize={8}
          fontWeight="600"
          letterSpacing="0.08em"
        >
          DRUMS
        </text>
        <text
          x={layout.staffLeft}
          y={10}
          fill="var(--color-text-muted)"
          fontFamily="var(--font-mono)"
          fontSize={8}
        >
          4/4 · {resolutionLabel(groove)}
        </text>

        {Array.from({ length: layout.measureCount }, (_, measure) => (
          <text
            key={`measure-label-${measure}`}
            x={layout.measureX(measure) + 4}
            y={21}
            fill={color}
            fontFamily="var(--font-mono)"
            fontSize={7}
            fontWeight="600"
          >
            {measure + 1}
          </text>
        ))}

        {Array.from({ length: 5 }, (_, line) => (
          <line
            key={`staff-line-${line}`}
            x1={layout.staffLeft}
            x2={layout.staffRight}
            y1={layout.staffTop + line * layout.staffSpacing}
            y2={layout.staffTop + line * layout.staffSpacing}
            stroke="var(--color-border-default)"
            strokeWidth={line === 0 || line === 4 ? 1 : 0.7}
            strokeOpacity={0.85}
          />
        ))}

        {Array.from({ length: layout.measureCount }, (_, measure) => (
          <g key={`measure-${measure}`}>
            {Array.from({ length: 5 }, (_, beat) => (
              <line
                key={`beat-line-${measure}-${beat}`}
                x1={layout.beatX(measure, beat)}
                x2={layout.beatX(measure, beat)}
                y1={layout.staffTop - 5}
                y2={layout.staffBottom + 5}
                stroke="var(--color-border-default)"
                strokeWidth={0.6}
                strokeOpacity={beat === 0 ? 0.9 : 0.35}
              />
            ))}
          </g>
        ))}

        {Array.from({ length: layout.measureCount + 1 }, (_, measure) => (
          <line
            key={`barline-${measure}`}
            x1={layout.measureX(measure)}
            x2={layout.measureX(measure)}
            y1={layout.staffTop - 5}
            y2={layout.staffBottom + 5}
            stroke="var(--color-text-secondary)"
            strokeWidth={
              measure === 0 || measure === layout.measureCount ? 1.2 : 1
            }
            strokeOpacity={0.9}
          />
        ))}

        {activeStep >= 0 && activeStep < layout.totalSteps && (
          <>
            <rect
              x={layout.stepStartX(activeStep)}
              y={layout.staffTop - 6}
              width={layout.stepWidth}
              height={layout.staffBottom - layout.staffTop + 12}
              fill={color}
              opacity={0.12}
            />
            <line
              x1={layout.stepX(activeStep)}
              x2={layout.stepX(activeStep)}
              y1={layout.staffTop - 7}
              y2={layout.staffBottom + 7}
              stroke={color}
              strokeWidth={1.4}
              strokeLinecap="round"
              opacity={0.9}
            />
          </>
        )}

        {DRUM_PIECES.map((piece) => (
          <text
            key={`piece-label-${piece.id}`}
            x={4}
            y={layout.noteY[piece.id] + 3}
            fill="var(--color-text-muted)"
            fontFamily="var(--font-mono)"
            fontSize={8}
            fontWeight="600"
          >
            {piece.label}
          </text>
        ))}

        {Array.from({ length: layout.measureCount }, (_, measure) =>
          Array.from({ length: 4 }, (_, beat) => {
            const start =
              measure * layout.stepsPerMeasure + beat * layout.stepsPerBeat;
            const hasHit = Array.from(
              { length: layout.stepsPerBeat },
              (_, offset) => hits[start + offset]?.length ?? 0,
            ).some(Boolean);
            if (hasHit) return null;

            return (
              <path
                key={`rest-${measure}-${beat}`}
                d={emptyBeatPath(
                  layout.beatX(measure, beat) + layout.measureWidth / 8,
                  layout.staffTop + layout.staffSpacing * 2,
                )}
                fill="none"
                stroke="var(--color-text-muted)"
                strokeWidth={0.9}
                strokeLinecap="round"
                opacity={0.75}
              />
            );
          }),
        )}

        {Array.from({ length: layout.measureCount }, (_, measure) =>
          Array.from({ length: 4 }, (_, beat) => {
            const start =
              measure * layout.stepsPerMeasure + beat * layout.stepsPerBeat;
            const end = start + layout.stepsPerBeat;
            const groups = Math.max(0, Math.log2(layout.stepsPerBeat));

            return Array.from({ length: groups }, (_, level) => {
              const groupSize = Math.max(
                1,
                layout.stepsPerBeat / 2 ** (level + 1),
              );
              return Array.from(
                { length: layout.stepsPerBeat / groupSize },
                (_, group) => {
                  const groupStart = start + group * groupSize;
                  const groupEnd = Math.min(end, groupStart + groupSize);
                  const hasHit = Array.from(
                    { length: groupEnd - groupStart },
                    (_, offset) => hits[groupStart + offset]?.length ?? 0,
                  ).some(Boolean);
                  if (!hasHit) return null;

                  const y = layout.staffTop - 11 - level * 3;
                  return (
                    <line
                      key={`beam-${measure}-${beat}-${level}-${group}`}
                      x1={layout.stepX(groupStart)}
                      x2={layout.stepX(groupEnd - 1)}
                      y1={y}
                      y2={y}
                      stroke={color}
                      strokeWidth={1.8}
                      strokeLinecap="round"
                      opacity={0.75}
                    />
                  );
                },
              );
            });
          }),
        )}

        {Array.from({ length: layout.totalSteps }, (_, step) => {
          const x = layout.stepX(step);
          return DRUM_PIECES.filter((piece) =>
            isPieceHit(hits, step, piece.id),
          ).map((piece) => {
            const y = layout.noteY[piece.id];
            const isKick = piece.id === 'bumbo';
            const stemX = x + (isKick ? -stemOffset : stemOffset);
            const stemEnd = isKick
              ? layout.staffBottom + 11
              : layout.staffTop - 11;

            return (
              <g key={`note-${piece.id}-${step}`}>
                <line
                  x1={stemX}
                  x2={stemX}
                  y1={isKick ? y + 2 : y - 2}
                  y2={stemEnd}
                  stroke={color}
                  strokeWidth={1}
                  strokeLinecap="round"
                />
                {piece.id === 'chimbal' ? (
                  <>
                    <line
                      x1={x - crossHalf}
                      x2={x + crossHalf}
                      y1={y - crossHalf}
                      y2={y + crossHalf}
                      stroke={color}
                      strokeWidth={1.7}
                      strokeLinecap="round"
                    />
                    <line
                      x1={x + crossHalf}
                      x2={x - crossHalf}
                      y1={y - crossHalf}
                      y2={y + crossHalf}
                      stroke={color}
                      strokeWidth={1.7}
                      strokeLinecap="round"
                    />
                  </>
                ) : (
                  <ellipse
                    cx={x}
                    cy={y}
                    rx={noteRadius}
                    ry={noteRadius * 0.75}
                    fill={color}
                    stroke={color}
                    strokeWidth={0.8}
                  />
                )}
              </g>
            );
          });
        })}

        <text
          x={layout.staffLeft}
          y={layout.height - 5}
          fill="var(--color-text-muted)"
          fontFamily="var(--font-body)"
          fontSize={7}
        >
          HH chimbal · C caixa · B bumbo
        </text>
      </svg>
    </div>
  );
}
