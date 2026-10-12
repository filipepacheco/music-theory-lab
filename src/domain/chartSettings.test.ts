import { describe, expect, it } from 'vitest';
import {
  chartSettingsBody,
  chartSettingsVersion,
  isNewerChartSettings,
  isNewerSettingsVersion,
  laterChartSettings,
  parseChartSettings,
  sectionLineLength,
  withBrowserLineLengths,
  hasOwnSectionLineLength,
  withSectionLineLength,
  withSongLineLength,
  withoutSectionLineLength,
  type ChartSettings,
} from '@/domain/chartSettings';
import { songKey } from '@/domain/librarySong';

const settings: ChartSettings = {
  chartId: 'a'.repeat(64),
  updatedAt: '2026-10-05T10:00:00.000Z',
  songLineLength: 4,
  sectionLineLengths: { 0: 'auto', 8: 2 },
  groupOverride: null,
};

describe('chart settings record', () => {
  it('holds the chart id, an update time, and the three fields of the table', () => {
    expect(Object.keys(parseChartSettings(settings)!).sort()).toEqual([
      'chartId',
      'groupOverride',
      'sectionLineLengths',
      'songLineLength',
      'updatedAt',
    ]);
    expect(parseChartSettings(settings)).toEqual(settings);
  });

  it('accepts each value that the table allows', () => {
    const allowed: Partial<ChartSettings>[] = [
      { songLineLength: 1 },
      { songLineLength: 16 },
      { songLineLength: 'auto' },
      { sectionLineLengths: {} },
      { sectionLineLengths: { 0: 1, 4: 16, 99999: 'auto' } },
      { groupOverride: 'separate' },
      { groupOverride: songKey('Água de Beber (Live)', 'Tom Jobim') },
      { groupOverride: songKey('Only A Title', '') },
    ];
    for (const change of allowed) {
      const record = { ...settings, ...change };
      expect(parseChartSettings(record)).toEqual(record);
    }
  });

  it('refuses a value that the table does not allow', () => {
    const refused: Record<string, unknown>[] = [
      { songLineLength: 0 },
      { songLineLength: 17 },
      { songLineLength: 2.5 },
      { songLineLength: '4' },
      { songLineLength: 'automatic' },
      { songLineLength: null },
      { songLineLength: Number.NaN },
      { sectionLineLengths: { 0: 0 } },
      { sectionLineLengths: { 0: 17 } },
      { sectionLineLengths: { 0: null } },
      { sectionLineLengths: { 0: '4' } },
      { sectionLineLengths: { '-1': 4 } },
      { sectionLineLengths: { '1.5': 4 } },
      { sectionLineLengths: { '01': 4 } },
      { sectionLineLengths: { 1000000: 4 } },
      { sectionLineLengths: { intro: 4 } },
      { sectionLineLengths: [4, 4] },
      { sectionLineLengths: null },
      {
        sectionLineLengths: Object.fromEntries(
          Array.from({ length: 1001 }, (_, bar) => [bar, 4]),
        ),
      },
      { groupOverride: '' },
      { groupOverride: 'Separate' },
      { groupOverride: 'no separator' },
      { groupOverride: 'Upper Case|artist' },
      { groupOverride: 'água|tom' },
      { groupOverride: 'two  spaces|artist' },
      { groupOverride: 'a|b|c' },
      { groupOverride: `${'a'.repeat(400)}|b` },
      { groupOverride: 7 },
      { groupOverride: undefined },
      { chartId: 'short' },
      { chartId: 'A'.repeat(64) },
      { chartId: 7 },
      { updatedAt: 'yesterday' },
      { updatedAt: '2026-10-05' },
      { updatedAt: 1759658400000 },
      { updatedAt: '2026-13-45T10:00:00.000Z' },
      // A chart, or a field that the record does not have.
      { chart: { title: 'A chart' } },
      { deviceId: 'device' },
    ];
    for (const change of refused) {
      expect(
        parseChartSettings({ ...settings, ...change }),
        JSON.stringify(change).slice(0, 80),
      ).toBeNull();
    }
    for (const value of [null, undefined, 'text', 4, [], [settings]]) {
      expect(parseChartSettings(value)).toBeNull();
    }
    for (const field of Object.keys(settings)) {
      const partial: Record<string, unknown> = { ...settings };
      delete partial[field];
      expect(parseChartSettings(partial), `no ${field}`).toBeNull();
    }
  });

  it('gives each update time one form, so text order is time order', () => {
    const record = parseChartSettings({
      ...settings,
      updatedAt: '2026-10-05T12:00:00+02:00',
    });
    expect(record?.updatedAt).toBe('2026-10-05T10:00:00.000Z');
  });

  it('gives equal text for equal choices, in any field order', () => {
    const other = parseChartSettings({
      groupOverride: null,
      sectionLineLengths: { 8: 2, 0: 'auto' },
      songLineLength: 4,
      updatedAt: '2030-01-01T00:00:00.000Z',
      chartId: 'b'.repeat(64),
    })!;
    expect(chartSettingsBody(other)).toBe(chartSettingsBody(settings));
    expect(chartSettingsBody(settings)).toBe(
      '{"songLineLength":4,"sectionLineLengths":{"0":"auto","8":2},"groupOverride":null}',
    );
  });
});

