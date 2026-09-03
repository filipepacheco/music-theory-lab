import type { DrumPiece, GrooveMeasureCount, GrooveSubdivision } from '@/types';

/** The default groove resolution retained by existing patterns. */
export const GROOVE_STEPS = 16;

/** Supported subdivisions for one 4/4 groove measure. */
export const GROOVE_SUBDIVISIONS: ReadonlyArray<{
  id: GrooveSubdivision;
  label: string;
  shortLabel: string;
  steps: number;
  stepsPerBeat: number;
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
    id: '16n',
    label: 'Semicolcheias',
    shortLabel: '1/16',
    steps: 16,
    stepsPerBeat: 4,
  },
  { id: '32n', label: 'Fusas', shortLabel: '1/32', steps: 32, stepsPerBeat: 8 },
];

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

/** The drum pieces, in display order, with compact pt-BR labels. */
export const DRUM_PIECES: { id: DrumPiece; label: string }[] = [
  { id: 'chimbal', label: 'HH' },
  { id: 'caixa', label: 'C' },
  { id: 'bumbo', label: 'B' },
];
