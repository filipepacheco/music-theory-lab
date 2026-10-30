import { describe, expect, it } from 'vitest';
import { DRUM_PIECES } from '@/constants/groove';
import { buildBassChart } from '@/domain/bassChart';
import { fixtureChart } from '@/domain/bassChartFixture';
import {
  parseBassChart,
  parseBassChartRecord,
  parseChart,
  parseDrumChart,
} from '@/domain/bassChartRecord';
import { summarizeChart } from '@/domain/chartSummary';
import {
  DRUM_CHART_PIECES,
  DRUM_PIECE_LABEL,
  drumSoundOf,
  isDrumChart,
} from '@/domain/drumChart';
import { fixtureDrumChart } from '@/domain/drumChartFixture';
import { groupLibrarySongs } from '@/domain/librarySong';
import { midiToArrangement } from '@/domain/midiBassChart';
import { hasDrumNotes, midiToDrumChart } from '@/domain/midiDrumChart';
import type { MidiFile, MidiNote } from '@/services/midi/midiFile';

const drums = fixtureDrumChart(2, [
  { bar: 0, beat: 0, midi: 36 },
  { bar: 0, beat: 0, midi: 42 },
  { bar: 0, beat: 1, midi: 38, dynamic: 'accent', intensity: 111 },
  { bar: 1, beat: 2.5, midi: 38, dynamic: 'ghost', intensity: 79 },
]);
const bass = {
  ...fixtureChart(2, [{ bar: 0, beat: 0, midi: 33 }]),
  id: 'a'.repeat(64),
};

describe('drum piece map', () => {
  it('follows the table of General MIDI numbers', () => {
    const table: [number[], string, string][] = [
      [[35, 36], 'bumbo', 'normal'],
      [[38, 40], 'caixa', 'normal'],
      [[37], 'caixa', 'crossStick'],
      [[42], 'chimbal', 'closed'],
      [[46], 'chimbal', 'open'],
      [[44], 'chimbal', 'pedal'],
      [[48, 50], 'tomAgudo', 'normal'],
      [[45, 47], 'tomMedio', 'normal'],
      [[41, 43], 'surdo', 'normal'],
      [[49, 57], 'pratoAtaque', 'normal'],
      [[52], 'pratoAtaque', 'china'],
      [[55], 'pratoAtaque', 'splash'],
      [[51, 59], 'pratoConducao', 'normal'],
      [[53], 'pratoConducao', 'bell'],
    ];
    const mapped = new Set<number>();
    for (const [numbers, piece, articulation] of table) {
      for (const number of numbers) {
        expect([number, drumSoundOf(number)]).toEqual([
          number,
          { piece, articulation },
        ]);
        mapped.add(number);
      }
    }
    for (let number = 0; number <= 127; number += 1) {
      if (mapped.has(number)) continue;
      expect([number, drumSoundOf(number)]).toEqual([
        number,
        { piece: 'outros', articulation: 'normal' },
      ]);
    }
  });

  it('names each drum piece in Portuguese', () => {
    expect(DRUM_CHART_PIECES.map((piece) => DRUM_PIECE_LABEL[piece])).toEqual([
      'Bumbo',
      'Caixa',
      'Chimbal',
      'Tom agudo',
      'Tom médio',
      'Surdo',
      'Prato de ataque',
      'Prato de condução',
      'Outros',
    ]);
  });

  it('leaves the groove grid of the Estrutura module with its eight drum pieces', () => {
    expect(DRUM_PIECES.map((piece) => piece.id)).toEqual([
      'crash',
      'ride',
      'chimbal',
      'tomAgudo',
      'tomMedio',
      'caixa',
      'surdo',
      'bumbo',
    ]);
  });
});

