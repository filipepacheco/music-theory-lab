import { describe, expect, it } from 'vitest';
import {
  DEFAULT_HARMONY_TRACK_NAME,
  DEFAULT_ROOT_TRACK_NAME,
  defaultTrackNames,
  transcribeGp,
  type GpInspection,
} from '@/services/transcribeGp';
import { GpParseError, type GpFile } from '@/services/gpFile';

function fixture(overrides?: Partial<GpFile>): GpInspection {
  const parsed: GpFile = {
    gpVersion: '7.0',
    trackNames: [DEFAULT_HARMONY_TRACK_NAME, DEFAULT_ROOT_TRACK_NAME, 'Drums'],
    masterBarCount: 2,
    chordDictionaryFound: true,
    masterBars: [
      { barIndex: 0, timeSignature: '4/4', quarterNoteBeats: 4 },
      { barIndex: 1, timeSignature: '3/4', quarterNoteBeats: 3 },
    ],
    results: [],
    // Bar 0 carries a C major triad; bar 1 is silent.
    pitchesFor: (barIndex) => (barIndex === 0 ? [0, 4, 7] : []),
    ...overrides,
  };
  return {
    gpVersion: parsed.gpVersion,
    trackNames: parsed.trackNames,
    masterBarCount: parsed.masterBarCount,
    chordDictionaryFound: parsed.chordDictionaryFound,
    parsed,
  };
}

describe('defaultTrackNames', () => {
  it('prefers the literal default track names when present', () => {
    expect(
      defaultTrackNames([
        DEFAULT_HARMONY_TRACK_NAME,
        DEFAULT_ROOT_TRACK_NAME,
        'Drums',
      ]),
    ).toEqual({
      harmonyTrackName: DEFAULT_HARMONY_TRACK_NAME,
      rootTrackName: DEFAULT_ROOT_TRACK_NAME,
    });
  });

  it('falls back to first and second tracks', () => {
    expect(defaultTrackNames(['Guitar', 'Bass'])).toEqual({
      harmonyTrackName: 'Guitar',
      rootTrackName: 'Bass',
    });
  });

  it('falls back to the single track when only one exists', () => {
    expect(defaultTrackNames(['Guitar'])).toEqual({
      harmonyTrackName: 'Guitar',
      rootTrackName: 'Guitar',
    });
  });
});

describe('transcribeGp', () => {
  it('transcribes bars from the parsed handle and derives the scale collection', () => {
    const transcription = transcribeGp(fixture());

    expect(transcription.bars).toHaveLength(2);
    expect(transcription.bars[0].result.kind).toBe('chord');
    expect(transcription.bars[0].label).not.toBeNull();
    expect(transcription.bars[1].result.kind).toBe('no-chord-data');
    expect(transcription.scaleCollection).toEqual([0, 4, 7]);
  });

  it('throws a missing-track error for strict track sourcing', () => {
    expect(() =>
      transcribeGp(fixture({ trackNames: ['Only One Track'] })),
    ).toThrowError(GpParseError);
  });

  it('returns a null scale collection when no bar matched a chord', () => {
    const inspection = fixture();
    inspection.parsed.pitchesFor = () => [];
    const transcription = transcribeGp(inspection);

    expect(transcription.scaleCollection).toBeNull();
  });
});
