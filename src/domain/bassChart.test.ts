import { describe, expect, it } from 'vitest';
import {
  activeNoteIndexes,
  barIndexAt,
  buildBassChart,
  fittedBarsPerRow,
  hardestNotes,
  midiNoteName,
  sectionBlocks,
  sectionLabel,
  sectionRows,
  TICKS_PER_BEAT,
  timeSignatures,
  tuningLabel,
  type BassChart,
  type BassChartSectionBlock,
} from '@/domain/bassChart';
import type { SngArrangement, SngNote } from '@/services/rocksmith/sng';

const BEAT = 0.5;

function note(partial: Partial<SngNote> & { time: number }): SngNote {
  return {
    mask: 0,
    string: 1,
    fret: 2,
    chordId: -1,
    phraseIterationId: 0,
    slideTo: -1,
    slideUnpitchTo: -1,
    sustain: 0,
    ...partial,
  };
}

/**
 * Bars of `beatsPerBar` beats at 120 bpm starting at t=0: two 4/4 bars of
 * count-in, two 7/4 bars of riff, then a lone closing beat.
 */
function arrangement(overrides: Partial<SngArrangement> = {}): SngArrangement {
  const beatsPerBar = [4, 4, 7, 7, 1];
  const beats: SngArrangement['beats'] = [];
  let time = 0;
  beatsPerBar.forEach((count, measure) => {
    for (let beat = 0; beat < count; beat += 1) {
      beats.push({ time, measure, beat });
      time += BEAT;
    }
  });
  const riffStart = 8 * BEAT;
  return {
    beats,
    phrases: [
      { name: 'count', maxDifficulty: 0 },
      { name: 'riff', maxDifficulty: 2 },
    ],
    chordTemplates: [{ name: 'B5', frets: [-1, 2, 4, -1, -1, -1] }],
    phraseIterations: [
      { phraseId: 0, startTime: 0 },
      { phraseId: 1, startTime: riffStart },
    ],
    sections: [
      { name: 'intro', startTime: riffStart, endTime: riffStart + 7 * BEAT },
      { name: 'intro', startTime: riffStart + 7 * BEAT, endTime: 22 * BEAT },
    ],
    levels: [
      {
        difficulty: 0,
        notes: [note({ time: riffStart, phraseIterationId: 1, fret: 9 })],
      },
      {
        difficulty: 2,
        notes: [
          note({ time: riffStart, phraseIterationId: 1, sustain: 0.1 }),
          // A swung offbeat: two thirds of the way through beat 2.
          note({
            time: riffStart + (1 + 2 / 3) * BEAT,
            phraseIterationId: 1,
            string: 3,
            fret: 4,
            mask: 0x20000,
          }),
          note({
            time: riffStart + 7 * BEAT,
            phraseIterationId: 1,
            chordId: 0,
          }),
          note({
            time: riffStart + 12 * BEAT,
            phraseIterationId: 1,
            string: 0,
            fret: 4,
            slideTo: 5,
            sustain: 2,
          }),
        ],
      },
    ],
    metadata: {
      songLength: 22 * BEAT,
      capoFret: -1,
      tuning: [0, 0, 0, 0, 0, 0],
    },
    ...overrides,
  };
}

function chart(sng = arrangement()): BassChart {
  return buildBassChart({
    id: 'abc',
    sourceFileName: 'x_p.psarc',
    importedAt: '2026-09-28T00:00:00.000Z',
    metadata: { title: 'Money', artist: 'Pink Floyd', album: '', year: 1973 },
    arrangement: sng,
  });
}

describe('hardestNotes', () => {
  it('takes each phrase iteration from its hardest level and expands chords', () => {
    const notes = hardestNotes(arrangement());
    expect(notes.map((n) => [n.string, n.fret])).toEqual([
      [1, 2],
      [3, 4],
      [1, 2],
      [2, 4],
      [0, 4],
    ]);
  });

  it('skips iterations whose level is missing', () => {
    const sng = arrangement({
      phrases: [
        { name: 'count', maxDifficulty: 0 },
        { name: 'riff', maxDifficulty: 9 },
      ],
    });
    expect(hardestNotes(sng)).toEqual([]);
  });
});

