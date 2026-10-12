import type {
  DrumArticulation,
  DrumChartPiece,
  DrumDynamic,
  DrumHit,
} from '@/domain/drumChart';

/** The sample files of `public/drum-samples/`, without the extension. */
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

/** A sample, played faster or slower to tune it. */
export interface DrumSampleChoice {
  sample: DrumSampleId;
  rate: number;
}

const choice = (sample: DrumSampleId, rate = 1): DrumSampleChoice => ({
  sample,
  rate,
});

/**
 * The sample of a drum piece and articulation. The kit has two toms: the
 * middle tom and the floor tom are the low tom tuned up and down. A piece
 * with no sample (`outros`) gives `null`, and its hits make no sound.
 */
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

/** The loudness of a hit, 0 to 1: a ghost note is soft, an accent is loud. */
export const DRUM_DYNAMIC_GAIN: Record<DrumDynamic, number> = {
  ghost: 0.3,
  normal: 0.7,
  accent: 1,
};

export interface DrumPlaybackHit {
  /** Seconds from the start of the chart. */
  time: number;
  sample: DrumSampleId;
  rate: number;
  gain: number;
}

/** What the player sounds for the hits of a drum chart, in time order. */
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
