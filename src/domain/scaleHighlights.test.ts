import { describe, expect, it } from 'vitest';
import { classifyScaleNotes } from './scaleHighlights';

describe('classifyScaleNotes', () => {
  it('marks every note as a when there is no comparison scale', () => {
    expect(classifyScaleNotes([0, 2, 4], null)).toEqual({
      notes: [0, 2, 4],
      kinds: ['a', 'a', 'a'],
    });
  });

  it('marks shared, a-only, and b-only notes', () => {
    expect(classifyScaleNotes([0, 2, 4], [0, 3, 4])).toEqual({
      notes: [0, 2, 4, 3],
      kinds: ['shared', 'a', 'shared', 'b'],
    });
  });

  it('handles an empty primary scale', () => {
    expect(classifyScaleNotes([], [0, 1])).toEqual({
      notes: [0, 1],
      kinds: ['b', 'b'],
    });
  });
});
