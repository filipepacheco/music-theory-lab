import { describe, expect, it } from 'vitest';
import { fixtureChart, walking } from '@/domain/bassChartFixture';
import { analyzeBassChart, barChordSymbol } from '@/domain/bassAnalysis';
import { analyzeHarmony, keyNoteNames } from '@/domain/bassHarmony';
import { STANDARD_OPEN_MIDI } from '@/domain/bassChart';
import { bassSynthNotes } from '@/services/bassSynthTransport';
import {
  canTransposeBassChart,
  DROP_D_TUNING,
  E_STANDARD_TUNING,
  transposeBassChart,
  transposeMusicalKey,
} from '@/domain/bassTransposition';

const original = {
  ...fixtureChart(
    3,
    walking([
      [38, 41, 45, 44],
      [43, 47, 50, 53],
      [48, 52, 55, 59],
    ]),
  ),
  source: 'gp' as const,
};

describe('MIDI/GP practice transposition', () => {
  it.each([{ tuning: E_STANDARD_TUNING }, { tuning: DROP_D_TUNING }])(
    'keeps every semitone playable in $tuning without changing pitch classes',
    ({ tuning }) => {
      const range = {
        ...fixtureChart(1, [
          { bar: 0, beat: 0, string: 0, fret: 0 },
          { bar: 0, beat: 1, string: 1, fret: 12 },
          { bar: 0, beat: 2, string: 3, fret: 24 },
        ]),
        source: 'midi' as const,
      };
      for (let shift = -12; shift <= 12; shift += 1) {
        expect(canTransposeBassChart(range, shift, tuning)).toBe(true);
        const result = transposeBassChart(range, shift, tuning);
        result.notes.forEach((note, i) => {
          expect(note.midi % 12).toBe((range.notes[i].midi + shift) % 12);
          expect(note.midi).toBe(
            STANDARD_OPEN_MIDI[note.string] + tuning[note.string] + note.fret,
          );
          expect(note.fret).toBeGreaterThanOrEqual(0);
          expect(note.fret).toBeLessThanOrEqual(24);
          expect(note.time).toBe(range.notes[i].time);
        });
      }
      expect(range.tuning).toEqual([0, 0, 0, 0]);
      expect(canTransposeBassChart(range, -13, tuning)).toBe(false);
    },
  );
  it.each([-1, 1])(
    'shifts chords and playback by %i semitone, preserving harmony',
    (shift) => {
      const chart = transposeBassChart(original, shift);
      const key = transposeMusicalKey(
        { tonic: 0, mode: 'major' as const },
        shift,
      );
      const analysis = analyzeBassChart(chart);
      const symbols = analysis.map((bar) =>
        barChordSymbol(bar, keyNoteNames(key)),
      );
      expect(symbols).toEqual(
        shift === 1 ? ['Ebm', 'Ab7', 'Dbmaj7'] : ['C#m', 'F#7', 'Bmaj7'],
      );
      const harmony = analyzeHarmony(chart, analysis, key);
      const before = analyzeHarmony(original, analyzeBassChart(original), {
        tonic: 0,
        mode: 'major',
      });
      expect(harmony.segments.map((s) => s.harmony.numeral)).toEqual(
        before.segments.map((s) => s.harmony.numeral),
      );
      expect(bassSynthNotes(chart.notes).map((n) => n.midi % 12)).toEqual(
        bassSynthNotes(original.notes).map((n) => (n.midi + shift + 12) % 12),
      );
      expect(chart.bars).toBe(original.bars);
      expect(chart.sections).toBe(original.sections);
      chart.notes.forEach((note, i) => {
        expect(note.midi).toBe(original.notes[i].midi + shift);
        expect(note.time).toBe(original.notes[i].time);
        expect(note.midi).toBe(
          STANDARD_OPEN_MIDI[note.string] +
            chart.tuning[note.string] +
            note.fret,
        );
      });
      expect(chart.tuning).toEqual(original.tuning);
    },
  );

  it('lowers an open E in E Standard by moving only the unreachable note up an octave', () => {
    const low = {
      ...fixtureChart(1, [
        { bar: 0, beat: 0, string: 0, fret: 0 },
        { bar: 0, beat: 1, string: 3, fret: 0 },
      ]),
      source: 'midi' as const,
    };
    expect(canTransposeBassChart(low, -2)).toBe(true);
    const chart = transposeBassChart(low, -2);
    expect(chart.notes.map((n) => n.midi)).toEqual([38, 41]);
    expect(chart.tuning).toEqual([0, 0, 0, 0]);
    chart.notes.forEach((note) => {
      expect(note.midi).toBe(STANDARD_OPEN_MIDI[note.string] + note.fret);
    });
    const sounds = bassSynthNotes(chart.notes, -2);
    expect(sounds.map((n) => n.midi + (n.transposeSemitones ?? 0))).toEqual([
      38, 41,
    ]);
    expect(low.tuning).toEqual([0, 0, 0, 0]);
    expect(transposeBassChart(low, 0)).toBe(low);
  });

  it('refingers E to D in explicit Drop D without moving the other strings', () => {
    const low = {
      ...fixtureChart(1, [
        { bar: 0, beat: 0, string: 0, fret: 0 },
        { bar: 0, beat: 1, string: 3, fret: 0 },
      ]),
      source: 'gp' as const,
    };
    const dropD = [-2, 0, 0, 0];
    expect(canTransposeBassChart(low, -2, dropD)).toBe(true);
    const chart = transposeBassChart(low, -2, dropD);
    expect(chart.tuning).toEqual(dropD);
    expect(chart.notes.map((n) => [n.midi, n.string, n.fret])).toEqual([
      [26, 0, 0],
      [41, 2, 3],
    ]);
    expect(transposeBassChart(low, -3, dropD).notes.map((n) => n.midi)).toEqual(
      [37, 40],
    );
    expect(low.tuning).toEqual([0, 0, 0, 0]);
  });

  it('ignores Rocksmith recordings and guards MIDI limits', () => {
    const rocksmith = { ...original, source: 'rocksmith' as const };
    expect(transposeBassChart(rocksmith, 1)).toBe(rocksmith);
    expect(canTransposeBassChart(rocksmith, 1)).toBe(false);
    expect(canTransposeBassChart(original, 13)).toBe(false);
    expect(() => transposeBassChart(original, 100)).toThrow(RangeError);
    expect(transposeMusicalKey({ tonic: 11, mode: 'minor' }, 1)).toEqual({
      tonic: 0,
      mode: 'minor',
    });
  });

  it('moves notes above the last fret down an octave without retuning', () => {
    const high = {
      ...fixtureChart(1, [{ bar: 0, beat: 0, string: 3, fret: 24 }]),
      source: 'midi' as const,
    };
    expect(canTransposeBassChart(high, 1)).toBe(true);
    const chart = transposeBassChart(high, 1);
    expect(chart.notes[0].midi).toBe(56);
    expect(chart.tuning).toEqual([0, 0, 0, 0]);
    expect(chart.notes[0].fret).toBeLessThanOrEqual(24);
  });
});
