import { describe, expect, it } from 'vitest';
import {
  neededBeatWidth,
  repeatsAbove,
  sectionBeatWidth,
  sectionBlocks,
} from '@/domain/bassChart';
import { fixtureDrumChart, type HitSpec } from '@/domain/drumChartFixture';
import {
  drumBarDrawing,
  drumBarSpoken,
  drumGridLanes,
  drumGridMarksByBar,
  drumGridRowOf,
  drumGridRows,
  drumGridSymbolOf,
  drumMarkReach,
  DRUM_GRID_ROW_LABEL,
  type DrumGridMark,
} from '@/domain/drumGrid';
import { drumSoundOf } from '@/domain/drumChart';

const KICK = 36;
const SNARE = 38;
const CLOSED_HAT = 42;
const PEDAL_HAT = 44;
const OPEN_HAT = 46;
const HIGH_TOM = 48;
const MID_TOM = 45;
const FLOOR_TOM = 41;
const CRASH = 49;
const RIDE = 51;
const COWBELL = 56;

describe('rows of the drum grid', () => {
  it('go from the cymbals at the top to the hi-hat pedal, then the other pieces', () => {
    const everyPiece = [
      COWBELL,
      PEDAL_HAT,
      KICK,
      FLOOR_TOM,
      SNARE,
      MID_TOM,
      HIGH_TOM,
      CLOSED_HAT,
      RIDE,
      CRASH,
    ].map(drumSoundOf);
    expect(drumGridRows(everyPiece)).toEqual([
      'pratos',
      'chimbal',
      'toms',
      'caixa',
      'surdo',
      'bumbo',
      'pedal',
      'outros',
    ]);
  });

  it('hold only the rows that the chart uses', () => {
    const groove = [KICK, SNARE, CLOSED_HAT, OPEN_HAT].map(drumSoundOf);
    expect(drumGridRows(groove)).toEqual(['chimbal', 'caixa', 'bumbo']);
    expect(drumGridRows([])).toEqual([]);
  });

  it('put the two cymbals in one row, the two toms in one row, and the pedal in its own', () => {
    expect(drumGridRowOf(drumSoundOf(CRASH))).toBe('pratos');
    expect(drumGridRowOf(drumSoundOf(RIDE))).toBe('pratos');
    expect(drumGridRowOf(drumSoundOf(HIGH_TOM))).toBe('toms');
    expect(drumGridRowOf(drumSoundOf(MID_TOM))).toBe('toms');
    expect(drumGridRowOf(drumSoundOf(FLOOR_TOM))).toBe('surdo');
    expect(drumGridRowOf(drumSoundOf(CLOSED_HAT))).toBe('chimbal');
    expect(drumGridRowOf(drumSoundOf(OPEN_HAT))).toBe('chimbal');
    expect(drumGridRowOf(drumSoundOf(PEDAL_HAT))).toBe('pedal');
  });

  it('have a label in Portuguese', () => {
    expect(
      drumGridRows(
        [CRASH, CLOSED_HAT, HIGH_TOM, SNARE, FLOOR_TOM, KICK, PEDAL_HAT].map(
          drumSoundOf,
        ),
      ).map((row) => DRUM_GRID_ROW_LABEL[row]),
    ).toEqual([
      'Pratos',
      'Chimbal',
      'Tons',
      'Caixa',
      'Surdo',
      'Bumbo',
      'Pedal',
    ]);
  });
});

describe('symbols of the drum grid', () => {
  it('draw a drum as a dot, a closed hi-hat as x, an open hi-hat as o', () => {
    for (const drum of [KICK, SNARE, FLOOR_TOM]) {
      expect(drumGridSymbolOf(drumSoundOf(drum))).toBe('dot');
    }
    for (const hat of [CLOSED_HAT, PEDAL_HAT]) {
      expect(drumGridSymbolOf(drumSoundOf(hat))).toBe('x');
    }
    expect(drumGridSymbolOf(drumSoundOf(OPEN_HAT))).toBe('o');
  });

  it('give the crash, the ride, and each tom a symbol of its own', () => {
    expect(drumGridSymbolOf(drumSoundOf(CRASH))).toBe('crash');
    expect(drumGridSymbolOf(drumSoundOf(RIDE))).toBe('ride');
    expect(drumGridSymbolOf(drumSoundOf(HIGH_TOM))).toBe('tom1');
    expect(drumGridSymbolOf(drumSoundOf(MID_TOM))).toBe('tom2');
  });
});

