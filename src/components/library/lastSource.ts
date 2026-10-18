import { isSourceChoice, type SourceChoice } from '@/domain/libraryRoute';

const KEY = 'music-theory-lab:library-last-source';

function readAll(): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    if (parsed && typeof parsed === 'object') {
      return parsed as Record<string, unknown>;
    }
  } catch {}
  return {};
}

export function readLastSource(songKey: string): SourceChoice | null {
  const value = readAll()[songKey];
  return isSourceChoice(value) ? value : null;
}

export function writeLastSource(songKey: string, source: SourceChoice): void {
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify({ ...readAll(), [songKey]: source }),
    );
  } catch {}
}
