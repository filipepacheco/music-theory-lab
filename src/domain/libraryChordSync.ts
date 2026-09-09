import type { ChordSegment } from '@/components/library/libraryData';
import { chordDisplayName } from '@/components/library/libraryData';

export interface LibraryChordVisualState {
  text: string | null;
  rootPitchClass: number | null;
  pitchClasses: number[];
}

const NO_ACTIVE_CHORD: LibraryChordVisualState = {
  text: null,
  rootPitchClass: null,
  pitchClasses: [],
};

/**
 * Derive the Biblioteca fretboard state solely from the media clock.
 * Segments are interpreted as half-open intervals so a boundary belongs to
 * the segment that starts there, never to the one that just ended.
 */
export function resolveLibraryChordAt(
  segments: ChordSegment[],
  currentSeconds: number,
): LibraryChordVisualState {
  if (!Number.isFinite(currentSeconds) || currentSeconds < 0) {
    return NO_ACTIVE_CHORD;
  }

  const segment = segments.find(
    ({ start_seconds, end_seconds }) =>
      currentSeconds >= start_seconds && currentSeconds < end_seconds,
  );
  if (!segment) return NO_ACTIVE_CHORD;

  if (
    segment.root_pc === null ||
    segment.label === 'unknown' ||
    segment.label === 'no_chord'
  ) {
    return {
      text: chordDisplayName(segment),
      rootPitchClass: null,
      pitchClasses: [],
    };
  }

  const third = segment.label === 'minor' ? 3 : 4;
  return {
    text: chordDisplayName(segment),
    rootPitchClass: segment.root_pc,
    pitchClasses: [
      segment.root_pc,
      (segment.root_pc + third) % 12,
      (segment.root_pc + 7) % 12,
    ],
  };
}
