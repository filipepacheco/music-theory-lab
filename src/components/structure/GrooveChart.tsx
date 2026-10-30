import {
  DEFAULT_GROOVE_SUBDIVISION,
  DRUM_PIECES,
  GROOVE_SUBDIVISIONS,
  GROOVE_TICKS_PER_MEASURE,
  grooveMeasureCount,
} from '@/constants/groove';
import {
  grooveBeats,
  grooveMeasures,
  grooveStepAtTick,
  type GrooveBeatView,
} from '@/domain/grooveSchedule';
import { grooveChartLayout } from '@/utils/grooveChartLayout';
import type { DrumPiece, GroovePattern } from '@/types';

export interface GrooveChartProps {
  groove: GroovePattern;
  color: string;
  currentTick?: number;
  print?: boolean;
  firstMeasure?: number;
  /** The drawn size against the natural one. */
  scale?: number;
}

/** The ink of the notation: one neutral colour, as in a printed chart. */
const SCREEN_INK = 'var(--color-text-primary)';
/** Room at the left of the staff for the percussion clef and the 4/4. */
const CLEF_WIDTH = 26;
const STAFF_TOP = 22;
const STAFF_SPACING = 6;
/** How far under the bottom staff line the stems end, at the first beam. */
const STEM_BELOW = 12;
const BEAM_GAP = 3.2;
const BEAM_WIDTH = 2;
const HEIGHT = 74;
/** Extra room under the beams for the 3 or the 6 of a tuplet. */
const TUPLET_HEIGHT = 8;
/** The pieces drawn with a cross head instead of a filled one. */
const CROSS_HEADS: readonly DrumPiece[] = ['chimbal', 'ride', 'crash'];

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
  /** The note fills its whole beat, so a tuplet beat is a plain quarter. */
  fullBeat: boolean;
}

/** The beats beamed together: one beat, or two beats of straight eighths. */
interface BeamGroup {
  firstBeat: number;
  stepsPerBeat: number;
  tuplet?: number;
  /** The pieces hit on each step of the group. */
  hits: DrumPiece[][];
}

function beamGroups(views: GrooveBeatView[]): BeamGroup[] {
  const groups: BeamGroup[] = [];
  for (let index = 0; index < views.length; index += 1) {
    const view = views[index];
    const next = views[index + 1];
    const pair =
      view.subdivision === '8n' &&
      next?.subdivision === '8n' &&
      view.beat % 2 === 0;
    groups.push({
      firstBeat: view.beat,
      stepsPerBeat: view.stepsPerBeat,
      tuplet: view.tuplet,
      hits: pair ? [...view.hits, ...next.hits] : view.hits,
    });
    if (pair) index += 1;
  }
  return groups;
}

/**
 * The stems of one beam group. A note lasts to the next hit of its group;
 * the last note lasts to the end of its own beat, because a beat with no hit
 * gets its own rest. A tuplet note is drawn with the value it stands for: a
 * triplet eighth as an eighth, a sextuplet sixteenth as a sixteenth.
 */
function groupStems({ hits, stepsPerBeat, tuplet }: BeamGroup): NoteStem[] {
  const notatedStepsPerBeat = tuplet ? (stepsPerBeat * 2) / 3 : stepsPerBeat;
  const steps: number[] = [];
  for (let step = 0; step < hits.length; step += 1) {
    if (hits[step].length > 0) steps.push(step);
  }
  return steps.map((step, index) => {
    const beatEnd = (Math.floor(step / stepsPerBeat) + 1) * stepsPerBeat;
    const stop = steps[index + 1] ?? beatEnd;
    const fullBeat = step % stepsPerBeat === 0 && stop - step === stepsPerBeat;
    const quarters = fullBeat ? 1 : (stop - step) / notatedStepsPerBeat;
    const level = Math.floor(Math.log2(quarters));
    return {
      step,
      pieces: hits[step],
      beams: quarters >= 1 ? 0 : -level,
      dotted: quarters / 2 ** level === 1.5,
      fullBeat,
    };
  });
}

export function grooveNotationLayout(groove: GroovePattern) {
  return grooveChartLayout(groove, {
    labelWidth: CLEF_WIDTH,
    staffTop: STAFF_TOP,
    staffSpacing: STAFF_SPACING,
    height: grooveBeats(groove).some((view) => view.tuplet)
      ? HEIGHT + TUPLET_HEIGHT
      : HEIGHT,
  });
}

/** How much larger than its natural size the chart of a section is drawn. */
const SCREEN_SCALE = 1.75;

/** The chart of a section groove: one staff line per measure. */
export function GrooveChart({
  groove,
  currentTick = -1,
  ...props
}: GrooveChartProps) {
  const totalTicks =
    GROOVE_TICKS_PER_MEASURE * grooveMeasureCount(groove.measureCount);
  const tick =
    currentTick >= 0
      ? ((currentTick % totalTicks) + totalTicks) % totalTicks
      : -1;
  return (
    <div className="min-w-0 max-w-full flex flex-col gap-1">
      {grooveMeasures(groove).map((measure, index) => (
        <GrooveNotation
          key={index}
          {...props}
          groove={measure}
          firstMeasure={index + 1}
          scale={SCREEN_SCALE}
          currentTick={
            Math.floor(tick / GROOVE_TICKS_PER_MEASURE) === index
              ? tick - index * GROOVE_TICKS_PER_MEASURE
              : -1
          }
        />
      ))}
    </div>
  );
}

