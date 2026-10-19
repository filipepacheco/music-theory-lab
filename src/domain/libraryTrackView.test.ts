import { describe, expect, it } from 'vitest';
import {
  barAtTime,
  buildLibraryTrackView,
  sectionAtTime,
  type LibraryAnnotationDocument,
  type LibraryTrackAnalyses,
} from './libraryTrackView';

function track(
  downbeats: number[],
  sections: { s: number; e: number; l: string }[] | null,
): LibraryTrackAnalyses {
  return {
    chord: {
      schema_version: '1',
      source_sha256: 'x',
      segments: [
        {
          start_seconds: 0,
          end_seconds: 100,
          label: 'major',
          root_pc: 0,
          candidate_label: 'C',
          confidence: 1,
        },
      ],
    },
    beat: {
      schema_version: '1',
      source_sha256: 'x',
      beats: downbeats.map((t) => ({ time_seconds: t, is_downbeat: true })),
      downbeat_count: downbeats.length,
      tempo_median_bpm: 120,
    },
    key: {
      schema_version: '1',
      source_sha256: 'x',
      estimates: [],
      top_estimate: { tonic_pc: 9, mode: 'minor', score: 1 },
    },
    section: sections && {
      schema_version: '1',
      source_sha256: 'x',
      sections: sections.map((x) => ({
        start_seconds: x.s,
        end_seconds: x.e,
        label: x.l,
      })),
      settings: { sample_rate: 1, hop_length: 1, feature: 'f', n_segments: 2 },
      warnings: [],
    },
  };
}

// Duplicate downbeat at 4: bars are 0-4, 4-8, 8-12 (zero-length one dropped).
const DUP = track(
  [0, 4, 4, 8],
  [
    { s: 0, e: 4, l: 'A' },
    { s: 4, e: 12, l: 'B' },
  ],
);

describe('buildLibraryTrackView', () => {
  it('numbers bars by position with no gap after a zero-length bar', () => {
    const view = buildLibraryTrackView(DUP, 12);
    expect(view.bars.map((b) => b.index)).toEqual([0, 1, 2]);
    expect(view.bars.map((b) => b.startSeconds)).toEqual([0, 4, 8]);
  });

  it('highlighted bar and section agree after a duplicate downbeat', () => {
    const view = buildLibraryTrackView(DUP, 12);
    for (const t of [0.5, 3.9, 4, 5, 7.9, 8, 11]) {
      const bar = barAtTime(view, t);
      const sec = sectionAtTime(view, t);
      expect(bar).toBeGreaterThanOrEqual(0);
      expect(view.groups[sec].bars.map((b) => b.index)).toContain(bar);
    }
    expect(barAtTime(view, 8.5)).toBe(2);
    expect(view.groups[sectionAtTime(view, 8.5)].section.label).toBe('B');
  });

  it('gives the chart cells of each section and of the whole track', () => {
    const view = buildLibraryTrackView(DUP, 12);
    const indexes = (cells: { bars: { index: number }[] }[]) =>
      cells.flatMap((c) => c.bars.map((b) => b.index));
    expect(indexes(view.cells)).toEqual([0, 1, 2]);
    for (const group of view.groups) {
      expect(indexes(group.cells)).toEqual(group.bars.map((b) => b.index));
    }
  });

  it('gives stats from the same bar list and key', () => {
    const view = buildLibraryTrackView(DUP, 12);
    expect(view.stats).toEqual({
      keyTonicPc: 9,
      keyMode: 'minor',
      barCount: 3,
    });
  });

  it('works with no section analysis', () => {
    const view = buildLibraryTrackView(track([0, 4, 8], null), 12);
    expect(view.groups).toEqual([]);
    expect(sectionAtTime(view, 1)).toBe(-1);
    expect(barAtTime(view, 1)).toBe(0);
  });

  it('falls back to one bar with fewer than two downbeats', () => {
    const view = buildLibraryTrackView(track([2], null), 12);
    expect(view.bars).toHaveLength(1);
    expect(view.stats.barCount).toBe(1);
    expect(barAtTime(view, 11)).toBe(0);
  });

  it('keeps a saved annotation on the same bars', () => {
    const doc: LibraryAnnotationDocument = {
      bar_count: 3,
      sections: [
        { label: 'Intro', start_bar: 0, end_bar: 1 },
        { label: 'Verso', start_bar: 1, end_bar: 3 },
      ],
    };
    const before = JSON.stringify(doc);
    const view = buildLibraryTrackView(DUP, 12, doc);
    expect(JSON.stringify(doc)).toBe(before);
    expect(view.groups.map((g) => g.bars.map((b) => b.index))).toEqual([
      [0],
      [1, 2],
    ]);
    expect(view.groups[sectionAtTime(view, 9)].section.label).toBe('Verso');
  });
});