describe('marks of the bars', () => {
  it('give each bar its marks, by row and then by beat, with the dynamic of the hit', () => {
    const chart = fixtureDrumChart(2, [
      { bar: 0, beat: 2, midi: SNARE, dynamic: 'accent' },
      { bar: 0, beat: 0, midi: KICK },
      { bar: 0, beat: 1, midi: CLOSED_HAT, dynamic: 'ghost' },
      { bar: 0, beat: 0, midi: OPEN_HAT },
    ]);
    expect(drumGridMarksByBar(chart)).toEqual([
      [
        { row: 'chimbal', beat: 0, symbol: 'o', dynamic: 'normal' },
        { row: 'chimbal', beat: 1, symbol: 'x', dynamic: 'ghost' },
        { row: 'caixa', beat: 2, symbol: 'dot', dynamic: 'accent' },
        { row: 'bumbo', beat: 0, symbol: 'dot', dynamic: 'normal' },
      ],
      [],
    ]);
  });

  it('draw two hits of one row at one beat as one mark, with the strongest dynamic', () => {
    const chart = fixtureDrumChart(1, [
      { bar: 0, beat: 0, midi: CRASH, dynamic: 'ghost' },
      { bar: 0, beat: 0, midi: RIDE, dynamic: 'accent' },
      { bar: 0, beat: 1, midi: HIGH_TOM },
      { bar: 0, beat: 1, midi: MID_TOM, dynamic: 'ghost' },
      { bar: 0, beat: 2, midi: CLOSED_HAT },
      { bar: 0, beat: 2, midi: OPEN_HAT },
    ]);
    expect(drumGridMarksByBar(chart)[0]).toEqual([
      { row: 'pratos', beat: 0, symbol: 'crash', dynamic: 'accent' },
      { row: 'chimbal', beat: 2, symbol: 'o', dynamic: 'normal' },
      { row: 'toms', beat: 1, symbol: 'tom1', dynamic: 'normal' },
    ]);
  });
});

/** The clear pixels between each two neighbouring marks of each row. */
function clearances(
  marks: DrumGridMark[],
  beatWidth: number,
  charWidth: number,
): number[] {
  const rows = [...new Set(marks.map((mark) => mark.row))];
  return rows.flatMap((row) => {
    const inRow = marks
      .filter((mark) => mark.row === row)
      .sort((a, b) => a.beat - b.beat);
    return inRow.slice(1).map((mark, index) => {
      const before = inRow[index];
      const right =
        before.beat * beatWidth + drumMarkReach(before).after * charWidth;
      const left =
        mark.beat * beatWidth - drumMarkReach(mark).before * charWidth;
      return left - right;
    });
  });
}

