import type { HarmonicFunction } from '@/constants/harmonicFields';
import type { ProgressionStep } from '@/constants/progressions';
import { getNoteName, getPreferredRootName } from '@/utils/noteHelpers';
import type { HarmonicChord } from '@/utils/musicTheory';

/**
 * A progression step resolved against the harmonic field: the single
 * interface for every display and playback call site that needs to know
 * what a step sounds like and how it is spelled.
 */
export interface ResolvedStep {
  /** Display name: the chord template name for field chords, else the step's own label. */
  chordName: string;
  /** Note names spelled for the current key (flat in flat keys). */
  noteNames: string[];
  /** Harmonic function of field chords; null for chromatic / out-of-field steps. */
  harmonicFunction: HarmonicFunction | null;
  /** Note indices 0-11 for playback; empty when nothing is playable. */
  notes: number[];
  /**
   * The 0-6 harmonic-field index when the step is a valid field chord,
   * null otherwise. Note: the 1-7 template degree lives on
   * `HarmonicChord.degree` — the two must not be conflated.
   */
  degree: number | null;
}

/**
 * Resolves one progression step against the harmonic field.
 *
 * Fallback rule: a step is a field chord only when its `degree` is present
 * AND the field holds that index. Anything else falls back to the step's
 * label plus its intervals mapped against the root note. The key's spelling
 * (sharp vs flat) is derived here, so call sites cannot drop it.
 */
export function resolveStep(
  step: ProgressionStep,
  harmonicField: HarmonicChord[],
  rootNote: number,
): ResolvedStep {
  const chord = step.degree !== null ? harmonicField[step.degree] : undefined;

  if (chord) {
    return {
      chordName: chord.chordName,
      noteNames: chord.noteNames,
      harmonicFunction: chord.harmonicFunction,
      notes: chord.notes,
      degree: step.degree,
    };
  }

  const rootName = getPreferredRootName(rootNote);
  const notes = (step.intervals ?? []).map((interval) => (rootNote + interval) % 12);

  return {
    chordName: step.label,
    noteNames: notes.map((note) => getNoteName(note, rootName)),
    harmonicFunction: null,
    notes,
    degree: null,
  };
}
