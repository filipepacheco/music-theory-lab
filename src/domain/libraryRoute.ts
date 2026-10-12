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

/** One entry of the source selector: a chart source, or the analysis. */
export type SourceChoice = BassChartSource | typeof ANALYSIS_SEGMENT;

const SOURCE_ORDER: SourceChoice[] = ['gp', 'rocksmith', 'midi'];

/** Whether a stored text names a source choice. */
export function isSourceChoice(value: unknown): value is SourceChoice {
  return (
    value === ANALYSIS_SEGMENT ||
    (typeof value === 'string' && SOURCE_ORDER.includes(value as SourceChoice))
  );
}

/** The entries of the source selector of a song: its sources, then the analysis. */
export function songSourceChoices(song: LibrarySong): SourceChoice[] {
  const choices = SOURCE_ORDER.filter((source) =>
    song.charts.some((chart) => chart.source === source),
  );
  if (song.analysed.length > 0) choices.push(ANALYSIS_SEGMENT);
  return choices;
}

/**
 * The route of a source choice. A chart source keeps the current part when it
 * has a chart of it, else it takes its first chart.
 */
export function routeOfSource(
  song: LibrarySong,
  choice: SourceChoice,
  currentPart: SongRoute['part'] = 'bass',
): SongRoute {
  if (choice === ANALYSIS_SEGMENT) {
    return routeOfChart(song.key, ANALYSIS_SEGMENT, ANALYSIS_SEGMENT);
  }
  const ofSource = song.charts.filter((chart) => chart.source === choice);
  const chart =
    ofSource.find((item) => item.part === currentPart) ??
    ofSource.find((item) => item.part === 'bass') ??
    ofSource[0];
  return chart
    ? routeOfChart(song.key, chart.source, chart.part)
    : routeOfSong(song);
}

/**
 * The song screen on the source that this device used last, else on the best
 * source of the song: Guitar Pro, Rocksmith, MIDI.
 */
export function routeOfSong(
  song: LibrarySong,
  lastSource?: SourceChoice | null,
): SongRoute {
  if (lastSource && songSourceChoices(song).includes(lastSource)) {
    return routeOfSource(song, lastSource);
  }
  const chart = song.charts[0];
  return chart
    ? routeOfChart(song.key, chart.source, chart.part)
    : routeOfChart(song.key, ANALYSIS_SEGMENT, ANALYSIS_SEGMENT);
}

/** The source choice that a resolved target stands on. */
export function choiceOfTarget(
  song: LibrarySong,
  target: RouteTarget,
): SourceChoice {
  if (target.kind === 'analysis') return ANALYSIS_SEGMENT;
  return (
    song.charts.find((chart) => chart.id === target.id)?.source ??
    ANALYSIS_SEGMENT
  );
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
