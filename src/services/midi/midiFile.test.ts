import { describe, expect, it } from 'vitest';
import { MidiError, parseMidi } from '@/services/midi/midiFile';

type Event = [delta: number, ...bytes: number[]];

function variableLength(value: number): number[] {
  const bytes = [value & 0x7f];
  for (let rest = value >> 7; rest > 0; rest >>= 7) {
    bytes.unshift((rest & 0x7f) | 0x80);
  }
  return bytes;
}

function chunk(tag: string, body: number[]): number[] {
  const length = body.length;
  return [
    ...tag.split('').map((c) => c.charCodeAt(0)),
    (length >> 24) & 0xff,
    (length >> 16) & 0xff,
    (length >> 8) & 0xff,
    length & 0xff,
    ...body,
  ];
}

function track(events: Event[]): number[] {
  return chunk(
    'MTrk',
    events.flatMap(([delta, ...bytes]) => [...variableLength(delta), ...bytes]),
  );
}

function file(format: number, division: number, tracks: Event[][]): Uint8Array {
  return new Uint8Array([
    ...chunk('MThd', [
      0,
      format,
      0,
      tracks.length,
      division >> 8,
      division & 0xff,
    ]),
    ...tracks.flatMap(track),
  ]);
}

const END: Event = [0, 0xff, 0x2f, 0];

function errorOf(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    if (error instanceof MidiError) return error.message;
    throw error;
  }
  return 'no error';
}

describe('parseMidi', () => {
  it('reads notes, running status and a note-on with velocity 0 as a release', () => {
    const midi = parseMidi(
      file(0, 480, [
        [
          [0, 0xc2, 33],
          [0, 0x92, 40, 100],
          // Running status: no status byte on the next two events.
          [480, 40, 0],
          [0, 43, 90],
          [240, 0x82, 43, 0],
          [240, 0xff, 0x2f, 0],
        ],
      ]),
    );
    expect(midi.ticksPerQuarter).toBe(480);
    expect(midi.programs).toEqual({ 2: 33 });
    expect(midi.notes).toEqual([
      {
        channel: 2,
        pitch: 40,
        velocity: 100,
        startTick: 0,
        endTick: 480,
        bent: false,
      },
      {
        channel: 2,
        pitch: 43,
        velocity: 90,
        startTick: 480,
        endTick: 720,
        bent: false,
      },
    ]);
    expect(midi.endTick).toBe(960);
  });

  it('reads the tempo map, time signatures and markers', () => {
    const midi = parseMidi(
      file(0, 480, [
        [
          [0, 0xff, 0x51, 3, 0x06, 0x8a, 0x1b],
          [0, 0xff, 0x58, 4, 6, 3, 24, 8],
          [0, 0xff, 0x06, 5, ...'Verse'.split('').map((c) => c.charCodeAt(0))],
          [960, 0xff, 0x51, 3, 0x07, 0xa1, 0x20],
          END,
        ],
      ]),
    );
    expect(midi.tempos).toEqual([
      { tick: 0, microsPerQuarter: 428571 },
      { tick: 960, microsPerQuarter: 500000 },
    ]);
    expect(midi.timeSignatures).toEqual([
      { tick: 0, numerator: 6, denominator: 8 },
    ]);
    expect(midi.markers).toEqual([{ tick: 0, text: 'Verse' }]);
  });

  it('merges the tracks of a format 1 file in time order', () => {
    const midi = parseMidi(
      file(1, 96, [
        [[0, 0xff, 0x51, 3, 0x07, 0xa1, 0x20], END],
        [[96, 0x90, 60, 80], [96, 0x80, 60, 0], END],
        [[0, 0x91, 36, 80], [48, 0x81, 36, 0], END],
      ]),
    );
    expect(midi.notes.map((n) => [n.channel, n.startTick, n.endTick])).toEqual([
      [1, 0, 48],
      [0, 96, 192],
    ]);
    expect(midi.endTick).toBe(192);
  });

  it('flags a note the pitch wheel moved under, and one started bent', () => {
    const midi = parseMidi(
      file(0, 480, [
        [
          [0, 0x90, 40, 100],
          [120, 0xe0, 0x00, 0x50],
          [120, 0x80, 40, 0],
          [0, 0x90, 42, 100],
          [240, 0x80, 42, 0],
          [0, 0xe0, 0x00, 0x40],
          [0, 0x90, 43, 100],
          [240, 0x80, 43, 0],
          END,
        ],
      ]),
    );
    expect(midi.notes.map((n) => n.bent)).toEqual([true, true, false]);
  });

  it('ends a note that is never released where its track ends', () => {
    const midi = parseMidi(
      file(0, 480, [
        [
          [0, 0x90, 40, 100],
          [960, ...END.slice(1)],
        ],
      ]),
    );
    expect(midi.notes[0].endTick).toBe(960);
  });

  it('rejects files it cannot chart', () => {
    expect(errorOf(() => parseMidi(new Uint8Array(40)))).toBe('not-midi');
    expect(errorOf(() => parseMidi(file(0, 0xe728, [[END]])))).toBe(
      'unsupported',
    );
    expect(errorOf(() => parseMidi(file(2, 480, [[END]])))).toBe('unsupported');
    // A note-on cut off before its velocity byte.
    expect(errorOf(() => parseMidi(file(0, 480, [[[0, 0x90, 40]]])))).toBe(
      'corrupt',
    );
  });
});
