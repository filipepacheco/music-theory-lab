import type { BassChartSection } from '@/domain/bassChart';
import type { VocalChart, VocalChartNote } from '@/domain/vocalChart';

const BEAT = 0.5;

export interface VocalNoteSpec {
  bar: number;
  beat: number;
  midi: number;
  lyric?: string | null;
  /** Length in beats. */
  length?: number;
}

export function fixtureVocalChart(
  barCount: number,
  specs: VocalNoteSpec[],
  options: {
    partName?: string;
    trackIndex?: number;
    id?: string;
    sections?: BassChartSection[];
  } = {},
): VocalChart {
  const bars = Array.from({ length: barCount }, (_, index) => ({
    index,
    startTime: index * 4 * BEAT,
    endTime: (index + 1) * 4 * BEAT,
    beatCount: 4,
  }));
  const notes: VocalChartNote[] = specs
    .map((spec) => {
      const time = bars[spec.bar].startTime + spec.beat * BEAT;
      const sustain = (spec.length ?? 1) * BEAT;
      return {
        time,
        endTime: time + sustain,
        midi: spec.midi,
        sustain,
        bar: spec.bar,
        beatInBar: spec.beat,
        lyric: spec.lyric ?? null,
      };
    })
    .sort((a, b) => a.time - b.time || a.midi - b.midi);
  return {
    schemaVersion: 1,
    id: options.id ?? 'f'.repeat(64),
    part: 'vocals',
    partName: options.partName ?? 'Voz',
    trackIndex: options.trackIndex ?? 2,
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
    notes,
  };
}
