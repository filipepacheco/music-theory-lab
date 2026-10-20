import { execFileSync, spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const hasFfprobe = spawnSync('ffprobe', ['-version']).error === undefined;

describe.skipIf(!hasFfprobe)('Growlybass production assets', () => {
  it('match the pinned manifest, encoding contract and transfer budget', () => {
    const result = execFileSync(
      process.platform === 'win32' ? 'python' : 'python3',
      ['scripts/generate_growlybass_assets.py', '--check'],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
        env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
      },
    );

    expect(result).toContain('40 arquivos válidos · 2608000 bytes');
  }, 30_000);
});
