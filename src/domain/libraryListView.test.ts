import { describe, expect, it } from 'vitest';
import type { BassChartSource } from '@/domain/bassChart';
import type { ChartPart, ChartSummary } from '@/domain/chartSummary';
import { groupLibrarySongs } from '@/domain/librarySong';
import {
  applyListView,
  DEFAULT_LIST_VIEW,
  filterSongs,
  foldText,
  sortSongs,
  tuningOptions,
  type ListView,
} from '@/domain/libraryListView';

function summary(
  id: string,
  title: string,
  artist: string,
  extra: Partial<ChartSummary> = {},
): ChartSummary {
  return {
    id,
    title,
    artist,
    source: 'gp' as BassChartSource,
    part: 'bass' as ChartPart,
    tempoBpm: 100,
    durationSeconds: 200,
    barCount: 10,
    noteCount: 50,
    tuning: [0, 0, 0, 0],
    importedAt: '2026-01-01T00:00:00.000Z',
    ...extra,
  };
}

const NONE = new Set<string>();
const view = (patch: Partial<ListView>): ListView => ({
  ...DEFAULT_LIST_VIEW,
  ...patch,
});
const titles = (songs: { title: string }[]) => songs.map((s) => s.title);

const charts = [
  summary('a', 'Água de Beber', 'Tom Jobim', {
    source: 'midi',
    tempoBpm: 140,
    importedAt: '2026-03-01T00:00:00.000Z',
  }),
  summary('b', 'Come Together', 'The Beatles', {
    tempoBpm: 80,
    tuning: [-2, 0, 0, 0],
    importedAt: '2026-02-01T00:00:00.000Z',
  }),
  summary('b2', 'Come Together', 'The Beatles', {
    part: 'drums',
    tuning: null,
    importedAt: '2026-02-01T00:00:00.000Z',
  }),
  summary('c', 'Zebra', 'Álvaro Ótimo', {
    source: 'rocksmith',
    tempoBpm: 120,
    importedAt: '2026-01-01T00:00:00.000Z',
  }),
];
const songs = groupLibrarySongs(charts, []);

describe('foldText', () => {
  it('drops accents and case', () => {
    expect(foldText('  ÁGUA  de Beber ')).toBe('agua de beber');
  });
});

describe('filterSongs', () => {
  it('finds a song by title, ignoring case and accents', () => {
    expect(titles(filterSongs(songs, view({ search: 'AGUA' }), NONE))).toEqual([
      'Água de Beber',
    ]);
  });

  it('finds a song by artist, ignoring case and accents', () => {
    expect(
      titles(filterSongs(songs, view({ search: 'alvaro otimo' }), NONE)),
    ).toEqual(['Zebra']);
  });

  it('needs every word of the search', () => {
    expect(filterSongs(songs, view({ search: 'come jobim' }), NONE)).toEqual(
      [],
    );
  });

  it('filters by source', () => {
    expect(titles(filterSongs(songs, view({ source: 'midi' }), NONE))).toEqual([
      'Água de Beber',
    ]);
  });

  it('filters by tuning', () => {
    const [drop] = tuningOptions(songs).filter((t) => t !== 'E A D G');
    expect(titles(filterSongs(songs, view({ tuning: drop }), NONE))).toEqual([
      'Come Together',
    ]);
  });

  it('filters by linked recording from the ids of this browser', () => {
    expect(
      titles(filterSongs(songs, view({ linked: 'linked' }), new Set(['c']))),
    ).toEqual(['Zebra']);
    expect(
      titles(filterSongs(songs, view({ linked: 'unlinked' }), new Set(['c']))),
    ).toHaveLength(2);
  });

  it('shows a song that holds a drum chart under the part "drums"', () => {
    expect(titles(filterSongs(songs, view({ part: 'drums' }), NONE))).toEqual([
      'Come Together',
    ]);
  });

  it('applies several filters together with the search', () => {
    const result = filterSongs(
      songs,
      view({ part: 'bass', source: 'gp', search: 'beatles' }),
      NONE,
    );
    expect(titles(result)).toEqual(['Come Together']);
    expect(
      filterSongs(songs, view({ part: 'drums', source: 'midi' }), NONE),
    ).toEqual([]);
    expect(
      filterSongs(songs, view({ source: 'gp', search: 'zebra' }), NONE),
    ).toEqual([]);
  });
});

describe('sortSongs', () => {
  it('orders by import date, newest first', () => {
    expect(titles(sortSongs(songs, 'imported'))).toEqual([
      'Água de Beber',
      'Come Together',
      'Zebra',
    ]);
  });
  it('orders by title, accents folded', () => {
    expect(titles(sortSongs(songs, 'title'))).toEqual([
      'Água de Beber',
      'Come Together',
      'Zebra',
    ]);
  });
  it('orders by artist', () => {
    expect(titles(sortSongs(songs, 'artist'))).toEqual([
      'Zebra',
      'Come Together',
      'Água de Beber',
    ]);
  });
  it('orders by tempo, slowest first', () => {
    expect(titles(sortSongs(songs, 'tempo'))).toEqual([
      'Come Together',
      'Zebra',
      'Água de Beber',
    ]);
  });
  it('puts a song without a tempo last and does not change its input', () => {
    const withTrack = groupLibrarySongs(charts, [
      { sha: 's', title: 'Analysed', artist: 'X' },
    ]);
    const before = withTrack.map((s) => s.key);
    expect(titles(sortSongs(withTrack, 'tempo')).pop()).toBe('Analysed');
    expect(withTrack.map((s) => s.key)).toEqual(before);
  });
});

describe('a library with titles in another script', () => {
  const others = groupLibrarySongs(
    [
      summary('j1', '夜に駆ける', 'YOASOBI'),
      summary('j2', '群青', 'YOASOBI'),
      summary('j3', 'ありがとう', 'いきものがかり'),
      summary('r1', 'Группа Крови', 'Кино'),
    ],
    [],
  );
  const found = (search: string) =>
    titles(filterSongs(others, view({ search }), NONE));

  it('finds a song by the letters of its title or its artist', () => {
    expect(found('群青')).toEqual(['群青']);
    expect(found('yoasobi')).toEqual(['夜に駆ける', '群青']);
    expect(found('группа кино')).toEqual(['Группа Крови']);
    expect(found('ありがとう'.normalize('NFD'))).toEqual(['ありがとう']);
    expect(found('夜 青')).toEqual([]);
  });

  it('sorts the songs by title with the key as the last tie-break', () => {
    const sorted = sortSongs(others, 'title');
    expect(sorted).toHaveLength(4);
    expect(new Set(sorted.map((song) => song.key)).size).toBe(4);
  });
});

describe('applyListView', () => {
  it('filters, then sorts', () => {
    const result = applyListView(
      songs,
      view({ source: 'gp', sort: 'title' }),
      NONE,
    );
    expect(titles(result)).toEqual(['Come Together']);
  });
});
