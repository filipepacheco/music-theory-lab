import { describe, expect, it } from 'vitest';
import {
  activeNoteIndexes,
  barIndexAt,
  barsRepeatingAbove,
  buildBassChart,
  degreeLanePlaces,
  lineBeatWidth,
  neededBeatWidth,
  sectionBeatWidth,
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
  type LabelLane,
} from '@/domain/bassChart';
import { fixtureChart, type NoteSpec } from '@/domain/bassChartFixture';
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

  describe('beat width of a line', () => {
    const line = {
      lineWidth: 1000,
      barsPerLine: 4,
      beatCount: 4,
      barChrome: 16,
      gap: 4,
      baseBeatWidth: 34,
    };
    const lineUsed = (l: typeof line) =>
      l.barsPerLine * (l.barChrome + l.beatCount * lineBeatWidth(l)) +
      (l.barsPerLine - 1) * l.gap;

    it('shares the full width of the line between its bars', () => {
      // 1000 - 3 gaps - 4 × 16 of chrome = 924 over 16 beats.
      expect(lineBeatWidth(line)).toBe(57.75);
      expect(lineUsed(line)).toBe(1000);
    });

    it('gives narrower beats to a longer line length', () => {
      const five = { ...line, barsPerLine: 5 };
      // 904 / 20 = 45.2, rounded down to 1/64 px.
      expect(lineBeatWidth(five)).toBe(45.1875);
      expect(lineUsed(five)).toBeLessThanOrEqual(1000);
      expect(lineUsed(five)).toBeGreaterThan(999);
    });

    it('follows the line width', () => {
      expect(lineBeatWidth({ ...line, lineWidth: 800 })).toBe(45.25);
    });

    it('never overflows the line when the share is not exact', () => {
      const odd = { ...line, lineWidth: 997, barsPerLine: 3, beatCount: 7 };
      expect(lineUsed(odd)).toBeLessThanOrEqual(997);
      expect(lineUsed(odd)).toBeGreaterThan(996);
    });

    it('stops at three times the base width, leaving the line free space', () => {
      const short = { ...line, barsPerLine: 1 };
      expect(lineBeatWidth(short)).toBe(102);
      expect(lineUsed(short)).toBeLessThan(1000);
    });

    it('narrows the beats to keep the line length', () => {
      const tight = { ...line, lineWidth: 600 };
      // 600 - 12 - 64 = 524 over 16 beats, under the base 34.
      expect(lineBeatWidth(tight)).toBe(32.75);
      expect(lineUsed(tight)).toBe(600);
    });

    it('has no lower limit for a dense section: the line length holds', () => {
      // 375 px, 8 bars of 4 beats: (375 - 28 - 128) / 32 beats = 6.84 px.
      const dense = { ...line, lineWidth: 375, barsPerLine: 8 };
      expect(lineBeatWidth(dense)).toBe(6.84375);
      expect(lineBeatWidth(dense)).toBeLessThan(34 * 0.8);
      expect(lineUsed(dense)).toBeLessThanOrEqual(375);
      expect(lineUsed(dense)).toBeGreaterThan(374);
    });

    it('widens each beat when the widest bar has fewer beats', () => {
      expect(lineBeatWidth({ ...line, beatCount: 3 })).toBe(77);
    });
  });

  describe('needed beat width', () => {
    const lane = (labels: [number, number][]) => ({
      charWidth: 6,
      labels: labels.map(([beat, chars]) => ({ beat, chars })),
    });

    it('is zero without two labels in a lane', () => {
      expect(neededBeatWidth([], 4)).toBe(0);
      expect(neededBeatWidth([lane([[0, 2]])], 4)).toBe(0);
    });

    it('keeps the nearest pair of one lane clear of touching', () => {
      // Two digits (12 px) + 4 px gap over a third of a beat.
      const needed = neededBeatWidth(
        [
          lane([
            [0, 1],
            [1, 2],
            [1 + 1 / 3, 2],
          ]),
        ],
        4,
      );
      expect(needed).toBeCloseTo(48);
      // The first label ends before the next one starts.
      expect(1 * 6 <= (1 / 3) * needed).toBe(true);
      expect(2 * 6 + 4 <= (1 / 3) * needed + 1e-9).toBe(true);
    });

    it('takes the widest need of all lanes and ignores one beat', () => {
      const sparse = lane([
        [0, 1],
        [2, 1],
      ]);
      const dense = lane([
        [0, 2],
        [0.5, 1],
      ]);
      expect(neededBeatWidth([sparse, dense], 4)).toBe(32);
      expect(
        neededBeatWidth(
          [
            lane([
              [1, 1],
              [1, 2],
            ]),
          ],
          4,
        ),
      ).toBe(0);
    });

    it('sizes a section from base and need, to three times the base', () => {
      expect(sectionBeatWidth(34, 0)).toBe(34);
      expect(sectionBeatWidth(34, 20)).toBe(34);
      expect(sectionBeatWidth(34, 50)).toBe(50);
      expect(sectionBeatWidth(34, 500)).toBe(102);
    });

    it('ignores the need of a section when a line length is set', () => {
      const line = {
        lineWidth: 600,
        barsPerLine: 4,
        beatCount: 4,
        barChrome: 16,
        gap: 4,
        baseBeatWidth: 34,
      };
      expect(lineBeatWidth(line)).toBe(32.75);
    });
  });

  describe('degree lane levels', () => {
    const CHAR = 6;
    const GAP = 4;
    const BASE = 34;
    const lane = (labels: [number, number][]): LabelLane => ({
      charWidth: CHAR,
      labels: labels.map(([beat, chars]) => ({ beat, chars })),
    });
    /** Pairs of labels on one level whose boxes overlap. */
    const overlaps = (l: LabelLane, beatWidth: number): number => {
      const places = degreeLanePlaces(l, beatWidth, GAP);
      let count = 0;
      for (let a = 0; a < places.length; a += 1) {
        for (let b = a + 1; b < places.length; b += 1) {
          if (places[a].level !== places[b].level) continue;
          const [left, right] = places[a].x <= places[b].x ? [a, b] : [b, a];
          const leftEnd = places[left].x + l.labels[left].chars * CHAR;
          if (leftEnd > places[right].x + 1e-9) count += 1;
        }
      }
      return count;
    };

    it('keeps a label with enough space on the first level, at its note', () => {
      // Two characters (12 px) and the 4 px gap fit in half a beat of 34 px.
      const places = degreeLanePlaces(
        lane([
          [0, 1],
          [0.5, 2],
          [1, 2],
          [3, 3],
        ]),
        BASE,
        GAP,
      );
      expect(places).toEqual([
        { level: 0, x: 0, shift: 0 },
        { level: 0, x: 17, shift: 0 },
        { level: 0, x: 34, shift: 0 },
        { level: 0, x: 102, shift: 0 },
      ]);
    });

    it('moves a label that touches the label before it to the second level', () => {
      // Sixteenths at 34 px a beat are 8.5 px apart: a 12 px label touches.
      const places = degreeLanePlaces(
        lane([
          [0, 2],
          [0.25, 2],
          [0.5, 2],
          [0.75, 2],
          [2, 2],
        ]),
        BASE,
        GAP,
      );
      expect(places.map((p) => p.level)).toEqual([0, 1, 0, 1, 0]);
      // A second level is enough: no label moves.
      expect(places.map((p) => p.shift)).toEqual([0, 0, 0, 0, 0]);
      expect(places.map((p) => p.x)).toEqual([0, 8.5, 17, 25.5, 68]);
    });

    it('counts a label under the gap away as touching', () => {
      // A 12 px label then 3 px of space: closer than the 4 px gap.
      const near = lane([
        [0, 2],
        [15 / BASE, 1],
      ]);
      expect(degreeLanePlaces(near, BASE, GAP)[1].level).toBe(1);
      const clear = lane([
        [0, 2],
        [16 / BASE, 1],
      ]);
      expect(degreeLanePlaces(clear, BASE, GAP)[1].level).toBe(0);
    });

    it('moves a label right by the missing distance at the largest width', () => {
      // Three characters (18 px + 4 px) at twelfths of a 102 px beat: the
      // third label is 17 px after the first, 5 px short of the 22 it needs.
      const places = degreeLanePlaces(
        lane([
          [0, 3],
          [1 / 12, 3],
          [2 / 12, 3],
          [3 / 12, 3],
          [2, 3],
        ]),
        BASE * 3,
        GAP,
      );
      expect(places[0]).toEqual({ level: 0, x: 0, shift: 0 });
      expect(places[1]).toEqual({ level: 1, x: 8.5, shift: 0 });
      expect(places[2].level).toBe(0);
      expect(places[2].shift).toBeCloseTo(5);
      expect(places[2].x).toBeCloseTo(22);
      // The move carries on: the fourth label clears the second by 22 px.
      expect(places[3].level).toBe(1);
      expect(places[3].x).toBeCloseTo(30.5);
      expect(places[3].shift).toBeCloseTo(5);
      // A label with space is back at its note.
      expect(places[4]).toEqual({ level: 0, x: 204, shift: 0 });
    });

    it('moves on the level where the missing distance is smaller', () => {
      const places = degreeLanePlaces(
        lane([
          [0, 5],
          [0.1, 1],
          [0.15, 2],
        ]),
        BASE * 3,
        GAP,
      );
      // Level 1 is free again at 34 px, level 2 at 20.2 px; the note is at
      // 15.3 px.
      expect(places[2].level).toBe(1);
      expect(places[2].x).toBeCloseTo(20.2);
    });

    it('answers in the order of the labels, whatever their order in time', () => {
      const places = degreeLanePlaces(
        lane([
          [0.25, 2],
          [0, 2],
        ]),
        BASE,
        GAP,
      );
      expect(places).toEqual([
        { level: 1, x: 8.5, shift: 0 },
        { level: 0, x: 0, shift: 0 },
      ]);
    });

    describe('at the needed beat width of a section', () => {
      const sixteenths = lane(
        Array.from({ length: 16 }, (_, i) => [i / 4, 1 + (i % 3)]),
      );
      const thirtySeconds = lane(
        Array.from({ length: 32 }, (_, i) => [i / 8, 1 + (i % 3)]),
      );
      // The finest grid of a chart: twelfths of a beat, with double stops.
      const twelfths = lane(
        Array.from({ length: 48 }, (_, i) => [i / 12, 1 + ((i * 7) % 5)]),
      );
      const dense = { sixteenths, thirtySeconds, twelfths };

      it.each(Object.entries(dense))(
        'no two label boxes of the degree lane overlap: %s',
        (_, l) => {
          const needed = neededBeatWidth([l], GAP);
          const line = {
            lineWidth: 375,
            barsPerLine: 2,
            beatCount: 4,
            barChrome: 16,
            gap: 4,
            baseBeatWidth: BASE,
          };
          // The widths where labels never touch: the automatic layout, and a
          // line length with room to spare (a tighter one may touch).
          const widths = [
            sectionBeatWidth(BASE, needed),
            lineBeatWidth({ ...line, lineWidth: 1600, barsPerLine: 1 }),
          ];
          for (const width of widths) expect(overlaps(l, width)).toBe(0);
        },
      );

      it('uses one level, with no move, when the width is not capped', () => {
        const needed = neededBeatWidth([sixteenths], GAP);
        // Three characters and the gap over a quarter beat: 88 px, under 102.
        expect(needed).toBe(88);
        const places = degreeLanePlaces(
          sixteenths,
          sectionBeatWidth(BASE, needed),
          GAP,
        );
        expect(places.every((p) => p.level === 0 && p.shift === 0)).toBe(true);
      });

      it('uses the second level when the need is over the largest width', () => {
        const needed = neededBeatWidth([thirtySeconds], GAP);
        expect(needed).toBeGreaterThan(BASE * 3);
        const width = sectionBeatWidth(BASE, needed);
        expect(width).toBe(BASE * 3);
        const places = degreeLanePlaces(thirtySeconds, width, GAP);
        expect(new Set(places.map((p) => p.level))).toEqual(new Set([0, 1]));
        // Two levels are enough for thirty-seconds: no label moves.
        expect(places.every((p) => p.shift === 0)).toBe(true);
      });

      it('moves labels only when two levels are not enough', () => {
        const width = sectionBeatWidth(BASE, neededBeatWidth([twelfths], GAP));
        const places = degreeLanePlaces(twelfths, width, GAP);
        expect(places.some((p) => p.shift > 0)).toBe(true);
        expect(overlaps(twelfths, width)).toBe(0);
      });
    });
  });

  it('finds bars that repeat the one above them', () => {
    // Bars 0-3, then the same four bars again, except that bar 6 gains a
    // dead note where bar 2 is empty and bar 7 moves its last note.
    const line = (offset: number): NoteSpec[] => [
      { bar: offset, beat: 0, string: 1, fret: 5 },
      { bar: offset, beat: 2, string: 1, fret: 5 },
      { bar: offset + 1, beat: 0, string: 0, fret: 3 },
      { bar: offset + 3, beat: 0, string: 1, fret: 7 },
      { bar: offset + 3, beat: 3, string: 1, fret: 7 },
    ];
    const specs = [...line(0), ...line(4)];
    specs.push({ bar: 6, beat: 1, string: 2, fret: 2, techniques: ['mute'] });
    specs[specs.length - 2] = { bar: 7, beat: 3.5, string: 1, fret: 7 };
    const built = fixtureChart(8, specs);
    const [block] = sectionBlocks(built);

    expect([...barsRepeatingAbove(built, block, 4)]).toEqual([
      [4, 0],
      [5, 1],
    ]);
    // Drawn two to a line, nothing sits under an identical bar.
    expect(barsRepeatingAbove(built, block, 2).size).toBe(0);
  });

  it('labels sections and tunings for display', () => {
    expect(sectionLabel('verse')).toBe('Verso');
    expect(sectionLabel('')).toBe('Início');
    expect(sectionLabel('weirdpart')).toBe('Weirdpart');
    expect(tuningLabel([0, 0, 0, 0])).toBe('E A D G');
    expect(tuningLabel([-2, 0, 0, 0])).toBe('D A D G');
  });
});
