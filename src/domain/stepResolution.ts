import type { HarmonicFunction } from '@/constants/harmonicFields';
import type { ProgressionStep } from '@/constants/progressions';
import { getNoteName, getPreferredRootName } from '@/utils/noteHelpers';
import type { HarmonicChord } from '@/utils/musicTheory';

export interface ResolvedStep {
  chordName: string;
  noteNames: string[];
  harmonicFunction: HarmonicFunction | null;
  notes: number[];
  degree: number | null;
}

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
  const notes = (step.intervals ?? []).map(
    (interval) => (rootNote + interval) % 12,
  );

  return {
    chordName: step.label,
    noteNames: notes.map((note) => getNoteName(note, rootName)),
    harmonicFunction: null,
    notes,
    degree: null,
  };
}
