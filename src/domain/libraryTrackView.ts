import {
  barIndexAtSeconds,
  buildChordChartBars,
  groupBarsBySection,
  type BeatAnalysisJson,
  type ChordAnalysisJson,
  type ChordChartBar,
  type KeyAnalysisJson,
  type SectionAnalysisJson,
  type SectionGroup,
  type SectionSegment,
} from '@/components/library/libraryData';

/**
 * The saved, editable sections of one Library track. Bars are counted by
 * position in the bar list, from zero; `bar_count` is the size of that list
 * when the document was saved. `end_bar` is exclusive.
 */
export interface LibraryAnnotationDocument {
  bar_count: number;
  sections: { label: string; start_bar: number; end_bar: number }[];
}

export interface LibraryTrackAnalyses {
  chord: ChordAnalysisJson;
  beat: BeatAnalysisJson;
  key: KeyAnalysisJson;
  section: SectionAnalysisJson | null;
}

export interface LibraryTrackView {
  bars: ChordChartBar[];
  sections: SectionSegment[];
  groups: SectionGroup[];
  stats: { keyTonicPc: number; keyMode: 'major' | 'minor'; barCount: number };
}

export function buildLibraryTrackView(
  analyses: LibraryTrackAnalyses,
  durationSeconds: number,
  annotation?: LibraryAnnotationDocument | null,
): LibraryTrackView {
  const bars = buildChordChartBars(
    analyses.chord,
    analyses.beat,
    durationSeconds,
    analyses.key,
  );
  const sections =
    annotation && annotation.bar_count === bars.length
      ? sectionsFromAnnotation(annotation, bars)
      : (analyses.section?.sections ?? []);
  const top = analyses.key.top_estimate;
  return {
    bars,
    sections,
    groups: groupBarsBySection(bars, sections),
    stats: {
      keyTonicPc: top.tonic_pc,
      keyMode: top.mode,
      barCount: bars.length,
    },
  };
}

function sectionsFromAnnotation(
  annotation: LibraryAnnotationDocument,
  bars: ChordChartBar[],
): SectionSegment[] {
  const out: SectionSegment[] = [];
  for (const s of annotation.sections) {
    const first = bars[s.start_bar];
    const last = bars[s.end_bar - 1];
    if (!first || !last) continue;
    out.push({
      label: s.label,
      start_seconds: first.startSeconds,
      end_seconds: last.endSeconds,
    });
  }
  return out;
}

/** Index in `view.bars` of the bar at the playhead, or -1. */
export function barAtTime(view: LibraryTrackView, seconds: number): number {
  return barIndexAtSeconds(view.bars, seconds);
}

/**
 * Index in `view.groups` of the section that holds the bar at the playhead,
 * or -1. Taken from the same bar list, so the section always contains the
 * highlighted bar.
 */
export function sectionAtTime(
  view: LibraryTrackView,
  seconds: number,
): number {
  const bar = barAtTime(view, seconds);
  if (bar < 0) return -1;
  return view.groups.findIndex((g) => g.bars.some((b) => b.index === bar));
}
