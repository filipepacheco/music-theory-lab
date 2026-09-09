import { getPreferredRootName } from '@/utils/noteHelpers';

const LIBRARY_ROOT = '/library';

export interface LibraryIndexEntry {
  source_sha256: string;
  sha256_prefix: string;
  title: string;
  artist: string;
  duration_seconds: number;
  detected_key: {
    tonic_pc: number;
    tonic_name: string;
    mode: 'major' | 'minor';
    confidence_score: number;
  };
  detected_tempo_bpm: number;
  beat_count: number;
  downbeat_count: number;
  chord_segment_count: number;
  detail_directory: string;
  /** Present since the section stage shipped; absent on older indexes. */
  has_sections?: boolean;
  /** Only written when `has_sections` is true. */
  section_count?: number;
  section_origin?: 'automatic' | 'fallback';
  review_required?: boolean;
}

export interface LibraryIndex {
  schema_version: string;
  generated_at: string;
  track_count: number;
  tracks: LibraryIndexEntry[];
}

export interface ChordSegment {
  start_seconds: number;
  end_seconds: number;
  label: 'major' | 'minor' | 'unknown' | 'no_chord';
  root_pc: number | null;
  candidate_label: string;
  confidence: number | null;
}

export interface ChordAnalysisJson {
  schema_version: string;
  source_sha256: string;
  segments: ChordSegment[];
}

export interface BeatEstimate {
  time_seconds: number;
  is_downbeat: boolean;
}

export interface BeatAnalysisJson {
  schema_version: string;
  source_sha256: string;
  beats: BeatEstimate[];
  downbeat_count: number;
  tempo_median_bpm: number;
}

export interface KeyEstimate {
  tonic_pc: number;
  mode: 'major' | 'minor';
  score: number;
}

export interface KeyAnalysisJson {
  schema_version: string;
  source_sha256: string;
  estimates: KeyEstimate[];
  top_estimate: KeyEstimate;
}

/**
 * One contiguous stretch of the track. `label` is a letter tag the detector
 * uses to group parts it considers similar (two segments labelled "A" are
 * its guess at the same repeated part). The labels carry no semantic
 * meaning — they are never "verse" or "chorus", only opaque cluster ids.
 */
export interface SectionSegment {
  start_seconds: number;
  end_seconds: number;
  label: string;
  cluster_id?: number | null;
  origin?: 'automatic' | 'fallback';
  review_required?: boolean;
}

export interface SectionAnalysisJson {
  schema_version: string;
  source_sha256: string;
  origin: 'automatic' | 'fallback';
  review_required: boolean;
  fallback_reason_codes: string[];
  sections: SectionSegment[];
  settings: {
    sample_rate: number;
    hop_length: number;
    feature?: string;
    n_segments?: number;
    candidate_m_min?: number;
    candidate_m_max?: number;
  } | null;
  warnings: string[];
}

export async function fetchLibraryIndex(
  signal?: AbortSignal,
): Promise<LibraryIndex> {
  const response = await fetch(`${LIBRARY_ROOT}/index.json`, { signal });
  if (!response.ok) {
    throw new Error(`Failed to fetch library index: HTTP ${response.status}`);
  }
  return (await response.json()) as LibraryIndex;
}

export async function fetchTrackAnalyses(
  entry: LibraryIndexEntry,
  signal?: AbortSignal,
): Promise<{
  chord: ChordAnalysisJson;
  beat: BeatAnalysisJson;
  key: KeyAnalysisJson;
  section: SectionAnalysisJson | null;
}> {
  const base = `${LIBRARY_ROOT}/${entry.detail_directory}`;
  const [chord, beat, key, section] = await Promise.all([
    fetchJson<ChordAnalysisJson>(`${base}/chord-analysis-result.json`, signal),
    fetchJson<BeatAnalysisJson>(`${base}/beat-analysis-result.json`, signal),
    fetchJson<KeyAnalysisJson>(`${base}/key-analysis-result.json`, signal),
    fetchSection(entry, base, signal),
  ]);
  return { chord, beat, key, section };
}

/**
 * Sections are optional: older tracks predate the stage, and an index can
 * outrun the files on disk. Either way a missing section file degrades to
 * the flat chord chart rather than failing the whole detail view.
 */
async function fetchSection(
  entry: LibraryIndexEntry,
  base: string,
  signal?: AbortSignal,
): Promise<SectionAnalysisJson | null> {
  if (entry.has_sections === false) return null;
  try {
    return await fetchJson<SectionAnalysisJson>(
      `${base}/section-analysis-result.json`,
      signal,
    );
  } catch {
    return null;
  }
}

