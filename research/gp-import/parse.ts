// Research script — throwaway, not part of the app. See README.md.
//
// Question: given a real Guitar Pro 7 (.gp) file, can we mechanically walk
// MasterBars -> Bars -> Voices -> Beats -> Notes and produce, per bar and per
// track, the set of MIDI pitches sounding in that bar? No chord-matching here
// (that's a later ticket) — this only proves the parse+group step and shows
// what the real intermediate data looks like.
//
// Usage: npm run parse -- [path-to-file.gp]
// Defaults to ~/Downloads/Resenha_do_arrocha_-_J_ESKINE.gp if no path given.

import AdmZip from 'adm-zip';
import { XMLParser } from 'fast-xml-parser';
import { writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, basename } from 'node:path';

const DEFAULT_SAMPLE = join(
  homedir(),
  'Downloads',
  'Resenha_do_arrocha_-_J_ESKINE.gp',
);
const filePath = process.argv[2] ?? DEFAULT_SAMPLE;

const NOTE_NAMES = [
  'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B',
];
function pitchClassName(midi: number): string {
  return NOTE_NAMES[((midi % 12) + 12) % 12];
}

// --- 1. Unzip + parse the XML -------------------------------------------

const zip = new AdmZip(filePath);
const gpifEntry = zip.getEntry('Content/score.gpif');
if (!gpifEntry) {
  throw new Error(
    `No Content/score.gpif in ${filePath} — is this a GP7 (zip) file? Legacy .gp3/.gp4/.gp5 are out of scope (see map issue #2).`,
  );
}
const xml = gpifEntry.getData().toString('utf-8');

const REPEATED_TAGS = new Set([
  'Track', 'Staff', 'Property', 'Item', 'MasterBar', 'Bar', 'Voice', 'Beat',
  'Note', 'Degree',
]);
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  isArray: (tagName) => REPEATED_TAGS.has(tagName),
});
const doc = parser.parse(xml);
const gpif = doc.GPIF;

console.log(`Parsed ${basename(filePath)} — GPVersion ${gpif.GPVersion}\n`);

// --- 2. Index everything by id ------------------------------------------

type AnyObj = Record<string, any>;
const asArray = <T>(v: T | T[] | undefined): T[] =>
  v === undefined ? [] : Array.isArray(v) ? v : [v];

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

console.log(
  `Tracks: ${tracks.map((t) => `${t['@_id']}=${t.Name}`).join(', ')}`,
);
console.log(`MasterBars: ${masterBars.length}\n`);

// --- 3. Fast-path check: does any track carry a named-chord dictionary? --
// Per research/gp-import/CHORD-METADATA-FINDINGS.md (issue #4): check each
// Staff's Properties for a ChordCollection/DiagramCollection with non-empty
// Items, and each Beat for a direct <Chord> child (an item-id reference).

let foundChordDictionary = false;
for (const track of tracks) {
  for (const staff of asArray(track.Staves?.Staff)) {
    for (const prop of asArray(staff.Properties?.Property)) {
      if (
        (prop['@_name'] === 'ChordCollection' ||
          prop['@_name'] === 'DiagramCollection') &&
        asArray(prop.Items?.Item).length > 0
      ) {
        foundChordDictionary = true;
        console.log(
          `Chord dictionary found: Track "${track.Name}", ${prop['@_name']}, ${asArray(prop.Items.Item).length} item(s)`,
        );
      }
    }
  }
}
const beatsWithChordRef = [...beats.values()].filter((b) => b.Chord !== undefined);
if (beatsWithChordRef.length > 0) {
  foundChordDictionary = true;
  console.log(`${beatsWithChordRef.length} beat(s) reference a chord id directly.`);
}
if (!foundChordDictionary) {
  console.log(
    'Fast path: no chord dictionary and no per-beat chord references found — this file has zero metadata chords. Falling back to note-based extraction for every bar, as expected (see issue #4 findings).',
  );
}
console.log();

// --- 4. Walk MasterBars -> Bars -> Voices -> Beats -> Notes --------------

interface BarPitches {
  barIndex: number;
  track: string;
  pitches: number[];
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

// --- 5. Print a readable summary ------------------------------------------
// Only the two clearly pitched, chord-bearing tracks — Rhythm Guitar and
// Electric Bass — printed in full; this is a feasibility check, not a mixer.

const INTERESTING_TRACKS = ['Rhythm Guitar - Acoustic Guitar (steel)', 'Electric Bass (finger)'];
const nonEmptyBars = results.filter(
  (r) => INTERESTING_TRACKS.includes(r.track) && r.pitches.length > 0,
);

console.log(`First 15 non-empty bars for ${INTERESTING_TRACKS.join(' / ')}:\n`);
for (const r of nonEmptyBars.slice(0, 15)) {
  const names = r.pitches.map((p) => `${pitchClassName(p)}${Math.floor(p / 12) - 1}`);
  console.log(`  bar ${r.barIndex + 1} [${r.track}]: ${names.join(', ')}`);
}

console.log(
  `\nTotal (bar, track) entries: ${results.length}. Non-empty entries for interesting tracks: ${nonEmptyBars.length} of ${masterBars.length * INTERESTING_TRACKS.length} possible.`,
);

// --- 6. Write full JSON output --------------------------------------------

const outPath = join(
  import.meta.dirname,
  'outputs',
  `${basename(filePath, '.gp')}.bars.json`,
);
writeFileSync(outPath, JSON.stringify(results, null, 2));
console.log(`\nFull per-bar, per-track pitch data written to ${outPath}`);
