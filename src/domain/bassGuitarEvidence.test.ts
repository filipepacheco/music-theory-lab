import { describe, expect, it } from 'vitest';
import {
  analyzeBassChart,
  barChordSymbol,
  describeEvidence,
} from '@/domain/bassAnalysis';
import { barChordTones } from '@/domain/bassHarmony';
import { fixtureChart } from '@/domain/bassChartFixture';
import {
  fixtureGuitarChart,
  type GuitarNoteSpec,
} from '@/domain/guitarChartFixture';

const A2 = 45;

function bass() {
  return fixtureChart(1, [{ bar: 0, beat: 0, midi: A2 }]);
}

function guitar(specs: GuitarNoteSpec[]) {
  return fixtureGuitarChart(1, specs);
}

// C4 (G string, fret 5) and E4 (open high E): a minor third and a fifth over A.
const MINOR: GuitarNoteSpec[] = [
  { bar: 0, beat: 0, string: 3, fret: 5 },
  { bar: 0, beat: 0, string: 5, fret: 0 },
];

describe('guitar evidence in the bar analysis', () => {
  it('names a minor chord from a guitar chord over a bass with no third', () => {
    const [bar] = analyzeBassChart(bass(), [guitar(MINOR)]);
    expect(bar.evidence.third).toBe('minor');
    expect(bar.evidence.fifth).toBe('perfect');
    expect(barChordSymbol(bar)).toBe('Am');
  });

  it('gives no evidence for a single-note guitar line', () => {
    const line: GuitarNoteSpec[] = [
      { bar: 0, beat: 0, string: 3, fret: 5 },
      { bar: 0, beat: 1, string: 5, fret: 0 },
    ];
    const [bar] = analyzeBassChart(bass(), [guitar(line)]);
    expect(bar).toEqual(analyzeBassChart(bass())[0]);
  });

  it('keeps "?" when both thirds sound', () => {
    const both: GuitarNoteSpec[] = [
      ...MINOR,
      { bar: 0, beat: 1, string: 3, fret: 6 },
      { bar: 0, beat: 1, string: 5, fret: 0 },
    ];
    const [bar] = analyzeBassChart(bass(), [guitar(both)]);
    expect(bar.evidence.third).toBe('both');
    expect(bar.evidence.chordType).toBeNull();
  });

  it('shows a guitar-only tone as played', () => {
    const [bar] = analyzeBassChart(bass(), [guitar(MINOR)]);
    const tones = barChordTones(bar, null);
    expect(tones.find((tone) => tone.interval === 3)?.played).toBe(true);
    expect(tones.find((tone) => tone.interval === 7)?.played).toBe(true);
  });

  it('names the guitar in the evidence text', () => {
    const [bar] = analyzeBassChart(bass(), [guitar(MINOR)]);
    expect(describeEvidence(bar.evidence)).toContain('guitarra');
    const [plain] = analyzeBassChart(bass());
    expect(describeEvidence(plain.evidence)).not.toContain('guitarra');
  });

  it('gives no bar analysis to a file with no bass chart', () => {
    expect(analyzeBassChart(null, [guitar(MINOR)])).toEqual([]);
  });

  it('is the same as before for a file with no guitar', () => {
    expect(analyzeBassChart(bass(), [])).toEqual(analyzeBassChart(bass()));
  });
});
