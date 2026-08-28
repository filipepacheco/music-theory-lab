import { describe, expect, it } from 'vitest';
import { grooveStepCount } from '@/constants/groove';
import type { GroovePattern, GrooveSubdivision } from '@/types';
import {
  grooveHits,
  grooveHitsAtTick,
  grooveStepDuration,
} from './grooveSchedule';

function emptyGroove(subdivision: GrooveSubdivision = '16n'): GroovePattern {
  return {
    subdivision,
    bumbo: Array(grooveStepCount(subdivision)).fill(false),
    caixa: Array(grooveStepCount(subdivision)).fill(false),
    chimbal: Array(grooveStepCount(subdivision)).fill(false),
  };
}

describe('groove schedule', () => {
  it('returns hits aligned to each grid step', () => {
    const groove = emptyGroove();
    groove.chimbal[0] = true;
    groove.bumbo[0] = true;
    groove.caixa[5] = true;
    groove.chimbal[15] = true;

    const hits = grooveHits(groove);

    expect(hits).toHaveLength(16);
    expect(hits[0]).toEqual(['chimbal', 'bumbo']);
    expect(hits[5]).toEqual(['caixa']);
    expect(hits[15]).toEqual(['chimbal']);
    expect(hits.slice(1, 5).every((step) => step.length === 0)).toBe(true);
  });

  it('calculates one grid-step duration from quarter-note BPM', () => {
    expect(grooveStepDuration(120)).toBe(0.125);
    expect(grooveStepDuration(120, '8n')).toBe(0.25);
    expect(grooveStepDuration(60)).toBe(0.25);
  });

  it('maps live patterns onto a fixed 32nd-note scheduler', () => {
    const sixteenths = emptyGroove('16n');
    sixteenths.bumbo[1] = true;

    const eighths = emptyGroove('8n');
    eighths.caixa[1] = true;

    expect(grooveHitsAtTick(sixteenths, 2)).toEqual(['bumbo']);
    expect(grooveHitsAtTick(eighths, 4)).toEqual(['caixa']);
    expect(grooveHitsAtTick(eighths, 5)).toEqual([]);
  });
});
