import type { ChartBars } from '@/domain/bassChart';
import type { DrumGridMark, DrumGridRow } from '@/domain/drumGrid';
import type { GrooveSubdivision } from '@/types';

const GROOVE_ROWS: readonly DrumGridRow[] = ['bumbo', 'caixa', 'chimbal'];

type SectionRange = { startBar: number; endBar: number };

function grooveMarks(marks: DrumGridMark[] | undefined): DrumGridMark[] {
  return (marks ?? []).filter((mark) => GROOVE_ROWS.includes(mark.row));
}

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

export interface SectionGroove {
  bar: number;
  count: number;
}

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
