import { describe, expect, it } from 'vitest';
import { kickBeatsByBar } from '@/domain/bassKick';
import { fixtureDrumChart } from '@/domain/drumChartFixture';

describe('kickBeatsByBar', () => {
  it('lists the kick beats of each bar and ignores other pieces', () => {
    const chart = fixtureDrumChart(3, [
      { bar: 0, beat: 0, midi: 36 },
      { bar: 0, beat: 1, midi: 38 },
      { bar: 0, beat: 2.5, midi: 36 },
      { bar: 2, beat: 3, midi: 36 },
      { bar: 2, beat: 3, midi: 42 },
    ]);
    expect(kickBeatsByBar(chart)).toEqual([[0, 2.5], [], [3]]);
  });
});
