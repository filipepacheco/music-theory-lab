import type { BassChartSection } from '@/domain/bassChart';
import type {
  GuitarChart,
  GuitarChartNote,
  GuitarTechnique,
} from '@/domain/guitarChart';

const BEAT = 0.5;

export const STANDARD_GUITAR_OPEN_PITCHES = [40, 45, 50, 55, 59, 64];

export interface GuitarNoteSpec {
  bar: number;
  beat: number;
  string: number;
  fret: number;
  slideToFret?: number | null;
  techniques?: GuitarTechnique[];
}

export function fixtureGuitarChart(
  barCount: number,
  specs: GuitarNoteSpec[],
  options: {
    openPitches?: number[];
    capo?: number;
    partName?: string;
    trackIndex?: number;
    sections?: BassChartSection[];
  } = {},
): GuitarChart {
  const openPitches = options.openPitches ?? STANDARD_GUITAR_OPEN_PITCHES;
  const capo = options.capo ?? 0;
  const bars = Array.from({ length: barCount }, (_, index) => ({
    index,
    startTime: index * 4 * BEAT,
    endTime: (index + 1) * 4 * BEAT,
    beatCount: 4,
  }));
  const notes: GuitarChartNote[] = specs
    .map((spec) => {
      const time = bars[spec.bar].startTime + spec.beat * BEAT;
      return {
        time,
        endTime: time + BEAT,
        string: spec.string,
        fret: spec.fret,
        midi: openPitches[spec.string] + capo + spec.fret,
        sustain: BEAT,
        bar: spec.bar,
        beatInBar: spec.beat,
        slideToFret: spec.slideToFret ?? null,
        techniques: spec.techniques ?? [],
      };
    })
    .sort((a, b) => a.time - b.time || a.string - b.string);
  return {
    schemaVersion: 1,
    id: 'e'.repeat(64),
    part: 'guitar',
    partName: options.partName ?? 'Guitarra 1',
    trackIndex: options.trackIndex ?? 1,
    sourceFileName: 'test.gp',
    source: 'gp',
    importedAt: '2026-01-01T00:00:00Z',
    title: 'Test',
    artist: '',
    album: '',
    year: null,
    songLengthSeconds: barCount * 4 * BEAT,
    averageTempoBpm: 120,
    bars,
    sections: options.sections ?? [
      { name: 'verse', parts: 1, startBar: 0, endBar: barCount },
    ],
    strings: openPitches.length,
    openPitches: [...openPitches],
    capo,
    notes,
  };
}