async function fetchJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error(`Fetch failed: HTTP ${response.status} ${url}`);
  }
  return (await response.json()) as T;
}

/**
 * Display name for one chord segment. Returns 'N.C.' for no_chord and '?'
 * for unknown; a root_pc + label mapping otherwise (e.g. root_pc=9,
 * label=minor → "Am"; root_pc=1, label=major → "C#").
 */
export function chordDisplayName(segment: ChordSegment): string {
  if (segment.label === 'no_chord') return 'N.C.';
  if (segment.label === 'unknown' || segment.root_pc === null) return '?';
  const rootName = getPreferredRootName(segment.root_pc);
  return segment.label === 'minor' ? `${rootName}m` : rootName;
}

type DegreeEntry = readonly [number, '' | 'b' | '#'];

const MAJOR_DEGREE_MAP: readonly DegreeEntry[] = [
  [1, ''],
  [2, 'b'],
  [2, ''],
  [3, 'b'],
  [3, ''],
  [4, ''],
  [4, '#'],
  [5, ''],
  [6, 'b'],
  [6, ''],
  [7, 'b'],
  [7, ''],
];

const MINOR_DEGREE_MAP: readonly DegreeEntry[] = [
  [1, ''],
  [2, 'b'],
  [2, ''],
  [3, ''],
  [3, '#'],
  [4, ''],
  [5, 'b'],
  [5, ''],
  [6, ''],
  [6, '#'],
  [7, ''],
  [7, '#'],
];

const DEGREE_NUMERALS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'] as const;

/**
 * Roman-numeral degree for a chord relative to a key. Case is upper for
 * major chord quality, lower for minor. `relativeRootPc` is the chromatic
 * offset (0-11) from the key's tonic — use `relativeRootOf` to compute it.
 * Returns null for non-pitched or non-triadic chord labels.
 */
export function romanNumeral(
  relativeRootPc: number,
  chordLabel: ChordSegment['label'],
  keyMode: 'major' | 'minor',
): string | null {
  if (chordLabel !== 'major' && chordLabel !== 'minor') return null;
  const idx = ((relativeRootPc % 12) + 12) % 12;
  const map = keyMode === 'major' ? MAJOR_DEGREE_MAP : MINOR_DEGREE_MAP;
  const [degree, accidental] = map[idx];
  const base = DEGREE_NUMERALS[degree - 1];
  const numeral = chordLabel === 'minor' ? base.toLowerCase() : base;
  return `${accidental}${numeral}`;
}

/**
 * Chromatic offset (0-11) of a chord root from the key's tonic.
 */
export function relativeRootOf(
  chordRootPc: number,
  keyTonicPc: number,
): number {
  return (((chordRootPc - keyTonicPc) % 12) + 12) % 12;
}

/**
 * Roman numeral for a chord segment given a key, or null if the segment is
 * non-pitched or lacks a root_pc.
 */
export function segmentRomanNumeral(
  segment: ChordSegment,
  key: KeyAnalysisJson,
): string | null {
  if (segment.root_pc === null) return null;
  const rel = relativeRootOf(segment.root_pc, key.top_estimate.tonic_pc);
  return romanNumeral(rel, segment.label, key.top_estimate.mode);
}

export interface BarChord {
  chord: string;
  romanNumeral: string | null;
  raw: ChordSegment | null;
}

export interface ChordChartBar {
  index: number;
  startSeconds: number;
  endSeconds: number;
  chords: BarChord[];
}

/**
 * Break the track into bars using detected downbeats and pick one chord per
 * bar based on longest-overlap with the segment list.
 *
 * A "bar" is one downbeat-to-next-downbeat span. If the track has fewer than
 * two downbeats we fall back to a single bar covering the full duration.
 * When more than one chord is present in a bar we pick the one with the
 * largest overlap — accurate enough for a first-slice display of major/minor
 * chords that already lasts multiple beats each.
 */
export function buildChordChartBars(
  chord: ChordAnalysisJson,
  beat: BeatAnalysisJson,
  totalDurationSeconds: number,
  key?: KeyAnalysisJson,
): ChordChartBar[] {
  const downbeats = beat.beats
    .filter((b) => b.is_downbeat)
    .map((b) => b.time_seconds);
  if (downbeats.length < 2) {
    return [
      {
        index: 0,
        startSeconds: 0,
        endSeconds: totalDurationSeconds,
        chords: [{ chord: '—', romanNumeral: null, raw: null }],
      },
    ];
  }

  const boundaries = [...downbeats, totalDurationSeconds];
  const bars: ChordChartBar[] = [];
  for (let i = 0; i < boundaries.length - 1; i += 1) {
    const start = boundaries[i];
    const end = boundaries[i + 1];
    if (end <= start) continue;
    const dominant = pickDominantSegment(chord.segments, start, end);
    bars.push({
      index: i,
      startSeconds: start,
      endSeconds: end,
      chords: [
        {
          chord: dominant ? chordDisplayName(dominant) : '—',
          romanNumeral:
            dominant && key ? segmentRomanNumeral(dominant, key) : null,
          raw: dominant,
        },
      ],
    });
  }
  return bars;
}