describe('drum chart checks', () => {
  const without = (field: string) => {
    const copy: Record<string, unknown> = { ...drums };
    delete copy[field];
    return copy;
  };
  const withHit = (change: Record<string, unknown>) => ({
    ...drums,
    hits: [{ ...drums.hits[0], ...change }, ...drums.hits.slice(1)],
  });

  it('accepts a drum chart, and each hit holds its seven facts and its dynamic', () => {
    expect(parseDrumChart(drums)).toEqual(drums);
    expect(parseChart(drums)).toEqual(drums);
    expect(drums.hits[2]).toEqual({
      time: 0.5,
      bar: 0,
      beatInBar: 1,
      piece: 'caixa',
      articulation: 'normal',
      dynamic: 'accent',
      intensity: 111,
      midi: 38,
    });
  });

  it('accepts a stored bass chart with no part field', () => {
    expect('part' in bass).toBe(false);
    expect(parseChart(bass)).toEqual(bass);
    expect(
      parseBassChartRecord({
        id: bass.id,
        updatedAt: '2026-10-05T10:00:00.000Z',
        chart: bass,
      })?.chart,
    ).toEqual(bass);
  });

  it('refuses a drum chart that fails a check', () => {
    const bad: unknown[] = [
      { ...drums, part: 'keys' },
      { ...drums, tuning: [0, 0, 0, 0] },
      { ...drums, notes: [] },
      { ...drums, audio: 'binary' },
      { ...drums, source: 'rocksmith' },
      without('source'),
      without('hits'),
      { ...drums, hits: [] },
      { ...drums, id: 'short' },
      { ...drums, bars: [] },
      { ...drums, sections: [{ ...drums.sections[0], endBar: 1 }] },
      { ...drums, hits: [...drums.hits].reverse() },
      withHit({ piece: 'cowbell' }),
      withHit({ articulation: 'rimshot' }),
      withHit({ dynamic: 'loud' }),
      withHit({ intensity: 0 }),
      withHit({ intensity: 128 }),
      withHit({ intensity: 90.5 }),
      withHit({ midi: 128 }),
      withHit({ midi: -1 }),
      withHit({ bar: 2 }),
      withHit({ beatInBar: -1 }),
      withHit({ time: -1 }),
      withHit({ time: Number.NaN }),
      withHit({ string: 1 }),
      { ...drums, hits: [{ time: 0, bar: 0, beatInBar: 0, midi: 36 }] },
    ];
    bad.forEach((chart, index) => {
      expect([index, parseDrumChart(chart)]).toEqual([index, null]);
      expect([index, parseChart(chart)]).toEqual([index, null]);
    });
  });

  it('refuses a bass chart that names the part "drums"', () => {
    expect(parseChart({ ...bass, part: 'drums' })).toBeNull();
    expect(parseChart({ ...bass, part: 'bass' })).toBeNull();
  });

  it('a check that knows only bass charts refuses a drum chart', () => {
    expect(parseBassChart(drums)).toBeNull();
  });

  it('keeps a chart from an earlier map of drum pieces', () => {
    expect(parseDrumChart(withHit({ piece: 'outros' }))).not.toBeNull();
  });

  it('refuses a record with a drum chart of a different id', () => {
    const record = {
      id: drums.id,
      updatedAt: '2026-10-05T10:00:00.000Z',
      chart: drums,
    };
    expect(parseBassChartRecord(record)?.chart).toEqual(drums);
    expect(parseBassChartRecord({ ...record, id: 'b'.repeat(64) })).toBeNull();
  });
});

describe('drum chart summary', () => {
  it('has the part "drums", the hits as its count, and no tuning', () => {
    expect(isDrumChart(drums)).toBe(true);
    expect(isDrumChart(bass)).toBe(false);
    expect(summarizeChart(drums)).toMatchObject({
      id: drums.id,
      part: 'drums',
      source: 'gp',
      noteCount: 4,
      barCount: 2,
      tuning: null,
    });
    expect(summarizeChart(bass)).toMatchObject({
      part: 'bass',
      tuning: [0, 0, 0, 0],
    });
  });

  it('gives its song a drums badge', () => {
    const [song] = groupLibrarySongs([summarizeChart(drums)], []);
    expect(song.parts).toEqual(['drums']);
    expect(song.best).toEqual({ kind: 'chart', id: drums.id });
  });
});

