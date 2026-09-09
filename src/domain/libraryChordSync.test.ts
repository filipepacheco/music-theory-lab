import { describe, expect, it } from 'vitest';
import {
  resolveLibraryChordAt,
  type LibraryChordVisualState,
} from '@/domain/libraryChordSync';
import type { ChordSegment } from '@/components/library/libraryData';

const segments: ChordSegment[] = [
  {
    start_seconds: 0,
    end_seconds: 1,
    label: 'major',
    root_pc: 0,
    candidate_label: 'C',
    confidence: 0.9,
  },
  {
    start_seconds: 1,
    end_seconds: 1.04,
    label: 'minor',
    root_pc: 2,
    candidate_label: 'Dm',
    confidence: 0.8,
  },
  {
    start_seconds: 1.04,
    end_seconds: 2,
    label: 'no_chord',
    root_pc: null,
    candidate_label: 'N',
    confidence: null,
  },
  {
    start_seconds: 3,
    end_seconds: 4,
    label: 'unknown',
    root_pc: null,
    candidate_label: 'X',
    confidence: null,
  },
];

function expectState(
  actual: LibraryChordVisualState,
  expected: LibraryChordVisualState,
) {
  expect(actual).toEqual(expected);
}

describe('resolveLibraryChordAt', () => {
  it('uses half-open boundaries and represents a rapid valid segment', () => {
    expectState(resolveLibraryChordAt(segments, 0.999), {
      text: 'C',
      rootPitchClass: 0,
      pitchClasses: [0, 4, 7],
    });
    expectState(resolveLibraryChordAt(segments, 1), {
      text: 'Dm',
      rootPitchClass: 2,
      pitchClasses: [2, 5, 9],
    });
    expectState(resolveLibraryChordAt(segments, 1.039), {
      text: 'Dm',
      rootPitchClass: 2,
      pitchClasses: [2, 5, 9],
    });
  });

  it('clears highlights while preserving terminal text states', () => {
    expectState(resolveLibraryChordAt(segments, 1.04), {
      text: 'N.C.',
      rootPitchClass: null,
      pitchClasses: [],
    });
    expectState(resolveLibraryChordAt(segments, 3), {
      text: '?',
      rootPitchClass: null,
      pitchClasses: [],
    });
  });

  it('returns no active chord for gaps, invalid time, missing data, and ends', () => {
    const none: LibraryChordVisualState = {
      text: null,
      rootPitchClass: null,
      pitchClasses: [],
    };

    expectState(resolveLibraryChordAt(segments, 2), none);
    expectState(resolveLibraryChordAt(segments, 4), none);
    expectState(resolveLibraryChordAt(segments, Number.NaN), none);
    expectState(resolveLibraryChordAt([], 0), none);
  });

  it('recomputes the same media position against replacement analysis', () => {
    const replacement: ChordSegment[] = [
      {
        start_seconds: 0,
        end_seconds: 2,
        label: 'minor',
        root_pc: 5,
        candidate_label: 'Fm',
        confidence: 0.95,
      },
    ];

    expectState(resolveLibraryChordAt(segments, 0.5), {
      text: 'C',
      rootPitchClass: 0,
      pitchClasses: [0, 4, 7],
    });
    expectState(resolveLibraryChordAt(replacement, 0.5), {
      text: 'Fm',
      rootPitchClass: 5,
      pitchClasses: [5, 8, 0],
    });
  });
});
