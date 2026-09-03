import {
  DEFAULT_GROOVE_SUBDIVISION,
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
}

/** Shared geometry for the browser SVG and the PDF drum chart. */
export function grooveChartLayout(
  groove: GroovePattern,
  options: GrooveChartLayoutOptions = {},
): GrooveChartLayout {
  const subdivision = groove.subdivision ?? DEFAULT_GROOVE_SUBDIVISION;
  const measureCount = grooveMeasureCount(groove.measureCount);
  const stepsPerMeasure = grooveStepCount(subdivision);
  const totalSteps = grooveTotalStepCount(subdivision, measureCount);
  const stepsPerBeat = grooveStepsPerBeat(subdivision);
  const measureWidth =
    options.measureWidth ?? (subdivision === '32n' ? 184 : 168);
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
    labelWidth,
    width: staffRight,
    height,
    staffLeft,
    staffRight,
    staffTop,
    staffBottom,
    staffSpacing,
    noteY: {
      chimbal: staffTop,
      caixa: staffTop + staffSpacing * 2,
      bumbo: staffBottom,
    },
    stepWidth,
    stepStartX: (step) => staffLeft + step * stepWidth,
    stepX: (step) => staffLeft + (step + 0.5) * stepWidth,
    measureX: (measure) => staffLeft + measure * measureWidth,
    beatX: (measure, beat) =>
      staffLeft + measure * measureWidth + (beat / 4) * measureWidth,
  };
}
