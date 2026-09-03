import {
  DEFAULT_GROOVE_SUBDIVISION,
  DRUM_PIECES,
  grooveStepCount,
  grooveTotalStepCount,
} from '@/constants/groove';
import type { DrumPiece, GroovePattern, GrooveSubdivision } from '@/types';

/** Return the active drum pieces for each step in the groove grid. */
export function grooveHits(groove: GroovePattern): DrumPiece[][] {
  return Array.from(
    {
      length: grooveTotalStepCount(groove.subdivision, groove.measureCount),
    },
    (_, step) =>
      DRUM_PIECES.filter((piece) => groove[piece.id][step]).map(
        (piece) => piece.id,
      ),
  );
}

/** Return the hits that fall on one fixed 32nd-note scheduler tick. */
export function grooveHitsAtTick(
  groove: GroovePattern,
  tick: number,
): DrumPiece[] {
  const ticksPerGroove = grooveTotalStepCount('32n', groove.measureCount);
  const steps = grooveTotalStepCount(groove.subdivision, groove.measureCount);
  const ticksPerStep = ticksPerGroove / steps;
  const normalizedTick =
    ((tick % ticksPerGroove) + ticksPerGroove) % ticksPerGroove;

  if (normalizedTick % ticksPerStep !== 0) return [];

  const step = normalizedTick / ticksPerStep;
  return grooveHits(groove)[step] ?? [];
}

/** Duration, in seconds, of one grid step at the supplied quarter-note BPM. */
export function grooveStepDuration(
  bpm: number,
  subdivision: GrooveSubdivision = DEFAULT_GROOVE_SUBDIVISION,
): number {
  return 60 / bpm / (grooveStepCount(subdivision) / 4);
}
