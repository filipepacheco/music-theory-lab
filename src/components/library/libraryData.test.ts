import { describe, expect, it } from 'vitest';
import {
  buildChordChartBars,
  chordDisplayName,
  formatDuration,
  relativeRootOf,
  romanNumeral,
  segmentRomanNumeral,
  type BeatAnalysisJson,
  type ChordAnalysisJson,
  type ChordSegment,
  type KeyAnalysisJson,
} from './libraryData';

function seg(
  start: number,
  end: number,
  label: ChordSegment['label'],
  root_pc: number | null = null,
  candidate: string = '',
): ChordSegment {
  return {
    start_seconds: start,
    end_seconds: end,
    label,
    root_pc,
    candidate_label: candidate,
    confidence: null,
  };
}

function keyOf(
  tonic_pc: number,
  mode: 'major' | 'minor',
): KeyAnalysisJson {
  const top = { tonic_pc, mode, score: 1 };
  return {
    schema_version: '1.0.0',
    source_sha256: 'x'.repeat(64),
    estimates: [top],
    top_estimate: top,
  };
}

function beats(times: number[], downbeatEvery: number): BeatAnalysisJson {
  return {
    schema_version: '1.0.0',
    source_sha256: 'x'.repeat(64),
    beats: times.map((t, i) => ({
      time_seconds: t,
      is_downbeat: i % downbeatEvery === 0,
    })),
    downbeat_count: times.filter((_, i) => i % downbeatEvery === 0).length,
    tempo_median_bpm: 120,
  };
}

describe('chordDisplayName', () => {
  it('maps major and minor labels to short chord names', () => {
    expect(chordDisplayName(seg(0, 1, 'major', 0))).toBe('C');
    expect(chordDisplayName(seg(0, 1, 'minor', 9))).toBe('Am');
    expect(chordDisplayName(seg(0, 1, 'major', 5))).toBe('F');
  });

  it('renders no_chord as N.C. and unknown as ?', () => {
    expect(chordDisplayName(seg(0, 1, 'no_chord'))).toBe('N.C.');
    expect(chordDisplayName(seg(0, 1, 'unknown'))).toBe('?');
  });

  it('falls back to ? when root_pc is missing on a pitched label', () => {
    expect(chordDisplayName(seg(0, 1, 'major', null))).toBe('?');
  });
});

describe('relativeRootOf', () => {
  it('returns the chromatic offset from the key tonic, mod 12', () => {
    expect(relativeRootOf(0, 0)).toBe(0);
    expect(relativeRootOf(7, 0)).toBe(7);
    expect(relativeRootOf(0, 7)).toBe(5);
    expect(relativeRootOf(9, 0)).toBe(9);
  });
});

describe('romanNumeral', () => {
  it('returns diatonic degrees in C major with upper/lower case by quality', () => {
    // I, ii, iii, IV, V, vi, vii is the classic pattern; vii° isn't tracked here.
    expect(romanNumeral(0, 'major', 'major')).toBe('I');
    expect(romanNumeral(2, 'minor', 'major')).toBe('ii');
    expect(romanNumeral(4, 'minor', 'major')).toBe('iii');
    expect(romanNumeral(5, 'major', 'major')).toBe('IV');
    expect(romanNumeral(7, 'major', 'major')).toBe('V');
    expect(romanNumeral(9, 'minor', 'major')).toBe('vi');
  });

  it('renders chromatic offsets with flat/sharp accidentals in major', () => {
    expect(romanNumeral(1, 'major', 'major')).toBe('bII');
    expect(romanNumeral(3, 'major', 'major')).toBe('bIII');
    expect(romanNumeral(6, 'major', 'major')).toBe('#IV');
    expect(romanNumeral(8, 'major', 'major')).toBe('bVI');
    expect(romanNumeral(10, 'major', 'major')).toBe('bVII');
  });

  it('returns natural-minor degrees for minor keys', () => {
    expect(romanNumeral(0, 'minor', 'minor')).toBe('i');
    expect(romanNumeral(3, 'major', 'minor')).toBe('III');
    expect(romanNumeral(5, 'minor', 'minor')).toBe('iv');
    expect(romanNumeral(7, 'minor', 'minor')).toBe('v');
    expect(romanNumeral(7, 'major', 'minor')).toBe('V');
    expect(romanNumeral(8, 'major', 'minor')).toBe('VI');
    expect(romanNumeral(10, 'major', 'minor')).toBe('VII');
  });

  it('returns null for non-pitched or non-triadic chord labels', () => {
    expect(romanNumeral(0, 'no_chord', 'major')).toBeNull();
    expect(romanNumeral(0, 'unknown', 'major')).toBeNull();
  });
});

