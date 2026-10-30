import type {
  DrumPiece,
  GrooveMeasureCount,
  GroovePattern,
  GrooveSubdivision,
} from '@/types';

export const GROOVE_STEPS = 16;

export const GROOVE_SUBDIVISIONS: ReadonlyArray<{
  id: GrooveSubdivision;
  label: string;
  shortLabel: string;
  steps: number;
  stepsPerBeat: number;
  /** Notes of a tuplet beat (3 for triplets, 6 for sextuplets); none if straight. */
  tuplet?: number;
}> = [
  { id: '4n', label: 'Quartos', shortLabel: '1/4', steps: 4, stepsPerBeat: 1 },
  {
    id: '8n',
    label: 'Colcheias',
    shortLabel: '1/8',
    steps: 8,
    stepsPerBeat: 2,
  },
  {
    id: '8t',
    label: 'Tercinas de colcheia',
    shortLabel: '1/8T',
    steps: 12,
    stepsPerBeat: 3,
    tuplet: 3,
  },
  {
    id: '16n',
    label: 'Semicolcheias',
    shortLabel: '1/16',
    steps: 16,
    stepsPerBeat: 4,
  },
  {
    id: '16t',
    label: 'Sextinas',
    shortLabel: '1/16T',
    steps: 24,
    stepsPerBeat: 6,
    tuplet: 6,
  },
  { id: '32n', label: 'Fusas', shortLabel: '1/32', steps: 32, stepsPerBeat: 8 },
];

/**
 * The ticks of one 4/4 measure of the groove player: 24 a beat, so that every
 * straight and tuplet subdivision falls on a tick.
 */
export const GROOVE_TICKS_PER_MEASURE = 96;

export const DEFAULT_GROOVE_SUBDIVISION: GrooveSubdivision = '16n';
export const DEFAULT_GROOVE_MEASURE_COUNT: GrooveMeasureCount = 1;

export const GROOVE_MEASURE_COUNTS: ReadonlyArray<{
  id: GrooveMeasureCount;
  label: string;
}> = [
  { id: 1, label: '1 compasso' },
  { id: 2, label: '2 compassos' },
];

export function grooveStepCount(
  subdivision: GrooveSubdivision | undefined,
): number {
  return (
    GROOVE_SUBDIVISIONS.find((option) => option.id === subdivision)?.steps ??
    GROOVE_STEPS
  );
}

export function grooveStepsPerBeat(
  subdivision: GrooveSubdivision | undefined,
): number {
  return (
    GROOVE_SUBDIVISIONS.find((option) => option.id === subdivision)
      ?.stepsPerBeat ?? 4
  );
}

export function grooveTuplet(
  subdivision: GrooveSubdivision | undefined,
): number | undefined {
  return GROOVE_SUBDIVISIONS.find((option) => option.id === subdivision)
    ?.tuplet;
}

export function grooveMeasureCount(
  measureCount: GrooveMeasureCount | undefined,
): GrooveMeasureCount {
  return measureCount === 2 ? 2 : DEFAULT_GROOVE_MEASURE_COUNT;
}

export function grooveTotalStepCount(
  subdivision: GrooveSubdivision | undefined,
  measureCount: GrooveMeasureCount | undefined,
): number {
  return grooveStepCount(subdivision) * grooveMeasureCount(measureCount);
}

export const DRUM_PIECES: { id: DrumPiece; label: string }[] = [
  { id: 'crash', label: 'CR' },
  { id: 'ride', label: 'RD' },
  { id: 'chimbal', label: 'HH' },
  { id: 'tomAgudo', label: 'T1' },
  { id: 'tomMedio', label: 'T2' },
  { id: 'caixa', label: 'C' },
  { id: 'surdo', label: 'S' },
  { id: 'bumbo', label: 'B' },
];

/** The hits of one row; a groove saved before that row existed has none. */
export function grooveRow(groove: GroovePattern, piece: DrumPiece): boolean[] {
  return groove[piece] ?? [];
}

export const GROOVE_BEATS_PER_MEASURE = 4;

export function grooveBeatCount(
  measureCount: GrooveMeasureCount | undefined,
): number {
  return GROOVE_BEATS_PER_MEASURE * grooveMeasureCount(measureCount);
}

/** The resolution of one beat: its own, or the base of the groove. */
export function grooveBeatSubdivision(
  groove: GroovePattern,
  beat: number,
): GrooveSubdivision {
  return (
    groove.beats?.[beat]?.subdivision ??
    groove.subdivision ??
    DEFAULT_GROOVE_SUBDIVISION
  );
}

/** The hits of one piece in one beat, one entry a step of that beat. */
export function grooveBeatRow(
  groove: GroovePattern,
  beat: number,
  piece: DrumPiece,
): boolean[] {
  const own = groove.beats?.[beat];
  const steps = grooveStepsPerBeat(grooveBeatSubdivision(groove, beat));
  const source = own
    ? (own.hits[piece] ?? [])
    : grooveRow(groove, piece).slice(beat * steps, (beat + 1) * steps);
  return Array.from({ length: steps }, (_, step) => source[step] === true);
}
