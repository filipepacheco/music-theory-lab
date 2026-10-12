import type { BassChartSource } from '@/domain/bassChart';
import type { ChartPart } from '@/domain/chartSummary';
import type { LibrarySong } from '@/domain/librarySong';

/** The prefix of every address of the Biblioteca. */
export const LIBRARY_HASH = '#/biblioteca';

/** The source and part that mark a song screen on an analysed track. */
export const ANALYSIS_SEGMENT = 'analise';

/** The address of a song screen: the song key, the source, and the part. */
export type SongRoute = {
  screen: 'song';
  songKey: string;
  source: BassChartSource | typeof ANALYSIS_SEGMENT;
  part: ChartPart | typeof ANALYSIS_SEGMENT;
};

/** The screen that an address names. */
export type LibraryRoute = { screen: 'list' } | SongRoute;

const SOURCES: string[] = ['gp', 'rocksmith', 'midi', ANALYSIS_SEGMENT];
const PARTS: string[] = ['bass', 'drums', ANALYSIS_SEGMENT];

/** Whether the address belongs to the Biblioteca. */
export function isLibraryHash(hash: string): boolean {
  return hash === LIBRARY_HASH || hash.startsWith(`${LIBRARY_HASH}/`);
}

/** The route of an address hash. Anything that is not a song is the list. */
export function parseLibraryRoute(hash: string): LibraryRoute {
  if (!hash.startsWith(`${LIBRARY_HASH}/`)) return { screen: 'list' };
  const segments = hash.slice(LIBRARY_HASH.length + 1).split('/');
  if (segments.length !== 3) return { screen: 'list' };
  const [encodedKey, source, part] = segments;
  try {
    const songKey = decodeURIComponent(encodedKey);
    if (!songKey || !SOURCES.includes(source) || !PARTS.includes(part)) {
      return { screen: 'list' };
    }
    return {
      screen: 'song',
      songKey,
      source: source as SongRoute['source'],
      part: part as SongRoute['part'],
    };
  } catch {
    return { screen: 'list' };
  }
}

/** The address hash of a route. */
export function formatLibraryRoute(route: LibraryRoute): string {
  if (route.screen === 'list') return LIBRARY_HASH;
  return `${LIBRARY_HASH}/${encodeURIComponent(route.songKey)}/${route.source}/${route.part}`;
}

export function routeOfChart(
  songKey: string,
  source: SongRoute['source'],
  part: SongRoute['part'],
): SongRoute {
  return { screen: 'song', songKey, source, part };
}

/** The song screen on the best source of a song. */
export function routeOfSong(song: LibrarySong): SongRoute {
  const chart = song.charts[0];
  return chart
    ? routeOfChart(song.key, chart.source, chart.part)
    : routeOfChart(song.key, ANALYSIS_SEGMENT, ANALYSIS_SEGMENT);
}

/** What a song screen shows. */
export type RouteTarget =
  | { kind: 'chart'; id: string }
  | { kind: 'analysis'; sha: string };

/**
 * The song and the target that a song route names, or null when no song has
 * the key. A source and part that the song lacks fall back to its best one.
 */
export function resolveSongRoute(
  songs: LibrarySong[],
  route: SongRoute,
): { song: LibrarySong; target: RouteTarget } | null {
  const song = songs.find((item) => item.key === route.songKey);
  if (!song) return null;
  const exact = song.charts.find(
    (item) => item.source === route.source && item.part === route.part,
  );
  if (exact) return { song, target: { kind: 'chart', id: exact.id } };
  const wantsAnalysis = route.source === ANALYSIS_SEGMENT;
  if (song.charts.length > 0 && !(wantsAnalysis && song.analysed.length > 0)) {
    return { song, target: { kind: 'chart', id: song.charts[0].id } };
  }
  return { song, target: { kind: 'analysis', sha: song.analysed[0].sha } };
}
