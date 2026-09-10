import { describe, expect, it } from 'vitest';
import {
  SECTION_COLOR_COUNT,
  barIndexAtSeconds,
  buildChordChartBars,
  chordDisplayName,
  collapseChartCells,
  formatDuration,
  groupBarsBySection,
  relativeRootOf,
  romanNumeral,
  sectionColorIndexes,
  sectionColorVar,
  sectionIndexAtSeconds,
  sectionBoundaryBars,
  segmentRomanNumeral,
  type BeatAnalysisJson,
  type ChordAnalysisJson,
  type ChordChartBar,
  type ChordSegment,
  type KeyAnalysisJson,
  type SectionSegment,
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

function keyOf(tonic_pc: number, mode: 'major' | 'minor'): KeyAnalysisJson {
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
    expect(
      segmentRomanNumeral(seg(0, 1, 'unknown'), keyOf(0, 'major')),
    ).toBeNull();
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
    segments: [seg(0, 4, 'major', 0), seg(4, 8, 'major', 5)],
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

function section(start: number, end: number, label: string): SectionSegment {
  return { start_seconds: start, end_seconds: end, label };
}

function bar(index: number, start: number, end: number): ChordChartBar {
  return {
    index,
    startSeconds: start,
    endSeconds: end,
    chords: [{ chord: 'C', romanNumeral: 'I', raw: null }],
  };
}

describe('sectionColorVar', () => {
  it('maps slot 0 to the first form token', () => {
    expect(sectionColorVar(0)).toBe('var(--color-form-1)');
  });

  it('cycles once past the last token', () => {
    expect(sectionColorVar(SECTION_COLOR_COUNT)).toBe(sectionColorVar(0));
    expect(sectionColorVar(SECTION_COLOR_COUNT + 2)).toBe(sectionColorVar(2));
  });

  it('handles negative indexes without producing an invalid slot', () => {
    expect(sectionColorVar(-1)).toBe(
      `var(--color-form-${SECTION_COLOR_COUNT})`,
    );
  });
});

describe('sectionColorIndexes', () => {
  it('assigns slots by order of first appearance', () => {
    const map = sectionColorIndexes([
      section(0, 10, 'B'),
      section(10, 20, 'A'),
      section(20, 30, 'C'),
    ]);
    expect(map.get('B')).toBe(0);
    expect(map.get('A')).toBe(1);
    expect(map.get('C')).toBe(2);
  });

  it('reuses one slot for every repeat of a label', () => {
    const map = sectionColorIndexes([
      section(0, 10, 'A'),
      section(10, 20, 'B'),
      section(20, 30, 'A'),
    ]);
    expect(map.size).toBe(2);
    expect(map.get('A')).toBe(0);
  });
});

describe('sectionIndexAtSeconds', () => {
  const sections = [
    section(0, 10, 'A'),
    section(10, 25, 'B'),
    section(25, 40, 'A'),
  ];

  it('finds the containing section', () => {
    expect(sectionIndexAtSeconds(sections, 5)).toBe(0);
    expect(sectionIndexAtSeconds(sections, 12)).toBe(1);
    expect(sectionIndexAtSeconds(sections, 39.9)).toBe(2);
  });

  it('treats a boundary as the start of the next section', () => {
    expect(sectionIndexAtSeconds(sections, 10)).toBe(1);
    expect(sectionIndexAtSeconds(sections, 25)).toBe(2);
  });

  it('includes the very end of the last section', () => {
    expect(sectionIndexAtSeconds(sections, 40)).toBe(2);
  });

  it('returns -1 outside the track and for junk input', () => {
    expect(sectionIndexAtSeconds(sections, 40.1)).toBe(-1);
    expect(sectionIndexAtSeconds(sections, -1)).toBe(-1);
    expect(sectionIndexAtSeconds(sections, Number.NaN)).toBe(-1);
    expect(sectionIndexAtSeconds([], 1)).toBe(-1);
  });
});

describe('groupBarsBySection', () => {
  it('returns no groups when the track has no sections', () => {
    expect(groupBarsBySection([bar(0, 0, 2)], [])).toEqual([]);
  });

  it('puts each bar in the section it overlaps most', () => {
    const sections = [section(0, 10, 'A'), section(10, 20, 'B')];
    const bars = [bar(0, 0, 4), bar(1, 4, 8), bar(2, 12, 16)];
    const groups = groupBarsBySection(bars, sections);
    expect(groups.map((g) => g.bars.map((b) => b.index))).toEqual([
      [0, 1],
      [2],
    ]);
  });

  it('assigns a straddling bar to the side it spends longer in', () => {
    const sections = [section(0, 10, 'A'), section(10, 20, 'B')];
    // 8-12 sits 2s in A and 2s in B; 9-14 sits 1s in A and 4s in B.
    const groups = groupBarsBySection([bar(0, 9, 14)], sections);
    expect(groups[0].bars).toHaveLength(0);
    expect(groups[1].bars.map((b) => b.index)).toEqual([0]);
  });

  it('keeps every bar exactly once even past the last boundary', () => {
    const sections = [section(0, 10, 'A'), section(10, 20, 'B')];
    const bars = [bar(0, 0, 4), bar(1, 25, 25), bar(2, 30, 34)];
    const groups = groupBarsBySection(bars, sections);
    const placed = groups.flatMap((g) => g.bars.map((b) => b.index));
    expect(placed.slice().sort()).toEqual([0, 1, 2]);
    expect(groups[1].bars.map((b) => b.index)).toEqual([1, 2]);
  });

  it('numbers repeats of a label and carries the total', () => {
    const sections = [
      section(0, 10, 'A'),
      section(10, 20, 'B'),
      section(20, 30, 'A'),
    ];
    const groups = groupBarsBySection([], sections);
    expect(groups.map((g) => [g.occurrence, g.occurrenceTotal])).toEqual([
      [1, 2],
      [1, 1],
      [2, 2],
    ]);
  });

  it('shares one colour slot across repeats of a label', () => {
    const groups = groupBarsBySection(
      [],
      [section(0, 10, 'A'), section(10, 20, 'B'), section(20, 30, 'A')],
    );
    expect(groups[0].colorIndex).toBe(groups[2].colorIndex);
    expect(groups[1].colorIndex).not.toBe(groups[0].colorIndex);
  });

  it('keeps a section that is too short to hold a bar, with no bars', () => {
    const sections = [section(0, 10, 'A'), section(10, 10.2, 'B')];
    const groups = groupBarsBySection([bar(0, 0, 4)], sections);
    expect(groups).toHaveLength(2);
    expect(groups[1].bars).toEqual([]);
    expect(groups[1].section.label).toBe('B');
  });
});

describe('sectionBoundaryBars', () => {
  it('snaps accepted analysis boundaries to the nearest bar start', () => {
    const bars = [bar(0, 0, 4), bar(1, 4, 8), bar(2, 8, 12)];
    const sections = [
      section(0, 3.8, 'A'),
      section(3.8, 8.2, 'B'),
      section(8.2, 12, 'A'),
    ];

    expect(sectionBoundaryBars(bars, sections)).toEqual([1, 2]);
  });

  it('derives editable boundaries without rewriting the analysis artifact', () => {
    const bars = [bar(0, 0, 4), bar(1, 4, 8)];
    const sections = [section(0, 3.8, 'A'), section(3.8, 8, 'B')];
    const bytesBefore = JSON.stringify(sections);

    sectionBoundaryBars(bars, sections);

    expect(JSON.stringify(sections)).toBe(bytesBefore);
  });
});

function chartBar(
  index: number,
  start: number,
  end: number,
  chord: string,
  numeral: string | null = null,
): ChordChartBar {
  return {
    index,
    startSeconds: start,
    endSeconds: end,
    chords: [{ chord, romanNumeral: numeral, raw: null }],
  };
}

describe('collapseChartCells', () => {
  it('returns one cell per bar when every bar carries a chord', () => {
    const cells = collapseChartCells([
      chartBar(0, 0, 2, 'A', 'I'),
      chartBar(1, 2, 4, 'D', 'IV'),
      chartBar(2, 4, 6, 'E', 'V'),
    ]);
    expect(cells.map((c) => [c.chord, c.span])).toEqual([
      ['A', 1],
      ['D', 1],
      ['E', 1],
    ]);
  });

  it('never merges a repeated real chord — bar count is the point', () => {
    const cells = collapseChartCells([
      chartBar(0, 0, 2, 'A', 'I'),
      chartBar(1, 2, 4, 'A', 'I'),
      chartBar(2, 4, 6, 'A', 'I'),
    ]);
    expect(cells).toHaveLength(3);
    expect(cells.every((c) => c.span === 1)).toBe(true);
  });

  it('collapses a run of N.C. into one cell spanning it', () => {
    const bars = [
      chartBar(0, 0, 2, 'N.C.'),
      chartBar(1, 2, 4, 'N.C.'),
      chartBar(2, 4, 6, 'N.C.'),
      chartBar(3, 6, 8, 'A', 'I'),
    ];
    const cells = collapseChartCells(bars);
    expect(cells).toHaveLength(2);
    expect(cells[0].chord).toBe('N.C.');
    expect(cells[0].span).toBe(3);
    expect(cells[0].startSeconds).toBe(0);
    expect(cells[0].endSeconds).toBe(6);
    expect(cells[0].bars.map((b) => b.index)).toEqual([0, 1, 2]);
    expect(cells[1].chord).toBe('A');
  });

  it('collapses unknown and empty bars too, but keeps the kinds apart', () => {
    const cells = collapseChartCells([
      chartBar(0, 0, 2, '?'),
      chartBar(1, 2, 4, '?'),
      chartBar(2, 4, 6, 'N.C.'),
      chartBar(3, 6, 8, 'N.C.'),
    ]);
    expect(cells.map((c) => [c.chord, c.span])).toEqual([
      ['?', 2],
      ['N.C.', 2],
    ]);
  });

  it('starts a new cell when a chord interrupts a run', () => {
    const cells = collapseChartCells([
      chartBar(0, 0, 2, 'N.C.'),
      chartBar(1, 2, 4, 'A', 'I'),
      chartBar(2, 4, 6, 'N.C.'),
      chartBar(3, 6, 8, 'N.C.'),
    ]);
    expect(cells.map((c) => [c.chord, c.span])).toEqual([
      ['N.C.', 1],
      ['A', 1],
      ['N.C.', 2],
    ]);
  });

  it('keeps every bar exactly once', () => {
    const bars = [
      chartBar(0, 0, 2, 'N.C.'),
      chartBar(1, 2, 4, 'N.C.'),
      chartBar(2, 4, 6, 'A', 'I'),
      chartBar(3, 6, 8, 'D', 'IV'),
    ];
    const placed = collapseChartCells(bars).flatMap((c) =>
      c.bars.map((b) => b.index),
    );
    expect(placed).toEqual([0, 1, 2, 3]);
  });

  it('carries the roman numeral of the bar that opens the cell', () => {
    const cells = collapseChartCells([chartBar(0, 0, 2, 'A', 'I')]);
    expect(cells[0].romanNumeral).toBe('I');
  });

  it('handles an empty chart', () => {
    expect(collapseChartCells([])).toEqual([]);
  });
});
