import {
  DEFAULT_GROOVE_SUBDIVISION,
  GROOVE_BEATS_PER_MEASURE,
  grooveMeasureCount,
  grooveStepCount,
  grooveStepsPerBeat,
  grooveTotalStepCount,
} from '@/constants/groove';
import type { DrumPiece, GroovePattern } from '@/types';

export interface GrooveChartLayoutOptions {
  measureWidth?: number;
  labelWidth?: number;
  staffTop?: number;
  staffSpacing?: number;
  height?: number;
}

export interface GrooveChartLayout {
  measureCount: 1 | 2;
  stepsPerMeasure: number;
  totalSteps: number;
  stepsPerBeat: number;
  measureWidth: number;
  beatWidth: number;
  labelWidth: number;
  width: number;
  height: number;
  staffLeft: number;
  staffRight: number;
  staffTop: number;
  staffBottom: number;
  staffSpacing: number;
  noteY: Record<DrumPiece, number>;
  stepWidth: number;
  stepStartX: (step: number) => number;
  stepX: (step: number) => number;
  measureX: (measure: number) => number;
  beatX: (measure: number, beat: number) => number;
  /** The left edge of a beat, by its index across the measures. */
  beatStartX: (beat: number) => number;
}

export function grooveChartLayout(
  groove: GroovePattern,
  options: GrooveChartLayoutOptions = {},
): GrooveChartLayout {
  const subdivision = groove.subdivision ?? DEFAULT_GROOVE_SUBDIVISION;
  const measureCount = grooveMeasureCount(groove.measureCount);
  const stepsPerMeasure = grooveStepCount(subdivision);
  const totalSteps = grooveTotalStepCount(subdivision, measureCount);
  const stepsPerBeat = grooveStepsPerBeat(subdivision);
  const finestStepsPerBeat = Math.max(
    stepsPerBeat,
    ...Object.values(groove.beats ?? {}).map((beat) =>
      grooveStepsPerBeat(beat.subdivision),
    ),
  );
  const measureWidth =
    options.measureWidth ?? (finestStepsPerBeat >= 8 ? 184 : 168);
  const beatWidth = measureWidth / GROOVE_BEATS_PER_MEASURE;
  const labelWidth = options.labelWidth ?? 30;
  const staffTop = options.staffTop ?? 23;
  const staffSpacing = options.staffSpacing ?? 6;
  const height = options.height ?? 76;
  const staffLeft = labelWidth;
  const staffRight = staffLeft + measureCount * measureWidth;
  const staffBottom = staffTop + staffSpacing * 4;
  const stepWidth = measureWidth / stepsPerMeasure;

  return {
    measureCount,
    stepsPerMeasure,
    totalSteps,
    stepsPerBeat,
    measureWidth,
    beatWidth,
    labelWidth,
    width: staffRight,
    height,
    staffLeft,
    staffRight,
    staffTop,
    staffBottom,
    staffSpacing,
    // The places of standard drum notation: the crash on the ledger line
    // above the staff, the hi-hat in the space above it, the ride on the top
    // line, the high tom in the top space, the mid tom on the fourth line,
    // the snare in the third space, the floor tom in the second space, the
    // kick in the first space.
    noteY: {
      crash: staffTop - staffSpacing,
      chimbal: staffTop - staffSpacing * 0.5,
      ride: staffTop,
      tomAgudo: staffTop + staffSpacing * 0.5,
      tomMedio: staffTop + staffSpacing,
      caixa: staffTop + staffSpacing * 1.5,
      surdo: staffTop + staffSpacing * 2.5,
      bumbo: staffTop + staffSpacing * 3.5,
    },
    stepWidth,
    stepStartX: (step) => staffLeft + step * stepWidth,
    stepX: (step) => staffLeft + (step + 0.5) * stepWidth,
    measureX: (measure) => staffLeft + measure * measureWidth,
    beatX: (measure, beat) =>
      staffLeft + measure * measureWidth + (beat / 4) * measureWidth,
    beatStartX: (beat) => staffLeft + beat * beatWidth,
  };
}
