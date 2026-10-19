import { describe, expect, it } from 'vitest';
import type { BassChart } from '@/domain/bassChart';
import { fixtureChart } from '@/domain/bassChartFixture';
import { summarizeChart, type ChartSummary } from '@/domain/chartSummary';
import type { ChartSettings } from '@/domain/chartSettings';
import {
  groupLibrarySongs,
  moveTargets,
  songJoinedByImport,
  songKey,
} from '@/domain/librarySong';

function summary(
  id: string,
  title: string,
  artist: string,
  source: ChartSummary['source'],
  extra: Partial<ChartSummary> = {},
): ChartSummary {
  const chart: BassChart = {
    ...fixtureChart(1, [{ bar: 0, beat: 0, midi: 33 }]),
    id,
    title,
    artist,
    source,
  };
  return { ...summarizeChart(chart), ...extra };
}

describe('songKey', () => {
  it('is lower case, without accents, punctuation, or bracketed text', () => {
    expect(songKey('Águas de Março (Remastered)', 'Elis Regina!')).toBe(
      'aguas de marco|elis regina',
    );
    expect(songKey('Dont Stop [Live] ', 'R.E.M.')).toBe('dont stop|r e m');
  });

  it('drops the words that name the file', () => {
    const plain = songKey('Come Together', 'The Beatles');
    expect(songKey('Come Together (bass)', 'The Beatles')).toBe(plain);
    expect(songKey('Come Together Bass Tab', 'The Beatles')).toBe(plain);
    expect(songKey('Come Together - tabs v2', 'The Beatles')).toBe(plain);
    expect(songKey('Come Together version 3', 'The Beatles')).toBe(plain);
  });

  it('keeps numbers that belong to the title', () => {
    expect(songKey('Take 5', 'Brubeck')).toBe('take 5|brubeck');
  });

  it('gives two keys for two different Japanese titles', () => {
    const first = songKey('夜に駆ける', 'YOASOBI');
    const second = songKey('群青', 'YOASOBI');
    expect(first).toBe('夜に駆ける|yoasobi');
    expect(second).toBe('群青|yoasobi');
    expect(first).not.toBe(second);
  });

  it('keeps the letters of Cyrillic, Greek, and Hebrew, in lower case', () => {
    expect(songKey('Группа Крови!', 'КИНО')).toBe('группа крови|кино');
    expect(songKey('Ζορμπάς (Live)', 'Θεοδωράκης')).toBe('ζορμπας|θεοδωρακης');
    expect(songKey('ירושלים של זהב', 'נעמי שמר')).toBe(
      'ירושלים של זהב|נעמי שמר',
    );
  });

  it('keeps a letter and its mark as one word, in the composed form', () => {
    expect(songKey('ありがとう', '')).toBe('ありがとう|');
    expect(songKey('ありがとう', '')).not.toBe(songKey('ありかとう', ''));
    expect(songKey('दिल से', '')).toBe('दिल से|');
    const composed = songKey('ありがとう', '');
    expect(songKey('ありがとう'.normalize('NFD'), '')).toBe(composed);
    expect(composed).toBe(composed.normalize('NFC'));
  });
});

