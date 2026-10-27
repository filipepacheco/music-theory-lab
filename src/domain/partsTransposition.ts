import type { GuitarChart } from '@/domain/guitarChart';
import type { VocalChart } from '@/domain/vocalChart';

const MAX_FRET = 24;

/** Moves a fret by `semitones`, and by one octave when it leaves the neck. */
function movedFret(fret: number, semitones: number): number {
  let next = fret + semitones;
  while (next < 0) next += 12;
  while (next > MAX_FRET) next -= 12;
  return next;
}

/** A guitar note keeps its string and moves its fret. */
export function transposeGuitarChart(
  chart: GuitarChart,
  semitones: number,
): GuitarChart {
  if (semitones === 0) return chart;
  return {
    ...chart,
    notes: chart.notes.map((note) => {
      const fret = movedFret(note.fret, semitones);
      const slide =
        note.slideToFret === null ? null : note.slideToFret + (fret - note.fret);
      return {
        ...note,
        fret,
        midi: note.midi + (fret - note.fret),
        slideToFret:
          slide !== null && slide >= 0 && slide <= MAX_FRET ? slide : null,
      };
    }),
  };
}

export function transposeVocalChart(
  chart: VocalChart,
  semitones: number,
): VocalChart {
  if (semitones === 0) return chart;
  return {
    ...chart,
    notes: chart.notes.map((note) => ({
      ...note,
      midi: note.midi + semitones,
    })),
  };
}

/** The guitar and vocal charts of one file shift by the same interval. */
export function transposeSongParts(
  parts: { guitars: GuitarChart[]; vocals: VocalChart[] },
  semitones: number,
): { guitars: GuitarChart[]; vocals: VocalChart[] } {
  return {
    guitars: parts.guitars.map((c) => transposeGuitarChart(c, semitones)),
    vocals: parts.vocals.map((c) => transposeVocalChart(c, semitones)),
  };
}
