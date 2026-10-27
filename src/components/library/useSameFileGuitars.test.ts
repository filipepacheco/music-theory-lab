import { describe, expect, it } from 'vitest';
import { sameFileGuitarIds } from '@/components/library/useSameFileGuitars';
import { partChartId } from '@/services/chartId';
import type { ChartSummary } from '@/domain/chartSummary';

function summary(id: string, trackIndex: number): ChartSummary {
  return { id, part: 'guitar', trackIndex } as ChartSummary;
}

describe('sameFileGuitarIds', () => {
  it('drops a guitar of another file, even with the same file name', async () => {
    const mine = await partChartId('bass-a', 'guitar', 1);
    const other = await partChartId('bass-b', 'guitar', 1);
    const ids = await sameFileGuitarIds('bass-a', [
      summary(mine, 1),
      summary(other, 1),
    ]);
    expect(ids).toEqual([mine]);
  });
});
