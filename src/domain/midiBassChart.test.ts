import { describe, expect, it } from 'vitest';
import { buildBassChart, timeSignatures } from '@/domain/bassChart';
import {
  midiToArrangement,
  pickBassChannel,
  suggestFingering,
} from '@/domain/midiBassChart';
import type { MidiFile, MidiNote } from '@/services/midi/midiFile';

const QUARTER = 480;
const OPEN = [28, 33, 38, 43];

function note(partial: Partial<MidiNote> & { pitch: number }): MidiNote {
  const startTick = partial.startTick ?? 0;
  return {
    channel: 0,
    velocity: 100,
    startTick,
    endTick: startTick + QUARTER,
    bent: false,
    ...partial,
  };
}

/** 120 bpm in 4/4 unless overridden: a quarter note lasts half a second. */
function midi(overrides: Partial<MidiFile> = {}): MidiFile {
  return {
    ticksPerQuarter: QUARTER,
    tempos: [],
    timeSignatures: [],
    markers: [],
    programs: {},
    notes: [],
    endTick: 0,
    ...overrides,
  };
}

function positions(pitches: number[], gapSeconds = 0.5) {
  return suggestFingering(
    pitches.map((pitch, i) => ({ pitch, time: i * gapSeconds })),
    OPEN,
  ).map((p) => [p.string, p.fret]);
}

describe('pickBassChannel', () => {
  it('takes the busiest channel on a General MIDI bass program', () => {
    const file = midi({
      programs: { 0: 25, 2: 33, 3: 38 },
      notes: [
        note({ channel: 0, pitch: 30 }),
        note({ channel: 2, pitch: 45 }),
        note({ channel: 2, pitch: 47 }),
        note({ channel: 3, pitch: 40 }),
      ],
    });
    expect(pickBassChannel(file)).toBe(2);
  });

  it('falls back to the lowest melodic channel, never the drums', () => {
    const file = midi({
      programs: { 0: 0, 1: 0, 9: 0 },
      notes: [
        note({ channel: 0, pitch: 64 }),
        note({ channel: 1, pitch: 40 }),
        note({ channel: 9, pitch: 36 }),
      ],
    });
    expect(pickBassChannel(file)).toBe(1);
    expect(
      pickBassChannel(midi({ notes: [note({ channel: 9, pitch: 36 })] })),
    ).toBe(null);
  });
});

describe('suggestFingering', () => {
  it('prefers open strings and low frets', () => {
    expect(positions([28, 31, 33])).toEqual([
      [0, 0],
      [0, 3],
      [1, 0],
    ]);
  });

  it('stays in position instead of jumping to the lowest fret and back', () => {
    // C#3 E2 C#3: the E is under the hand at the 7th fret of the A string,
    // though the D string plays it at the 2nd.
    expect(positions([49, 40, 49])).toEqual([
      [3, 6],
      [1, 7],
      [3, 6],
    ]);
  });

  it('lets the hand move during a long rest', () => {
    expect(positions([49, 40], 4)).toEqual([
      [3, 6],
      [2, 2],
    ]);
  });

  it('puts simultaneous notes on separate strings, low to high', () => {
    const [low, high] = suggestFingering(
      [
        { pitch: 40, time: 1 },
        { pitch: 47, time: 1 },
      ],
      OPEN,
    );
    expect(high.string).toBeGreaterThan(low.string);
    expect(OPEN[low.string] + low.fret).toBe(40);
    expect(OPEN[high.string] + high.fret).toBe(47);
  });
});

describe('midiToArrangement', () => {
  it('lays beats on the tempo map and completes the last bar', () => {
    const arrangement = midiToArrangement(
      midi({
        tempos: [
          { tick: 0, microsPerQuarter: 500_000 },
          { tick: 4 * QUARTER, microsPerQuarter: 1_000_000 },
        ],
        notes: [note({ pitch: 40, startTick: 5 * QUARTER })],
        endTick: 6 * QUARTER,
      }),
      0,
    );
    expect(arrangement.beats.map((b) => [b.time, b.measure, b.beat])).toEqual([
      [0, 0, 0],
      [0.5, 0, 1],
      [1, 0, 2],
      [1.5, 0, 3],
      [2, 1, 0],
      [3, 1, 1],
      [4, 1, 2],
      [5, 1, 3],
    ]);
    expect(arrangement.levels[0].notes[0]).toMatchObject({
      time: 3,
      sustain: 1,
    });
    expect(arrangement.metadata.songLength).toBe(4);
  });

  it('follows time signature changes, with the signature unit as the beat', () => {
    const arrangement = midiToArrangement(
      midi({
        timeSignatures: [
          { tick: 0, numerator: 3, denominator: 4 },
          { tick: 3 * QUARTER, numerator: 6, denominator: 8 },
        ],
        notes: [note({ pitch: 40 })],
        endTick: 6 * QUARTER,
      }),
      0,
    );
    const chart = buildBassChart({
      id: 'abc',
      sourceFileName: 'x.mid',
      importedAt: '2026-10-01T00:00:00.000Z',
      metadata: { title: 'X', artist: '', album: '', year: null },
      arrangement,
      source: 'midi',
    });
    expect(chart.bars.map((b) => [b.startTime, b.beatCount])).toEqual([
      [0, 3],
      [1.5, 6],
    ]);
    expect(chart.source).toBe('midi');
    expect(timeSignatures(chart)).toEqual(['3/4', '6/4']);
  });

  it('turns markers into sections, or one section for the whole song', () => {
    const notes = [note({ pitch: 40 })];
    const marked = midiToArrangement(
      midi({
        markers: [
          { tick: 0, text: 'intro' },
          { tick: 4 * QUARTER, text: 'verse' },
        ],
        notes,
        endTick: 8 * QUARTER,
      }),
      0,
    );
    expect(marked.sections).toEqual([
      { name: 'intro', startTime: 0, endTime: 2 },
      { name: 'verse', startTime: 2, endTime: 4 },
    ]);
    const plain = midiToArrangement(midi({ notes, endTick: 8 * QUARTER }), 0);
    expect(plain.sections).toEqual([
      { name: 'Música', startTime: 0, endTime: 4 },
    ]);
  });

  it('keeps only the chosen channel and marks bent notes', () => {
    const arrangement = midiToArrangement(
      midi({
        notes: [
          note({ channel: 9, pitch: 36 }),
          note({ channel: 2, pitch: 33, bent: true }),
        ],
        endTick: QUARTER,
      }),
      2,
    );
    expect(arrangement.levels[0].notes).toHaveLength(1);
    expect(arrangement.levels[0].notes[0]).toMatchObject({
      string: 1,
      fret: 0,
      mask: 0x1000,
    });
  });

  it('lowers the tuning to reach notes below the open E', () => {
    const tuningFor = (pitch: number) =>
      midiToArrangement(
        midi({
          notes: [note({ pitch }), note({ pitch: 45 })],
          endTick: QUARTER,
        }),
        0,
      );
    expect(tuningFor(28).metadata.tuning).toEqual([0, 0, 0, 0]);
    // Drop D: only the fourth string moves.
    const dropD = tuningFor(26);
    expect(dropD.metadata.tuning).toEqual([-2, 0, 0, 0]);
    expect(dropD.levels[0].notes[0]).toMatchObject({ string: 0, fret: 0 });
    // A five-string's low B: every string a fourth down.
    expect(tuningFor(23).metadata.tuning).toEqual([-5, -5, -5, -5]);
  });
});
