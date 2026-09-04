import { describe, expect, it } from 'vitest';
import {
  barIndexAtSeconds,
  buildChordChartBars,
  chordDisplayName,
  formatDuration,
  type BeatAnalysisJson,
  type ChordAnalysisJson,
  type ChordSegment,
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

describe('barIndexAtSeconds', () => {
  const beat = {
    schema_version: '1.0.0',
    source_sha256: 'x'.repeat(64),
    beats: [0, 1, 2, 3, 4, 5, 6, 7, 8].map((t, i) => ({
      time_seconds: t,
      is_downbeat: i % 4 === 0,
    })),
    downbeat_count: 3,
    tempo_median_bpm: 120,
  } satisfies BeatAnalysisJson;
  const chord: ChordAnalysisJson = {
    schema_version: '1.0.0',
    source_sha256: 'x'.repeat(64),
    segments: [
      seg(0, 4, 'major', 0),
      seg(4, 8, 'major', 5),
    ],
  };
  const bars = buildChordChartBars(chord, beat, 8);

  it('finds the bar containing the given time', () => {
    expect(barIndexAtSeconds(bars, 0)).toBe(0);
    expect(barIndexAtSeconds(bars, 3.999)).toBe(0);
    expect(barIndexAtSeconds(bars, 4)).toBe(1);
    expect(barIndexAtSeconds(bars, 7.5)).toBe(1);
  });

  it('returns -1 for times outside the bar range or negative', () => {
    expect(barIndexAtSeconds(bars, -0.1)).toBe(-1);
    expect(barIndexAtSeconds(bars, 8)).toBe(-1);
    expect(barIndexAtSeconds(bars, 100)).toBe(-1);
    expect(barIndexAtSeconds(bars, Number.NaN)).toBe(-1);
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