describe('groupLibrarySongs', () => {
  const gp = summary('gp1', 'Come Together', 'The Beatles', 'gp');
  const midi = summary('midi1', 'Come Together (bass)', 'the beatles', 'midi');
  const rs = summary('rs1', 'Come Together', 'The Beatles', 'rocksmith');
  const track = { sha: 'abc', title: 'Come Together', artist: 'The Beatles' };

  it('makes one row of charts and analysed tracks with one song key', () => {
    const songs = groupLibrarySongs([midi, gp, rs], [track]);
    expect(songs).toHaveLength(1);
    expect(songs[0].charts.map((c) => c.id)).toEqual(['gp1', 'rs1', 'midi1']);
    expect(songs[0].analysed).toEqual([track]);
    expect(songs[0].sources).toEqual(['gp', 'rocksmith', 'midi']);
    expect(songs[0].parts).toEqual(['bass']);
  });

  it('takes title and artist from the best source and opens its chart', () => {
    const [song] = groupLibrarySongs([midi, rs], []);
    expect(song.title).toBe('Come Together');
    expect(song.best).toEqual({ kind: 'chart', id: 'rs1' });
    const [withGp] = groupLibrarySongs([midi, rs, gp], []);
    expect(withGp.best).toEqual({ kind: 'chart', id: 'gp1' });
  });

  it('opens the analysis of a song with only an analysed track', () => {
    const [song] = groupLibrarySongs([], [track]);
    expect(song.best).toEqual({ kind: 'analysis', sha: 'abc' });
    expect(song.title).toBe('Come Together');
    expect(song.sources).toEqual([]);
  });

  it('shows a badge for each part', () => {
    const drums = summary('d1', 'Come Together', 'The Beatles', 'gp', {
      part: 'drums',
    });
    const [song] = groupLibrarySongs([gp, drums], []);
    expect(song.parts).toEqual(['bass', 'drums']);
    expect(song.best).toEqual({ kind: 'chart', id: 'gp1' });
  });

  it('joins a chart without an artist by title when one song has it', () => {
    const bare = summary('bare', 'Come Together', '', 'midi');
    const songs = groupLibrarySongs([gp, bare], []);
    expect(songs).toHaveLength(1);
    expect(songs[0].charts).toHaveLength(2);
  });

  it('keeps a chart without an artist alone when two songs share its title', () => {
    const other = summary('o', 'Come Together', 'Aerosmith', 'gp');
    const bare = summary('bare', 'Come Together', '', 'midi');
    const songs = groupLibrarySongs([gp, other, bare], []);
    expect(songs).toHaveLength(3);
  });

  it('honours a group override of separate or of another song key', () => {
    const separate = groupLibrarySongs([gp, midi], [], { midi1: 'separate' });
    expect(separate).toHaveLength(2);
    const moved = groupLibrarySongs([gp, midi], [], {
      midi1: songKey('Other', 'Someone'),
    });
    expect(moved).toHaveLength(2);
  });

  it('keeps two songs with titles in another script as two rows', () => {
    const first = summary('j1', '夜に駆ける', 'YOASOBI', 'gp');
    const second = summary('j2', '群青', 'YOASOBI', 'gp');
    const sameAsFirst = summary('j3', '夜に駆ける (bass)', 'yoasobi', 'midi');
    const bare = summary('j4', 'Группа крови', '', 'midi');
    const other = summary('j5', 'Звезда по имени Солнце', '', 'midi');
    const songs = groupLibrarySongs(
      [first, second, sameAsFirst, bare, other],
      [],
    );
    expect(songs.map((song) => song.charts.map((c) => c.id))).toEqual([
      ['j1', 'j3'],
      ['j2'],
      ['j4'],
      ['j5'],
    ]);
  });

  it('never groups a chart or a track whose key has no title', () => {
    const empty = summary('e1', '', '', 'midi');
    const marks = summary('e2', '???', '', 'gp');
    const untitled = summary('e3', '(Untitled)', 'The Beatles', 'gp');
    const fileWord = summary('e4', 'Bass Tab', 'The Beatles', 'midi');
    const tracks = [
      { sha: 't1', title: '', artist: '' },
      { sha: 't2', title: '[demo]', artist: 'The Beatles' },
    ];
    const songs = groupLibrarySongs(
      [gp, empty, marks, untitled, fileWord],
      tracks,
    );
    expect(songs.map((song) => song.key)).toEqual([
      songKey('Come Together', 'The Beatles'),
      'separate:e1|',
      'separate:e2|',
      'separate:e3|',
      'separate:e4|',
      'separate:t1|',
      'separate:t2|',
    ]);
    for (const song of songs) {
      expect(song.charts.length + song.analysed.length).toBe(1);
    }
    expect(songJoinedByImport([empty, untitled], tracks, marks)).toBeNull();
  });

  it('a MIDI chart and a Guitar Pro chart with one song key make one row. Each chart keeps its settings record and its linked recording.', () => {
    const settings: ChartSettings[] = [
      {
        chartId: 'midi1',
        updatedAt: '2026-01-01T00:00:00.000Z',
        songLineLength: 4,
        sectionLineLengths: { 0: 2 },
        groupOverride: null,
      },
      {
        chartId: 'gp1',
        updatedAt: '2026-01-02T00:00:00.000Z',
        songLineLength: 'auto',
        sectionLineLengths: {},
        groupOverride: null,
      },
    ];
    const recordings: Record<string, string> = {
      midi1: 'audio-midi',
      gp1: 'audio-gp',
    };
    const input = [midi, gp];
    const before = structuredClone({ input, settings, recordings });
    const songs = groupLibrarySongs(input, []);
    expect(songs).toHaveLength(1);
    expect(songs[0].charts.map((c) => c.id).sort()).toEqual(['gp1', 'midi1']);
    expect({ input, settings, recordings }).toEqual(before);
    for (const chart of songs[0].charts) {
      expect(settings.find((s) => s.chartId === chart.id)).toBeDefined();
      expect(recordings[chart.id]).toBeDefined();
    }
  });
});

describe('songJoinedByImport', () => {
  const gp = summary('gp1', 'Come Together', 'The Beatles', 'gp');
  it('names the song a new file joins', () => {
    const added = summary('m', 'Come Together (bass)', 'The Beatles', 'midi');
    expect(songJoinedByImport([gp], [], added)?.title).toBe('Come Together');
  });
  it('joins an analysed track too', () => {
    const track = { sha: 's', title: 'Come Together', artist: 'The Beatles' };
    expect(songJoinedByImport([], [track], gp)?.title).toBe('Come Together');
  });
  it('is null for a new song and for the same file again', () => {
    const other = summary('x', 'Something', 'George', 'midi');
    expect(songJoinedByImport([gp], [], other)).toBeNull();
    expect(songJoinedByImport([gp], [], gp)).toBeNull();
  });
  it('is null when the only chart of the calculated song was separated', () => {
    const added = summary('m', 'Come Together', 'The Beatles', 'midi');
    expect(songJoinedByImport([gp], [], added, { gp1: 'separate' })).toBeNull();
  });
  it('names the song that a group override moves the new file to', () => {
    const other = summary('x', 'Something', 'George', 'midi');
    expect(
      songJoinedByImport([gp], [], other, { x: 'come together|the beatles' })
        ?.title,
    ).toBe('Come Together');
  });
});

describe('moveTargets', () => {
  it('leaves out the own song, separated songs, and songs with the same source and part', () => {
    const open = summary('m2', 'Come Togther', 'The Beatles', 'midi');
    const songs = groupLibrarySongs(
      [
        summary('m1', 'Come Together', 'The Beatles', 'midi'),
        summary('g1', 'Imagine', 'John Lennon', 'gp'),
        open,
      ],
      [],
      {},
    );
    const keys = moveTargets(songs, open, 'come togther|the beatles').map(
      (song) => song.key,
    );
    expect(keys).toEqual(['imagine|john lennon']);
  });
});
