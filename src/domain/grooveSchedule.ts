import {
  DEFAULT_GROOVE_SUBDIVISION,
  DRUM_PIECES,
  GROOVE_BEATS_PER_MEASURE,
  GROOVE_TICKS_PER_MEASURE,
  grooveBeatCount,
  grooveBeatRow,
  grooveBeatSubdivision,
  grooveStepsPerBeat,
  grooveTuplet,
} from '@/constants/groove';
import type { DrumPiece, GroovePattern, GrooveSubdivision } from '@/types';

export const GROOVE_TICKS_PER_BEAT =
  GROOVE_TICKS_PER_MEASURE / GROOVE_BEATS_PER_MEASURE;

/** One beat of a groove, at its own resolution. */
export interface GrooveBeatView {
  /** The beat index across the measures. */
  beat: number;
  subdivision: GrooveSubdivision;
  stepsPerBeat: number;
  tuplet?: number;
  /** True when the beat has its own resolution, not the base one. */
  own: boolean;
  /** The pieces hit on each step of the beat. */
  hits: DrumPiece[][];
}

export function grooveBeats(groove: GroovePattern): GrooveBeatView[] {
  return Array.from(
    { length: grooveBeatCount(groove.measureCount) },
    (_, beat) => {
      const subdivision = grooveBeatSubdivision(groove, beat);
      const stepsPerBeat = grooveStepsPerBeat(subdivision);
      const rows = DRUM_PIECES.map((piece) => ({
        piece: piece.id,
        row: grooveBeatRow(groove, beat, piece.id),
      }));
      return {
        beat,
        subdivision,
        stepsPerBeat,
        tuplet: grooveTuplet(subdivision),
        own: groove.beats?.[beat] !== undefined,
        hits: Array.from({ length: stepsPerBeat }, (_, step) =>
          rows.filter(({ row }) => row[step]).map(({ piece }) => piece),
        ),
      };
    },
  );
}

export function grooveHasHits(groove: GroovePattern): boolean {
  return grooveBeats(groove).some((view) =>
    view.hits.some((pieces) => pieces.length > 0),
  );
}

/** The beat and the step of that beat a tick falls on, if it falls on one. */
export function grooveStepAtTick(
  groove: GroovePattern,
  tick: number,
): { beat: number; step: number; onStep: boolean } {
  const ticksPerGroove =
    GROOVE_TICKS_PER_BEAT * grooveBeatCount(groove.measureCount);
  const normalizedTick =
    ((tick % ticksPerGroove) + ticksPerGroove) % ticksPerGroove;
  const beat = Math.floor(normalizedTick / GROOVE_TICKS_PER_BEAT);
  const ticksPerStep =
    GROOVE_TICKS_PER_BEAT /
    grooveStepsPerBeat(grooveBeatSubdivision(groove, beat));
  const tickInBeat = normalizedTick % GROOVE_TICKS_PER_BEAT;
  return {
    beat,
    step: Math.floor(tickInBeat / ticksPerStep),
    onStep: tickInBeat % ticksPerStep === 0,
  };
}

export function grooveHitsAtTick(
  groove: GroovePattern,
  tick: number,
): DrumPiece[] {
  const { beat, step, onStep } = grooveStepAtTick(groove, tick);
  if (!onStep) return [];
  return DRUM_PIECES.filter(
    (piece) => grooveBeatRow(groove, beat, piece.id)[step],
  ).map((piece) => piece.id);
}

export function grooveStepDuration(
  bpm: number,
  subdivision: GrooveSubdivision = DEFAULT_GROOVE_SUBDIVISION,
): number {
  return 60 / bpm / grooveStepsPerBeat(subdivision);
}

/** The seconds of one tick of the groove player. */
export function grooveTickDuration(bpm: number): number {
  return 60 / bpm / GROOVE_TICKS_PER_BEAT;
}
