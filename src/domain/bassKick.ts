import { drumGridMarksByBar } from '@/domain/drumGrid';
import type { DrumChart } from '@/domain/drumChart';

/**
 * The beats of the kick hits in each bar of a drum chart. A bass chart of the
 * same file shows them under its strings: both charts share one bar grid.
 */
export function kickBeatsByBar(chart: DrumChart): number[][] {
  return drumGridMarksByBar(chart).map((marks) =>
    marks.filter((m) => m.row === 'bumbo').map((m) => m.beat),
  );
}
