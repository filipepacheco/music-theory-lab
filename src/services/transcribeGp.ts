// The transcription module: one call turns a `.gp` file's bytes into
// per-bar chord results plus the scale collection the passage draws on.
//
// Everything a caller would otherwise have to know lives in the
// implementation: container sniffing and parsing (gpFile), template matching
// (gpChords), harmony/root track sourcing, and scale-collection derivation.
// The v1 track-sourcing policy is literal track names, per CONTEXT.md — pass
// different names only when the policy changes.
//
// The file is parsed exactly once: `inspectGp` returns the parsed handle
// inside the inspection, and `transcribeGp` consumes that handle, so the
// two-phase UI flow never re-parses the same bytes.
//
// See the map: https://github.com/filipepacheco/music-theory-lab/issues/9

import {
  parseGpFile,
  GpParseError,
  type GpFile,
} from '@/services/gpFile';
import { matchBar, chordLabel, type BarChordResult } from '@/services/gpChords';

/**
 * v1 literal track names (CONTEXT.md): the harmony track carries full chord
 * content, the root track provides the bass anchor and tiebreak.
 */
export const DEFAULT_HARMONY_TRACK_NAME =
  'Rhythm Guitar - Acoustic Guitar (steel)';
export const DEFAULT_ROOT_TRACK_NAME = 'Electric Bass (finger)';

export interface TranscribeOptions {
  harmonyTrackName?: string;
  rootTrackName?: string;
}

export interface TranscribedBar {
  barIndex: number;
  /** Raw signature as written in the file, e.g. `"4/4"`. */
  timeSignature: string;
  quarterNoteBeats: number;
  result: BarChordResult;
  /** Display label when a chord matched, else null. Presentation only. */
  label: string | null;
}

export interface GpTranscription {
  gpVersion: string;
  trackNames: string[];
  masterBarCount: number;
  harmonyTrackName: string;
  rootTrackName: string;
  chordDictionaryFound: boolean;
  /**
   * Scale collection: the unordered set of pitch classes the matched chords
   * draw on, sorted ascending. Null when no bar matched a chord — a
   * collection cannot be established from silence and unclear bars alone.
   */
  scaleCollection: number[] | null;
  bars: TranscribedBar[];
}

export interface GpInspection {
  gpVersion: string;
  trackNames: string[];
  masterBarCount: number;
  chordDictionaryFound: boolean;
  /** The parsed file, kept so transcription reuses this parse. */
  parsed: GpFile;
}

export interface TrackDefaults {
  harmonyTrackName: string;
  rootTrackName: string;
}

/**
 * v1 defaulting policy: prefer the literal default track names when the
 * file has them; otherwise fall back to the first (harmony) and second or
 * first (root) tracks.
 */
export function defaultTrackNames(trackNames: string[]): TrackDefaults {
  const harmonyTrackName = trackNames.includes(DEFAULT_HARMONY_TRACK_NAME)
    ? DEFAULT_HARMONY_TRACK_NAME
    : trackNames[0];
  const rootTrackName = trackNames.includes(DEFAULT_ROOT_TRACK_NAME)
    ? DEFAULT_ROOT_TRACK_NAME
    : (trackNames[1] ?? trackNames[0]);
  return { harmonyTrackName, rootTrackName };
}

export function inspectGp(data: Uint8Array): GpInspection {
  const parsed = parseGpFile(data);
  return {
    gpVersion: parsed.gpVersion,
    trackNames: parsed.trackNames,
    masterBarCount: parsed.masterBarCount,
    chordDictionaryFound: parsed.chordDictionaryFound,
    parsed,
  };
}

export function transcribeGp(
  inspection: GpInspection,
  options: TranscribeOptions = {},
): GpTranscription {
  const parsed = inspection.parsed;
  const harmonyTrackName =
    options.harmonyTrackName ?? DEFAULT_HARMONY_TRACK_NAME;
  const rootTrackName = options.rootTrackName ?? DEFAULT_ROOT_TRACK_NAME;

  // Strict lookup: a missing track is an error, not a whole song silently
  // labelled no-chord-data.
  for (const name of [harmonyTrackName, rootTrackName]) {
    if (!parsed.trackNames.includes(name)) {
      throw new GpParseError(
        'missing-track',
        `The file has no track named "${name}".`,
      );
    }
  }

  const scalePcs = new Set<number>();
  const bars: TranscribedBar[] = parsed.masterBars.map((mb) => {
    const harmonyPitches = parsed.pitchesFor(mb.barIndex, harmonyTrackName);
    const rootPitches = parsed.pitchesFor(mb.barIndex, rootTrackName);
    const result = matchBar(harmonyPitches, rootPitches);
    if (result.kind === 'chord') {
      for (const interval of result.intervals) {
        scalePcs.add((result.root + interval) % 12);
      }
    }
    return {
      barIndex: mb.barIndex,
      timeSignature: mb.timeSignature,
      quarterNoteBeats: mb.quarterNoteBeats,
      result,
      label: result.kind === 'chord' ? chordLabel(result) : null,
    };
  });

  return {
    gpVersion: parsed.gpVersion,
    trackNames: parsed.trackNames,
    masterBarCount: parsed.masterBarCount,
    harmonyTrackName,
    rootTrackName,
    chordDictionaryFound: parsed.chordDictionaryFound,
    scaleCollection:
      scalePcs.size > 0 ? [...scalePcs].sort((a, b) => a - b) : null,
    bars,
  };
}
