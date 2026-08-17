import { describe, expect, it } from 'vitest';
import { mergeLastWriteWins, mergeProgressions } from './syncMerge';
import type { SavedProgression } from './syncMerge';

const progression = (id: string): SavedProgression => ({
  id,
  name: id,
  description: '',
  steps: [],
  mode: 'major',
  presetId: 'piano',
  bpm: 90,
  isExample: false,
  createdAt: '2026-01-01T00:00:00.000Z',
});

describe('saved library merge policy', () => {
  it('unions local-only and cloud-only progressions', () => {
    const result = mergeProgressions(
      [progression('local'), progression('shared')],
      [
        {
          id: 'cloud',
          name: 'cloud',
          description: '',
          steps: '[]',
          mode: 'major',
          preset_id: 'piano',
          bpm: 90,
          is_example: 0,
          created_at: '',
        },
        {
          id: 'shared',
          name: 'shared',
          description: '',
          steps: '[]',
          mode: 'major',
          preset_id: 'piano',
          bpm: 90,
          is_example: 0,
          created_at: '',
        },
      ],
    );

    expect(result.localOnly.map((record) => record.id)).toEqual(['local']);
    expect(result.cloudOnly.map((record) => record.id)).toEqual(['cloud']);
  });

  it('applies newer cloud records and pushes local-only records', () => {
    const result = mergeLastWriteWins(
      [
        { id: 'old', updatedAt: '2026-01-01T00:00:00.000Z' },
        { id: 'same', updatedAt: '2026-01-03T00:00:00.000Z' },
        { id: 'local', updatedAt: '2026-01-04T00:00:00.000Z' },
      ],
      [
        { id: 'old', updated_at: '2026-01-02T00:00:00.000Z' },
        { id: 'same', updated_at: '2026-01-02T00:00:00.000Z' },
      ],
    );

    expect(result.cloudToApply.map((record) => record.id)).toEqual(['old']);
    expect(result.localToPush.map((record) => record.id)).toEqual(['local']);
  });
});
