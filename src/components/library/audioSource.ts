import type { LibraryIndexEntry } from './libraryData';

const LIBRARY_ROOT = '/library';

/**
 * File extensions the sync script's --copy-audio flag may write, in order
 * of decreasing likelihood. The client probes them one-by-one with HEAD
 * until one succeeds; missing audio is a first-class no-player state.
 */
export const AUDIO_SOURCE_EXTENSIONS = [
  '.mp3',
  '.m4a',
  '.wav',
  '.flac',
  '.ogg',
] as const;

export function candidateAudioUrls(entry: LibraryIndexEntry): string[] {
  const base = `${LIBRARY_ROOT}/${entry.detail_directory}/source`;
  return AUDIO_SOURCE_EXTENSIONS.map((ext) => `${base}${ext}`);
}

/**
 * Whether a `Content-Type` plausibly describes an audio file.
 *
 * A 200 is not enough on its own: the Vite dev server — and any static host
 * with an SPA rewrite — answers an unknown path with index.html and a 200,
 * so a status-only check hands the player an HTML document to decode. That
 * fails inside the media element rather than at the fetch, leaving the
 * player mounted but permanently disabled with nothing on screen to explain
 * why. `application/octet-stream` stays allowed because plenty of hosts
 * serve .flac and .m4a that way, and a missing header is trusted because
 * some servers omit it on HEAD.
 */
export function isAudioContentType(value: string | null): boolean {
  if (value === null) return true;
  const type = value.split(';')[0].trim().toLowerCase();
  if (type === '') return true;
  return (
    type.startsWith('audio/') ||
    type === 'application/octet-stream' ||
    // Some hosts label .m4a as video/mp4.
    type === 'video/mp4'
  );
}

/**
 * HEAD each candidate URL for the entry's source audio and return the first
 * that responds 2xx with an audio content type, or null if none exist.
 * Aborts cleanly via `signal`.
 */
export async function probeAudioUrl(
  entry: LibraryIndexEntry,
  signal?: AbortSignal,
): Promise<string | null> {
  for (const url of candidateAudioUrls(entry)) {
    try {
      const response = await fetch(url, { method: 'HEAD', signal });
      if (response.ok && isAudioContentType(response.headers.get('content-type')))
        return url;
    } catch {
      if (signal?.aborted) return null;
    }
  }
  return null;
}
