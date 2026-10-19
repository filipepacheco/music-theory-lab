export type PlaybackPart = 'bass' | 'drums';

export type PartMutes = Record<PlaybackPart, boolean>;

export const NO_MUTES: PartMutes = { bass: false, drums: false };

export interface PartsSoundingInput {
  open: PlaybackPart;
  sameFile: boolean;
  recording: boolean;
  mutes: PartMutes;
}

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

export function playsTogether(
  input: Pick<PartsSoundingInput, 'sameFile' | 'recording'>,
): boolean {
  return input.sameFile && !input.recording;
}

export type PartEvent<B, D> =
  | { part: 'bass'; time: number; note: B }
  | { part: 'drums'; time: number; hit: D };

export function partsTimeline<
  B extends { time: number },
  D extends { time: number },
>(bass: readonly B[], drums: readonly D[]): PartEvent<B, D>[] {
  const events: PartEvent<B, D>[] = [
    ...bass.map((note) => ({ part: 'bass' as const, time: note.time, note })),
    ...drums.map((hit) => ({ part: 'drums' as const, time: hit.time, hit })),
  ];
  return events.sort((a, b) => a.time - b.time);
}

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
