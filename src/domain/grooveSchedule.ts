import {
  DEFAULT_GROOVE_SUBDIVISION,
  DRUM_PIECES,
  GROOVE_TICKS_PER_MEASURE,
  grooveMeasureCount,
  grooveRow,
  grooveStepsPerBeat,
  grooveTotalStepCount,
} from '@/constants/groove';
import type { DrumPiece, GroovePattern, GrooveSubdivision } from '@/types';

export function grooveHits(groove: GroovePattern): DrumPiece[][] {
  return Array.from(
    {
      length: grooveTotalStepCount(groove.subdivision, groove.measureCount),
    },
    (_, step) =>
      DRUM_PIECES.filter((piece) => grooveRow(groove, piece.id)[step]).map(
        (piece) => piece.id,
      ),
  );
}

export function grooveHitsAtTick(
  groove: GroovePattern,
  tick: number,
): DrumPiece[] {
  const ticksPerGroove =
    GROOVE_TICKS_PER_MEASURE * grooveMeasureCount(groove.measureCount);
  const steps = grooveTotalStepCount(groove.subdivision, groove.measureCount);
  const ticksPerStep = ticksPerGroove / steps;
  const normalizedTick =
    ((tick % ticksPerGroove) + ticksPerGroove) % ticksPerGroove;

  if (normalizedTick % ticksPerStep !== 0) return [];

  const step = normalizedTick / ticksPerStep;
  return grooveHits(groove)[step] ?? [];
}

export function grooveStepDuration(
  bpm: number,
  subdivision: GrooveSubdivision = DEFAULT_GROOVE_SUBDIVISION,
): number {
  return 60 / bpm / grooveStepsPerBeat(subdivision);
}

/** The seconds of one tick of the groove player. */
export function grooveTickDuration(bpm: number): number {
  return (60 / bpm) * (4 / GROOVE_TICKS_PER_MEASURE);
}
