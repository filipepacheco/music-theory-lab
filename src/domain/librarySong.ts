import type { BassChartSource } from '@/domain/bassChart';
import type { ChartPart, ChartSummary } from '@/domain/chartSummary';

/** An analysed track, as far as grouping needs to know it. */
export interface AnalysedTrackRef {
  sha: string;
  title: string;
  artist: string;
  durationSeconds?: number;
}

/** What a row opens: the chart of its best source, or the analysis. */
export type LibrarySongTarget =
  | { kind: 'chart'; id: string }
  | { kind: 'analysis'; sha: string };

/** One row of the list: the charts and analysed tracks of one song key. */
export interface LibrarySong {
  key: string;
  title: string;
  artist: string;
  charts: ChartSummary[];
  analysed: AnalysedTrackRef[];
  /** The sources of the charts, best first. */
  sources: BassChartSource[];
  parts: ChartPart[];
  best: LibrarySongTarget;
}

/** Words that name the file, not the song. */
const FILE_WORDS = new Set([
  'bass',
  'baixo',
  'tab',
  'tabs',
  'midi',
  'gp',
  'gp5',
  'gp7',
  'gp8',
  'version',
  'ver',
  'v',
]);

const SOURCE_ORDER: BassChartSource[] = ['gp', 'rocksmith', 'midi'];

function normalizeText(text: string): string {
  let result = text;
  // Text in brackets, repeated for nested pairs.
  for (let i = 0; i < 3; i += 1) {
    result = result.replace(/\([^()]*\)|\[[^[\]]*\]|\{[^{}]*\}/g, ' ');
  }
  return result
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** The part of a song key that comes from one text (title or artist). */
function keyPart(text: string, dropFileWords: boolean): string {
  const words = normalizeText(text).split(' ').filter(Boolean);
  const kept = words.filter((word, index) => {
    if (!dropFileWords) return true;
    if (FILE_WORDS.has(word)) return false;
    // A version number: v2, or a number after "version", "ver", or "v".
    if (/^v\d+$/.test(word)) return false;
    if (/^\d+$/.test(word) && index > 0) {
      const before = words[index - 1];
      if (before === 'version' || before === 'ver' || before === 'v') {
        return false;
      }
    }
    return true;
  });
  return kept.join(' ');
}

/**
 * The song key: the normalized title and artist. Lower case, no accents, no
 * punctuation, no text in brackets, and no word that names the file. It is
 * not a musical key.
 */
export function songKey(title: string, artist: string): string {
  return `${keyPart(title, true)}|${keyPart(artist, false)}`;
}

interface Member {
  chart?: ChartSummary;
  track?: AnalysedTrackRef;
  key: string;
}

function titleOf(key: string): string {
  return key.slice(0, key.indexOf('|'));
}

function hasArtist(key: string): boolean {
  return key.slice(key.indexOf('|') + 1) !== '';
}

function sourceRank(source: BassChartSource): number {
  return SOURCE_ORDER.indexOf(source);
}

/**
 * Group charts and analysed tracks into library songs. The group is a view:
 * it reads its input and changes nothing stored. `overrides` maps a chart id
 * to a song key or `separate` (from the group override of its settings).
 */
export function groupLibrarySongs(
  charts: ChartSummary[],
  tracks: AnalysedTrackRef[],
  overrides: Record<string, string | null | undefined> = {},
): LibrarySong[] {
  const members: Member[] = [
    ...charts.map((chart): Member => {
      const override = overrides[chart.id];
      const key =
        override === 'separate'
          ? `separate:${chart.id}|`
          : override
            ? override
            : songKey(chart.title, chart.artist);
      return { chart, key };
    }),
    ...tracks.map(
      (track): Member => ({
        track,
        key: songKey(track.title, track.artist),
      }),
    ),
  ];

  // A member without an artist joins by title when one song has that title.
  const keysByTitle = new Map<string, Set<string>>();
  for (const { key } of members) {
    if (!hasArtist(key)) continue;
    const title = titleOf(key);
    const set = keysByTitle.get(title) ?? new Set<string>();
    set.add(key);
    keysByTitle.set(title, set);
  }
  for (const member of members) {
    if (hasArtist(member.key) || member.key.startsWith('separate:')) continue;
    if (member.chart && overrides[member.chart.id]) continue;
    const candidates = keysByTitle.get(titleOf(member.key));
    if (candidates?.size === 1) member.key = [...candidates][0];
  }

  const groups = new Map<string, Member[]>();
  for (const member of members) {
    const group = groups.get(member.key) ?? [];
    group.push(member);
    groups.set(member.key, group);
  }

  return [...groups.entries()].map(([key, group]) => {
    const songCharts = group
      .flatMap((member) => (member.chart ? [member.chart] : []))
      .sort(
        (a, b) =>
          sourceRank(a.source) - sourceRank(b.source) ||
          Number(a.part !== 'bass') - Number(b.part !== 'bass') ||
          a.importedAt.localeCompare(b.importedAt),
      );
    const analysed = group.flatMap((member) =>
      member.track ? [member.track] : [],
    );
    const bestChart = songCharts[0];
    const bestTrack = analysed[0];
    const origin = bestChart ?? bestTrack;
    return {
      key,
      title: origin.title,
      artist: origin.artist,
      charts: songCharts,
      analysed,
      sources: SOURCE_ORDER.filter((source) =>
        songCharts.some((chart) => chart.source === source),
      ),
      parts: (['bass', 'drums'] as ChartPart[]).filter((part) =>
        songCharts.some((chart) => chart.part === part),
      ),
      best: bestChart
        ? { kind: 'chart', id: bestChart.id }
        : { kind: 'analysis', sha: bestTrack.sha },
    } satisfies LibrarySong;
  });
}

/**
 * The song that an imported chart joins, or null when it makes a song of its
 * own (or only replaces a chart that was already there).
 */
export function songJoinedByImport(
  charts: ChartSummary[],
  tracks: AnalysedTrackRef[],
  added: ChartSummary,
): LibrarySong | null {
  if (charts.some((chart) => chart.id === added.id)) return null;
  const song = groupLibrarySongs([...charts, added], tracks).find((item) =>
    item.charts.some((chart) => chart.id === added.id),
  );
  if (!song) return null;
  return song.charts.length + song.analysed.length > 1 ? song : null;
}
