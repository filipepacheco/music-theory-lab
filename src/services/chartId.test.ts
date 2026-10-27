import { describe, expect, it } from 'vitest';
import { partChartId, sha256Hex } from '@/services/chartId';

const FILE = 'f'.repeat(64);
const hashOf = (text: string) => sha256Hex(new TextEncoder().encode(text));

describe('partChartId', () => {
  it('keeps the bass and drum ids as before', async () => {
    expect(await partChartId(FILE, 'bass')).toBe(FILE);
    expect(await partChartId(FILE, 'drums')).toBe(await hashOf(`${FILE}:drums`));
  });

  it('hashes the file hash, the part, and the track index for a guitar or vocal chart', async () => {
    expect(await partChartId(FILE, 'guitar', 2)).toBe(
      await hashOf(`${FILE}:guitar:2`),
    );
    expect(await partChartId(FILE, 'vocals', 4)).toBe(
      await hashOf(`${FILE}:vocals:4`),
    );
  });

  it('gives the same id for the same file and two ids for two tracks', async () => {
    const one = await partChartId(FILE, 'guitar', 1);
    expect(await partChartId(FILE, 'guitar', 1)).toBe(one);
    expect(await partChartId(FILE, 'guitar', 2)).not.toBe(one);
    expect(await partChartId(FILE, 'vocals', 1)).not.toBe(one);
  });

  it('needs a track index for a guitar or vocal chart', async () => {
    await expect(partChartId(FILE, 'guitar')).rejects.toThrow();
  });
});
