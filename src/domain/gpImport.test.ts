import { describe, expect, it } from 'vitest';
import { mapGpTranscription } from './gpImport';
import type { GpTranscription } from '@/services/transcribeGp';

const transcription: GpTranscription = {
  gpVersion: '7.0',
  trackNames: ['Harmony', 'Bass'],
  masterBarCount: 3,
  harmonyTrackName: 'Harmony',
  rootTrackName: 'Bass',
  chordDictionaryFound: false,
  scaleCollection: [0, 2, 4, 5, 7, 9, 11],
  bars: [
    {
      barIndex: 0,
      timeSignature: '4/4',
      quarterNoteBeats: 4,
      result: { kind: 'chord', root: 2, quality: 'min', intervals: [0, 3, 7] },
      label: 'Dmin',
    },
    {
      barIndex: 1,
      timeSignature: '3/4',
      quarterNoteBeats: 3,
      result: { kind: 'unclear' },
      label: null,
    },
    {
      barIndex: 2,
      timeSignature: '6/8',
      quarterNoteBeats: 3,
      result: { kind: 'no-chord-data' },
      label: null,
    },
  ],
};

describe('GP import mapping', () => {
  it('keeps every bar editable and makes chord intervals relative to the reference root', () => {
    const result = mapGpTranscription(transcription, {
      createId: () => 'imported-section',
      sectionLabel: 'Demo GP',
    });

    expect(result.referenceRoot).toBe(2);
    expect(result.sections).toEqual([
      {
        id: 'imported-section',
        type: 'custom',
        customLabel: 'Demo GP',
        steps: [
          {
            degree: null,
            label: 'Dmin',
            intervals: [0, 3, 7],
            beats: 4,
            confidence: 'sure',
          },
          {
            degree: null,
            label: 'Incerto',
            beats: 3,
            confidence: 'unsure',
          },
          {
            degree: null,
            label: 'Sem acorde',
            beats: 3,
            confidence: 'unsure',
          },
        ],
      },
    ]);
    expect(result.resolvedBars).toBe(1);
    expect(result.uncertainBars).toBe(1);
    expect(result.silentBars).toBe(1);
  });
});
