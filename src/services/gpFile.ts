// Parses Guitar Pro 7 (`.gp`) files in the browser: a zip container holding
// `Content/score.gpif` (XML). Ported from the research prototype at
// `research/gp-import/gpif.ts`, which stays frozen as the historical record.
//
// Two changes from that prototype, both forced by the browser:
//   - input is a `Uint8Array` (from a `File`), not a path — there is no `fs`
//   - unzipping uses `fflate`, not `adm-zip` (Node-only)
//
// This module is an internal seam of the transcription module
// (`src/services/transcribeGp.ts`): callers transcribe through `transcribeGp`,
// not `parseGpFile`.
//
// See the map: https://github.com/filipepacheco/music-theory-lab/issues/9

import { unzipSync } from 'fflate';
import { XMLParser } from 'fast-xml-parser';
import { NOTE_NAMES } from '@/constants/notes';

export function pitchClassName(midi: number): string {
  return NOTE_NAMES[((midi % 12) + 12) % 12];
}

/**
 * Why a file could not be read. The UI branches on this to say which problem
 * the user actually has: a `.gp5` is unsupported, a truncated download is
 * broken, and telling one story for both sends people looking in the wrong
 * place. `missing-track` is raised by the transcription module, not the
 * parser: the file itself is fine, it just has no track with the name the
 * transcription needs.
 */
export type GpParseErrorKind =
  | 'legacy-binary' // .gp3/.gp4/.gp5 — a different format, not a broken file
  | 'gpx-container' // GP6 .gpx — BCFZ/BCFS container, also not zip+XML
  | 'not-a-zip' // not a zip at all
  | 'not-a-gp-file' // a zip, but no Content/score.gpif inside
  | 'corrupt' // zip or XML that should have parsed and did not
  | 'missing-track'; // no track with the required name

export class GpParseError extends Error {
  readonly kind: GpParseErrorKind;

  constructor(kind: GpParseErrorKind, message: string) {
    super(message);
    this.name = 'GpParseError';
    this.kind = kind;
  }
}

export interface BarPitches {
  barIndex: number;
  track: string;
  pitches: number[];
}

export interface MasterBarInfo {
  barIndex: number;
  /** Raw signature as written in the file, e.g. `"4/4"`. */
  timeSignature: string;
  /**
   * Length in quarter-note beats: numerator * 4 / denominator. 4/4 -> 4,
   * 3/4 -> 3, 6/8 -> 3. This is the unit `ProgressionStep.beats` uses.
   */
  quarterNoteBeats: number;
}

export interface GpFile {
  gpVersion: string;
  trackNames: string[];
  masterBarCount: number;
  chordDictionaryFound: boolean;
  /** Per-bar time signatures, indexed to match `barIndex`. */
  masterBars: MasterBarInfo[];
  /** Every (bar, track) pair — including empty ones. */
  results: BarPitches[];
  /** Convenience lookup: pitches for a given bar index + track name. */
  pitchesFor(barIndex: number, trackName: string): number[];
}

type AnyObj = Record<string, any>;

const asArray = <T>(v: T | T[] | undefined): T[] =>
  v === undefined ? [] : Array.isArray(v) ? v : [v];

const REPEATED_TAGS = new Set([
  'Track',
  'Staff',
  'Property',
  'Item',
  'MasterBar',
  'Bar',
  'Voice',
  'Beat',
  'Note',
  'Degree',
]);

const GPIF_ENTRY = 'Content/score.gpif';

function startsWith(data: Uint8Array, ascii: string): boolean {
  if (data.length < ascii.length) return false;
  for (let i = 0; i < ascii.length; i++) {
    if (data[i] !== ascii.charCodeAt(i)) return false;
  }
  return true;
}

/**
 * Identifies the container before attempting to unzip, so an unsupported
 * format reports itself as unsupported rather than as a zip failure.
 *
 * Legacy `.gp3`/`.gp4`/`.gp5` open with a Pascal-style version string
 * (`FICHIER GUITAR PRO v...`) a few bytes in; GP6 `.gpx` uses a BCFZ/BCFS
 * container; GP7 `.gp` is an ordinary zip.
 */
function assertSupportedContainer(data: Uint8Array): void {
  if (startsWith(data, 'BCFZ') || startsWith(data, 'BCFS')) {
    throw new GpParseError(
      'gpx-container',
      'Guitar Pro 6 .gpx container (BCFZ/BCFS), not the GP7 zip format.',
    );
  }

  // The version string is length-prefixed, so scan the opening bytes.
  const head = new TextDecoder('latin1').decode(data.subarray(0, 64));
  if (head.includes('FICHIER GUITAR PRO')) {
    throw new GpParseError(
      'legacy-binary',
      'Legacy Guitar Pro binary format (.gp3/.gp4/.gp5), not the GP7 zip format.',
    );
  }

  if (!startsWith(data, 'PK\x03\x04')) {
    throw new GpParseError('not-a-zip', 'Not a zip archive.');
  }
}

