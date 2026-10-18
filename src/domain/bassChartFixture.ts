import type {
  BassChart,
  BassChartNote,
  BassChartSection,
  BassTechnique,
} from '@/domain/bassChart';

const BEAT = 0.5;
const OPEN_MIDI = [28, 33, 38, 43];

export interface NoteSpec {
  bar: number;
  beat: number;
  midi?: number;
  string?: number;
  fret?: number;
  sustain?: number;
  techniques?: BassTechnique[];
}

export function fixtureChart(
  barCount: number,
  specs: NoteSpec[],
  sections: BassChartSection[] = [
    { name: 'verse', parts: 1, startBar: 0, endBar: barCount },
  ],
): BassChart {
  const bars = Array.from({ length: barCount }, (_, index) => ({
    index,
    startTime: index * 4 * BEAT,
    endTime: (index + 1) * 4 * BEAT,
    beatCount: 4,
  }));
  const notes: BassChartNote[] = specs.map((spec) => {
    const string = spec.string ?? 1;
    const fret = spec.fret ?? (spec.midi ?? 0) - OPEN_MIDI[string];
    const time = bars[spec.bar].startTime + spec.beat * BEAT;
    return {
      time,
      endTime: time + BEAT,
      string,
      fret,
      midi: spec.midi ?? OPEN_MIDI[string] + fret,
      sustain: (spec.sustain ?? 0) * BEAT,
      bar: spec.bar,
      beatInBar: spec.beat,
      slideToFret: null,
      techniques: spec.techniques ?? [],
    };
  });
  notes.sort((a, b) => a.time - b.time || a.string - b.string);
  return {
    schemaVersion: 1,
    id: 'test',
    sourceFileName: 'test.psarc',
    importedAt: '2026-01-01T00:00:00Z',
    title: 'Test',
    artist: '',
    album: '',
    year: null,
    tuning: [0, 0, 0, 0],
    songLengthSeconds: barCount * 4 * BEAT,
    averageTempoBpm: 120,
    bars,
    sections,
    notes,
  };
}

export function walking(bars: number[][]): NoteSpec[] {
  return bars.flatMap((midis, bar) =>
    midis.map((midi, beat) => ({ bar, beat, midi })),
  );
}
