// Research script — throwaway, not part of the app. See README.md.
//
// Resolves issue #6 (chord-matching algorithm), building on #3 (parse),
// #4 (metadata fast-path), #5 (track-sourcing: harmony track = Rhythm
// Guitar, root track = Electric Bass), and #7 (bar-level granularity,
// no beat splitting).
//
// Algorithm (decided in #6):
//   1. Exact pitch-class-set match only, against a fixed 12-chord vocabulary,
//      at any of 12 roots. No fuzzy/subset fallback (tested, proven overfit —
//      see issue #6 for the 100%-but-mostly-spurious subset-match finding).
//   2. Harmony track (Rhythm Guitar) pitch classes are matched first.
//      - Exactly one exact match -> that's the label.
//      - Zero exact matches -> try the root track's own pitch classes the
//        same way (this case wasn't in the sample file's data, but is the
//        natural extension of the decided algorithm to "harmony track empty,
//        root track has something").
//      - Still nothing -> "unclear".
//   3. Two or more exact matches (genuine ambiguity, e.g. F#sus4 == Bsus2) ->
//      tiebreak using the root track's lowest note. If it matches one
//      candidate's root, pick that one. Otherwise -> "unclear" (per #6 Q2:
//      one honest failure label, not two).
//   4. Both harmony and root track empty for a bar -> "no chord data" (per
//      #5 — distinct from "unclear", which means data existed but didn't
//      resolve).
//
// Usage: npm run chords -- [path-to-file.gp]

import { writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, basename } from 'node:path';
import { parseGpFile, NOTE_NAMES } from './gpif.ts';

const DEFAULT_SAMPLE = join(
  homedir(),
  'Downloads',
  'Resenha_do_arrocha_-_J_ESKINE.gp',
);
const filePath = process.argv[2] ?? DEFAULT_SAMPLE;

const HARMONY_TRACK = 'Rhythm Guitar - Acoustic Guitar (steel)';
const ROOT_TRACK = 'Electric Bass (finger)';

// --- Chord vocabulary (locked in #6 Q3 — kept as-is, no adjustment) ------

const TEMPLATES: Record<string, number[]> = {
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
};

interface Candidate {
  root: number;
  name: string;
  label: string;
}

function pitchClassSet(midiPitches: number[]): Set<number> {
  return new Set(midiPitches.map((m) => ((m % 12) + 12) % 12));
}

function exactMatches(pcs: Set<number>): Candidate[] {
  const out: Candidate[] = [];
  for (let root = 0; root < 12; root++) {
    for (const [name, intervals] of Object.entries(TEMPLATES)) {
      const template = new Set(intervals.map((i) => (i + root) % 12));
      if (template.size === pcs.size && [...template].every((p) => pcs.has(p))) {
        out.push({ root, name, label: `${NOTE_NAMES[root]}${name}` });
      }
    }
  }
  return out;
}

type ChordResult =
  | { kind: 'chord'; label: string }
  | { kind: 'unclear' }
  | { kind: 'no-chord-data' };

function matchBar(harmonyPitches: number[], rootPitches: number[]): ChordResult {
  if (harmonyPitches.length === 0 && rootPitches.length === 0) {
    return { kind: 'no-chord-data' };
  }

  const rootLowestPc =
    rootPitches.length > 0 ? ((Math.min(...rootPitches) % 12) + 12) % 12 : null;

  const source = harmonyPitches.length > 0 ? harmonyPitches : rootPitches;
  const candidates = exactMatches(pitchClassSet(source));

  if (candidates.length === 0) return { kind: 'unclear' };
  if (candidates.length === 1) return { kind: 'chord', label: candidates[0].label };

  // Ambiguous: tiebreak with the root track's lowest note.
  if (rootLowestPc !== null) {
    const agreeing = candidates.filter((c) => c.root === rootLowestPc);
    if (agreeing.length === 1) return { kind: 'chord', label: agreeing[0].label };
  }
  return { kind: 'unclear' };
}

// --- Run it ----------------------------------------------------------------

const gp = parseGpFile(filePath);
console.log(`Parsed ${basename(filePath)} — GPVersion ${gp.gpVersion}`);
console.log(`Harmony track: "${HARMONY_TRACK}" | Root track: "${ROOT_TRACK}"\n`);

interface BarChord {
  barIndex: number;
  result: ChordResult;
}

const barChords: BarChord[] = [];
for (let barIndex = 0; barIndex < gp.masterBarCount; barIndex++) {
  const harmonyPitches = gp.pitchesFor(barIndex, HARMONY_TRACK);
  const rootPitches = gp.pitchesFor(barIndex, ROOT_TRACK);
  barChords.push({ barIndex, result: matchBar(harmonyPitches, rootPitches) });
}

const counts = { chord: 0, unclear: 0, 'no-chord-data': 0 };
for (const bc of barChords) counts[bc.result.kind]++;

console.log('Chord progression (first 40 bars):\n');
for (const bc of barChords.slice(0, 40)) {
  const label =
    bc.result.kind === 'chord'
      ? bc.result.label
      : bc.result.kind === 'unclear'
        ? 'unclear'
        : '—';
  console.log(`  bar ${String(bc.barIndex + 1).padStart(3)}: ${label}`);
}

console.log(
  `\nTotals across ${gp.masterBarCount} bars: ${counts.chord} resolved chords (${Math.round((100 * counts.chord) / gp.masterBarCount)}%), ${counts.unclear} unclear (${Math.round((100 * counts.unclear) / gp.masterBarCount)}%), ${counts['no-chord-data']} with no chord data.`,
);

const outPath = join(
  import.meta.dirname,
  'outputs',
  `${basename(filePath, '.gp')}.chords.json`,
);
writeFileSync(
  outPath,
  JSON.stringify(
    barChords.map((bc) => ({ bar: bc.barIndex + 1, ...bc.result })),
    null,
    2,
  ),
);
console.log(`\nFull per-bar chord progression written to ${outPath}`);
