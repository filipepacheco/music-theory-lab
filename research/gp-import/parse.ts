import { writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, basename } from 'node:path';
import { parseGpFile, pitchClassName } from './gpif.ts';

const DEFAULT_SAMPLE = join(
  homedir(),
  'Downloads',
  'Resenha_do_arrocha_-_J_ESKINE.gp',
);
const filePath = process.argv[2] ?? DEFAULT_SAMPLE;

const gp = parseGpFile(filePath);

console.log(`Parsed ${basename(filePath)} — GPVersion ${gp.gpVersion}\n`);
console.log(`Tracks: ${gp.trackNames.join(', ')}`);
console.log(`MasterBars: ${gp.masterBarCount}\n`);

if (gp.chordDictionaryFound) {
  console.log(
    'Fast path: chord metadata found — see chords.ts for how this is used.',
  );
} else {
  console.log(
    'Fast path: no chord dictionary and no per-beat chord references found — this file has zero metadata chords. Falling back to note-based extraction for every bar, as expected (see issue #4 findings).',
  );
}
console.log();

const INTERESTING_TRACKS = [
  'Rhythm Guitar - Acoustic Guitar (steel)',
  'Electric Bass (finger)',
];
const nonEmptyBars = gp.results.filter(
  (r) => INTERESTING_TRACKS.includes(r.track) && r.pitches.length > 0,
);

console.log(`First 15 non-empty bars for ${INTERESTING_TRACKS.join(' / ')}:\n`);
for (const r of nonEmptyBars.slice(0, 15)) {
  const names = r.pitches.map(
    (p) => `${pitchClassName(p)}${Math.floor(p / 12) - 1}`,
  );
  console.log(`  bar ${r.barIndex + 1} [${r.track}]: ${names.join(', ')}`);
}

console.log(
  `\nTotal (bar, track) entries: ${gp.results.length}. Non-empty entries for interesting tracks: ${nonEmptyBars.length} of ${gp.masterBarCount * INTERESTING_TRACKS.length} possible.`,
);

const outPath = join(
  import.meta.dirname,
  'outputs',
  `${basename(filePath, '.gp')}.bars.json`,
);
writeFileSync(outPath, JSON.stringify(gp.results, null, 2));
console.log(`\nFull per-bar, per-track pitch data written to ${outPath}`);
