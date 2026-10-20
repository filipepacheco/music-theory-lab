import { drumGridMarksByBar } from '@/domain/drumGrid';
import type { DrumChart } from '@/domain/drumChart';

export function kickBeatsByBar(chart: DrumChart): number[][] {
  return drumGridMarksByBar(chart).map((marks) =>
    marks.filter((m) => m.row === 'bumbo').map((m) => m.beat),
  );
}