export function parseGpFile(data: Uint8Array): GpFile {
  assertSupportedContainer(data);

  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(data, { filter: (f) => f.name === GPIF_ENTRY });
  } catch {
    throw new GpParseError('corrupt', 'The zip archive could not be read.');
  }

  const gpifBytes = entries[GPIF_ENTRY];
  if (!gpifBytes) {
    throw new GpParseError(
      'not-a-gp-file',
      `The archive has no ${GPIF_ENTRY}.`,
    );
  }

  const xml = new TextDecoder('utf-8').decode(gpifBytes);

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    isArray: (tagName) => REPEATED_TAGS.has(tagName),
  });

  let gpif: AnyObj;
  try {
    gpif = parser.parse(xml).GPIF;
  } catch {
    throw new GpParseError('corrupt', 'The score XML could not be parsed.');
  }
  if (!gpif) {
    throw new GpParseError('corrupt', 'The score XML has no GPIF root.');
  }

  const tracks: AnyObj[] = asArray(gpif.Tracks?.Track);
  const masterBarNodes: AnyObj[] = asArray(gpif.MasterBars?.MasterBar);
  const bars = new Map<string, AnyObj>(
    asArray(gpif.Bars?.Bar).map((b) => [String(b['@_id']), b]),
  );
  const voices = new Map<string, AnyObj>(
    asArray(gpif.Voices?.Voice).map((v) => [String(v['@_id']), v]),
  );
  const beats = new Map<string, AnyObj>(
    asArray(gpif.Beats?.Beat).map((b) => [String(b['@_id']), b]),
  );
  const notes = new Map<string, AnyObj>(
    asArray(gpif.Notes?.Note).map((n) => [String(n['@_id']), n]),
  );

  // Fast-path check — a file whose author annotated chords by hand carries
  // them here. See research/gp-import/CHORD-METADATA-FINDINGS.md.
  let chordDictionaryFound = false;
  for (const track of tracks) {
    for (const staff of asArray(track.Staves?.Staff)) {
      for (const prop of asArray(staff.Properties?.Property)) {
        if (
          (prop['@_name'] === 'ChordCollection' ||
            prop['@_name'] === 'DiagramCollection') &&
          asArray(prop.Items?.Item).length > 0
        ) {
          chordDictionaryFound = true;
        }
      }
    }
  }
  if ([...beats.values()].some((b) => b.Chord !== undefined)) {
    chordDictionaryFound = true;
  }

  const masterBars: MasterBarInfo[] = masterBarNodes.map((mb, barIndex) => {
    const raw = String(mb.Time ?? '4/4').trim();
    const [num, den] = raw.split('/').map((n) => Number(n));
    const usable = Number.isFinite(num) && Number.isFinite(den) && den > 0;
    return {
      barIndex,
      timeSignature: raw,
      quarterNoteBeats: usable ? (num * 4) / den : 4,
    };
  });

  const results: BarPitches[] = [];
  masterBarNodes.forEach((mb, barIndex) => {
    const barIds = String(mb.Bars).trim().split(/\s+/);
    tracks.forEach((track, trackIdx) => {
      const barId = barIds[trackIdx];
      const bar = bars.get(barId);
      const trackName = track.Name as string;
      if (!bar || String(bar.Voices).trim() === '-1') {
        results.push({ barIndex, track: trackName, pitches: [] });
        return;
      }
      const voiceIds = String(bar.Voices).trim().split(/\s+/);
      const pitchSet = new Set<number>();
      for (const vid of voiceIds) {
        const voice = voices.get(vid);
        if (!voice || voice.Beats === undefined) continue;
        const beatIds = String(voice.Beats).trim().split(/\s+/);
        for (const bid of beatIds) {
          const beat = beats.get(bid);
          if (!beat || beat.Notes === undefined) continue;
          const noteIds = String(beat.Notes).trim().split(/\s+/);
          for (const nid of noteIds) {
            const note = notes.get(nid);
            const midiProp = asArray(note?.Properties?.Property).find(
              (p) => p['@_name'] === 'Midi',
            );
            const midi = midiProp?.Number;
            if (typeof midi === 'number') pitchSet.add(midi);
          }
        }
      }
      results.push({
        barIndex,
        track: trackName,
        pitches: [...pitchSet].sort((a, b) => a - b),
      });
    });
  });

  const pitchIndex = new Map<string, number[]>();
  for (const r of results)
    pitchIndex.set(`${r.barIndex}::${r.track}`, r.pitches);

  return {
    gpVersion: String(gpif.GPVersion),
    trackNames: tracks.map((t) => t.Name as string),
    masterBarCount: masterBarNodes.length,
    chordDictionaryFound,
    masterBars,
    results,
    pitchesFor: (barIndex, trackName) =>
      pitchIndex.get(`${barIndex}::${trackName}`) ?? [],
  };
}
