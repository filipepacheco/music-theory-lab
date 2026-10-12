import type { ChartBars, LabelLane } from '@/domain/bassChart';
import type { DrumDynamic, DrumHit } from '@/domain/drumChart';

/**
 * The rows of the drum grid, from top to bottom. The two cymbals share a row,
 * and so do the two toms. The hi-hat that the foot plays has its own row. The
 * pieces that General MIDI does not name for the kit go to the last row.
 */
export const DRUM_GRID_ROWS = [
  'pratos',
  'chimbal',
  'toms',
  'caixa',
  'surdo',
  'bumbo',
  'pedal',
  'outros',
] as const;
export type DrumGridRow = (typeof DRUM_GRID_ROWS)[number];

/** The label of a row at the start of a line of bars; short, to save width. */
export const DRUM_GRID_ROW_LABEL: Record<DrumGridRow, string> = {
  pratos: 'Pratos',
  chimbal: 'Chimbal',
  toms: 'Tons',
  caixa: 'Caixa',
  surdo: 'Surdo',
  bumbo: 'Bumbo',
  pedal: 'Pedal',
  outros: 'Outros',
};

/** The full name of a row, for a tooltip and for a screen reader. */
export const DRUM_GRID_ROW_NAME: Record<DrumGridRow, string> = {
  pratos: 'Pratos de ataque e de condução',
  chimbal: 'Chimbal',
  toms: 'Tons agudo e médio',
  caixa: 'Caixa',
  surdo: 'Surdo',
  bumbo: 'Bumbo',
  pedal: 'Pedal do chimbal',
  outros: 'Outras peças',
};

/** A filled dot for a drum, `x` for a cymbal, `o` for the open hi-hat. */
export type DrumGridSymbol = 'dot' | 'x' | 'o';

/** The text of a symbol, for a label that a screen reader speaks. */
export const DRUM_GRID_SYMBOL_TEXT: Record<DrumGridSymbol, string> = {
  dot: '●',
  x: 'x',
  o: 'o',
};

type GridHit = Pick<DrumHit, 'piece' | 'articulation'>;

/** The row of the grid that draws a hit. */
export function drumGridRowOf(hit: GridHit): DrumGridRow {
  switch (hit.piece) {
    case 'pratoAtaque':
    case 'pratoConducao':
      return 'pratos';
    case 'chimbal':
      return hit.articulation === 'pedal' ? 'pedal' : 'chimbal';
    case 'tomAgudo':
    case 'tomMedio':
      return 'toms';
    case 'caixa':
      return 'caixa';
    case 'surdo':
      return 'surdo';
    case 'bumbo':
      return 'bumbo';
    default:
      return 'outros';
  }
}

/** The symbol that draws a hit. */
export function drumGridSymbolOf(hit: GridHit): DrumGridSymbol {
  switch (hit.piece) {
    case 'bumbo':
    case 'caixa':
    case 'tomAgudo':
    case 'tomMedio':
    case 'surdo':
      return 'dot';
    case 'chimbal':
      return hit.articulation === 'open' ? 'o' : 'x';
    default:
      return 'x';
  }
}

/**
 * The rows that a chart uses, from top to bottom. All bars of the chart draw
 * these rows, so a simple groove stays compact.
 */
export function drumGridRows(hits: GridHit[]): DrumGridRow[] {
  const used = new Set(hits.map(drumGridRowOf));
  return DRUM_GRID_ROWS.filter((row) => used.has(row));
}

/** Padding at each side of a bar, in the bass tab and in the drum grid. */
export const BAR_PAD_X = 7;
/** Width of one drum symbol (11 px monospace), and of a kick circle's span. */
export const DRUM_MARK_WIDTH = 11 * 0.6;

/**
 * The x of the centre of a mark at `beat` in a bar: the one rule that the
 * drum grid and the kick row of the bass tab share, so the two align.
 */
export function beatMarkX(beat: number, beatWidth: number): number {
  return BAR_PAD_X + beat * beatWidth + DRUM_MARK_WIDTH / 2;
}

/** One symbol of the grid: what a row draws at one beat of a bar. */
export interface DrumGridMark {
  row: DrumGridRow;
  /** Beats from the downbeat of the bar. */
  beat: number;
  symbol: DrumGridSymbol;
  dynamic: DrumDynamic;
}

const DYNAMIC_RANK: Record<DrumDynamic, number> = {
  ghost: 0,
  normal: 1,
  accent: 2,
};
const SYMBOL_RANK: Record<DrumGridSymbol, number> = { x: 0, dot: 1, o: 2 };

