import { describe, expect, it } from 'vitest';
import { grooveTotalStepCount } from '@/constants/groove';
import type { GroovePattern } from '@/types';
import { grooveChartLayout } from './grooveChartLayout';

function groove(measureCount: 1 | 2): GroovePattern {
  return {
    subdivision: '16n',
    measureCount,
    bumbo: Array(grooveTotalStepCount('16n', measureCount)).fill(false),
    caixa: Array(grooveTotalStepCount('16n', measureCount)).fill(false),
    chimbal: Array(grooveTotalStepCount('16n', measureCount)).fill(false),
  };
}

describe('groove chart layout', () => {
  it('aligns note positions and beat boundaries within one measure', () => {
    const layout = grooveChartLayout(groove(1), { measureWidth: 160 });

    expect(layout.totalSteps).toBe(16);
    expect(layout.stepX(0)).toBe(35);
    expect(layout.beatX(0, 1)).toBe(70);
    expect(layout.measureX(1)).toBe(190);
  });

  it('doubles the chart width and scheduler sequence for two measures', () => {
    const layout = grooveChartLayout(groove(2), { measureWidth: 160 });

    expect(layout.totalSteps).toBe(32);
    expect(layout.width).toBe(350);
    expect(layout.stepX(16)).toBe(195);
    expect(layout.measureX(2)).toBe(350);
  });
});
