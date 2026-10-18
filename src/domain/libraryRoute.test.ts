import { describe, expect, it } from 'vitest';
import {
  chartOfAddress,
  formatLibraryRoute,
  parseLibraryRoute,
  resolveSongRoute,
  songPartChoices,
  type LibraryRoute,
} from '@/domain/libraryRoute';
import { groupLibrarySongs, songKey } from '@/domain/librarySong';
import type { ChartSummary } from '@/domain/chartSummary';

describe('library route', () => {
  it('round-trips a song address with a key that has spaces and a bar', () => {
    const route: LibraryRoute = {
      screen: 'song',
      songKey: 'come together|the beatles',
      source: 'gp',
      part: 'drums',
    };
    expect(parseLibraryRoute(formatLibraryRoute(route))).toEqual(route);
  });

  it('round-trips a song key with letters of another script', () => {
    for (const key of [
      songKey('夜に駆ける', 'YOASOBI'),
      songKey('ありがとう', ''),
      songKey('Группа крови', 'Кино'),
      songKey('ירושלים של זהב', 'נעמי שמר'),
      songKey('दिल से', 'ए आर रहमान'),
      'separate:b1|',
    ]) {
      const route: LibraryRoute = {
        screen: 'song',
        songKey: key,
        source: 'midi',
        part: 'bass',
      };
      const hash = formatLibraryRoute(route);
      expect(hash).toMatch(/^[\x21-\x7e]+$/);
      expect(parseLibraryRoute(hash)).toEqual(route);
    }
  });

  it('reads a song key that the address holds as plain or decomposed text', () => {
    const key = songKey('ありがとう', 'いきものがかり');
    const route = { screen: 'song', songKey: key, source: 'gp', part: 'bass' };
    expect(parseLibraryRoute(`#/biblioteca/${key}/gp/bass`)).toEqual(route);
    const decomposed = key.normalize('NFD');
    expect(decomposed).not.toBe(key);
    expect(
      parseLibraryRoute(
        `#/biblioteca/${encodeURIComponent(decomposed)}/gp/bass`,
      ),
    ).toEqual(route);
  });

  it('reads the list from the list address, an empty hash, and bad input', () => {
    for (const hash of [
      '#/biblioteca',
      '',
      '#/biblioteca/a/gp',
      '#/biblioteca/a/zip/bass',
      '#/biblioteca/%E0%A4%A/gp/bass',
    ]) {
      expect(parseLibraryRoute(hash)).toEqual({ screen: 'list' });
    }
  });
});

describe('part choices of a source', () => {
  const chart = (
    id: string,
    source: ChartSummary['source'],
    part: ChartSummary['part'],
  ): ChartSummary => ({
    id,
    title: 'Come Together',
    artist: 'The Beatles',
    source,
    part,
    tempoBpm: 82,
    durationSeconds: 260,
    barCount: 90,
    noteCount: 400,
    tuning: part === 'bass' ? [0, 0, 0, 0] : null,
    importedAt: '2026-01-01T00:00:00Z',
  });
  const [song] = groupLibrarySongs(
    [
      chart('d', 'gp', 'drums'),
      chart('b', 'gp', 'bass'),
      chart('m', 'midi', 'bass'),
    ],
    [],
  );

  it('lists the parts that the source has, the bass first', () => {
    expect(songPartChoices(song, 'gp')).toEqual(['bass', 'drums']);
    expect(songPartChoices(song, 'midi')).toEqual(['bass']);
  });

  it('lists no part for a source that the song lacks, and for the analysis', () => {
    expect(songPartChoices(song, 'rocksmith')).toEqual([]);
    expect(songPartChoices(song, 'analise')).toEqual([]);
  });
  it('names the newest import when two charts share one address', () => {
    const old = { ...chart('old', 'gp', 'bass'), importedAt: '2026-01-01' };
    const fresh = { ...chart('new', 'gp', 'bass'), importedAt: '2026-02-01' };
    for (const charts of [
      [old, fresh, chart('d', 'gp', 'drums')],
      [fresh, old, chart('d', 'gp', 'drums')],
    ]) {
      const [twice] = groupLibrarySongs(charts, []);
      expect(chartOfAddress(twice, 'gp', 'bass')?.id).toBe('new');
      expect(
        resolveSongRoute([twice], {
          screen: 'song',
          songKey: twice.key,
          source: 'gp',
          part: 'bass',
        })?.target,
      ).toEqual({ kind: 'chart', id: 'new' });
    }
  });
});
