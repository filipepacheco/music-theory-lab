import type { LibraryIndexEntry } from './libraryData';

const LIBRARY_ROOT = '/library';

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

export async function probeAudioUrl(
  entry: LibraryIndexEntry,
  signal?: AbortSignal,
): Promise<string | null> {
  for (const url of candidateAudioUrls(entry)) {
    try {
      const response = await fetch(url, { method: 'HEAD', signal });
      if (
        response.ok &&
        isAudioContentType(response.headers.get('content-type'))
      )
        return url;
    } catch {
      if (signal?.aborted) return null;
    }
  }
  return null;
}
