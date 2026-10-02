import { describe, expect, it } from 'vitest';
import { NOTE_NAMES_FLAT } from '@/constants/notes';
import {
  analyzeBassChart,
  barChordSymbol,
  degreeLabel,
  describeEvidence,
  soundingMidi,
  summarizeBars,
  type BarAnalysis,
} from '@/domain/bassAnalysis';
import { fixtureChart as chart, walking } from '@/domain/bassChartFixture';

function labels(bar: BarAnalysis): string[] {
  return bar.notes.map(degreeLabel);
}

// Pitches: C2 = 36, so D2 38, G2 43, A2 45, C3 48.
const D2 = 38;
const F2 = 41;
const G2 = 43;
const AB2 = 44;
const A2 = 45;
const B2 = 47;
const C3 = 48;
const CS3 = 49;
const D3 = 50;
const EB3 = 51;
const E3 = 52;
const F3 = 53;
const FS3 = 54;
const G3 = 55;
const AB3 = 56;
const A3 = 57;
const B3 = 59;

describe('analyzeBassChart', () => {
  it('reads a walking ii–V–I–V7/ii as Dm, G7, Cmaj7, A7', () => {
    const bars = analyzeBassChart(
      chart(
        5,
        walking([
          [D2, F2, A2, AB2],
          [G2, B2, D3, F3],
          [C3, E3, G3, B3],
          [A2, CS3, E3, G3],
          [D3],
        ]),
      ),
    );
    expect(bars.map((bar) => barChordSymbol(bar))).toEqual([
      'Dm',
      'G7',
      'Cmaj7',
      'A7',
      'D',
    ]);
    expect(bars.map((b) => b.rootSource)).toEqual(Array(5).fill('downbeat'));
    // The A♭ is a half step into G on the next downbeat, not a b5 of D.
    expect(bars[0].notes.map((n) => n.role)).toEqual([
      'chordTone',
      'chordTone',
      'chordTone',
      'approach',
    ]);
    expect(labels(bars[0])).toEqual(['R', 'b3', '5', 'b5']);
    expect(bars[0].notes[3].category).toBe('ornament');
    expect(labels(bars[1])).toEqual(['R', '3', '5', 'b7']);
    expect(labels(bars[2])).toEqual(['R', '3', '5', '7']);
    expect(bars[1].counts).toEqual({
      root: 1,
      third: 1,
      fifth: 1,
      seventh: 1,
      tension: 0,
      ornament: 0,
    });
  });

  it('marks stepwise weak-beat notes as passing and leaves the quality open', () => {
    // C D E F | G: the major third is on beat 3, the fifth never sounds.
    const [bar] = analyzeBassChart(chart(2, walking([[C3, D3, E3, F3], [G3]])));
    expect(bar.notes.map((n) => n.role)).toEqual([
      'chordTone',
      'passing',
      'chordTone',
      'passing',
    ]);
    expect(bar.evidence.third).toBe('major');
    expect(bar.evidence.fifth).toBeNull();
    // Major or augmented: the bass does not say which.
    expect(bar.evidence.chordType).toBeNull();
    expect(barChordSymbol(bar)).toBe('C');
    expect(describeEvidence(bar.evidence)).toBe('3ª maior · sem 5ª · sem 7ª');
  });

  it('keeps a repeated root a root even when it leads into the next bar', () => {
    // B♭ for a whole bar, then A: the last B♭ is a half step above A.
    const [bar] = analyzeBassChart(chart(2, walking([[46, 46, 46, 46], [A2]])));
    expect(bar.notes.map((n) => n.role)).toEqual(Array(4).fill('chordTone'));
    expect(bar.counts.root).toBe(4);
  });

  it('marks a step out and back as a neighbour note', () => {
    const [bar] = analyzeBassChart(chart(1, walking([[C3, D3, C3, G3]])));
    expect(bar.notes[1].role).toBe('neighbor');
  });

  it('reads a pedal as all roots, never anticipating the same root', () => {
    const eighths = [0, 1].flatMap((bar) =>
      Array.from({ length: 8 }, (_, i) => ({ bar, beat: i / 2, midi: 40 })),
    );
    const bars = analyzeBassChart(chart(2, eighths));
    expect(bars[0].counts.root).toBe(8);
    expect(bars[0].motion).toEqual({ repeats: 7, steps: 0, leaps: 0 });
    expect(bars[1].motion.repeats).toBe(8);
  });

  it('takes a pushed note tied over the bar line as the next root', () => {
    const bars = analyzeBassChart(
      chart(2, [
        { bar: 0, beat: 0, midi: A2 },
        { bar: 0, beat: 1, midi: A2 },
        { bar: 0, beat: 2, midi: A2 },
        // On the "and" of 4, held for a beat and a half into bar 2.
        { bar: 0, beat: 3.5, midi: D3, sustain: 1.5 },
        { bar: 1, beat: 2, midi: A3 },
      ]),
    );
    expect(bars[1].root).toBe(D3 % 12);
    expect(bars[1].rootSource).toBe('tied');
    expect(bars[0].notes[3].role).toBe('anticipation');
    expect(labels(bars[1])).toEqual(['5']);
  });

  it('estimates the root when nothing sounds on the downbeat', () => {
    const [bar] = analyzeBassChart(
      chart(1, [
        { bar: 0, beat: 0, string: 1, fret: 5, techniques: ['mute'] },
        { bar: 0, beat: 1.5, midi: G2 },
        { bar: 0, beat: 2, midi: C3 },
      ]),
    );
    expect(bar.root).toBe(0);
    expect(bar.rootSource).toBe('estimated');
    expect(bar.notes[0]).toMatchObject({
      role: 'dead',
      midi: null,
      category: null,
    });
    expect(degreeLabel(bar.notes[0])).toBe('');
  });

  it('has no root for a bar with no sounding bass', () => {
    const bars = analyzeBassChart(chart(2, walking([[C3, E3, G3, E3]])));
    expect(bars[1].root).toBeNull();
    expect(barChordSymbol(bars[1])).toBeNull();
    expect(bars[1].evidence.chordType).toBeNull();
  });

  it('hears an off-beat half step into a beat as a chromatic approach', () => {
    // The blues b3 → 3: the major third is the chord tone.
    const [bar] = analyzeBassChart(
      chart(1, [
        { bar: 0, beat: 0, midi: C3 },
        { bar: 0, beat: 1.5, midi: EB3 },
        { bar: 0, beat: 2, midi: E3 },
        { bar: 0, beat: 3, midi: G3 },
      ]),
    );
    expect(bar.notes[1].role).toBe('approach');
    expect(bar.evidence.third).toBe('major');
    expect(bar.evidence.chordType).toBe('major');
  });

  it('names diminished chords only from the notes that prove them', () => {
    const [dim7, halfDim, onlyThird] = analyzeBassChart(
      chart(
        3,
        walking([
          [B2, D3, F3, AB3],
          [B2, D3, F3, A3],
          [B2, D3, B2, D3],
        ]),
      ),
    );
    expect(barChordSymbol(dim7)).toBe('Bdim7');
    expect(labels(dim7)).toEqual(['R', 'b3', 'b5', 'bb7']);
    expect(barChordSymbol(halfDim)).toBe('Bm7(b5)');
    // A minor third alone could be minor or diminished.
    expect(onlyThird.evidence.third).toBe('minor');
    expect(onlyThird.evidence.chordType).toBeNull();
  });

  it('spells the chord symbol with the key’s note names', () => {
    // B♭ major: B♭2 D3 F3 D3.
    const [bar] = analyzeBassChart(chart(1, walking([[46, D3, F3, D3]])));
    expect(barChordSymbol(bar)).toBe('A#');
    expect(barChordSymbol(bar, NOTE_NAMES_FLAT)).toBe('Bb');
  });

  it('labels a tritone over a major third as #11, not a fifth', () => {
    const [bar] = analyzeBassChart(chart(1, walking([[C3, E3, FS3, G3]])));
    expect(bar.evidence.fifth).toBe('perfect');
    expect(labels(bar)).toEqual(['R', '3', '#11', '5']);
    expect(bar.counts.tension).toBe(1);
  });

  it('counts the upper note of a double stop as harmony', () => {
    const [bar] = analyzeBassChart(
      chart(1, [
        { bar: 0, beat: 0, midi: A2 },
        { bar: 0, beat: 0, string: 3, midi: E3 },
        { bar: 0, beat: 2, midi: C3 },
      ]),
    );
    expect(bar.root).toBe(A2 % 12);
    expect(barChordSymbol(bar)).toBe('Am');
  });
});

