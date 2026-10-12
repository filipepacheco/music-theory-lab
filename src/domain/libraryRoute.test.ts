import { describe, expect, it } from 'vitest';
import {
  formatLibraryRoute,
  parseLibraryRoute,
  type LibraryRoute,
} from '@/domain/libraryRoute';
import { songKey } from '@/domain/librarySong';

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
      // The address holds only ASCII, so a reload gives it back unchanged.
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