describe('layout of the grid with the functions of the bass tab', () => {
  const BASE = 34;
  const CHAR = 6.6;
  const GAP = 4;

  it.each<[string, HitSpec[]]>([
    [
      'sixteenth notes on the hi-hat',
      Array.from({ length: 16 }, (_, i) => ({
        bar: 0,
        beat: i / 4,
        midi: CLOSED_HAT,
      })),
    ],
    [
      'ghost notes between the snare hits',
      Array.from({ length: 16 }, (_, i) => ({
        bar: 0,
        beat: i / 4,
        midi: SNARE,
        dynamic: i % 4 === 0 ? ('accent' as const) : ('ghost' as const),
      })),
    ],
    [
      'eighth notes with one ghost note',
      Array.from({ length: 8 }, (_, i) => ({
        bar: 0,
        beat: i / 2,
        midi: SNARE,
        dynamic: i === 3 ? ('ghost' as const) : ('normal' as const),
      })),
    ],
  ])('keeps two symbols of a row apart: %s', (_name, specs) => {
    const chart = fixtureDrumChart(1, specs);
    const marks = drumGridMarksByBar(chart)[0];
    const lanes = drumGridLanes(marks, drumGridRows(chart.hits), CHAR);
    const beatWidth = sectionBeatWidth(BASE, neededBeatWidth(lanes, GAP));
    const clear = clearances(marks, beatWidth, CHAR);
    expect(clear.length).toBeGreaterThan(0);
    expect(Math.min(...clear)).toBeGreaterThanOrEqual(GAP - 1e-6);
  });

  it('needs a wider beat for sixteenth notes than the base width gives', () => {
    const chart = fixtureDrumChart(
      1,
      Array.from({ length: 16 }, (_, i) => ({
        bar: 0,
        beat: i / 4,
        midi: CLOSED_HAT,
      })),
    );
    const marks = drumGridMarksByBar(chart)[0];
    // At the base width two neighbours would be 1.9 px apart.
    expect(Math.min(...clearances(marks, BASE, CHAR))).toBeLessThan(GAP);
    const lanes = drumGridLanes(marks, ['chimbal'], CHAR);
    expect(neededBeatWidth(lanes, GAP)).toBeCloseTo((CHAR + GAP) / 0.25);
  });

  it('gives one lane for each row of the chart, also for a bar that leaves a row empty', () => {
    const chart = fixtureDrumChart(2, [
      { bar: 0, beat: 0, midi: KICK },
      { bar: 0, beat: 2, midi: SNARE },
      { bar: 1, beat: 0, midi: KICK },
    ]);
    const rows = drumGridRows(chart.hits);
    const lanes = drumGridLanes(drumGridMarksByBar(chart)[1], rows, CHAR);
    expect(lanes.map((lane) => lane.labels.length)).toEqual([0, 1]);
  });
});

describe('repeat marks of the grid', () => {
  it('finds the bars that draw the same as the bar above', () => {
    const groove = (bar: number): HitSpec[] => [
      { bar, beat: 0, midi: KICK },
      { bar, beat: 2, midi: SNARE },
    ];
    const chart = fixtureDrumChart(6, [
      ...groove(0),
      ...groove(1),
      ...groove(2),
      // Bar 3 has an accent that bar 1 lacks.
      { bar: 3, beat: 0, midi: KICK },
      { bar: 3, beat: 2, midi: SNARE, dynamic: 'accent' },
      ...groove(4),
    ]);
    const marks = drumGridMarksByBar(chart);
    const drawing = drumBarDrawing(chart, marks);
    expect(drawing(5)).toBeNull();
    expect(drawing(0)).toBe(drawing(1));
    expect(drawing(3)).not.toBe(drawing(1));
    const [block] = sectionBlocks(
      chart,
      new Set(chart.hits.map((hit) => hit.bar)),
    );
    expect([...repeatsAbove(block, 2, drawing)]).toEqual([
      [2, 0],
      [4, 2],
    ]);
  });
});

describe('a bar in words', () => {
  it('names each row with its symbols', () => {
    const chart = fixtureDrumChart(2, [
      { bar: 0, beat: 0, midi: OPEN_HAT },
      { bar: 0, beat: 1, midi: CLOSED_HAT },
      { bar: 0, beat: 0, midi: KICK, dynamic: 'accent' },
      { bar: 0, beat: 2, midi: SNARE, dynamic: 'ghost' },
    ]);
    const rows = drumGridRows(chart.hits);
    const marks = drumGridMarksByBar(chart);
    expect(drumBarSpoken(marks[0], rows)).toBe(
      'Chimbal o x · Caixa (●) · Bumbo >●',
    );
    expect(drumBarSpoken(marks[1], rows)).toBe('pausa');
  });
});
