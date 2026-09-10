import { describe, expect, it } from 'vitest';
import {
  mergeLastWriteWins,
  mergeLibraryAnnotations,
  mergeProgressions,
} from './syncMerge';
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

  it('keeps the existing saved-document merge behavior', () => {
    const result = mergeLastWriteWins(
      [
        { id: 'old', updatedAt: '2026-01-01T00:00:00.000Z' },
        { id: 'same', updatedAt: '2026-01-03T00:00:00.000Z' },
        { id: 'newer-local', updatedAt: '2026-01-04T00:00:00.000Z' },
        { id: 'local', updatedAt: '2026-01-04T00:00:00.000Z' },
      ],
      [
        { id: 'old', updated_at: '2026-01-02T00:00:00.000Z' },
        { id: 'same', updated_at: '2026-01-02T00:00:00.000Z' },
        { id: 'newer-local', updated_at: '2026-01-03T00:00:00.000Z' },
      ],
    );

    expect(result.cloudToApply.map((record) => record.id)).toEqual(['old']);
    expect(result.localToPush.map((record) => record.id)).toEqual(['local']);
  });

  it('converges Library annotations in both timestamp directions', () => {
    const document = (sourceSha256: string, updatedAt: string) => ({
      schemaVersion: 2 as const,
      sourceSha256,
      barCount: 1,
      reviewRequired: false,
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt,
      sections: [
        {
          id: 'section-1',
          name: 'Parte 1',
          startBar: 0,
          endBar: 1,
          origin: 'manual' as const,
        },
      ],
    });
    const result = mergeLibraryAnnotations(
      [
        document('cloud-newer', '2026-09-09T12:00:00.000Z'),
        document('local-newer', '2026-09-09T14:00:00.000Z'),
      ],
      [
        document('cloud-newer', '2026-09-09T13:00:00.000Z'),
        document('local-newer', '2026-09-09T13:00:00.000Z'),
      ],
    );

    expect(result.cloudToApply.map((item) => item.sourceSha256)).toEqual([
      'cloud-newer',
    ]);
    expect(result.localToPush.map((item) => item.sourceSha256)).toEqual([
      'local-newer',
    ]);
  });
});