describe('segmentRomanNumeral', () => {
  it('computes the roman numeral relative to the top key estimate', () => {
    // Am as vi of C major.
    const segment = seg(0, 1, 'minor', 9);
    expect(segmentRomanNumeral(segment, keyOf(0, 'major'))).toBe('vi');
  });

  it('returns null when the segment has no root_pc', () => {
    expect(segmentRomanNumeral(seg(0, 1, 'unknown'), keyOf(0, 'major'))).toBeNull();
  });
});

describe('buildChordChartBars', () => {
  it('splits the track into one bar per downbeat span', () => {
    // Downbeats at 0, 2, 4, 6; total duration 8.
    const beat = beats([0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6], 4);
    const chord: ChordAnalysisJson = {
      schema_version: '1.0.0',
      source_sha256: 'x'.repeat(64),
      segments: [
        seg(0, 2, 'major', 0), // C for bar 0
        seg(2, 4, 'minor', 9), // Am for bar 1
        seg(4, 6, 'major', 5), // F for bar 2
        seg(6, 8, 'major', 7), // G for last (partial-covered) bar
      ],
    };
    const bars = buildChordChartBars(chord, beat, 8);
    expect(bars.map((b) => b.chords[0].chord)).toEqual(['C', 'Am', 'F', 'G']);
    expect(bars[0].startSeconds).toBe(0);
    expect(bars[3].endSeconds).toBe(8);
  });

  it('picks the chord with the largest overlap when a bar spans two chords', () => {
    // Bar 0-4 seconds; two chord segments: F for 0-1s, C for 1-4s. C wins.
    const beat = beats([0, 1, 2, 3, 4], 4);
    const chord: ChordAnalysisJson = {
      schema_version: '1.0.0',
      source_sha256: 'x'.repeat(64),
      segments: [seg(0, 1, 'major', 5), seg(1, 4, 'major', 0)],
    };
    const bars = buildChordChartBars(chord, beat, 4);
    expect(bars).toHaveLength(1);
    expect(bars[0].chords[0].chord).toBe('C');
  });

  it('populates roman numerals on each bar when a key is provided', () => {
    const beat = beats([0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6], 4);
    const chord: ChordAnalysisJson = {
      schema_version: '1.0.0',
      source_sha256: 'x'.repeat(64),
      segments: [
        seg(0, 2, 'major', 0),
        seg(2, 4, 'minor', 9),
        seg(4, 6, 'major', 5),
        seg(6, 8, 'major', 7),
      ],
    };
    const bars = buildChordChartBars(chord, beat, 8, keyOf(0, 'major'));
    expect(bars.map((b) => b.chords[0].romanNumeral)).toEqual([
      'I',
      'vi',
      'IV',
      'V',
    ]);
  });

  it('leaves roman numeral null when no key is provided', () => {
    const beat = beats([0, 1, 2, 3, 4], 4);
    const chord: ChordAnalysisJson = {
      schema_version: '1.0.0',
      source_sha256: 'x'.repeat(64),
      segments: [seg(0, 4, 'major', 0)],
    };
    const bars = buildChordChartBars(chord, beat, 4);
    expect(bars[0].chords[0].romanNumeral).toBeNull();
  });

  it('falls back to a single bar when there are fewer than two downbeats', () => {
    const beat = beats([0], 1);
    const chord: ChordAnalysisJson = {
      schema_version: '1.0.0',
      source_sha256: 'x'.repeat(64),
      segments: [seg(0, 30, 'major', 0)],
    };
    const bars = buildChordChartBars(chord, beat, 30);
    expect(bars).toHaveLength(1);
    expect(bars[0].chords[0].chord).toBe('—');
  });
});

describe('formatDuration', () => {
  it('formats seconds as M:SS with two-digit seconds', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(9)).toBe('0:09');
    expect(formatDuration(65)).toBe('1:05');
    expect(formatDuration(3599)).toBe('59:59');
  });

  it('guards against negative or non-finite input', () => {
    expect(formatDuration(-1)).toBe('0:00');
    expect(formatDuration(Number.NaN)).toBe('0:00');
    expect(formatDuration(Number.POSITIVE_INFINITY)).toBe('0:00');
  });
});
