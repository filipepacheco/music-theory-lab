import { isSourceChoice, type SourceChoice } from '@/domain/libraryRoute';

const KEY = 'music-theory-lab:library-last-source';

function readAll(): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    if (parsed && typeof parsed === 'object') {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Unreadable or blocked storage: no song has a last source.
  }
  return {};
}

/** The source that this device opened last for a song, if any. */
export function readLastSource(songKey: string): SourceChoice | null {
  const value = readAll()[songKey];
  return isSourceChoice(value) ? value : null;
}

/** Keep the source that this device opened for a song. */
export function writeLastSource(songKey: string, source: SourceChoice): void {
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify({ ...readAll(), [songKey]: source }),
    );
  } catch {
    // Blocked storage: the song opens on its best source next time.
  }
}
