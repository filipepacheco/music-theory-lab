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
 * HEAD each candidate URL for the entry's source audio and return the first
 * that responds 2xx, or null if none exist. Aborts cleanly via `signal`.
 */
export async function probeAudioUrl(
  entry: LibraryIndexEntry,
  signal?: AbortSignal,
): Promise<string | null> {
  for (const url of candidateAudioUrls(entry)) {
    try {
      const response = await fetch(url, { method: 'HEAD', signal });
      if (response.ok) return url;
    } catch {
      if (signal?.aborted) return null;
    }
  }
  return null;
}
