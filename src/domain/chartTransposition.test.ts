import { describe, expect, it } from 'vitest';
import {
  chartSettingsBody,
  chartTransposition,
  ORIGINAL_TRANSPOSITION,
  parseChartSettings,
  withBarOctave,
  withTransposition,
  type ChartSettings,
} from '@/domain/chartSettings';

describe('transposition in the chart settings', () => {
  const base: ChartSettings = {
    chartId: 'b'.repeat(64),
    updatedAt: '2026-10-05T10:00:00.000Z',
    songLineLength: 4,
    sectionLineLengths: { 0: 'auto' },
    groupOverride: null,
  };
  const later = '2026-10-06T10:00:00.000Z';

  it('reads the original pitch and tuning when nothing is saved', () => {
    expect(chartTransposition(null)).toEqual(ORIGINAL_TRANSPOSITION);
    expect(chartTransposition(base)).toEqual(ORIGINAL_TRANSPOSITION);
  });

  it('saves the semitones and the tuning and reads them back from the body', () => {
    const moved = withTransposition(
      base,
      base.chartId,
      { semitones: -2, tuning: 'drop-d' },
      later,
    );
    expect(moved.updatedAt).toBe(later);
    expect(chartTransposition(moved)).toEqual({
      semitones: -2,
      tuning: 'drop-d',
    });
    expect(
      parseChartSettings({
        ...JSON.parse(chartSettingsBody(moved)),
        chartId: moved.chartId,
        updatedAt: moved.updatedAt,
      }),
    ).toEqual(moved);
  });

  it('keeps the bar octaves when the transposition changes', () => {
    const octaves = withBarOctave(base, base.chartId, [2], 1, later);
    const moved = withTransposition(
      octaves,
      base.chartId,
      { semitones: 3, tuning: 'original' },
      later,
    );
    expect(moved.barOctaves).toEqual({ 2: 1 });
    expect(moved.transposition).toEqual({ semitones: 3, tuning: 'original' });
  });

  it('leaves no field when the song goes back to the original', () => {
    const moved = withTransposition(
      base,
      base.chartId,
      { semitones: 5, tuning: 'standard' },
      later,
    );
    const back = withTransposition(
      moved,
      base.chartId,
      ORIGINAL_TRANSPOSITION,
      later,
    );
    expect(back.transposition).toBeUndefined();
    expect(chartSettingsBody(back)).toBe(chartSettingsBody(base));
  });

  it('starts a record for a chart with no settings yet', () => {
    const created = withTransposition(
      null,
      base.chartId,
      { semitones: 1, tuning: 'original' },
      later,
    );
    expect(parseChartSettings(created)).toEqual(created);
    expect(created.songLineLength).toBe('auto');
  });

  it('refuses a transposition that is not allowed', () => {
    for (const transposition of [
      { semitones: 13, tuning: 'original' },
      { semitones: -13, tuning: 'original' },
      { semitones: 0.5, tuning: 'original' },
      { semitones: '2', tuning: 'original' },
      { semitones: 2, tuning: 'drop-c' },
      { semitones: 2 },
      { semitones: 2, tuning: 'original', extra: true },
      { semitones: 0, tuning: 'original' },
      [2, 'original'],
      null,
    ]) {
      expect(parseChartSettings({ ...base, transposition })).toBeNull();
    }
  });
});
