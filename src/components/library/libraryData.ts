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
}> {
  const base = `${LIBRARY_ROOT}/${entry.detail_directory}`;
  const [chord, beat, key] = await Promise.all([
    fetchJson<ChordAnalysisJson>(`${base}/chord-analysis-result.json`, signal),
    fetchJson<BeatAnalysisJson>(`${base}/beat-analysis-result.json`, signal),
    fetchJson<KeyAnalysisJson>(`${base}/key-analysis-result.json`, signal),
  ]);
  return { chord, beat, key };
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

export interface BarChord {
  chord: string;
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
): ChordChartBar[] {
  const downbeats = beat.beats.filter((b) => b.is_downbeat).map((b) => b.time_seconds);
  if (downbeats.length < 2) {
    return [
      {
        index: 0,
        startSeconds: 0,
        endSeconds: totalDurationSeconds,
        chords: [{ chord: '—', raw: null }],
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

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.round(seconds);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
