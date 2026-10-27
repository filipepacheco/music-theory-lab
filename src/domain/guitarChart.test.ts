import { describe, expect, it } from 'vitest';
import {
  parseBassChartRecord,
  parseChart,
  parseGuitarChart,
} from '@/domain/bassChartRecord';
import { summarizeChart } from '@/domain/chartSummary';
import { guitarTuningLabel } from '@/domain/guitarChart';
import { fixtureGuitarChart } from '@/domain/guitarChartFixture';

const chart = fixtureGuitarChart(2, [
  { bar: 0, beat: 0, string: 0, fret: 3 },
  { bar: 0, beat: 0, string: 1, fret: 2 },
  { bar: 0, beat: 0, string: 2, fret: 0, techniques: ['bend'] },
  { bar: 1, beat: 1, string: 5, fret: 5, slideToFret: 7 },
]);

describe('guitar chart parser', () => {
  it('accepts a valid guitar chart', () => {
    expect(parseGuitarChart(chart)).toEqual(chart);
    expect(parseChart(chart)).toEqual(chart);
  });

  it('accepts a 7-string and a 12-string chart with a capo', () => {
    const seven = fixtureGuitarChart(
      1,
      [{ bar: 0, beat: 0, string: 0, fret: 0 }],
      { openPitches: [35, 40, 45, 50, 55, 59, 64] },
    );
    const twelve = fixtureGuitarChart(
      1,
      [{ bar: 0, beat: 0, string: 11, fret: 3 }],
      {
        openPitches: [40, 45, 50, 55, 59, 64, 52, 57, 62, 67, 71, 76],
        capo: 2,
      },
    );
    expect(parseGuitarChart(seven)?.strings).toBe(7);
    expect(parseGuitarChart(twelve)).toMatchObject({ strings: 12, capo: 2 });
  });

  it('accepts a record that holds a guitar chart, and rejects a mismatched id', () => {
    const record = {
      id: chart.id,
      updatedAt: '2026-10-05T10:00:00.000Z',
      chart,
    };
    expect(parseBassChartRecord(record)?.chart).toEqual(chart);
    expect(parseBassChartRecord({ ...record, id: 'f'.repeat(64) })).toBeNull();
  });

  it('rejects a malformed guitar chart', () => {
    const note = chart.notes[0];
    const bad: unknown[] = [
      { ...chart, part: 'guitars' },
      { ...chart, partName: 3 },
      { ...chart, trackIndex: -1 },
      { ...chart, trackIndex: 1.5 },
      { ...chart, source: 'midi' },
      { ...chart, strings: 4, openPitches: [40, 45, 50, 55] },
      { ...chart, strings: 6, openPitches: [40, 45, 50, 55, 59] },
      { ...chart, openPitches: [40, 45, 50, 55, 59, 128] },
      { ...chart, openPitches: [40, 45, 50, 55, 59, 'E'] },
      { ...chart, capo: -1 },
      { ...chart, capo: 2.5 },
      { ...chart, capo: 30 },
      { ...chart, notes: [] },
      { ...chart, notes: [{ ...note, string: 6 }] },
      { ...chart, notes: [{ ...note, string: -1 }] },
      { ...chart, notes: [{ ...note, fret: -1 }] },
      { ...chart, notes: [{ ...note, midi: note.midi + 1 }] },
      { ...chart, notes: [{ ...note, bar: 2 }] },
      { ...chart, notes: [{ ...note, techniques: ['whammy'] }] },
      { ...chart, notes: [{ ...note, slideToFret: -2 }] },
      { ...chart, notes: [chart.notes[3], chart.notes[0]] },
      { ...chart, tuning: [0, 0, 0, 0] },
      { ...chart, audio: 'binary' },
      { ...chart, bars: [] },
    ];
    for (const value of bad) {
      expect(parseGuitarChart(value)).toBeNull();
      expect(parseChart(value)).toBeNull();
    }
  });

  it('the capo moves every midi pitch: the check counts frets from the capo', () => {
    const capoed = fixtureGuitarChart(
      1,
      [{ bar: 0, beat: 0, string: 0, fret: 3 }],
      { capo: 2 },
    );
    expect(capoed.notes[0].midi).toBe(40 + 2 + 3);
    expect(parseGuitarChart(capoed)).not.toBeNull();
    expect(
      parseGuitarChart({ ...capoed, notes: [{ ...capoed.notes[0], midi: 43 }] }),
    ).toBeNull();
  });
});

describe('guitar chart summary', () => {
  it('is a guitar part with its part name and track index', () => {
    expect(summarizeChart(chart)).toMatchObject({
      id: chart.id,
      part: 'guitar',
      partName: 'Guitarra 1',
      trackIndex: 1,
      noteCount: 4,
      source: 'gp',
    });
  });

  it('names the tuning from the lowest string', () => {
    expect(guitarTuningLabel(chart)).toBe('E A D G B E');
  });
});