function pickDominantSegment(
  segments: ChordSegment[],
  start: number,
  end: number,
): ChordSegment | null {
  let best: ChordSegment | null = null;
  let bestOverlap = 0;
  for (const seg of segments) {
    const overlap = Math.max(
      0,
      Math.min(seg.end_seconds, end) - Math.max(seg.start_seconds, start),
    );
    if (overlap > bestOverlap) {
      bestOverlap = overlap;
      best = seg;
    }
  }
  return best;
}

/**
 * Return the index of the bar whose [startSeconds, endSeconds) contains
 * `seconds`, or -1 if none (before the first bar or after the last).
 * Bars are assumed sorted by startSeconds and non-overlapping.
 */
export function barIndexAtSeconds(
  bars: ChordChartBar[],
  seconds: number,
): number {
  if (!Number.isFinite(seconds) || seconds < 0) return -1;
  for (let i = 0; i < bars.length; i += 1) {
    const bar = bars[i];
    if (seconds >= bar.startSeconds && seconds < bar.endSeconds) return i;
  }
  return -1;
}

/**
 * Chord names that carry no harmony: a run of them says "nothing was
 * detected here", which is worth one cell however long it lasts.
 */
const EMPTY_CHORD_NAMES = new Set(['N.C.', '?', '—']);

export interface ChartCell {
  /** Bars this cell stands for, in order. Never empty. */
  bars: ChordChartBar[];
  chord: string;
  romanNumeral: string | null;
  startSeconds: number;
  endSeconds: number;
  /** `bars.length`. Greater than 1 only for a collapsed run. */
  span: number;
}

/**
 * Collapse consecutive bars that carry no chord into a single cell.
 *
 * Fourteen "N.C." squares in a row tell the reader nothing that one square
 * reading "N.C. x14" does not, and they push the actual harmony off the
 * screen. Real chords are never merged: how many bars a chord lasts is the
 * whole point of a chord chart, so a repeated D stays one square per bar.
 */
export function collapseChartCells(bars: ChordChartBar[]): ChartCell[] {
  const cells: ChartCell[] = [];
  for (const bar of bars) {
    const chord = bar.chords[0].chord;
    const previous = cells[cells.length - 1];
    const mergeable =
      previous !== undefined &&
      EMPTY_CHORD_NAMES.has(chord) &&
      previous.chord === chord;
    if (mergeable) {
      previous.bars.push(bar);
      previous.span = previous.bars.length;
      previous.endSeconds = bar.endSeconds;
      continue;
    }
    cells.push({
      bars: [bar],
      chord,
      romanNumeral: bar.chords[0].romanNumeral,
      startSeconds: bar.startSeconds,
      endSeconds: bar.endSeconds,
      span: 1,
    });
  }
  return cells;
}

/**
 * Accent colours for song-form labels, defined in globals.css.
 *
 * Spelled out one literal at a time on purpose: Tailwind v4 drops `@theme`
 * variables whose names it cannot find in the scanned source, so a
 * `var(--color-form-${n})` built at runtime would leave every slot but the
 * one that happens to appear literally somewhere undefined — the colour
 * silently falls back to transparent.
 */
const SECTION_COLOR_VARS = [
  'var(--color-form-1)',
  'var(--color-form-2)',
  'var(--color-form-3)',
  'var(--color-form-4)',
  'var(--color-form-5)',
  'var(--color-form-6)',
] as const;

export const SECTION_COLOR_COUNT = SECTION_COLOR_VARS.length;

/**
 * CSS variable for a section's accent colour. `colorIndex` comes from
 * `sectionColorIndexes` and cycles once a track has more distinct labels
 * than we have tokens.
 */
export function sectionColorVar(colorIndex: number): string {
  const slot =
    ((colorIndex % SECTION_COLOR_COUNT) + SECTION_COLOR_COUNT) %
    SECTION_COLOR_COUNT;
  return SECTION_COLOR_VARS[slot];
}

/**
 * Map each distinct section label to a colour slot by order of first
 * appearance. Keyed off appearance rather than the letter itself so the
 * first labels of a track always get distinct colours, whatever the
 * detector happened to name them.
 */
