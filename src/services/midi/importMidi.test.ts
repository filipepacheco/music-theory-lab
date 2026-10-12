import { describe, expect, it } from 'vitest';
import { isDrumChart, type DrumChart } from '@/domain/drumChart';
import { parseChart } from '@/domain/bassChartRecord';
import { dynamicsByVelocity } from '@/domain/midiDrumChart';
import { importMidi, midiImportErrorMessage } from '@/services/midi/importMidi';
import type { MidiFile, MidiNote } from '@/services/midi/midiFile';

type Event = [delta: number, ...bytes: number[]];

function chunk(tag: string, body: number[]): number[] {
  const n = body.length;
  return [
    ...tag.split('').map((c) => c.charCodeAt(0)),
    (n >> 24) & 0xff,
    (n >> 16) & 0xff,
    (n >> 8) & 0xff,
    n & 0xff,
    ...body,
  ];
}

// Deltas stay under 128 ticks, so each is one byte.
function midiBytes(events: Event[]): Uint8Array<ArrayBuffer> {
  const body = events.flatMap(([delta, ...bytes]) => [delta, ...bytes]);
  return Uint8Array.from([
    ...chunk('MThd', [0, 0, 0, 1, 0, 96]),
    ...chunk('MTrk', [...body, 0, 0xff, 0x2f, 0]),
  ]);
}

const BASS: Event[] = [
  [0, 0xc0, 33],
  [0, 0x90, 40, 90],
  [48, 0x80, 40, 0],
  [0, 0x90, 43, 90],
  [48, 0x80, 43, 0],
];
const DRUMS: Event[] = [
  [0, 0x99, 36, 100],
  [48, 0x89, 36, 0],
  [0, 0x99, 38, 100],
  [48, 0x89, 38, 0],
];

function file(events: Event[], name = 'Teste - Artista.mid') {
  const bytes = midiBytes(events);
  const blob = new Blob([bytes as BlobPart]) as Blob & { name: string };
  return Object.assign(blob, { name });
}

describe('MIDI import with a drum part', () => {
  it('a file with bass and percussion gives two charts, the bass first', async () => {
    const { charts, audio } = await importMidi(file([...BASS, ...DRUMS]));
    expect(audio).toBeNull();
    expect(charts.map((c) => (isDrumChart(c) ? 'drums' : 'bass'))).toEqual([
      'bass',
      'drums',
    ]);
    const drums = charts[1] as DrumChart;
    expect(drums.source).toBe('midi');
    expect(drums.hits.map((h) => h.piece)).toEqual(['bumbo', 'caixa']);
    expect(drums.hits.map((h) => h.midi)).toEqual([36, 38]);
    expect(drums.id).not.toBe(charts[0].id);
    for (const chart of charts) expect(parseChart(chart)).not.toBeNull();
  });

  it('a file with only percussion gives one drum chart', async () => {
    const { charts } = await importMidi(file(DRUMS));
    expect(charts).toHaveLength(1);
    expect(isDrumChart(charts[0])).toBe(true);
    expect(parseChart(charts[0])).not.toBeNull();
  });

  it('a file with no bass and no percussion gives an error message', async () => {
    const error = await importMidi(file([[0, 0xc0, 0]])).catch((e) => e);
    expect(midiImportErrorMessage(error)).toBe(
      'Este MIDI não tem baixo nem bateria.',
    );
  });

  it('a new import of a file held as a bass chart gives the same bass chart and adds only the drum chart', async () => {
    const events = [...BASS, ...DRUMS];
    const bytes = midiBytes(events);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    const fileHash = Array.from(new Uint8Array(digest), (b) =>
      b.toString(16).padStart(2, '0'),
    ).join('');
    const now = new Date('2026-01-01T00:00:00Z');
    const first = await importMidi(file(events), now);
    const again = await importMidi(file(events), new Date('2026-02-01'));
    // The id of the bass chart is the hash of the file, as before the drums.
    expect(first.charts[0].id).toBe(fileHash);
    expect(again.charts[0]).toEqual({
      ...first.charts[0],
      importedAt: '2026-02-01T00:00:00.000Z',
    });
    expect(first.charts.slice(1).map((c) => c.id)).not.toContain(fileHash);
    expect(first.charts.filter(isDrumChart)).toHaveLength(1);
  });
});

describe('dynamicsByVelocity', () => {
  const hit = (pitch: number, velocity: number): MidiNote => ({
    channel: 9,
    pitch,
    velocity,
    startTick: 0,
    endTick: 1,
    bent: false,
  });
  const midi = (notes: MidiNote[]) => ({ notes }) as MidiFile;

  it('a hit much softer than the usual intensity of its piece is a ghost note', () => {
    const notes = [hit(38, 100), hit(38, 100), hit(38, 100), hit(38, 40)];
    expect(dynamicsByVelocity(midi(notes))(notes[3])).toBe('ghost');
  });

  it('a hit much louder than the usual intensity of its piece is an accent', () => {
    const notes = [hit(38, 70), hit(38, 70), hit(38, 70), hit(38, 120)];
    expect(dynamicsByVelocity(midi(notes))(notes[3])).toBe('accent');
  });

  it('compares each piece with itself and keeps near hits normal', () => {
    const notes = [hit(36, 120), hit(38, 60), hit(38, 64), hit(36, 118)];
    const dynamic = dynamicsByVelocity(midi(notes));
    expect(notes.map(dynamic)).toEqual([
      'normal',
      'normal',
      'normal',
      'normal',
    ]);
    expect(dynamic(hit(36, 60))).toBe('ghost');
  });
});