describe('the last write of chart settings', () => {
  const later = { ...settings, updatedAt: '2026-10-05T10:00:00.001Z' };

  it('wins by its update time', () => {
    expect(isNewerChartSettings(settings, undefined)).toBe(true);
    expect(isNewerChartSettings(later, settings)).toBe(true);
    expect(isNewerChartSettings(settings, later)).toBe(false);
    expect(isNewerChartSettings(settings, { ...settings })).toBe(false);
    expect(
      isNewerSettingsVersion(
        chartSettingsVersion(later),
        chartSettingsVersion(settings),
      ),
    ).toBe(true);
  });

  it('has one order for two writes with one update time', () => {
    const eight = { ...settings, songLineLength: 8 };
    const first = isNewerChartSettings(eight, settings);
    const second = isNewerChartSettings(settings, eight);
    expect([first, second].sort()).toEqual([false, true]);
  });

  it('puts a change of this device after the stored record of a faster clock', () => {
    const stored = { ...settings, updatedAt: '2026-10-05T11:00:00.000Z' };
    const change = { ...settings, songLineLength: 8 };
    const result = laterChartSettings(change, stored);
    expect(result).toEqual({
      ...change,
      updatedAt: '2026-10-05T11:00:00.001Z',
    });
    expect(isNewerChartSettings(result, stored)).toBe(true);
    expect(parseChartSettings(result)).toEqual(result);
  });

  it('keeps the update time of a change that is later, and of a first record', () => {
    expect(laterChartSettings(later, settings)).toBe(later);
    expect(laterChartSettings(settings, undefined)).toBe(settings);
  });

  it('keeps the stored record when an earlier change repeats its choices', () => {
    expect(laterChartSettings({ ...settings }, later)).toBe(later);
  });
});

describe('section line length', () => {
  it('tells its own number, its own automatic, and no value', () => {
    expect(sectionLineLength(settings, 8)).toBe(2);
    expect(hasOwnSectionLineLength(settings, 8)).toBe(true);
    expect(sectionLineLength(settings, 0)).toBe('auto');
    expect(hasOwnSectionLineLength(settings, 0)).toBe(true);
    expect(sectionLineLength(settings, 16)).toBe(settings.songLineLength);
    expect(hasOwnSectionLineLength(settings, 16)).toBe(false);
    expect(hasOwnSectionLineLength(null, 0)).toBe(false);
  });

  it('sets the song line length and removes all section values in one write', () => {
    const now = '2026-10-06T10:00:00.000Z';
    const next = withSongLineLength(settings, settings.chartId, 6, now);
    expect(next).toEqual({
      ...settings,
      updatedAt: now,
      songLineLength: 6,
      sectionLineLengths: {},
    });
    expect(sectionLineLength(next, 8)).toBe(6);
    expect(parseChartSettings(next)).toEqual(next);
    const first = withSongLineLength(null, settings.chartId, 'auto', now);
    expect(first.songLineLength).toBe('auto');
    expect(first.sectionLineLengths).toEqual({});
  });

  it('removes the value of one section, which then follows the song', () => {
    const now = '2026-10-06T10:00:00.000Z';
    const next = withoutSectionLineLength(settings, settings.chartId, 8, now);
    expect(next.sectionLineLengths).toEqual({ 0: 'auto' });
    expect(sectionLineLength(next, 8)).toBe(4);
    expect(settings.sectionLineLengths[8]).toBe(2);
  });

  it('gives the choice of a section, else the song line length, else automatic', () => {
    expect(sectionLineLength(null, 0)).toBe('auto');
    expect(sectionLineLength(settings, 8)).toBe(2);
    expect(sectionLineLength(settings, 0)).toBe('auto');
    expect(sectionLineLength(settings, 16)).toBe(4);
  });

  it('keeps a set length as it is, with no divisor rule', () => {
    const seven = withSectionLineLength(settings, settings.chartId, 8, 7, 'x');
    expect(sectionLineLength(seven, 8)).toBe(7);
  });

  it('writes one section and keeps the other choices', () => {
    const now = '2026-10-06T10:00:00.000Z';
    const next = withSectionLineLength(settings, settings.chartId, 16, 6, now);
    expect(next).toEqual({
      ...settings,
      updatedAt: now,
      sectionLineLengths: { 0: 'auto', 8: 2, 16: 6 },
    });
    const auto = withSectionLineLength(next, settings.chartId, 8, 'auto', now);
    expect(auto.sectionLineLengths[8]).toBe('auto');
    expect(parseChartSettings(auto)).toEqual(auto);
  });

  it('starts from the automatic layout when the chart has no settings', () => {
    const now = '2026-10-06T10:00:00.000Z';
    const first = withSectionLineLength(null, settings.chartId, 0, 4, now);
    expect(first.songLineLength).toBe('auto');
    expect(first.groupOverride).toBeNull();
    expect(first.sectionLineLengths).toEqual({ 0: 4 });
  });

  it('copies the browser lengths with the import time, and leaves out bad values', () => {
    const copy = withBrowserLineLengths(
      null,
      settings.chartId,
      { 0: 4, 8: 99, 16: 'x', abc: 3, 24: 2 },
      '2026-01-01T00:00:00.000Z',
    );
    expect(copy).toEqual({
      chartId: settings.chartId,
      updatedAt: '2026-01-01T00:00:00.000Z',
      songLineLength: 'auto',
      sectionLineLengths: { 0: 4, 24: 2 },
      groupOverride: null,
    });
    expect(withBrowserLineLengths(null, settings.chartId, {}, 'x')).toBeNull();
    expect(withBrowserLineLengths(null, settings.chartId, 5, 'x')).toBeNull();
  });

  it('keeps a section that the settings already hold when it copies', () => {
    const copy = withBrowserLineLengths(
      settings,
      settings.chartId,
      { 8: 5, 12: 3 },
      '2020-01-01T00:00:00.000Z',
    );
    expect(copy?.sectionLineLengths).toEqual({ 0: 'auto', 8: 2, 12: 3 });
    expect(copy?.updatedAt).toBe(settings.updatedAt);
  });
});
