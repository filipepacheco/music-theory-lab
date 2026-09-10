import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

describe('Growlybass production assets', () => {
  it('match the pinned manifest, encoding contract and transfer budget', () => {
    const result = execFileSync(
      'python3',
      ['scripts/generate_growlybass_assets.py', '--check'],
      { cwd: process.cwd(), encoding: 'utf8' },
    );

    expect(result).toContain('40 arquivos válidos · 2608000 bytes');
  }, 30_000);
});
