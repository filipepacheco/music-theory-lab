import { describe, expect, it } from 'vitest';
import { fixtureGuitarChart } from '@/domain/guitarChartFixture';
import { fixtureVocalChart } from '@/domain/vocalChartFixture';
import {
  transposeGuitarChart,
  transposeVocalChart,
  transposeSongParts,
} from '@/domain/partsTransposition';

const guitar = () =>
  fixtureGuitarChart(1, [
    { bar: 0, beat: 0, string: 1, fret: 3 },
    { bar: 0, beat: 1, string: 2, fret: 0 },
    { bar: 0, beat: 2, string: 3, fret: 23, slideToFret: 24 },
  ]);

describe('partsTransposition', () => {
  it('keeps the string and moves the fret', () => {
    const out = transposeGuitarChart(guitar(), 2);
    expect(out.notes.slice(0, 2).map((n) => [n.string, n.fret])).toEqual([
      [1, 5],
      [2, 2],
    ]);
    expect(out.notes[0].midi).toBe(guitar().notes[0].midi + 2);
  });

  it('moves one octave when a note leaves frets 0 to 24', () => {
    const down = transposeGuitarChart(guitar(), -2);
    expect(down.notes[1]).toMatchObject({ string: 2, fret: 10 });
    expect(down.notes[1].midi).toBe(guitar().notes[1].midi - 2 + 12);
    const up = transposeGuitarChart(guitar(), 3);
    expect(up.notes[2]).toMatchObject({ string: 3, fret: 14 });
    expect(up.notes[2].midi).toBe(guitar().notes[2].midi + 3 - 12);
    expect(up.notes[2].slideToFret).toBe(15);
  });

  it('shifts the pitch of a vocal note', () => {
    const vocal = fixtureVocalChart(1, [{ bar: 0, beat: 0, midi: 60 }]);
    expect(transposeVocalChart(vocal, -5).notes[0].midi).toBe(55);
  });

  it('returns the same chart for a zero shift', () => {
    const g = guitar();
    expect(transposeGuitarChart(g, 0)).toBe(g);
  });

  it('shifts all parts by the same interval', () => {
    const g = guitar();
    const v = fixtureVocalChart(1, [{ bar: 0, beat: 0, midi: 60 }]);
    const out = transposeSongParts({ guitars: [g], vocals: [v] }, 4);
    expect(out.guitars[0].notes[0].fret).toBe(7);
    expect(out.vocals[0].notes[0].midi).toBe(64);
  });
});
