// The rules for playing the bass part and the drum part of one song together.
//
// Both parts play on one clock only when they come from one file: charts from
// different files can have different bar grids. A linked recording replaces
// the samples, so no sample sounds for either part.

export type PlaybackPart = 'bass' | 'drums';

export type PartMutes = Record<PlaybackPart, boolean>;

export const NO_MUTES: PartMutes = { bass: false, drums: false };

export interface PartsSoundingInput {
  /** The part on the screen. */
  open: PlaybackPart;
  /** The other part is from the same file as the open one. */
  sameFile: boolean;
  /** A recording is linked to the song: it sounds, the samples do not. */
  recording: boolean;
  mutes: PartMutes;
}

/** Which parts sound with samples, given the mutes, the recording, the file. */
export function partsSounding({
  open,
  sameFile,
  recording,
  mutes,
}: PartsSoundingInput): PartMutes {
  if (recording) return { bass: false, drums: false };
  const reaches = (part: PlaybackPart) => sameFile || part === open;
  return {
    bass: reaches('bass') && !mutes.bass,
    drums: reaches('drums') && !mutes.drums,
  };
}

/** The parts play together on one clock: same file, and no recording. */
export function playsTogether(
  input: Pick<PartsSoundingInput, 'sameFile' | 'recording'>,
): boolean {
  return input.sameFile && !input.recording;
}

export type PartEvent<B, D> =
  | { part: 'bass'; time: number; note: B }
  | { part: 'drums'; time: number; hit: D };

/** The events of the two parts on one clock, in time order. */
export function partsTimeline<
  B extends { time: number },
  D extends { time: number },
>(bass: readonly B[], drums: readonly D[]): PartEvent<B, D>[] {
  const events: PartEvent<B, D>[] = [
    ...bass.map((note) => ({ part: 'bass' as const, time: note.time, note })),
    ...drums.map((hit) => ({ part: 'drums' as const, time: hit.time, hit })),
  ];
  // A stable sort keeps the bass note before a drum hit at the same time.
  return events.sort((a, b) => a.time - b.time);
}

/** The events that sound: the timeline without the parts that stay silent. */
export function partsSchedule<
  B extends { time: number },
  D extends { time: number },
>(
  input: PartsSoundingInput,
  bass: readonly B[],
  drums: readonly D[],
): PartEvent<B, D>[] {
  const sounding = partsSounding(input);
  return partsTimeline(bass, drums).filter((event) => sounding[event.part]);
}
