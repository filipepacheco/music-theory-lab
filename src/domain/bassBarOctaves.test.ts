import { describe, expect, it } from 'vitest';
import { fixtureChart, walking } from '@/domain/bassChartFixture';
import {
  barOctaveFits,
  barsLike,
  transposeBassChart,
} from '@/domain/bassTransposition';
import {
  chartSettingsBody,
  parseChartSettings,
  withBarOctave,
  withoutBarOctaves,
  type ChartSettings,
} from '@/domain/chartSettings';
import { STANDARD_OPEN_MIDI, type BassChart } from '@/domain/bassChart';

const chart = {
  ...fixtureChart(
    3,
    walking([
      [45, 48, 52, 45],
      [45, 48, 52, 45],
      [28, 31, 35, 28],
    ]),
  ),
  source: 'gp' as const,
};
const midiOfBar = (c: BassChart, bar: number) =>
  c.notes.filter((n) => n.bar === bar).map((n) => n.midi);

describe('octave of one bar of the bass tab', () => {
  it('moves only the notes of the chosen bar, and keeps the rest', () => {
    const moved = transposeBassChart(chart, 0, chart.tuning, { 1: -1 });
    expect(midiOfBar(moved, 1)).toEqual([33, 36, 40, 33]);
    expect(midiOfBar(moved, 0)).toEqual(midiOfBar(chart, 0));
    expect(moved.notes.filter((n) => n.bar !== 1)).toEqual(
      chart.notes.filter((n) => n.bar !== 1),
    );
    for (const note of moved.notes.filter((n) => n.bar === 1)) {
      expect(STANDARD_OPEN_MIDI[note.string] + note.fret).toBe(note.midi);
      expect(note.fret).toBeGreaterThanOrEqual(0);
    }
    expect(moved.notes.map((n) => n.time)).toEqual(
      chart.notes.map((n) => n.time),
    );
  });

  it('leaves a bar as written when its notes would leave the neck', () => {
    expect(barOctaveFits(chart, 2, -1)).toBe(false);
    expect(barOctaveFits(chart, 2, 1)).toBe(true);
    expect(transposeBassChart(chart, 0, chart.tuning, { 2: -1 })).toBe(chart);
  });

  it('holds on top of a transposition of the whole line', () => {
    const plain = transposeBassChart(chart, 2);
    const moved = transposeBassChart(chart, 2, chart.tuning, { 0: 1 });
    expect(midiOfBar(moved, 0)).toEqual(midiOfBar(plain, 0).map((m) => m + 12));
    expect(midiOfBar(moved, 1)).toEqual(midiOfBar(plain, 1));
  });

  it('finds the bars with the same notes at the same beats', () => {
    expect(barsLike(chart, 0)).toEqual([0, 1]);
    expect(barsLike(chart, 2)).toEqual([2]);
  });
});

describe('bar octaves in the chart settings', () => {
  const base: ChartSettings = {
    chartId: 'a'.repeat(64),
    updatedAt: '2026-10-05T10:00:00.000Z',
    songLineLength: 4,
    sectionLineLengths: { 0: 'auto' },
    groupOverride: null,
  };
  const later = '2026-10-06T10:00:00.000Z';

  it('keeps the text of a record that has no bar octave', () => {
    expect(parseChartSettings(base)).toEqual(base);
    expect(chartSettingsBody(base)).not.toContain('barOctaves');
    const cleared = withBarOctave(
      withBarOctave(base, base.chartId, [3], 1, later),
      base.chartId,
      [3],
      0,
      later,
    );
    expect(chartSettingsBody(cleared)).toBe(chartSettingsBody(base));
  });

  it('stores an octave for many bars in one record and reads it back', () => {
    const moved = withBarOctave(base, base.chartId, [3, 7], -1, later);
    expect(moved.barOctaves).toEqual({ 3: -1, 7: -1 });
    expect(moved.sectionLineLengths).toEqual(base.sectionLineLengths);
    expect(
      parseChartSettings({
        ...JSON.parse(chartSettingsBody(moved)),
        chartId: moved.chartId,
        updatedAt: moved.updatedAt,
      }),
    ).toEqual(moved);
    expect(withoutBarOctaves(moved, base.chartId, later).barOctaves).toBe(
      undefined,
    );
  });

  it('refuses an octave that is not allowed', () => {
    for (const barOctaves of [{ 3: 0 }, { 3: 3 }, { 3: 0.5 }, { x: 1 }, [1]]) {
      expect(parseChartSettings({ ...base, barOctaves })).toBeNull();
    }
    expect(parseChartSettings({ ...base, other: 1 })).toBeNull();
  });
});
