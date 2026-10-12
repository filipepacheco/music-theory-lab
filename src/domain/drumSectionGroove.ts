import type { ChartBars } from '@/domain/bassChart';
import type { DrumGridMark, DrumGridRow } from '@/domain/drumGrid';
import type { GrooveSubdivision } from '@/types';

/** The rows that count for the groove of a section: kick, snare, hi-hat. */
const GROOVE_ROWS: readonly DrumGridRow[] = ['bumbo', 'caixa', 'chimbal'];

type SectionRange = { startBar: number; endBar: number };

/** The kick, snare, and hi-hat marks of a bar, in the order of the grid. */
function grooveMarks(marks: DrumGridMark[] | undefined): DrumGridMark[] {
  return (marks ?? []).filter((mark) => GROOVE_ROWS.includes(mark.row));
}

/**
 * The kick, snare, and hi-hat pattern of a bar as text: the same text for the
 * same pattern. Null for a bar with none of the three. The dynamic and the
 * open hi-hat do not count: the pattern is where the three pieces hit.
 */
export function drumBarGroovePattern(
  chart: Pick<ChartBars, 'bars'>,
  marks: DrumGridMark[][],
  bar: number,
): string | null {
  const own = grooveMarks(marks[bar]);
  if (own.length === 0) return null;
  const cells = own.map((mark) => `${mark.row}:${mark.beat}`);
  return `${chart.bars[bar]?.beatCount}|${cells.join(',')}`;
}

/** The bar that holds the section groove, and how often the groove repeats. */
export interface SectionGroove {
  /** The first bar of the section that plays the section groove. */
  bar: number;
  /** The bars of the section that play it. */
  count: number;
}

/**
 * The section groove: the kick, snare, and hi-hat pattern that the section
 * repeats most. On a tie the pattern that comes first wins. Null for a
 * section with none of the three pieces.
 */
export function sectionGroove(
  chart: Pick<ChartBars, 'bars'>,
  marks: DrumGridMark[][],
  section: SectionRange,
): SectionGroove | null {
  const found = new Map<string, SectionGroove>();
  for (let bar = section.startBar; bar < section.endBar; bar += 1) {
    const pattern = drumBarGroovePattern(chart, marks, bar);
    if (pattern === null) continue;
    const before = found.get(pattern);
    if (before) before.count += 1;
    else found.set(pattern, { bar, count: 1 });
  }
  let best: SectionGroove | null = null;
  for (const candidate of found.values()) {
    if (best === null || candidate.count > best.count) best = candidate;
  }
  return best;
}

/**
 * The bars of a section that are fills: they play kick, snare, or hi-hat, and
 * not the section groove. A bar with none of the three, or that differs only
 * in other pieces of the kit, is not a fill. Empty with no section groove.
 */
export function sectionFillBars(
  chart: Pick<ChartBars, 'bars'>,
  marks: DrumGridMark[][],
  section: SectionRange,
): number[] {
  const groove = sectionGroove(chart, marks, section);
  if (groove === null) return [];
  const main = drumBarGroovePattern(chart, marks, groove.bar);
  const fills: number[] = [];
  for (let bar = section.startBar; bar < section.endBar; bar += 1) {
    const pattern = drumBarGroovePattern(chart, marks, bar);
    if (pattern !== null && pattern !== main) fills.push(bar);
  }
  return fills;
}

/** The pattern that the groove chart of the Estrutura module draws. */
export interface GrooveChartInput {
  subdivision: GrooveSubdivision;
  measureCount: 1;
  bumbo: boolean[];
  caixa: boolean[];
  chimbal: boolean[];
}

const SUBDIVISIONS: readonly { id: GrooveSubdivision; perBeat: number }[] = [
  { id: '4n', perBeat: 1 },
  { id: '8n', perBeat: 2 },
  { id: '16n', perBeat: 4 },
  { id: '32n', perBeat: 8 },
];

const EPSILON = 1e-6;

/**
 * Converts the section groove to the input of the groove chart: one 4/4
 * measure on the coarsest step grid that holds every hit. Null when the chart
 * cannot draw it: the bar is not 4/4, or a hit is off the finest grid.
 */
export function grooveChartInput(
  chart: Pick<ChartBars, 'bars'>,
  marks: DrumGridMark[][],
  groove: SectionGroove,
): GrooveChartInput | null {
  if (chart.bars[groove.bar]?.beatCount !== 4) return null;
  const own = grooveMarks(marks[groove.bar]);
  if (own.length === 0) return null;
  const grid = SUBDIVISIONS.find(({ perBeat }) =>
    own.every((mark) => {
      const step = mark.beat * perBeat;
      return Math.abs(step - Math.round(step)) < EPSILON;
    }),
  );
  if (!grid) return null;
  const steps = 4 * grid.perBeat;
  const lane = (row: DrumGridRow) => {
    const hits = Array.from({ length: steps }, () => false);
    for (const mark of own) {
      if (mark.row !== row) continue;
      const step = Math.round(mark.beat * grid.perBeat);
      if (step < 0 || step >= steps) return null;
      hits[step] = true;
    }
    return hits;
  };
  const bumbo = lane('bumbo');
  const caixa = lane('caixa');
  const chimbal = lane('chimbal');
  if (!bumbo || !caixa || !chimbal) return null;
  return {
    subdivision: grid.id,
    measureCount: 1,
    bumbo,
    caixa,
    chimbal,
  };
}
