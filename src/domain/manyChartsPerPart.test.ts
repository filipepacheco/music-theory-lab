import { describe, expect, it } from 'vitest';
import type { ChartSummary } from '@/domain/chartSummary';
import { groupLibrarySongs } from '@/domain/librarySong';
import {
  chartOfAddress,
  chartsOfPart,
  formatLibraryRoute,
  parseLibraryRoute,
  resolveSongRoute,
  routeOfChart,
  routeOfSong,
  routeOfSource,
  songPartChoices,
} from '@/domain/libraryRoute';

function chart(
  id: string,
  part: ChartSummary['part'],
  extra: Partial<ChartSummary> = {},
): ChartSummary {
  return {
    id,
    title: 'Come Together',
    artist: 'The Beatles',
    source: 'gp',
    part,
    tempoBpm: 120,
    durationSeconds: 10,
    barCount: 4,
    noteCount: 8,
    tuning: null,
    importedAt: '2026-01-01T00:00:00.000Z',
    ...extra,
  };
}

const CHARTS = [
  chart('v1', 'vocals', { partName: 'Voz', trackIndex: 5 }),
  chart('g2', 'guitar', { partName: 'Guitarra 2 - Lead', trackIndex: 3 }),
  chart('d', 'drums'),
  chart('g1', 'guitar', { partName: 'Guitarra 1 - Rhythm', trackIndex: 1 }),
  chart('b', 'bass'),
];

const song = () => groupLibrarySongs(CHARTS, [])[0];

describe('order of the parts', () => {
  it('lists the kinds as bass, drums, guitar, vocals', () => {
    expect(song().parts).toEqual(['bass', 'drums', 'guitar', 'vocals']);
    expect(songPartChoices(song(), 'gp')).toEqual([
      'bass',
      'drums',
      'guitar',
      'vocals',
    ]);
  });

  it('keeps the charts of one kind in the GP track order and opens on the bass', () => {
    expect(song().charts.map((item) => item.id)).toEqual([
      'b',
      'd',
      'g1',
      'g2',
      'v1',
    ]);
    expect(routeOfSong(song())).toMatchObject({ part: 'bass' });
    expect(song().best).toEqual({ kind: 'chart', id: 'b' });
    expect(
      chartsOfPart(song(), 'gp', 'guitar').map((item) => item.partName),
    ).toEqual(['Guitarra 1 - Rhythm', 'Guitarra 2 - Lead']);
  });

  it('keeps the guitar part on a change of source, on its first track', () => {
    const route = routeOfSource(song(), 'gp', 'guitar');
    expect(route).toMatchObject({ part: 'guitar', track: 1 });
  });
});

describe('address of a chart with a track index', () => {
  it('names the part kind and the track index', () => {
    const route = routeOfChart('k', 'gp', 'guitar', 3);
    expect(formatLibraryRoute(route)).toBe('#/biblioteca/k/gp/guitar-3');
    expect(parseLibraryRoute('#/biblioteca/k/gp/guitar-3')).toEqual({
      screen: 'song',
      songKey: 'k',
      source: 'gp',
      part: 'guitar',
      track: 3,
    });
    expect(parseLibraryRoute('#/biblioteca/k/gp/vocals-0')).toMatchObject({
      part: 'vocals',
      track: 0,
    });
  });

  it('keeps the bass and drum addresses as before', () => {
    expect(formatLibraryRoute(routeOfChart('k', 'gp', 'drums'))).toBe(
      '#/biblioteca/k/gp/drums',
    );
    expect(parseLibraryRoute('#/biblioteca/k/gp/bass')).toEqual({
      screen: 'song',
      songKey: 'k',
      source: 'gp',
      part: 'bass',
    });
  });

  it('refuses an address with a bad track index', () => {
    for (const part of ['guitar-x', 'guitar--1', 'bass-1', 'guitar-1-2']) {
      expect(parseLibraryRoute(`#/biblioteca/k/gp/${part}`)).toEqual({
        screen: 'list',
      });
    }
  });

  it('opens the same chart from a saved address', () => {
    const songs = groupLibrarySongs(CHARTS, []);
    const key = songs[0].key;
    for (const [track, id] of [
      [1, 'g1'],
      [3, 'g2'],
    ] as const) {
      const hash = formatLibraryRoute(routeOfChart(key, 'gp', 'guitar', track));
      const route = parseLibraryRoute(hash);
      if (route.screen !== 'song') throw new Error('not a song route');
      expect(resolveSongRoute(songs, route)?.target).toEqual({
        kind: 'chart',
        id,
      });
      expect(chartOfAddress(songs[0], 'gp', 'guitar', track)?.id).toBe(id);
    }
  });

  it('opens the first track of the kind when the address has no track', () => {
    expect(chartOfAddress(song(), 'gp', 'guitar')?.id).toBe('g1');
  });
});
