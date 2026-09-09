import { describe, expect, it, vi } from 'vitest';
import {
  createGrowlybassAssetCache,
  createGrowlybassSampler,
} from '@/services/growlybass';
import { resolveGrowlybassSample, toBassMidi } from '@/utils/growlybass';

describe('Growlybass sample contract', () => {
  it.each([
    [0, 1, 'pp'],
    [60 / 127, 60, 'pp'],
    [61 / 127, 61, 'p'],
    [95 / 127, 95, 'p'],
    [96 / 127, 96, 'f'],
    [120 / 127, 120, 'f'],
    [121 / 127, 121, 'ff'],
    [1, 127, 'ff'],
  ] as const)(
    'maps normalized velocity %s to MIDI %s and layer %s',
    (velocity, midiVelocity, layer) => {
      expect(resolveGrowlybassSample(28, velocity)).toMatchObject({
        midiVelocity,
        layer,
      });
    },
  );

  it('uses the p layer for the neutral default velocity', () => {
    expect(resolveGrowlybassSample(28)).toMatchObject({
      file: 'e2_p_rr1.mp3',
      layer: 'p',
    });
  });

  it.each([
    [28, 'e2', 0],
    [29, 'e2', 1],
    [31, 'gb2', 1],
    [35, 'c3', -1],
    [55, 'gb4', 1],
  ] as const)(
    'maps MIDI %s to nearest anchor %s within two semitones',
    (midi, anchor, semitones) => {
      expect(resolveGrowlybassSample(midi)).toMatchObject({
        anchor,
        semitones,
      });
    },
  );

  it('maps native bass note indices and octaves to sounding MIDI', () => {
    expect(toBassMidi(4, 1)).toBe(28);
    expect(toBassMidi(9, 1)).toBe(33);
    expect(toBassMidi(2, 2)).toBe(38);
    expect(toBassMidi(7, 3)).toBe(55);
  });
});

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