describe('buildBassChart', () => {
  const built = chart();

  it('builds bars from downbeats', () => {
    expect(built.bars.map((b) => b.beatCount)).toEqual([4, 4, 7, 7, 1]);
    expect(built.bars[2].startTime).toBe(4);
    expect(built.bars[4].endTime).toBe(11.5);
    expect(timeSignatures(built)).toEqual(['4/4', '7/4']);
  });

  it('places notes on the beat grid, snapping to twelfths of a beat', () => {
    expect(
      built.notes.map((n) => [n.bar, n.beatInBar * TICKS_PER_BEAT]),
    ).toEqual([
      [2, 0],
      [2, 20],
      [3, 0],
      [3, 0],
      [3, 60],
    ]);
  });

  it('derives pitch, techniques and slides', () => {
    expect(built.notes.map((n) => midiNoteName(n.midi))).toEqual([
      'B1',
      'B2',
      'B1',
      'F#2',
      'G#1',
    ]);
    expect(built.notes[1].techniques).toEqual(['mute']);
    expect(built.notes[4].slideToFret).toBe(5);
  });

  it('holds a note until the next onset, capped at max(sustain, one beat)', () => {
    const [first, swung, chordLow, chordHigh, last] = built.notes;
    // 0.83 s to the next onset, but an unsustained note stops after a beat.
    expect(first.endTime).toBeCloseTo(first.time + BEAT);
    expect(swung.endTime).toBeCloseTo(swung.time + BEAT);
    expect(chordLow.endTime).toBeCloseTo(chordLow.time + BEAT);
    expect(chordHigh.endTime).toBe(chordLow.endTime);
    expect(last.endTime).toBeCloseTo(last.time + 2);
  });

  it('merges repeated section names and covers the lead-in', () => {
    expect(built.sections).toEqual([
      { name: '', parts: 1, startBar: 0, endBar: 2 },
      { name: 'intro', parts: 2, startBar: 2, endBar: 5 },
    ]);
  });

  it('uses the median beat for tempo', () => {
    expect(built.averageTempoBpm).toBe(120);
  });
});

describe('queries', () => {
  const built = chart();
  const times = built.notes.map((n) => n.time);

  it('finds the bar at a time', () => {
    expect(barIndexAt(built, -1)).toBe(-1);
    expect(barIndexAt(built, 0)).toBe(0);
    expect(barIndexAt(built, 4.1)).toBe(2);
    expect(barIndexAt(built, 99)).toBe(-1);
    expect(barIndexAt(built, Number.NaN)).toBe(-1);
  });

  it('reports sounding notes, including both notes of a double stop', () => {
    expect(activeNoteIndexes(built, times, 3.9)).toEqual([]);
    expect(activeNoteIndexes(built, times, 4.2)).toEqual([0]);
    expect(activeNoteIndexes(built, times, 7.6)).toEqual([2, 3]);
    // Past the cap, before the next onset: silence.
    expect(activeNoteIndexes(built, times, 8.2)).toEqual([]);
  });

  it('collapses runs of empty bars into rests', () => {
    const blocks = sectionBlocks(built);
    expect(blocks[0].items).toEqual([{ kind: 'rest', startBar: 0, count: 2 }]);
    expect(blocks[1].items).toEqual([
      { kind: 'bar', bar: 2 },
      { kind: 'bar', bar: 3 },
      { kind: 'bar', bar: 4 },
    ]);
    expect(blocks.map((b) => [b.occurrence, b.occurrenceTotal])).toEqual([
      [1, 1],
      [1, 1],
    ]);
  });

  it('breaks a section into lines of a chosen number of bars', () => {
    const bars = (from: number, to: number) =>
      Array.from({ length: to - from }, (_, i) => ({
        kind: 'bar' as const,
        bar: from + i,
      }));
    const block: BassChartSectionBlock = {
      section: { name: 'intro', parts: 1, startBar: 10, endBar: 26 },
      index: 0,
      colorIndex: 0,
      occurrence: 1,
      occurrenceTotal: 1,
      items: bars(10, 26),
    };
    expect(sectionRows(block, 8)).toEqual([bars(10, 18), bars(18, 26)]);
    expect(sectionRows(block, 5).map((row) => row.length)).toEqual([
      5, 5, 5, 1,
    ]);

    // Lines stay on the same bar numbers around a rest, which is never
    // split, and a line the rest fills on its own disappears.
    const rest = { kind: 'rest' as const, startBar: 12, count: 6 };
    const withRest = {
      ...block,
      items: [...bars(10, 12), rest, ...bars(18, 26)],
    };
    expect(sectionRows(withRest, 4)).toEqual([
      [...bars(10, 12), rest],
      bars(18, 22),
      bars(22, 26),
    ]);
  });

  it('halves a line length that does not fit the screen', () => {
    expect(fittedBarsPerRow(8, 9)).toBe(8);
    expect(fittedBarsPerRow(8, 7)).toBe(4);
    expect(fittedBarsPerRow(8, 3)).toBe(2);
    expect(fittedBarsPerRow(12, 7)).toBe(6);
    expect(fittedBarsPerRow(7, 6)).toBe(6);
    expect(fittedBarsPerRow(8, 0)).toBe(1);
  });

  it('labels sections and tunings for display', () => {
    expect(sectionLabel('verse')).toBe('Verso');
    expect(sectionLabel('')).toBe('Início');
    expect(sectionLabel('weirdpart')).toBe('Weirdpart');
    expect(tuningLabel([0, 0, 0, 0])).toBe('E A D G');
    expect(tuningLabel([-2, 0, 0, 0])).toBe('D A D G');
  });
});
