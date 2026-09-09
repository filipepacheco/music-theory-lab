import { describe, expect, it, vi } from 'vitest';
import {
  createGrowlybassAssetCache,
  createGrowlybassSampler,
} from '@/services/growlybass';

describe('Growlybass asset cache', () => {
  it('loads an asset only on demand and reuses it afterward', async () => {
    const load = vi.fn(async (url: string) => ({ url }));
    const cache = createGrowlybassAssetCache(load);

    expect(cache.size()).toBe(0);

    const first = await cache.load('/audio/growlybass/e2_p_rr1.mp3');
    const second = await cache.load('/audio/growlybass/e2_p_rr1.mp3');

    expect(first).toBe(second);
    expect(load).toHaveBeenCalledTimes(1);
    expect(cache.size()).toBe(1);
  });

  it('deduplicates concurrent loads and allows retry after failure', async () => {
    const load = vi
      .fn<(url: string) => Promise<string>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue('ready');
    const cache = createGrowlybassAssetCache(load);

    await expect(cache.load('/missing.mp3')).rejects.toThrow('offline');
    await expect(cache.load('/missing.mp3')).resolves.toBe('ready');

    expect(load).toHaveBeenCalledTimes(2);
    expect(cache.size()).toBe(1);
  });
});

describe('Growlybass sampler', () => {
  it('loads on first trigger and plays from frame zero with 500 ms release', async () => {
    const asset = { decoded: true };
    const load = vi.fn(async () => asset);
    const play = vi.fn();
    const sampler = createGrowlybassSampler({ load, play });

    expect(sampler.getStatus()).toBe('idle');

    await sampler.trigger(28, undefined, '8n');

    expect(load).toHaveBeenCalledWith('/audio/growlybass/e2_p_rr1.mp3');
    expect(play).toHaveBeenCalledWith(
      asset,
      expect.objectContaining({
        file: 'e2_p_rr1.mp3',
        playbackRate: 1,
      }),
      '8n',
      0.5,
    );
    expect(sampler.getStatus()).toBe('ready');
  });

  it('reports load failures without making later triggers unusable', async () => {
    const load = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue('decoded');
    const play = vi.fn();
    const sampler = createGrowlybassSampler({ load, play });

    await expect(sampler.trigger(28)).rejects.toThrow('offline');
    expect(sampler.getStatus()).toBe('error');

    await expect(sampler.trigger(28)).resolves.toBeUndefined();
    expect(sampler.getStatus()).toBe('ready');
    expect(play).toHaveBeenCalledTimes(1);
  });
});
