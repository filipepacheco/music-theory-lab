import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AUDIO_SOURCE_EXTENSIONS,
  candidateAudioUrls,
  isAudioContentType,
  probeAudioUrl,
} from './audioSource';
import type { LibraryIndexEntry } from './libraryData';

const entry: LibraryIndexEntry = {
  source_sha256: 'a'.repeat(64),
  sha256_prefix: 'a'.repeat(12),
  title: 't',
  artist: 'a',
  duration_seconds: 10,
  detected_key: {
    tonic_pc: 0,
    tonic_name: 'C',
    mode: 'major',
    confidence_score: 1,
  },
  detected_tempo_bpm: 120,
  beat_count: 8,
  downbeat_count: 2,
  chord_segment_count: 2,
  detail_directory: `tracks/${'a'.repeat(12)}`,
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('candidateAudioUrls', () => {
  it('lists mp3 first then the other supported extensions in order', () => {
    const urls = candidateAudioUrls(entry);
    expect(urls).toHaveLength(AUDIO_SOURCE_EXTENSIONS.length);
    expect(urls[0]).toBe(`/library/${entry.detail_directory}/source.mp3`);
    expect(urls[urls.length - 1]).toBe(
      `/library/${entry.detail_directory}/source.ogg`,
    );
  });
});

describe('probeAudioUrl', () => {
  it('returns the first URL whose HEAD is 2xx', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      void init;
      const okAt = `/library/${entry.detail_directory}/source.wav`;
      if (url !== okAt) return new Response(null, { status: 404 });
      return new Response(null, {
        status: 200,
        headers: { 'content-type': 'audio/wav' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const found = await probeAudioUrl(entry);
    expect(found).toBe(`/library/${entry.detail_directory}/source.wav`);
    // Should have stopped after the .wav probe (mp3, m4a, wav — 3 calls).
    expect(fetchMock).toHaveBeenCalledTimes(3);
    // And every call must be a HEAD.
    for (const call of fetchMock.mock.calls) {
      expect(call[1]?.method).toBe('HEAD');
    }
  });

  it('returns null when every candidate is missing', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 404 }));
    vi.stubGlobal('fetch', fetchMock);

    const found = await probeAudioUrl(entry);
    expect(found).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(AUDIO_SOURCE_EXTENSIONS.length);
  });

  it('returns null and stops probing when the signal aborts', async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      controller.abort();
      const err = new Error('aborted');
      err.name = 'AbortError';
      // Reflect the aborted signal so probeAudioUrl sees it on the catch path.
      if (init?.signal?.aborted) throw err;
      throw err;
    });
    vi.stubGlobal('fetch', fetchMock);

    const found = await probeAudioUrl(entry, controller.signal);
    expect(found).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('isAudioContentType', () => {
  it('accepts audio types, octet-stream and video/mp4', () => {
    expect(isAudioContentType('audio/mpeg')).toBe(true);
    expect(isAudioContentType('audio/flac; charset=binary')).toBe(true);
    expect(isAudioContentType('application/octet-stream')).toBe(true);
    expect(isAudioContentType('video/mp4')).toBe(true);
  });

  it('accepts a missing or blank header', () => {
    expect(isAudioContentType(null)).toBe(true);
    expect(isAudioContentType('   ')).toBe(true);
  });

  it('rejects the HTML a dev server or SPA rewrite falls back to', () => {
    expect(isAudioContentType('text/html')).toBe(false);
    expect(isAudioContentType('text/html; charset=utf-8')).toBe(false);
    expect(isAudioContentType('application/json')).toBe(false);
  });
});

describe('probeAudioUrl content-type guard', () => {
  it('rejects a 200 that is really the SPA index.html', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(null, {
          status: 200,
          headers: { 'content-type': 'text/html; charset=utf-8' },
        }),
    );
    vi.stubGlobal('fetch', fetchMock);

    // Every candidate "exists" as far as the status goes; none is audio.
    await expect(probeAudioUrl(entry)).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(AUDIO_SOURCE_EXTENSIONS.length);
  });

  it('skips an HTML 200 and keeps looking for real audio', async () => {
    const okAt = `/library/${entry.detail_directory}/source.m4a`;
    const fetchMock = vi.fn(async (url: string) => {
      if (url === okAt) {
        return new Response(null, {
          status: 200,
          headers: { 'content-type': 'audio/mp4' },
        });
      }
      return new Response(null, {
        status: 200,
        headers: { 'content-type': 'text/html' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(probeAudioUrl(entry)).resolves.toBe(okAt);
  });
});
