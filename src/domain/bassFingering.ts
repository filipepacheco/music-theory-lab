import type { BassChart } from '@/domain/bassChart';

export function withOriginalGpFingering(chart: BassChart): BassChart {
  const positions = chart.originalFingering;
  if (chart.source !== 'gp' || !positions) return chart;
  return {
    ...chart,
    notes: chart.notes.map((note, index) => {
      const position = positions[index];
      // A slide keeps its distance in frets on the written string.
      const slide =
        note.slideToFret === null
          ? null
          : note.slideToFret + position.fret - note.fret;
      return {
        ...note,
        ...position,
        slideToFret: slide !== null && slide >= 0 && slide <= 24 ? slide : null,
      };
    }),
  };
}
