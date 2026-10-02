import { execFileSync, spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

// ffprobe is a system tool, so this check is skipped where it is missing.
// The "Bass assets" workflow installs it and runs the same check whenever
// the assets, their manifest or contract, or the script change.
const hasFfprobe = spawnSync('ffprobe', ['-version']).error === undefined;

describe.skipIf(!hasFfprobe)('Growlybass production assets', () => {
  it('match the pinned manifest, encoding contract and transfer budget', () => {
    const result = execFileSync(
      'python3',
      ['scripts/generate_growlybass_assets.py', '--check'],
      { cwd: process.cwd(), encoding: 'utf8' },
    );

    expect(result).toContain('40 arquivos válidos · 2608000 bytes');
  }, 30_000);
});
