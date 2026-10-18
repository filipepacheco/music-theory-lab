import { describe, expect, it } from 'vitest';
import {
  barIndexAt,
  lineBeatWidth,
  neededBeatWidth,
  repeatsAbove,
  sectionBlocks,
  sectionIndexOfBar,
  sectionRows,
  timeSignatures,
  type ChartBars,
  type LabelLane,
  type SectionBlockItem,
} from '@/domain/bassChart';
import { fixtureDrumChart, type HitSpec } from '@/domain/drumChartFixture';

const KICK = 36;
const SNARE = 38;

const specs: HitSpec[] = [
  ...Array.from({ length: 8 }, (_, i) => [
    { bar: i + 2, beat: 0, midi: KICK },
    { bar: i + 2, beat: 2, midi: SNARE },
  ]).flat(),
  { bar: 9, beat: 3, midi: SNARE },
];
const drums = fixtureDrumChart(10, specs, [
  { name: 'intro', parts: 1, startBar: 0, endBar: 2 },
  { name: 'verse', parts: 1, startBar: 2, endBar: 10 },
]);
const filled = new Set(drums.hits.map((hit) => hit.bar));
const drawing = (bar: number): string | null => {
  const cells = drums.hits
    .filter((hit) => hit.bar === bar)
    .map((hit) => `${hit.piece}@${hit.beatInBar}`);
  return cells.length > 0 ? cells.join(',') : null;
};
const barsOf = (rows: SectionBlockItem[][]) =>
  rows.map((row) =>
    row.map((item) => (item.kind === 'bar' ? item.bar : item.startBar)),
  );

describe('layout of a chart that has no bass notes', () => {
  it('lays the sections out by the bars that the part fills', () => {
    const [intro, verse] = sectionBlocks(drums, filled);
    expect(intro.items).toEqual([{ kind: 'rest', startBar: 0, count: 2 }]);
    expect(verse.items).toEqual(
      Array.from({ length: 8 }, (_, i) => ({ kind: 'bar', bar: i + 2 })),
    );
    expect(verse.index).toBe(1);
    expect(verse.colorIndex).toBe(1);
  });

  it('takes a chart of bars and sections only: no bar is filled', () => {
    const bare: ChartBars = { bars: drums.bars, sections: drums.sections };
    const [intro, verse] = sectionBlocks(bare);
    expect(intro.items).toEqual([{ kind: 'rest', startBar: 0, count: 2 }]);
    expect(verse.items).toEqual([{ kind: 'rest', startBar: 2, count: 8 }]);
  });

  it('breaks a section into lines of exactly the chosen number of bars', () => {
    const [, verse] = sectionBlocks(drums, filled);
    expect(barsOf(sectionRows(verse, 4))).toEqual([
      [2, 3, 4, 5],
      [6, 7, 8, 9],
    ]);
    expect(barsOf(sectionRows(verse, 3))).toEqual([
      [2, 3, 4],
      [5, 6, 7],
      [8, 9],
    ]);
  });

  it('fits the beat width of a line to the bars of the chart', () => {
    const [, verse] = sectionBlocks(drums, filled);
    const mostBeats = Math.max(
      ...drums.bars
        .slice(verse.section.startBar, verse.section.endBar)
        .map((bar) => bar.beatCount),
    );
    expect(
      lineBeatWidth({
        lineWidth: 1000,
        barsPerLine: 4,
        beatCount: mostBeats,
        barChrome: 16,
        gap: 4,
        baseBeatWidth: 34,
      }),
    ).toBe(57.75);
  });

  it('gives the needed beat width from the label lanes of the part', () => {
    const lanes = (bar: number): LabelLane[] => {
      const byPiece = new Map<string, number[]>();
      for (const hit of drums.hits.filter((h) => h.bar === bar)) {
        byPiece.set(hit.piece, [
          ...(byPiece.get(hit.piece) ?? []),
          hit.beatInBar,
        ]);
      }
      return [...byPiece.values()].map((beats) => ({
        charWidth: 8,
        labels: beats.map((beat) => ({ beat, chars: 1 })),
      }));
    };
    expect(neededBeatWidth(lanes(2), 4)).toBe(0);
    expect(
      neededBeatWidth(
        drums.bars.flatMap((bar) => lanes(bar.index)),
        4,
      ),
    ).toBe(12);
    expect(neededBeatWidth([], 4)).toBe(0);
  });

  it('marks the bars that draw the same as the bar above', () => {
    const [intro, verse] = sectionBlocks(drums, filled);
    expect([...repeatsAbove(verse, 4, drawing)]).toEqual([
      [6, 2],
      [7, 3],
      [8, 4],
    ]);
    expect([...repeatsAbove(verse, 2, drawing).keys()]).toEqual([
      4, 5, 6, 7, 8,
    ]);
    expect(repeatsAbove(verse, 4, () => null).size).toBe(0);
    expect(repeatsAbove(intro, 1, drawing).size).toBe(0);
  });

  it('finds the bar and the section of the cursor, and the meter', () => {
    expect(barIndexAt(drums, 5)).toBe(2);
    expect(barIndexAt(drums, Number.NaN)).toBe(-1);
    expect(sectionIndexOfBar(drums, 2)).toBe(1);
    expect(sectionIndexOfBar(drums, 1)).toBe(0);
    expect(timeSignatures(drums)).toEqual(['4/4']);
  });
});