export function GrooveNotation({
  groove,
  color,
  currentTick = -1,
  print = false,
  firstMeasure = 1,
  scale = 1,
}: GrooveChartProps) {
  const layout = grooveNotationLayout(groove);
  const INK = print ? '#222222' : SCREEN_INK;
  const muted = print ? '#666666' : 'var(--color-text-muted)';
  const secondary = print ? '#555555' : 'var(--color-text-secondary)';
  const font = print ? 'courier' : 'var(--font-mono)';
  const views = grooveBeats(groove);
  const active =
    currentTick >= 0 ? grooveStepAtTick(groove, currentTick) : null;
  const activeStepWidth = active
    ? layout.beatWidth / views[active.beat].stepsPerBeat
    : 0;
  const finestStepWidth =
    layout.beatWidth / Math.max(...views.map((view) => view.stepsPerBeat));
  const headRx = Math.min(3.6, finestStepWidth * 0.38);
  const headRy = headRx * 0.72;
  const crossHalf = headRx * 0.9;
  const beamY = layout.staffBottom + STEM_BELOW;
  const tupletY = beamY + TUPLET_HEIGHT;
  const groups = beamGroups(views).map((group) => {
    const stepWidth = layout.beatWidth / group.stepsPerBeat;
    const left = layout.beatStartX(group.firstBeat);
    return {
      ...group,
      stepWidth,
      left,
      stems: groupStems(group).map((stem) => ({
        ...stem,
        x: left + (stem.step + 0.5) * stepWidth,
      })),
    };
  });
  const stemX = (x: number) => x - headRx + 0.4;
  const label = `Chart de bateria, ${layout.measureCount} ${layout.measureCount === 1 ? 'compasso' : 'compassos'}, resolução ${resolutionLabel(groove)}`;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="block w-auto max-w-full h-auto"
      style={{ width: layout.width * scale }}
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
          fill={muted}
          fontFamily={font}
          fontSize={8}
          fontWeight="600"
        >
          {measure + firstMeasure}
        </text>
      ))}

      {Array.from({ length: 5 }, (_, line) => (
        <line
          key={`staff-line-${line}`}
          x1={2}
          x2={layout.staffRight}
          y1={layout.staffTop + line * layout.staffSpacing}
          y2={layout.staffTop + line * layout.staffSpacing}
          stroke={muted}
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
          fontFamily={font}
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
          stroke={secondary}
          strokeWidth={1}
        />
      ))}

      {active && (
        <>
          <rect
            x={layout.beatStartX(active.beat) + active.step * activeStepWidth}
            y={layout.staffTop - 8}
            width={activeStepWidth}
            height={beamY - layout.staffTop + 10}
            fill={color}
            opacity={0.12}
          />
          <line
            x1={
              layout.beatStartX(active.beat) +
              (active.step + 0.5) * activeStepWidth
            }
            x2={
              layout.beatStartX(active.beat) +
              (active.step + 0.5) * activeStepWidth
            }
            y1={layout.staffTop - 9}
            y2={beamY + 3}
            stroke={color}
            strokeWidth={1.4}
            strokeLinecap="round"
            opacity={0.9}
          />
        </>
      )}

      {views.map((view) => {
        if (view.hits.some((pieces) => pieces.length > 0)) return null;
        return (
          <path
            key={`rest-${view.beat}`}
            data-rest
            d={quarterRestPath(
              layout.beatStartX(view.beat) + layout.beatWidth / 2,
              layout.staffTop + layout.staffSpacing * 2,
            )}
            fill="none"
            stroke={INK}
            strokeWidth={1.1}
            strokeLinecap="round"
          />
        );
      })}

      {groups.map(({ stems, stepWidth }, group) =>
        stems.map((stem, index) => {
          const prev = stems[index - 1];
          const next = stems[index + 1];
          const alone = !(prev?.beams || next?.beams);
          return Array.from({ length: stem.beams }, (_, level) => {
            const y = beamY - level * BEAM_GAP;
            const x = stemX(stem.x);
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
                  x2={stemX(next.x)}
                  y1={y}
                  y2={y}
                  stroke={INK}
                  strokeWidth={BEAM_WIDTH}
                />
              );
            }
            if (prev && prev.beams > level) return null;
            // A short beam that points to the note it belongs with.
            const stub = Math.min(5, stepWidth * 0.6);
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

      {groups.map(({ stems, tuplet, left }, group) => {
        if (tuplet === undefined || stems.length === 0) return null;
        if (stems.length === 1 && stems[0].fullBeat) return null;
        return (
          <text
            key={`tuplet-${group}`}
            data-tuplet
            x={left + layout.beatWidth / 2}
            y={tupletY}
            textAnchor="middle"
            fill={INK}
            fontFamily={font}
            fontSize={7}
            fontStyle="italic"
            fontWeight="600"
          >
            {tuplet}
          </text>
        );
      })}

      {groups
        .flatMap(({ stems, firstBeat }) =>
          stems.map((stem) => ({ ...stem, firstBeat })),
        )
        .map((stem) => {
          const x = stem.x;
          const top = Math.min(
            ...stem.pieces.map((piece) => layout.noteY[piece]),
          );
          return (
            <g
              key={`note-${stem.firstBeat}-${stem.step}`}
              data-beat={stem.firstBeat}
              data-step={stem.step}
            >
              <line
                x1={stemX(x)}
                x2={stemX(x)}
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
                    {piece.id === 'crash' && (
                      <line
                        data-ledger
                        x1={x - headRx - 2}
                        x2={x + headRx + 2}
                        y1={y}
                        y2={y}
                        stroke={muted}
                        strokeWidth={0.7}
                      />
                    )}
                    {CROSS_HEADS.includes(piece.id) ? (
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
        fill={muted}
        fontFamily={font}
        fontSize={7}
      >
        x pratos · meio caixa · baixo bumbo · {resolutionLabel(groove)}
      </text>
    </svg>
  );
}
