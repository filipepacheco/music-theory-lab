import { CHORD_TYPES } from "@/constants/chords";
import {
  MAJOR_FIELD,
  MINOR_FIELD,
  type HarmonicFunction,
} from "@/constants/harmonicFields";
import { SCALE_PATTERNS } from "@/constants/scales";
import { getNoteName } from "./noteHelpers";

export interface HarmonicChord {
  degree: number;
  romanNumeral: string;
  chordName: string;
  notes: number[];
  noteNames: string[];
  harmonicFunction: HarmonicFunction;
  intervals: number[];
  chordSymbol: string;
}

/**
 * Get the notes of a scale given a root index and scale pattern ID.
 */
export function getScaleNotes(
  rootIndex: number,
  scaleId: string = "major",
): number[] {
  const pattern = SCALE_PATTERNS[scaleId];
  if (!pattern) return [];
  return pattern.intervals.map((interval) => (rootIndex + interval) % 12);
}

/**
 * Get the notes of a chord given a root index and chord type ID.
 */
export function getChordNotes(
  rootIndex: number,
  chordTypeId: string,
): number[] {
  const chordType = CHORD_TYPES[chordTypeId];
  if (!chordType) return [];
  return chordType.intervals.map((interval) => (rootIndex + interval) % 12);
}

/**
 * Compute the full harmonic field for a given root note.
 * Returns an array of 7 HarmonicChord objects.
 */
export function getHarmonicField(
  rootIndex: number,
  isMinor: boolean = false,
): HarmonicChord[] {
  const template = isMinor ? MINOR_FIELD : MAJOR_FIELD;
  const rootName = getNoteName(rootIndex);

  return template.map((deg) => {
    const chordRoot = (rootIndex + deg.scaleInterval) % 12;
    const chordType = CHORD_TYPES[deg.chordType];
    const notes = chordType.intervals.map(
      (interval) => (chordRoot + interval) % 12,
    );
    const chordRootName = getNoteName(chordRoot, rootName);

    return {
      degree: deg.degree,
      romanNumeral: deg.romanNumeral,
      chordName: `${chordRootName}${chordType.symbol}`,
      notes,
      noteNames: notes.map((n) => getNoteName(n, rootName)),
      harmonicFunction: deg.harmonicFunction,
      intervals: chordType.intervals,
      chordSymbol: chordType.symbol,
    };
  });
}
