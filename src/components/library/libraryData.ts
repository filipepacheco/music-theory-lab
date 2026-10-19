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
  has_sections?: boolean;
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

interface SectionInterval {
  start_seconds: number;
  end_seconds: number;
}

export interface StructuralSectionSegment extends SectionInterval {
  label: `Parte ${number}`;
  cluster_id: number | null;
  origin: 'automatic' | 'fallback';
  review_required: boolean;
}

export interface LegacySectionSegment extends SectionInterval {
  label: string;
}

export type SectionSegment = StructuralSectionSegment | LegacySectionSegment;

interface SectionAnalysisBase<TSection extends SectionSegment> {
  schema_version: string;
  source_sha256: string;
  origin: 'automatic' | 'fallback';
  review_required: boolean;
  fallback_reason_codes: string[];
  sections: TSection[];
  warnings: string[];
}

export interface StructuralSectionAnalysisJson extends SectionAnalysisBase<StructuralSectionSegment> {
  stage_kind: 'section.mcfee_ellis_laplacian';
  decision: 'accepted' | 'fallback';
  reason_codes: string[];
  baseline_selected_m: number | null;
  baseline_candidate_levels: Array<{
    m: number;
    boundaries_seconds: number[];
  }>;
  measurements: {
    boundary_support: number[];
  };
  settings: {
    sample_rate: number;
    hop_length: number;
    candidate_m_min: number;
    candidate_m_max: number;
  };
}

export interface LegacySectionAnalysisJson extends SectionAnalysisBase<LegacySectionSegment> {
  stage_kind?: never;
  settings: {
    sample_rate: number;
    hop_length: number;
    feature: string;
    n_segments: number;
  } | null;
}

export type SectionAnalysisJson =
  | StructuralSectionAnalysisJson
  | LegacySectionAnalysisJson;

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

export function relativeRootOf(
  chordRootPc: number,
  keyTonicPc: number,
): number {
  return (((chordRootPc - keyTonicPc) % 12) + 12) % 12;
}

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

const EMPTY_CHORD_NAMES = new Set(['N.C.', '?', '—']);

export interface ChartCell {
  bars: ChordChartBar[];
  chord: string;
  romanNumeral: string | null;
  startSeconds: number;
  endSeconds: number;
  span: number;
}

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

const SECTION_COLOR_VARS = [
  'var(--color-form-1)',
  'var(--color-form-2)',
  'var(--color-form-3)',
  'var(--color-form-4)',
  'var(--color-form-5)',
  'var(--color-form-6)',
] as const;

export const SECTION_COLOR_COUNT = SECTION_COLOR_VARS.length;

export function sectionColorVar(colorIndex: number): string {
  const slot =
    ((colorIndex % SECTION_COLOR_COUNT) + SECTION_COLOR_COUNT) %
    SECTION_COLOR_COUNT;
  return SECTION_COLOR_VARS[slot];
}

export function sectionColorIndexes(
  sections: SectionSegment[],
): Map<string, number> {
  const byLabel = new Map<string, number>();
  for (const section of sections) {
    if (!byLabel.has(section.label)) byLabel.set(section.label, byLabel.size);
  }
  return byLabel;
}

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
  index: number;
  colorIndex: number;
  occurrence: number;
  occurrenceTotal: number;
  bars: ChordChartBar[];
}

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
