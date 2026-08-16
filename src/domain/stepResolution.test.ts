import { describe, expect, it } from 'vitest';
import { resolveStep } from './stepResolution';
import type { ProgressionStep } from '@/constants/progressions';
import type { HarmonicChord } from '@/utils/musicTheory';

const cMajor: HarmonicChord = {
  degree: 1,
  romanNumeral: 'I',
  chordName: 'C',
  notes: [0, 4, 7],
  noteNames: ['C', 'E', 'G'],
  harmonicFunction: 'T',
  intervals: [0, 4, 7],
  chordSymbol: 'M',
};

const field = [cMajor];

function step(partial: Partial<ProgressionStep>): ProgressionStep {
  return { degree: null, label: 'Acorde', ...partial };
}

describe('resolveStep', () => {
  it('returns chord data for a step whose degree is in the field', () => {
    const resolved = resolveStep(step({ degree: 0, label: 'C' }), field, 0);

    expect(resolved).toEqual({
      chordName: 'C',
      noteNames: ['C', 'E', 'G'],
      harmonicFunction: 'T',
      notes: [0, 4, 7],
      degree: 0,
    });
  });

  it('maps chromatic intervals against the root note', () => {
    const resolved = resolveStep(
      step({ degree: null, label: 'F#dim', intervals: [1, 4, 7] }),
      field,
      0,
    );

    expect(resolved).toEqual({
      chordName: 'F#dim',
      noteNames: ['C#', 'E', 'G'],
      harmonicFunction: null,
      notes: [1, 4, 7],
      degree: null,
    });
  });

  it('spells flat for flat keys', () => {
    // Root Bb (10): interval 0 is Bb, not A#.
    const resolved = resolveStep(
      step({ degree: null, label: 'Bb', intervals: [0, 4] }),
      field,
      10,
    );

    expect(resolved.noteNames).toEqual(['Bb', 'D']);
  });

  it('spells flat for the F key', () => {
    // Root F (5): interval 1 is Gb, not F#.
    const resolved = resolveStep(
      step({ degree: null, label: 'F', intervals: [0, 1] }),
      field,
      5,
    );

    expect(resolved.noteNames).toEqual(['F', 'Gb']);
  });

  it('falls back to label + intervals when the degree is not in the field', () => {
    const resolved = resolveStep(
      step({ degree: 5, label: 'X', intervals: [0, 3] }),
      field,
      0,
    );

    expect(resolved.chordName).toBe('X');
    expect(resolved.harmonicFunction).toBeNull();
    expect(resolved.notes).toEqual([0, 3]);
    expect(resolved.degree).toBeNull();
  });

  it('returns empty notes for a step with no degree and no intervals', () => {
    const resolved = resolveStep(step({ degree: null, label: 'Sem acorde' }), field, 0);

    expect(resolved).toEqual({
      chordName: 'Sem acorde',
      noteNames: [],
      harmonicFunction: null,
      notes: [],
      degree: null,
    });
  });
});