/**
 * The marks of each bar of a chart, ordered by row and then by beat. Hits of
 * one row at one beat (the two toms, or the two cymbals) are one mark: it
 * takes the strongest dynamic, and the open hi-hat wins over the closed one.
 */
export function drumGridMarksByBar(
  chart: Pick<ChartBars, 'bars'> & { hits: DrumHit[] },
): DrumGridMark[][] {
  const cells = chart.bars.map(() => new Map<string, DrumGridMark>());
  for (const hit of chart.hits) {
    const cell = cells[hit.bar];
    if (!cell) continue;
    const row = drumGridRowOf(hit);
    const key = `${row}@${hit.beatInBar}`;
    const symbol = drumGridSymbolOf(hit);
    const before = cell.get(key);
    cell.set(
      key,
      before
        ? {
            ...before,
            symbol:
              SYMBOL_RANK[symbol] > SYMBOL_RANK[before.symbol]
                ? symbol
                : before.symbol,
            dynamic:
              DYNAMIC_RANK[hit.dynamic] > DYNAMIC_RANK[before.dynamic]
                ? hit.dynamic
                : before.dynamic,
          }
        : { row, beat: hit.beatInBar, symbol, dynamic: hit.dynamic },
    );
  }
  return cells.map((cell) =>
    [...cell.values()].sort(
      (a, b) =>
        DRUM_GRID_ROWS.indexOf(a.row) - DRUM_GRID_ROWS.indexOf(b.row) ||
        a.beat - b.beat,
    ),
  );
}

/**
 * How far a mark reaches to each side of its beat, in character widths. The
 * symbol starts at the beat and is one character wide. A ghost note has one
 * parenthesis before the beat and one after the symbol. The `>` of an accent
 * is above the symbol, so it takes no width.
 */
export function drumMarkReach(mark: Pick<DrumGridMark, 'dynamic'>): {
  before: number;
  after: number;
} {
  return mark.dynamic === 'ghost'
    ? { before: 1, after: 2 }
    : { before: 0, after: 1 };
}

/**
 * The label lanes of a bar of the grid, one for each row, for the layout
 * functions of the bass tab (`neededBeatWidth`). A label holds the reach of
 * its mark after the beat and the reach of the next mark before its own
 * beat, so two marks of a row do not touch at the beat width that the lanes
 * need.
 */
export function drumGridLanes(
  marks: DrumGridMark[],
  rows: readonly DrumGridRow[],
  charWidth: number,
): LabelLane[] {
  return rows.map((row) => {
    const inRow = marks
      .filter((mark) => mark.row === row)
      .sort((a, b) => a.beat - b.beat);
    return {
      charWidth,
      labels: inRow.map((mark, index) => {
        const next = inRow[index + 1];
        return {
          beat: mark.beat,
          chars:
            drumMarkReach(mark).after + (next ? drumMarkReach(next).before : 0),
        };
      }),
    };
  });
}

/**
 * What a bar of the grid draws, for `repeatsAbove`: its meter and its marks.
 * Null for a bar with no hit.
 */
export function drumBarDrawing(
  chart: Pick<ChartBars, 'bars'>,
  marks: DrumGridMark[][],
): (bar: number) => string | null {
  return (bar) => {
    const cells = (marks[bar] ?? []).map((mark) =>
      [mark.row, mark.beat, mark.symbol, mark.dynamic].join(':'),
    );
    return cells.length > 0
      ? `${chart.bars[bar].beatCount}|${cells.join(',')}`
      : null;
  };
}

/** A bar of the grid in words: each row with its symbols, for a screen reader. */
export function drumBarSpoken(
  marks: DrumGridMark[],
  rows: readonly DrumGridRow[],
): string {
  const spoken = rows.flatMap((row) => {
    const inRow = marks.filter((mark) => mark.row === row);
    if (inRow.length === 0) return [];
    const symbols = inRow.map((mark) => {
      const text = DRUM_GRID_SYMBOL_TEXT[mark.symbol];
      if (mark.dynamic === 'ghost') return `(${text})`;
      return mark.dynamic === 'accent' ? `>${text}` : text;
    });
    return [`${DRUM_GRID_ROW_LABEL[row]} ${symbols.join(' ')}`];
  });
  return spoken.length > 0 ? spoken.join(' · ') : 'pausa';
}