describe('midiToDrumChart', () => {
  const QUARTER = 480;
  const hit = (
    startTick: number,
    pitch: number,
    velocity = 100,
    channel = 9,
  ): MidiNote => ({
    channel,
    pitch,
    velocity,
    startTick,
    endTick: startTick + 60,
    bent: false,
  });
  const file: MidiFile = {
    ticksPerQuarter: QUARTER,
    tempos: [
      { tick: 0, microsPerQuarter: 500_000 },
      { tick: 4 * QUARTER, microsPerQuarter: 1_000_000 },
    ],
    timeSignatures: [],
    markers: [
      { tick: 0, text: 'Intro' },
      { tick: 4 * QUARTER, text: 'Verso' },
    ],
    programs: { 0: 33 },
    notes: [
      hit(0, 33, 100, 0),
      hit(0, 36, 110),
      hit(0, 42, 90),
      hit(QUARTER / 8, 42, 60),
      hit(QUARTER / 6, 43, 70),
      hit(4 * QUARTER, 38, 100),
      hit(5 * QUARTER + QUARTER / 2, 81, 64),
    ],
    endTick: 8 * QUARTER,
  };
  const input = {
    id: 'd'.repeat(64),
    sourceFileName: 'song.mid',
    source: 'midi' as const,
    importedAt: '2026-10-05T10:00:00.000Z',
    metadata: { title: 'Song', artist: 'Band', album: '', year: null },
  };

  it('puts each hit of the percussion channel on the bar grid, with its MIDI number and intensity', () => {
    const chart = midiToDrumChart({ ...input, midi: file })!;
    expect(chart.hits).toEqual([
      {
        time: 0,
        bar: 0,
        beatInBar: 0,
        piece: 'bumbo',
        articulation: 'normal',
        dynamic: 'normal',
        intensity: 110,
        midi: 36,
      },
      {
        time: 0,
        bar: 0,
        beatInBar: 0,
        piece: 'chimbal',
        articulation: 'closed',
        dynamic: 'normal',
        intensity: 90,
        midi: 42,
      },
      {
        time: 0.0625,
        bar: 0,
        beatInBar: 0.125,
        piece: 'chimbal',
        articulation: 'closed',
        dynamic: 'normal',
        intensity: 60,
        midi: 42,
      },
      {
        time: expect.closeTo(0.5 / 6, 6),
        bar: 0,
        beatInBar: 8 / 48,
        piece: 'surdo',
        articulation: 'normal',
        dynamic: 'normal',
        intensity: 70,
        midi: 43,
      },
      {
        time: 2,
        bar: 1,
        beatInBar: 0,
        piece: 'caixa',
        articulation: 'normal',
        dynamic: 'normal',
        intensity: 100,
        midi: 38,
      },
      {
        time: 3.5,
        bar: 1,
        beatInBar: 1.5,
        piece: 'outros',
        articulation: 'normal',
        dynamic: 'normal',
        intensity: 64,
        midi: 81,
      },
    ]);
    expect(chart.part).toBe('drums');
    expect(parseDrumChart(JSON.parse(JSON.stringify(chart)))).not.toBeNull();
  });

  it('has the bars and the sections of the bass chart of the same file', () => {
    const chart = midiToDrumChart({ ...input, midi: file })!;
    const bassChart = buildBassChart({
      ...input,
      id: 'a'.repeat(64),
      arrangement: midiToArrangement(file, 0),
    });
    expect(chart.bars).toEqual(bassChart.bars);
    expect(chart.sections).toEqual(bassChart.sections);
    expect(chart.bars.map((bar) => bar.endTime)).toEqual([2, 6]);
    expect(chart.sections.map((section) => section.name)).toEqual([
      'Intro',
      'Verso',
    ]);
    expect(chart.songLengthSeconds).toBe(bassChart.songLengthSeconds);
    expect(chart.averageTempoBpm).toBe(bassChart.averageTempoBpm);
  });

  it('takes the ghost note and the accent from the source, not from the intensity', () => {
    const chart = midiToDrumChart({
      ...input,
      midi: file,
      dynamicOf: (note) =>
        note.pitch === 36 ? 'ghost' : note.pitch === 43 ? 'accent' : 'normal',
    })!;
    expect(chart.hits.map((item) => [item.intensity, item.dynamic])).toEqual([
      [110, 'ghost'],
      [90, 'normal'],
      [60, 'normal'],
      [70, 'accent'],
      [100, 'normal'],
      [64, 'normal'],
    ]);
  });

  it('gives no chart for a file with an empty percussion channel', () => {
    const melodic = { ...file, notes: [hit(0, 33, 100, 0)] };
    expect(hasDrumNotes(file)).toBe(true);
    expect(hasDrumNotes(melodic)).toBe(false);
    expect(midiToDrumChart({ ...input, midi: melodic })).toBeNull();
  });
});
