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

/** The ink of the notation: one neutral colour, as in a printed chart. */
const INK = 'var(--color-text-primary)';
/** Room at the left of the staff for the percussion clef and the 4/4. */
const CLEF_WIDTH = 26;
const STAFF_TOP = 18;
const STAFF_SPACING = 6;
/** How far under the bottom staff line the stems end, at the first beam. */
const STEM_BELOW = 12;
const BEAM_GAP = 3.2;
const BEAM_WIDTH = 2;
const HEIGHT = 70;

function resolutionLabel(groove: GroovePattern): string {
  const subdivision = groove.subdivision ?? DEFAULT_GROOVE_SUBDIVISION;
  return (
    GROOVE_SUBDIVISIONS.find((option) => option.id === subdivision)
      ?.shortLabel ?? '1/16'
  );
}

function quarterRestPath(x: number, y: number): string {
  return `M ${x - 2.5} ${y - 5} l 4 4 -3 4 4 4`;
}

/** One stem of the chart: a step with one or more hits. */
interface NoteStem {
  step: number;
  pieces: DrumPiece[];
  /** Beams of the note: 1 for an eighth, 2 for a sixteenth, 0 for longer. */
  beams: number;
  dotted: boolean;
}

/**
 * The stems of one beam group. A note lasts to the next hit of its group or
 * to the end of the group, so a hit alone in its half of the beat is longer.
 */
function groupStems(
  hits: DrumPiece[][],
  start: number,
  end: number,
  stepsPerBeat: number,
): NoteStem[] {
  const steps: number[] = [];
  for (let step = start; step < end; step += 1) {
    if ((hits[step]?.length ?? 0) > 0) steps.push(step);
  }
  return steps.map((step, index) => {
    const quarters = ((steps[index + 1] ?? end) - step) / stepsPerBeat;
    const level = Math.floor(Math.log2(quarters));
    return {
      step,
      pieces: hits[step],
      beams: quarters >= 1 ? 0 : -level,
      dotted: quarters / 2 ** level === 1.5,
    };
  });
}

