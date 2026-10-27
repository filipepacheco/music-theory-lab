import type { BassChartSource } from '@/domain/bassChart';
import {
  PART_ORDER,
  type ChartPart,
  type ChartSummary,
} from '@/domain/chartSummary';
import type { LibrarySong } from '@/domain/librarySong';

export const LIBRARY_HASH = '#/biblioteca';

export const ANALYSIS_SEGMENT = 'analise';

export type SongRoute = {
  screen: 'song';
  songKey: string;
  source: BassChartSource | typeof ANALYSIS_SEGMENT;
  part: ChartPart | typeof ANALYSIS_SEGMENT;
  /** GP track index: only for a guitar or vocal chart. */
  track?: number;
};

export type LibraryRoute = { screen: 'list' } | SongRoute;

const SOURCES: string[] = ['gp', 'rocksmith', 'midi', ANALYSIS_SEGMENT];
const PARTS: string[] = [...PART_ORDER, ANALYSIS_SEGMENT];
const TRACK_PART = /^(guitar|vocals)-(\d+)$/;

export function isLibraryHash(hash: string): boolean {
  return hash === LIBRARY_HASH || hash.startsWith(`${LIBRARY_HASH}/`);
}

export function parseLibraryRoute(hash: string): LibraryRoute {
  if (!hash.startsWith(`${LIBRARY_HASH}/`)) return { screen: 'list' };
  const segments = hash.slice(LIBRARY_HASH.length + 1).split('/');
  if (segments.length !== 3) return { screen: 'list' };
  const [encodedKey, source, part] = segments;
  try {
    const songKey = decodeURIComponent(encodedKey).normalize('NFC');
    const withTrack = TRACK_PART.exec(part);
    const kind = withTrack ? withTrack[1] : part;
    if (!songKey || !SOURCES.includes(source) || !PARTS.includes(kind)) {
      return { screen: 'list' };
    }
    return {
      screen: 'song',
      songKey,
      source: source as SongRoute['source'],
      part: kind as SongRoute['part'],
      ...(withTrack ? { track: Number(withTrack[2]) } : {}),
    };
  } catch {
    return { screen: 'list' };
  }
}

export function formatLibraryRoute(route: LibraryRoute): string {
  if (route.screen === 'list') return LIBRARY_HASH;
  return `${LIBRARY_HASH}/${encodeURIComponent(route.songKey)}/${route.source}/${route.part}${route.track === undefined ? '' : `-${route.track}`}`;
}

export function routeOfChart(
  songKey: string,
  source: SongRoute['source'],
  part: SongRoute['part'],
  track?: number,
): SongRoute {
  return {
    screen: 'song',
    songKey,
    source,
    part,
    ...(track === undefined ? {} : { track }),
  };
}

export function routeOfSummary(
  songKey: string,
  chart: ChartSummary,
): SongRoute {
  return routeOfChart(songKey, chart.source, chart.part, chart.trackIndex);
}

export type SourceChoice = BassChartSource | typeof ANALYSIS_SEGMENT;

const SOURCE_ORDER: SourceChoice[] = ['gp', 'rocksmith', 'midi'];

export function isSourceChoice(value: unknown): value is SourceChoice {
  return (
    value === ANALYSIS_SEGMENT ||
    (typeof value === 'string' && SOURCE_ORDER.includes(value as SourceChoice))
  );
}

export function songSourceChoices(song: LibrarySong): SourceChoice[] {
  const choices = SOURCE_ORDER.filter((source) =>
    song.charts.some((chart) => chart.source === source),
  );
  if (song.analysed.length > 0) choices.push(ANALYSIS_SEGMENT);
  return choices;
}

export function songPartChoices(
  song: LibrarySong,
  source: SourceChoice,
): ChartPart[] {
  return PART_ORDER.filter((part) =>
    song.charts.some((chart) => chart.source === source && chart.part === part),
  );
}

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
  return chart ? routeOfSummary(song.key, chart) : routeOfSong(song);
}

export function routeOfSong(
  song: LibrarySong,
  lastSource?: SourceChoice | null,
): SongRoute {
  if (lastSource && songSourceChoices(song).includes(lastSource)) {
    return routeOfSource(song, lastSource);
  }
  const chart = song.charts[0];
  return chart
    ? routeOfSummary(song.key, chart)
    : routeOfChart(song.key, ANALYSIS_SEGMENT, ANALYSIS_SEGMENT);
}

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

export function chartsOfPart(
  song: LibrarySong,
  source: SongRoute['source'],
  part: ChartPart,
): ChartSummary[] {
  return song.charts.filter(
    (item) => item.source === source && item.part === part,
  );
}

export function chartOfAddress(
  song: LibrarySong,
  source: SongRoute['source'],
  part: SongRoute['part'],
  track?: number,
): ChartSummary | undefined {
  if (part === 'guitar' || part === 'vocals') {
    const ofPart = chartsOfPart(song, source, part);
    return (
      ofPart.find((item) => item.trackIndex === track) ??
      (track === undefined ? ofPart[0] : undefined)
    );
  }
  return song.charts
    .filter((item) => item.source === source && item.part === part)
    .reduce<
      ChartSummary | undefined
    >((best, item) => (best && best.importedAt >= item.importedAt ? best : item), undefined);
}

export type RouteTarget =
  | { kind: 'chart'; id: string }
  | { kind: 'analysis'; sha: string };

export function resolveSongRoute(
  songs: LibrarySong[],
  route: SongRoute,
): { song: LibrarySong; target: RouteTarget } | null {
  const song = songs.find((item) => item.key === route.songKey);
  if (!song) return null;
  const exact = chartOfAddress(
    song,
    route.source,
    route.part,
    route.track,
  );
  if (exact) return { song, target: { kind: 'chart', id: exact.id } };
  const wantsAnalysis = route.source === ANALYSIS_SEGMENT;
  if (song.charts.length > 0 && !(wantsAnalysis && song.analysed.length > 0)) {
    return { song, target: { kind: 'chart', id: song.charts[0].id } };
  }
  return { song, target: { kind: 'analysis', sha: song.analysed[0].sha } };
}
