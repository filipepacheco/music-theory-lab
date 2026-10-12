import { describe, expect, it } from 'vitest';
import { fixtureDrumChart, type HitSpec } from '@/domain/drumChartFixture';
import { drumGridMarksByBar } from '@/domain/drumGrid';
import {
  grooveChartInput,
  sectionFillBars,
  sectionGroove,
} from '@/domain/drumSectionGroove';

const KICK = 36;
const SNARE = 38;
const HAT = 42;
const CRASH = 49;
const TOM = 45;

const rock = (bar: number): HitSpec[] => [
  { bar, beat: 0, midi: KICK },
  { bar, beat: 1, midi: SNARE },
  { bar, beat: 2, midi: KICK },
  { bar, beat: 3, midi: SNARE },
];
const disco = (bar: number): HitSpec[] => [
  { bar, beat: 0, midi: KICK },
  { bar, beat: 1, midi: KICK },
  { bar, beat: 2, midi: KICK },
  { bar, beat: 3, midi: KICK },
];

function setup(barCount: number, specs: HitSpec[]) {
  const chart = fixtureDrumChart(barCount, specs);
  return { chart, marks: drumGridMarksByBar(chart) };
}
const SECTION = (endBar: number) => ({ startBar: 0, endBar });

describe('sectionGroove', () => {
  it('gives the pattern that the section repeats most', () => {
    const { chart, marks } = setup(4, [
      ...disco(0),
      ...rock(1),
      ...rock(2),
      ...rock(3),
    ]);
    expect(sectionGroove(chart, marks, SECTION(4))).toEqual({
      bar: 1,
      count: 3,
    });
  });

  it('gives the pattern that comes first on a tie', () => {
    const { chart, marks } = setup(4, [
      ...disco(0),
      ...rock(1),
      ...rock(2),
      ...disco(3),
    ]);
    expect(sectionGroove(chart, marks, SECTION(4))).toEqual({
      bar: 0,
      count: 2,
    });
  });

  it('counts only the bars of the section', () => {
    const { chart, marks } = setup(4, [...disco(0), ...disco(1), ...rock(2)]);
    expect(sectionGroove(chart, marks, { startBar: 2, endBar: 4 })?.bar).toBe(
      2,
    );
  });

  it('gives nothing for a section with no kick, snare, or hi-hat', () => {
    const { chart, marks } = setup(2, [
      { bar: 0, beat: 0, midi: CRASH },
      { bar: 1, beat: 1, midi: TOM },
    ]);
    expect(sectionGroove(chart, marks, SECTION(2))).toBeNull();
    expect(sectionFillBars(chart, marks, SECTION(2))).toEqual([]);
  });
});

describe('sectionFillBars', () => {
  it('marks a bar with a different kick, snare, or hi-hat pattern', () => {
    const { chart, marks } = setup(4, [
      ...rock(0),
      ...rock(1),
      ...rock(2),
      ...disco(3),
    ]);
    expect(sectionFillBars(chart, marks, SECTION(4))).toEqual([3]);
  });

  it('marks a bar that adds a hi-hat hit', () => {
    const { chart, marks } = setup(3, [
      ...rock(0),
      ...rock(1),
      ...rock(2),
      { bar: 2, beat: 0.5, midi: HAT },
    ]);
    expect(sectionFillBars(chart, marks, SECTION(3))).toEqual([2]);
  });

  it('does not mark a bar that differs only in other pieces', () => {
    const { chart, marks } = setup(3, [
      ...rock(0),
      ...rock(1),
      ...rock(2),
      { bar: 2, beat: 0, midi: CRASH },
      { bar: 2, beat: 3.5, midi: TOM },
    ]);
    expect(sectionFillBars(chart, marks, SECTION(3))).toEqual([]);
  });

  it('does not mark a bar with no hit', () => {
    const { chart, marks } = setup(3, [...rock(0), ...rock(2)]);
    expect(sectionFillBars(chart, marks, SECTION(3))).toEqual([]);
  });
});

describe('grooveChartInput', () => {
  it('converts the section groove to one measure of the groove chart', () => {
    const { chart, marks } = setup(1, [
      ...rock(0),
      { bar: 0, beat: 0, midi: HAT },
      { bar: 0, beat: 0.5, midi: HAT },
    ]);
    const input = grooveChartInput(chart, marks, { bar: 0, count: 1 });
    expect(input?.subdivision).toBe('8n');
    expect(input?.measureCount).toBe(1);
    expect(input?.bumbo).toEqual([
      true,
      false,
      false,
      false,
      true,
      false,
      false,
      false,
    ]);
    expect(input?.chimbal.slice(0, 3)).toEqual([true, true, false]);
    expect(input?.caixa[2]).toBe(true);
  });

  it('gives null when a hit is off the finest grid', () => {
    const { chart, marks } = setup(1, [{ bar: 0, beat: 1 / 3, midi: KICK }]);
    expect(grooveChartInput(chart, marks, { bar: 0, count: 1 })).toBeNull();
  });

  it('gives null for a bar that is not 4/4', () => {
    const { chart, marks } = setup(1, rock(0));
    chart.bars[0] = { ...chart.bars[0], beatCount: 3 };
    expect(grooveChartInput(chart, marks, { bar: 0, count: 1 })).toBeNull();
  });
});
