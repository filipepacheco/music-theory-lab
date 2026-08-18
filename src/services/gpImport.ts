// Turns a parsed `.gp` file plus a chosen key into a `Song` the transcription
// editor can open. Pure functions only - the panel owns the file, the store and
// the database.
//
// Every rule here was settled on the map, not invented:
// https://github.com/filipepacheco/music-theory-lab/issues/9

import { getHarmonicField } from '@/utils/musicTheory';
import { getNoteName, getPreferredRootName } from '@/utils/noteHelpers';
import type { GpFile } from '@/services/gpFile';
import { matchBar, chordLabel, type BarChordResult } from '@/services/gpChords';
import type { ProgressionStep } from '@/constants/progressions';
import type { SongSection } from '@/types';

/**
 * Display symbols for the extractor's qualities. Kept here rather than reused
 * from `CHORD_TYPES` because the extractor's vocabulary is wider - it has
 * `6no3` and `sus4add9`, which the chord picker has no reason to offer.
 */
const QUALITY_SYMBOL: Record<string, string> = {
  maj: '',
  min: 'm',
  dim: 'dim',
  aug: 'aug',
  maj7: 'maj7',
  min7: 'm7',
  dom7: '7',
  '5': '5',
  sus2: 'sus2',
  sus4: 'sus4',
  sus4add9: 'sus4(9)',
  add9: 'add9',
  minadd9: 'm(add9)',
  add11: 'add11',
  minadd11: 'm(add11)',
  '6': '6',
  min6: 'm6',
  '6no3': '6(no3)',
};

/** Label for a bar that inherited nothing, because no chord has resolved yet. */
export const UNKNOWN_LABEL = '?';

/** Steps per section, forced by the cap in `addSongStep`. */
export const SECTION_SIZE = 64;

export type QualityFamily = 'MAJ' | 'MIN' | 'DIM' | 'AUG' | 'NOTHIRD';

/**
 * Derived from intervals rather than a lookup table, so the same function
 * classifies the extractor's templates and the harmonic field's chords without
 * a second map to keep in sync.
 */
export function familyOf(intervals: number[]): QualityFamily {
  const s = new Set(intervals.map((i) => ((i % 12) + 12) % 12));
  if (s.has(4) && s.has(8)) return 'AUG';
  if (s.has(3) && s.has(6)) return 'DIM';
  if (s.has(4)) return 'MAJ';
  if (s.has(3)) return 'MIN';
  return 'NOTHIRD';
}

/**
 * Matches `setSongStepBeats`. An import that wrote a beat count the editor
 * cannot reproduce would leave a step the user can never restore after
 * touching it.
 */
function clampBeats(beats: number): number {
  if (!Number.isFinite(beats)) return 4;
  return Math.max(0.5, Math.min(8, Math.round(beats * 2) / 2));
}

export interface ImportedBar {
  /** 1-based, matching how bars are numbered in Guitar Pro. */
  bar: number;
  /** What the matcher found, before any key was applied. */
  result: BarChordResult;
  /** Absolute chord name from the matcher, e.g. `"G#min"`. Null unless matched. */
  detected: string | null;
  /** True when this bar inherited the previous bar's chord. */
  carried: boolean;
  /** Exactly what will be written into the Song - the preview shows no more. */
  step: ProgressionStep;
}

/**
 * One entry per master bar, in order. Bar alignment is what makes an import
 * checkable against the original tab, so nothing is collapsed or dropped.
 */
export function analyzeBars(
  gp: GpFile,
  harmonyTrack: string,
  rootTrack: string,
  keyRoot: number,
  isMinor: boolean,
): ImportedBar[] {
  const field = getHarmonicField(keyRoot, isMinor);
  // Preferred spelling, so flat keys (Bb, Eb, ...) spell flats — enharmonics
  // follow the chosen key, per issue #13.
  const keyName = getPreferredRootName(keyRoot);

  const degrees = field.map((c) => ({
    root: c.notes[0],
    family: familyOf(c.intervals),
    roman: c.romanNumeral,
  }));

  const bars: ImportedBar[] = [];
  let last: ProgressionStep | null = null;

  for (let i = 0; i < gp.masterBarCount; i++) {
    const beats = clampBeats(gp.quarterNoteBeats(i));
    const result = matchBar(
      gp.pitchesFor(i, harmonyTrack),
      gp.pitchesFor(i, rootTrack),
    );

    // An unclear or silent bar holds the previous chord rather than breaking
    // the alignment, flagged `unsure` so the editor renders it for review.
    if (result.kind !== 'chord') {
      bars.push({
        bar: i + 1,
        result,
        detected: null,
        carried: last !== null,
        step: last
          ? { ...last, beats, confidence: 'unsure' }
          : { degree: null, label: UNKNOWN_LABEL, beats, confidence: 'unsure' },
      });
      continue;
    }

    const family = familyOf(result.intervals);
    // Quality-family matching, decided on issue #13: the field is built from
    // sevenths and tabs play triads, so exact quality would reject almost
    // everything. No-third chords match on root alone - a suspension decorates
    // the chord underneath it rather than replacing it.
    const degIdx = degrees.findIndex(
      (d) =>
        d.root === result.root && (family === 'NOTHIRD' || d.family === family),
    );

    const step: ProgressionStep =
      degIdx >= 0
        ? { degree: degIdx, label: degrees[degIdx].roman, beats }
        : {
            degree: null,
            label: `${getNoteName(result.root, keyName)}${QUALITY_SYMBOL[result.quality] ?? result.quality}`,
            // Relative to the key root, matching how the chord picker writes
            // chromatic steps and how playback reads them back.
            intervals: result.intervals.map(
              (iv) => (result.root - keyRoot + iv + 12) % 12,
            ),
            beats,
          };

    last = step;
    bars.push({
      bar: i + 1,
      result,
      detected: chordLabel(result),
      carried: false,
      step,
    });
  }

  return bars;
}

export interface ImportSummary {
  diatonic: number;
  chromatic: number;
  unclear: number;
  noData: number;
}

export function summarise(bars: ImportedBar[]): ImportSummary {
  return {
    diatonic: bars.filter((b) => !b.carried && b.step.degree !== null).length,
    chromatic: bars.filter(
      (b) => !b.carried && b.result.kind === 'chord' && b.step.degree === null,
    ).length,
    unclear: bars.filter((b) => b.result.kind === 'unclear').length,
    noData: bars.filter((b) => b.result.kind === 'no-chord-data').length,
  };
}

/**
 * Splits mechanically into chunks of {@link SECTION_SIZE}. The file carries no
 * `<Section>` or `<RehearsalSign>` markers to lean on, and splitting on
 * chord-loop repetition would be a guess dressed up as structure - so this is
 * honest about knowing nothing about the song's real form.
 */
export function assembleSections(bars: ImportedBar[]): SongSection[] {
  const sections: SongSection[] = [];
  for (let i = 0; i < bars.length; i += SECTION_SIZE) {
    const n = sections.length + 1;
    sections.push({
      id: crypto.randomUUID(),
      type: 'custom',
      customLabel: `Parte ${n}`,
      steps: bars.slice(i, i + SECTION_SIZE).map((b) => b.step),
    });
  }
  return sections;
}