export function sectionColorIndexes(
  sections: SectionSegment[],
): Map<string, number> {
  const byLabel = new Map<string, number>();
  for (const section of sections) {
    if (!byLabel.has(section.label)) byLabel.set(section.label, byLabel.size);
  }
  return byLabel;
}

/**
 * Index of the section whose [start_seconds, end_seconds) contains
 * `seconds`, or -1 if none. Sections are contiguous and ordered, so the
 * last section's end is treated as inclusive to avoid a dead frame at the
 * very end of the track.
 */
export function sectionIndexAtSeconds(
  sections: SectionSegment[],
  seconds: number,
): number {
  if (!Number.isFinite(seconds) || seconds < 0) return -1;
  for (let i = 0; i < sections.length; i += 1) {
    const section = sections[i];
    const isLast = i === sections.length - 1;
    const withinEnd = isLast
      ? seconds <= section.end_seconds
      : seconds < section.end_seconds;
    if (seconds >= section.start_seconds && withinEnd) return i;
  }
  return -1;
}

/**
 * Convert accepted analysis boundaries into editable bar boundaries. Detector
 * labels are intentionally ignored: annotations begin with neutral names.
 */
export function sectionBoundaryBars(
  bars: ChordChartBar[],
  sections: SectionSegment[],
): number[] {
  if (bars.length < 2 || sections.length < 2) return [];
  const boundaries = sections.slice(1).map((section) => {
    let nearest = 1;
    let distance = Math.abs(bars[1].startSeconds - section.start_seconds);
    for (let index = 2; index < bars.length; index += 1) {
      const candidateDistance = Math.abs(
        bars[index].startSeconds - section.start_seconds,
      );
      if (candidateDistance < distance) {
        nearest = index;
        distance = candidateDistance;
      }
    }
    return nearest;
  });
  return [...new Set(boundaries)].sort((left, right) => left - right);
}

export interface SectionGroup {
  section: SectionSegment;
  /** Position in the track, 0-based. */
  index: number;
  /** Colour slot for this group's label — see `sectionColorVar`. */
  colorIndex: number;
  /** Which appearance of this label this is, 1-based. */
  occurrence: number;
  /** How many times this label appears across the track. */
  occurrenceTotal: number;
  bars: ChordChartBar[];
}

/**
 * Distribute chord-chart bars across the detected sections.
 *
 * Section boundaries come from a spectral segmentation that knows nothing
 * about the beat grid, so a bar can straddle one. Each bar goes to the
 * section it overlaps most — the same rule `buildChordChartBars` already
 * uses to pick one chord per bar. Every bar lands in exactly one group even
 * when nothing overlaps it, so the grouped chart can never drop content the
 * flat chart would have shown.
 *
 * Returns [] when there are no sections, which callers read as "render the
 * flat chart instead".
 */
export function groupBarsBySection(
  bars: ChordChartBar[],
  sections: SectionSegment[],
): SectionGroup[] {
  if (sections.length === 0) return [];

  const colorIndexes = sectionColorIndexes(sections);
  const totals = new Map<string, number>();
  for (const section of sections) {
    totals.set(section.label, (totals.get(section.label) ?? 0) + 1);
  }

  const seen = new Map<string, number>();
  const groups: SectionGroup[] = sections.map((section, index) => {
    const occurrence = (seen.get(section.label) ?? 0) + 1;
    seen.set(section.label, occurrence);
    return {
      section,
      index,
      colorIndex: colorIndexes.get(section.label) ?? 0,
      occurrence,
      occurrenceTotal: totals.get(section.label) ?? 1,
      bars: [],
    };
  });

  for (const bar of bars) {
    groups[pickSectionForBar(sections, bar)].bars.push(bar);
  }
  return groups;
}

function pickSectionForBar(
  sections: SectionSegment[],
  bar: ChordChartBar,
): number {
  let best = -1;
  let bestOverlap = 0;
  for (let i = 0; i < sections.length; i += 1) {
    const overlap = Math.max(
      0,
      Math.min(sections[i].end_seconds, bar.endSeconds) -
        Math.max(sections[i].start_seconds, bar.startSeconds),
    );
    if (overlap > bestOverlap) {
      bestOverlap = overlap;
      best = i;
    }
  }
  if (best !== -1) return best;
  // No overlap at all (a zero-length bar, or one past the last boundary):
  // fall back to the last section that starts at or before the bar.
  let fallback = 0;
  for (let i = 0; i < sections.length; i += 1) {
    if (sections[i].start_seconds <= bar.startSeconds) fallback = i;
  }
  return fallback;
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.round(seconds);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
