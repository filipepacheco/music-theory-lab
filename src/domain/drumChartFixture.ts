import type { BassChartSection } from '@/domain/bassChart';
import {
  drumSoundOf,
  type DrumChart,
  type DrumDynamic,
  type DrumHit,
} from '@/domain/drumChart';

const BEAT = 0.5;

export interface HitSpec {
  bar: number;
  beat: number;
  midi: number;
  dynamic?: DrumDynamic;
  intensity?: number;
}

export function fixtureDrumChart(
  barCount: number,
  specs: HitSpec[],
  sections: BassChartSection[] = [
    { name: 'verse', parts: 1, startBar: 0, endBar: barCount },
  ],
): DrumChart {
  const bars = Array.from({ length: barCount }, (_, index) => ({
    index,
    startTime: index * 4 * BEAT,
    endTime: (index + 1) * 4 * BEAT,
    beatCount: 4,
  }));
  const hits: DrumHit[] = specs.map((spec) => ({
    time: bars[spec.bar].startTime + spec.beat * BEAT,
    bar: spec.bar,
    beatInBar: spec.beat,
    ...drumSoundOf(spec.midi),
    dynamic: spec.dynamic ?? 'normal',
    intensity: spec.intensity ?? 95,
    midi: spec.midi,
  }));
  hits.sort((a, b) => a.time - b.time || a.midi - b.midi);
  return {
    schemaVersion: 1,
    id: 'd'.repeat(64),
    part: 'drums',
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
    sections,
    hits,
  };
}