export function GrooveChart({
  groove,
  color,
  currentTick = -1,
}: GrooveChartProps) {
  const layout = grooveChartLayout(groove, {
    labelWidth: CLEF_WIDTH,
    staffTop: STAFF_TOP,
    staffSpacing: STAFF_SPACING,
    height: HEIGHT,
  });
  const hits = grooveHits(groove);
  const totalTicks = grooveTotalStepCount('32n', groove.measureCount);
  const normalizedTick = ((currentTick % totalTicks) + totalTicks) % totalTicks;
  const ticksPerStep = totalTicks / layout.totalSteps;
  const activeStep =
    currentTick >= 0 ? Math.floor(normalizedTick / ticksPerStep) : -1;
  const headRx = Math.min(3.6, layout.stepWidth * 0.38);
  const headRy = headRx * 0.72;
  const crossHalf = headRx * 0.9;
  const beamY = layout.staffBottom + STEM_BELOW;
  const stemX = (step: number) => layout.stepX(step) - headRx + 0.4;
  const groupSize =
    layout.stepsPerBeat === 2 ? layout.stepsPerBeat * 2 : layout.stepsPerBeat;
  const groups = Array.from(
    { length: layout.totalSteps / groupSize },
    (_, group) =>
      groupStems(
        hits,
        group * groupSize,
        (group + 1) * groupSize,
        layout.stepsPerBeat,
      ),
  );
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

        {Array.from({ length: layout.measureCount }, (_, measure) => (
          <text
            key={`measure-label-${measure}`}
            x={measure === 0 ? 2 : layout.measureX(measure) + 2}
            y={8}
            fill="var(--color-text-muted)"
            fontFamily="var(--font-mono)"
            fontSize={8}
            fontWeight="600"
          >
            {measure + 1}
          </text>
        ))}

        {Array.from({ length: 5 }, (_, line) => (
          <line
            key={`staff-line-${line}`}
            x1={2}
            x2={layout.staffRight}
            y1={layout.staffTop + line * layout.staffSpacing}
            y2={layout.staffTop + line * layout.staffSpacing}
            stroke="var(--color-text-muted)"
            strokeWidth={0.7}
          />
        ))}

        <g data-percussion-clef fill={INK}>
          {[5, 8.5].map((x) => (
            <rect
              key={x}
              x={x}
              y={layout.staffTop + layout.staffSpacing}
              width={1.8}
              height={layout.staffSpacing * 2}
            />
          ))}
        </g>
        {[1, 3].map((line) => (
          <text
            key={`time-${line}`}
            x={18}
            y={layout.staffTop + line * layout.staffSpacing}
            textAnchor="middle"
            dominantBaseline="central"
            fill={INK}
            fontFamily="var(--font-mono)"
            fontSize={12}
            fontWeight="600"
          >
            4
          </text>
        ))}

        {Array.from({ length: layout.measureCount }, (_, measure) => (
          <line
            key={`barline-${measure}`}
            x1={layout.measureX(measure + 1)}
            x2={layout.measureX(measure + 1)}
            y1={layout.staffTop}
            y2={layout.staffBottom}
            stroke="var(--color-text-secondary)"
            strokeWidth={1}
          />
        ))}

        {activeStep >= 0 && activeStep < layout.totalSteps && (
          <>
            <rect
              x={layout.stepStartX(activeStep)}
              y={layout.staffTop - 8}
              width={layout.stepWidth}
              height={beamY - layout.staffTop + 10}
              fill={color}
              opacity={0.12}
            />
            <line
              x1={layout.stepX(activeStep)}
              x2={layout.stepX(activeStep)}
              y1={layout.staffTop - 9}
              y2={beamY + 3}
              stroke={color}
              strokeWidth={1.4}
              strokeLinecap="round"
              opacity={0.9}
            />
          </>
        )}

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
                data-rest
                d={quarterRestPath(
                  layout.beatX(measure, beat) + layout.measureWidth / 8,
                  layout.staffTop + layout.staffSpacing * 2,
                )}
                fill="none"
                stroke={INK}
                strokeWidth={1.1}
                strokeLinecap="round"
              />
            );
          }),
        )}

        {groups.map((stems, group) =>
          stems.map((stem, index) => {
            const prev = stems[index - 1];
            const next = stems[index + 1];
            const alone = !(prev?.beams || next?.beams);
            return Array.from({ length: stem.beams }, (_, level) => {
              const y = beamY - level * BEAM_GAP;
              const x = stemX(stem.step);
              const key = `beam-${group}-${stem.step}-${level}`;
              if (alone) {
                return (
                  <path
                    key={key}
                    data-flag
                    d={`M ${x} ${y} q 4.5 -1.5 4.5 -6`}
                    fill="none"
                    stroke={INK}
                    strokeWidth={1.2}
                    strokeLinecap="round"
                  />
                );
              }
              if (next && next.beams > level) {
                return (
                  <line
                    key={key}
                    data-beam
                    x1={x}
                    x2={stemX(next.step)}
                    y1={y}
                    y2={y}
                    stroke={INK}
                    strokeWidth={BEAM_WIDTH}
                  />
                );
              }
              if (prev && prev.beams > level) return null;
              // A short beam that points to the note it belongs with.
              const stub = Math.min(5, layout.stepWidth * 0.6);
              const toward = prev ? -stub : stub;
              return (
                <line
                  key={key}
                  data-beam
                  x1={x}
                  x2={x + toward}
                  y1={y}
                  y2={y}
                  stroke={INK}
                  strokeWidth={BEAM_WIDTH}
                />
              );
            });
          }),
        )}

        {groups.flat().map((stem) => {
          const x = layout.stepX(stem.step);
          const top = Math.min(
            ...stem.pieces.map((piece) => layout.noteY[piece]),
          );
          return (
            <g key={`note-${stem.step}`} data-step={stem.step}>
              <line
                x1={stemX(stem.step)}
                x2={stemX(stem.step)}
                y1={top}
                y2={beamY + BEAM_WIDTH / 2}
                stroke={INK}
                strokeWidth={0.9}
              />
              {DRUM_PIECES.filter((piece) =>
                stem.pieces.includes(piece.id),
              ).map((piece) => {
                const y = layout.noteY[piece.id];
                return (
                  <g key={piece.id} data-piece={piece.id}>
                    {piece.id === 'chimbal' ? (
                      <path
                        d={`M ${x - crossHalf} ${y - crossHalf} L ${x + crossHalf} ${y + crossHalf} M ${x + crossHalf} ${y - crossHalf} L ${x - crossHalf} ${y + crossHalf}`}
                        stroke={INK}
                        strokeWidth={1.3}
                        strokeLinecap="round"
                      />
                    ) : (
                      <ellipse
                        cx={x}
                        cy={y}
                        rx={headRx}
                        ry={headRy}
                        transform={`rotate(-20 ${x} ${y})`}
                        fill={INK}
                      />
                    )}
                    {stem.dotted && (
                      <circle
                        data-dot
                        cx={x + headRx + 2.2}
                        cy={y}
                        r={0.9}
                        fill={INK}
                      />
                    )}
                  </g>
                );
              })}
            </g>
          );
        })}

        <text
          x={2}
          y={layout.height - 3}
          fill="var(--color-text-muted)"
          fontFamily="var(--font-body)"
          fontSize={7}
        >
          x chimbal · meio caixa · baixo bumbo · {resolutionLabel(groove)}
        </text>
      </svg>
    </div>
  );
}
