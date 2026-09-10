import { getPreferredRootName } from '@/utils/noteHelpers';

export interface ChordSegment {
  start_seconds: number;
  end_seconds: number;
  label: 'major' | 'minor' | 'unknown' | 'no_chord';
  root_pc: number | null;
  candidate_label: string;
  confidence: number | null;
}

/** Display name for a detected chord or its explicit terminal state. */
export function chordDisplayName(segment: ChordSegment): string {
  if (segment.label === 'no_chord') return 'N.C.';
  if (segment.label === 'unknown' || segment.root_pc === null) return '?';
  const rootName = getPreferredRootName(segment.root_pc);
  return segment.label === 'minor' ? `${rootName}m` : rootName;
}

export interface LibraryChordVisualState {
  text: string | null;
  rootPitchClass: number | null;
  pitchClasses: number[];
}

export type LibraryFretHighlightKind = 'root' | 'tone' | null;

/** Classify one visible bass fret against the atomically resolved chord. */
export function libraryFretHighlightKind(
  pitchClass: number,
  chord: Pick<LibraryChordVisualState, 'pitchClasses' | 'rootPitchClass'>,
): LibraryFretHighlightKind {
  if (!chord.pitchClasses.includes(pitchClass)) return null;
  return pitchClass === chord.rootPitchClass ? 'root' : 'tone';
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
