import type { ChartBars, LabelLane } from '@/domain/bassChart';
import type { DrumDynamic, DrumHit } from '@/domain/drumChart';

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

export type DrumGridSymbol = 'dot' | 'x' | 'o';

export const DRUM_GRID_SYMBOL_TEXT: Record<DrumGridSymbol, string> = {
  dot: '●',
  x: 'x',
  o: 'o',
};

type GridHit = Pick<DrumHit, 'piece' | 'articulation'>;

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

export function drumGridRows(hits: GridHit[]): DrumGridRow[] {
  const used = new Set(hits.map(drumGridRowOf));
  return DRUM_GRID_ROWS.filter((row) => used.has(row));
}

export const BAR_PAD_X = 7;
export const DRUM_MARK_WIDTH = 11 * 0.6;

export function beatMarkX(beat: number, beatWidth: number): number {
  return BAR_PAD_X + beat * beatWidth + DRUM_MARK_WIDTH / 2;
}

export interface DrumGridMark {
  row: DrumGridRow;
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

export function drumMarkReach(mark: Pick<DrumGridMark, 'dynamic'>): {
  before: number;
  after: number;
} {
  return mark.dynamic === 'ghost'
    ? { before: 1, after: 2 }
    : { before: 0, after: 1 };
}

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
