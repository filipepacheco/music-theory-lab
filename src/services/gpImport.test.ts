import { describe, expect, it } from 'vitest';
import {
  analyzeBars,
  assembleSections,
  familyOf,
  summarise,
  type ImportedBar,
} from './gpImport';
import type { GpFile } from '@/services/gpFile';

function fixture(overrides?: Partial<GpFile>): GpFile {
  const gp: GpFile = {
    gpVersion: '8.1.3',
    title: 'Song',
    artist: 'Artist',
    trackNames: ['Rhythm Guitar', 'Electric Bass (finger)'],
    masterBarCount: 2,
    chordDictionaryFound: true,
    masterBars: [
      { barIndex: 0, timeSignature: '4/4', quarterNoteBeats: 4 },
      { barIndex: 1, timeSignature: '3/4', quarterNoteBeats: 3 },
    ],
    results: [],
    pitchesFor: () => [],
    quarterNoteBeats: (i) => gp.masterBars[i]?.quarterNoteBeats ?? 4,
    ...overrides,
  };
  return gp;
}

const HARMONY = 'Rhythm Guitar';
const ROOT = 'Electric Bass (finger)';

describe('familyOf', () => {
  it('classifies major, minor, dim, aug, and no-third shapes', () => {
    expect(familyOf([0, 4, 7])).toBe('MAJ');
    expect(familyOf([0, 4, 7, 10])).toBe('MAJ');
    expect(familyOf([0, 3, 7])).toBe('MIN');
    expect(familyOf([0, 3, 6])).toBe('DIM');
    expect(familyOf([0, 4, 8])).toBe('AUG');
    expect(familyOf([0, 5, 7])).toBe('NOTHIRD');
  });
});

describe('analyzeBars', () => {
  it('maps an in-field chord to its degree', () => {
    const bars = analyzeBars(
      fixture({ pitchesFor: () => [0, 4, 7] }),
      HARMONY,
      ROOT,
      0,
      false,
    );

    expect(bars[0].step).toMatchObject({ degree: 0, label: 'I' });
    expect(bars[0].carried).toBe(false);
  });

  it('keeps out-of-field chords chromatic with key-relative intervals', () => {
    const bars = analyzeBars(
      fixture({ pitchesFor: () => [1, 5, 8] }),
      HARMONY,
      ROOT,
      0,
      false,
    );

    expect(bars[0].step).toEqual({
      degree: null,
      label: 'C#',
      intervals: [1, 5, 8],
      beats: 4,
    });
  });

  it('carries the previous chord into silent bars, marked unsure', () => {
    const gp = fixture({
      masterBarCount: 2,
      pitchesFor: (barIndex) => (barIndex === 0 ? [0, 4, 7] : []),
    });
    const bars = analyzeBars(gp, HARMONY, ROOT, 0, false);

    expect(bars[1].carried).toBe(true);
    expect(bars[1].step).toEqual({
      degree: 0,
      label: 'I',
      beats: 3,
      confidence: 'unsure',
    });
    expect(bars[1].result.kind).toBe('no-chord-data');
  });

  it('emits a bare ? step before any chord has resolved', () => {
    const bars = analyzeBars(fixture(), HARMONY, ROOT, 0, false);

    expect(bars[0].step).toEqual({
      degree: null,
      label: '?',
      beats: 4,
      confidence: 'unsure',
    });
    expect(bars[0].carried).toBe(false);
  });

  it('clamps beats to what the editor can reproduce', () => {
    const gp = fixture({
      masterBars: [
        { barIndex: 0, timeSignature: '20/4', quarterNoteBeats: 20 },
        { barIndex: 1, timeSignature: '7/8', quarterNoteBeats: 3.5 },
      ],
      pitchesFor: () => [0, 4, 7],
    });
    const bars = analyzeBars(gp, HARMONY, ROOT, 0, false);

    expect(bars.map((b) => b.step.beats)).toEqual([8, 3.5]);
  });

  it('spells flats when the chosen key is flat', () => {
    // C# major chord in Bb major: the label must read Db, not C#.
    const bars = analyzeBars(
      fixture({ pitchesFor: () => [1, 5, 8] }),
      HARMONY,
      ROOT,
      10,
      false,
    );

    expect(bars[0].step.label).toBe('Db');
    expect(bars[0].step.intervals).toEqual([3, 7, 10]);
  });
});

describe('summarise', () => {
  it('counts outcomes without double-counting carried bars', () => {
    const bars: ImportedBar[] = [
      { bar: 1, result: { kind: 'chord', root: 0, quality: 'maj', intervals: [0, 4, 7] }, detected: 'C', carried: false, step: { degree: 0, label: 'I', beats: 4 } },
      { bar: 2, result: { kind: 'chord', root: 1, quality: 'maj', intervals: [1, 5, 8] }, detected: 'C#', carried: false, step: { degree: null, label: 'C#', intervals: [1, 5, 8], beats: 4 } },
      { bar: 3, result: { kind: 'unclear' }, detected: null, carried: true, step: { degree: 0, label: 'I', beats: 4, confidence: 'unsure' } },
      { bar: 4, result: { kind: 'no-chord-data' }, detected: null, carried: true, step: { degree: 0, label: 'I', beats: 4, confidence: 'unsure' } },
    ];

    expect(summarise(bars)).toEqual({
      diatonic: 1,
      chromatic: 1,
      unclear: 1,
      noData: 1,
    });
  });
});

describe('assembleSections', () => {
  it('splits mechanically into 64-step sections named Parte N', () => {
    const bars: ImportedBar[] = Array.from({ length: 130 }, (_, i) => ({
      bar: i + 1,
      result: { kind: 'no-chord-data' },
      detected: null,
      carried: false,
      step: { degree: null, label: '?', beats: 4, confidence: 'unsure' },
    }));

    const sections = assembleSections(bars);

    expect(sections.map((s) => s.customLabel)).toEqual([
      'Parte 1',
      'Parte 2',
      'Parte 3',
    ]);
    expect(sections.map((s) => s.steps.length)).toEqual([64, 64, 2]);
    expect(sections.every((s) => s.type === 'custom')).toBe(true);
  });
});
