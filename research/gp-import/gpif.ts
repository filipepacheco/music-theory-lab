// Shared GP7 (.gp) parsing — extracted from parse.ts so chords.ts can reuse
// it. Not app code; research/gp-import/ is standalone. See README.md.

import AdmZip from 'adm-zip';
import { XMLParser } from 'fast-xml-parser';

export const NOTE_NAMES = [
  'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B',
];
export function pitchClassName(midi: number): string {
  return NOTE_NAMES[((midi % 12) + 12) % 12];
}

export interface BarPitches {
  barIndex: number;
  track: string;
  pitches: number[];
}

export interface GpFile {
  gpVersion: string;
  trackNames: string[];
  masterBarCount: number;
  chordDictionaryFound: boolean;
  /** Every (bar, track) pair — including empty ones. */
  results: BarPitches[];
  /** Convenience lookup: pitches for a given bar index + track name. */
  pitchesFor(barIndex: number, trackName: string): number[];
}

type AnyObj = Record<string, any>;
const asArray = <T>(v: T | T[] | undefined): T[] =>
  v === undefined ? [] : Array.isArray(v) ? v : [v];

const REPEATED_TAGS = new Set([
  'Track', 'Staff', 'Property', 'Item', 'MasterBar', 'Bar', 'Voice', 'Beat',
  'Note', 'Degree',
]);

export function parseGpFile(filePath: string): GpFile {
  const zip = new AdmZip(filePath);
  const gpifEntry = zip.getEntry('Content/score.gpif');
  if (!gpifEntry) {
    throw new Error(
      `No Content/score.gpif in ${filePath} — is this a GP7 (zip) file? Legacy .gp3/.gp4/.gp5 are out of scope (see map issue #2).`,
    );
  }
  const xml = gpifEntry.getData().toString('utf-8');

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    isArray: (tagName) => REPEATED_TAGS.has(tagName),
  });
  const doc = parser.parse(xml);
  const gpif = doc.GPIF;

  const tracks: AnyObj[] = asArray(gpif.Tracks?.Track);
  const masterBars: AnyObj[] = asArray(gpif.MasterBars?.MasterBar);
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

  // Fast-path check — see CHORD-METADATA-FINDINGS.md (issue #4).
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

  const results: BarPitches[] = [];
  masterBars.forEach((mb, barIndex) => {
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
  for (const r of results) pitchIndex.set(`${r.barIndex}::${r.track}`, r.pitches);

  return {
    gpVersion: String(gpif.GPVersion),
    trackNames: tracks.map((t) => t.Name as string),
    masterBarCount: masterBars.length,
    chordDictionaryFound,
    results,
    pitchesFor: (barIndex, trackName) =>
      pitchIndex.get(`${barIndex}::${trackName}`) ?? [],
  };
}
