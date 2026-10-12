import { describe, expect, it } from 'vitest';
import {
  formatLibraryRoute,
  parseLibraryRoute,
  type LibraryRoute,
} from '@/domain/libraryRoute';

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
