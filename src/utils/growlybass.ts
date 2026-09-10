import {
  GROWLYBASS_ANCHORS,
  GROWLYBASS_LAYERS,
} from '@/constants/growlybass.generated';

export const GROWLYBASS_BASE_URL = '/audio/growlybass/';

export type GrowlybassLayer = (typeof GROWLYBASS_LAYERS)[number];

export interface GrowlybassSamplePlan {
  anchor: string;
  anchorMidi: number;
  requestedMidi: number;
  midiVelocity: number;
  layer: GrowlybassLayer;
  semitones: number;
  playbackRate: number;
  file: string;
  url: string;
}

function toMidiVelocity(velocity: number): number {
  const normalized = Math.max(0, Math.min(1, velocity));
  return Math.max(1, Math.min(127, Math.round(normalized * 127)));
}

function layerForMidiVelocity(midiVelocity: number): GrowlybassLayer {
  if (midiVelocity <= 60) return 'pp';
  if (midiVelocity <= 95) return 'p';
  if (midiVelocity <= 120) return 'f';
  return 'ff';
}

export function resolveGrowlybassSample(
  requestedMidi: number,
  velocity = 0.6,
): GrowlybassSamplePlan {
  if (
    !Number.isInteger(requestedMidi) ||
    requestedMidi < 28 ||
    requestedMidi > 55
  ) {
    throw new RangeError('Growlybass suporta somente notas entre E1 e G3.');
  }

  const anchor = GROWLYBASS_ANCHORS.reduce((nearest, candidate) =>
    Math.abs(candidate.soundingMidi - requestedMidi) <
    Math.abs(nearest.soundingMidi - requestedMidi)
      ? candidate
      : nearest,
  );
  const midiVelocity = toMidiVelocity(velocity);
  const layer = layerForMidiVelocity(midiVelocity);
  const semitones = requestedMidi - anchor.soundingMidi;
  const file = `${anchor.name}_${layer}_rr1.mp3`;

  return {
    anchor: anchor.name,
    anchorMidi: anchor.soundingMidi,
    requestedMidi,
    midiVelocity,
    layer,
    semitones,
    playbackRate: 2 ** (semitones / 12),
    file,
    url: `${GROWLYBASS_BASE_URL}${file}`,
  };
}

export function toBassMidi(noteIndex: number, octave: number): number {
  const normalizedNote = ((noteIndex % 12) + 12) % 12;
  return (octave + 1) * 12 + normalizedNote;
}