describe('soundingMidi', () => {
  it('raises natural harmonics to the partial they sound', () => {
    const base = chart(1, [
      { bar: 0, beat: 0, string: 0, fret: 5, techniques: ['harmonic'] },
      { bar: 0, beat: 1, string: 0, fret: 7, techniques: ['harmonic'] },
      { bar: 0, beat: 2, string: 0, fret: 5 },
    ]).notes;
    // Open E1 = 28: two octaves up at fret 5, an octave and a fifth at 7.
    expect(base.map(soundingMidi)).toEqual([52, 47, 33]);
  });
});

describe('summarizeBars', () => {
  it('totals chord-tone counts and motion over a bar range', () => {
    const bars = analyzeBassChart(
      chart(
        3,
        walking([
          [G2, B2, D3, F3],
          [C3, E3, G3, B3],
          [C3, E3, G3, B3],
        ]),
      ),
    );
    const summary = summarizeBars(bars, 0, 2);
    expect(summary.counts).toEqual({
      root: 2,
      third: 2,
      fifth: 2,
      seventh: 2,
      tension: 0,
      ornament: 0,
    });
    // G→B→D→F leaps, F→C leap, C→E→G→B leaps: every move is a leap.
    expect(summary.motion).toEqual({ repeats: 0, steps: 0, leaps: 7 });
  });
});
