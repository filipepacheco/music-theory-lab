// Matches a bar's pitches against a fixed chord vocabulary. Ported from the
// research prototype at `research/gp-import/chords.ts`, which stays frozen.
//
// The algorithm is unchanged from the one decided on the feasibility map:
//
//   1. Exact pitch-class-set match only, against the vocabulary below, at any
//      of 12 roots. No fuzzy/subset fallback — that was tested and proven
//      overfit (it hit 100% by matching almost anything).
//   2. Harmony-track pitch classes are matched first.
//      - Exactly one match  -> that's the chord.
//      - Zero matches       -> try the root track's own pitch classes.
//      - Still nothing      -> `unclear`.
//   3. Two or more matches (genuine ambiguity, e.g. F#sus4 == Bsus2) -> break
//      the tie with the root track's lowest note. No agreement -> `unclear`.
//   4. Both tracks empty for the bar -> `no-chord-data`.
//
// One change from the prototype: a match returns `{root, quality, intervals}`
// rather than a pre-formatted label string. The caller needs the root as a
// pitch class to map the chord onto a degree of the harmonic field, and
// re-parsing "G#min" to recover it would be inventing a problem. Display
// labels are built in the UI.
//
// See the map: https://github.com/filipepacheco/music-theory-lab/issues/9
//
// This module is an internal seam of the transcription module
// (`src/services/transcribeGp.ts`): callers transcribe through `transcribeGp`,
// not `matchBar`.

import { NOTE_NAMES } from '@/constants/notes';

/**
 * Fitted bar-by-bar to a single song. Each entry past the first twelve was
 * added to cover a specific bar in that file, so a high resolve rate on it is
 * a measurement on the training file, not a general claim — a second file
 * will likely miss shapes that are not here. Misses stay `unclear` rather
 * than being forced onto the nearest template.
 */
export const CHORD_TEMPLATES: Record<string, number[]> = {
  maj: [0, 4, 7],
  min: [0, 3, 7],
  dim: [0, 3, 6],
  aug: [0, 4, 8],
  '5': [0, 7],
  maj7: [0, 4, 7, 11],
  min7: [0, 3, 7, 10],
  dom7: [0, 4, 7, 10],
  sus2: [0, 2, 7],
  sus4: [0, 5, 7],
  add9: [0, 4, 7, 2],
  minadd9: [0, 3, 7, 2],
  // 6M = 9 semitones, 11 (4J) = 5. A 6th chord is pitch-class-identical to the
  // min7 a minor third below it (C6 == Am7), so `6` makes every min7 bar
  // ambiguous; the root-track tiebreak is what resolves those.
  '6': [0, 4, 7, 9],
  min6: [0, 3, 7, 9],
  add11: [0, 4, 5, 7],
  minadd11: [0, 3, 5, 7],
  // Two shapes the sample file plays that the above miss. Both drop or
  // displace a chord tone, so neither falls out of an existing template:
  //   6no3     — root/5th/6th, no 3rd: quality is undetermined by the notes
  //              alone, and the root track's bass is what makes it readable.
  //   sus4add9 — 1 9 11 5, a suspended voicing with the 9th on top.
  '6no3': [0, 7, 9],
  sus4add9: [0, 2, 5, 7],
};

export interface ChordMatch {
  /** Root as a pitch class, 0-11. */
  root: number;
  /** Vocabulary key, e.g. `"min7"`. */
  quality: string;
  /** Semitone offsets from the root, as written in the vocabulary. */
  intervals: number[];
}

export type BarChordResult =
  | ({ kind: 'chord' } & ChordMatch)
  | { kind: 'unclear' }
  | { kind: 'no-chord-data' };

/** Display label, e.g. `"G#min"`. Presentation only — never parsed back. */
export function chordLabel(match: ChordMatch): string {
  return `${NOTE_NAMES[match.root]}${match.quality}`;
}

function pitchClassSet(midiPitches: number[]): Set<number> {
  return new Set(midiPitches.map((m) => ((m % 12) + 12) % 12));
}

function exactMatches(pcs: Set<number>): ChordMatch[] {
  const out: ChordMatch[] = [];
  for (let root = 0; root < 12; root++) {
    for (const [quality, intervals] of Object.entries(CHORD_TEMPLATES)) {
      const template = new Set(intervals.map((i) => (i + root) % 12));
      if (
        template.size === pcs.size &&
        [...template].every((p) => pcs.has(p))
      ) {
        out.push({ root, quality, intervals });
      }
    }
  }
  return out;
}

export function matchBar(
  harmonyPitches: number[],
  rootPitches: number[],
): BarChordResult {
  if (harmonyPitches.length === 0 && rootPitches.length === 0) {
    return { kind: 'no-chord-data' };
  }

  const rootLowestPc =
    rootPitches.length > 0 ? ((Math.min(...rootPitches) % 12) + 12) % 12 : null;

  const source = harmonyPitches.length > 0 ? harmonyPitches : rootPitches;
  const candidates = exactMatches(pitchClassSet(source));

  if (candidates.length === 0) return { kind: 'unclear' };
  if (candidates.length === 1) return { kind: 'chord', ...candidates[0] };

  // Ambiguous: tiebreak with the root track's lowest note.
  if (rootLowestPc !== null) {
    const agreeing = candidates.filter((c) => c.root === rootLowestPc);
    if (agreeing.length === 1) return { kind: 'chord', ...agreeing[0] };
  }
  return { kind: 'unclear' };
}
