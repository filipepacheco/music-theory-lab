import type {
  DrumArticulation,
  DrumChartPiece,
  DrumDynamic,
  DrumHit,
} from '@/domain/drumChart';

export const DRUM_SAMPLE_IDS = [
  'kick',
  'snare',
  'cross-stick',
  'hihat-closed',
  'hihat-open',
  'hihat-pedal',
  'tom-high',
  'tom-low',
  'crash',
  'ride',
  'ride-bell',
  'splash',
] as const;
export type DrumSampleId = (typeof DRUM_SAMPLE_IDS)[number];

export const DRUM_SAMPLE_TRIM_DB: Record<DrumSampleId, number> = {
  kick: -4.5,
  snare: -1.1,
  'cross-stick': 0.4,
  'hihat-closed': 1.8,
  'hihat-open': -3.1,
  'hihat-pedal': 9.1,
  'tom-high': 1.3,
  'tom-low': 2.6,
  crash: -1.7,
  ride: 9.1,
  'ride-bell': 3.5,
  splash: 16,
};

export interface DrumSampleChoice {
  sample: DrumSampleId;
  rate: number;
}

const choice = (sample: DrumSampleId, rate = 1): DrumSampleChoice => ({
  sample,
  rate,
});

export function drumSampleFor(
  piece: DrumChartPiece,
  articulation: DrumArticulation,
): DrumSampleChoice | null {
  switch (piece) {
    case 'bumbo':
      return choice('kick');
    case 'caixa':
      return choice(articulation === 'crossStick' ? 'cross-stick' : 'snare');
    case 'chimbal':
      if (articulation === 'open') return choice('hihat-open');
      if (articulation === 'pedal') return choice('hihat-pedal');
      return choice('hihat-closed');
    case 'tomAgudo':
      return choice('tom-high');
    case 'tomMedio':
      return choice('tom-low', 1.12);
    case 'surdo':
      return choice('tom-low', 0.84);
    case 'pratoAtaque':
      return choice(articulation === 'splash' ? 'splash' : 'crash');
    case 'pratoConducao':
      return choice(articulation === 'bell' ? 'ride-bell' : 'ride');
    default:
      return null;
  }
}

export const DRUM_DYNAMIC_GAIN: Record<DrumDynamic, number> = {
  ghost: 0.3,
  normal: 0.7,
  accent: 1,
};

export interface DrumPlaybackHit {
  time: number;
  sample: DrumSampleId;
  rate: number;
  gain: number;
}

export function drumPlaybackHits(hits: DrumHit[]): DrumPlaybackHit[] {
  const result: DrumPlaybackHit[] = [];
  for (const hit of hits) {
    const picked = drumSampleFor(hit.piece, hit.articulation);
    if (!picked) continue;
    result.push({
      time: hit.time,
      sample: picked.sample,
      rate: picked.rate,
      gain: DRUM_DYNAMIC_GAIN[hit.dynamic] ?? DRUM_DYNAMIC_GAIN.normal,
    });
  }
  return result.sort((a, b) => a.time - b.time);
}
