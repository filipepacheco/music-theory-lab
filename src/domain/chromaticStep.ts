import { CHORD_TYPES } from '@/constants/chords';
import type { ProgressionStep } from '@/constants/progressions';
import { getNoteName, getPreferredRootName } from '@/utils/noteHelpers';

export interface ChromaticStepConstruction {
  /** Absolute note indices for preview/playback. */
  notes: number[];
  /** The progression step to persist (intervals relative to the key root). */
  step: ProgressionStep;
}

/**
 * Manual chromatic step: root note + chord type, expressed against the
 * current key. The inverse of `resolveStep` — everything produced here
 * resolves back correctly.
 */
export function buildManualChromaticStep(
  root: number,
  chordTypeId: string,
  keyRoot: number,
): ChromaticStepConstruction {
  const chordType = CHORD_TYPES[chordTypeId];
  const keyRootName = getPreferredRootName(keyRoot);
  const rootName = getNoteName(root, keyRootName);

  return {
    notes: chordType.intervals.map((i) => (root + i) % 12),
    step: {
      degree: null,
      label: `${rootName}${chordType.symbol}`,
      intervals: chordType.intervals.map(
        (i) => (root - keyRoot + i + 12) % 12,
      ),
    },
  };
}

/**
 * Common chromatic step (secondary dominants, modal interchange, passing
 * diminished): a pre-organized template resolved against the current key.
 */
export function buildCommonChromaticStep(
  label: string,
  rootOffset: number,
  chordTypeId: string,
  keyRoot: number,
): ChromaticStepConstruction {
  const chordType = CHORD_TYPES[chordTypeId];
  const chordRoot = (keyRoot + rootOffset) % 12;

  return {
    notes: chordType.intervals.map((i) => (chordRoot + i) % 12),
    step: {
      degree: null,
      label,
      intervals: chordType.intervals.map((i) => (rootOffset + i) % 12),
    },
  };
}
