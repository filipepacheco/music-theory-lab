import { NOTE_NAMES } from '@/constants/notes';

export const CHORD_TEMPLATES: Record<string, number[]> = {
  maj: [0, 4, 7],
  min: [0, 3, 7],
  dim: [0, 3, 6],
  aug: [0, 4, 8],
  '5': [0, 7],
  maj7: [0, 4, 7, 11],
  min7: [0, 3, 7, 10],
  dom7: [0, 4, 7, 10],
  sus2: [0, 2, 7],
  sus4: [0, 5, 7],
  add9: [0, 4, 7, 2],
  minadd9: [0, 3, 7, 2],
  '6': [0, 4, 7, 9],
  min6: [0, 3, 7, 9],
  add11: [0, 4, 5, 7],
  minadd11: [0, 3, 5, 7],
  '6no3': [0, 7, 9],
  sus4add9: [0, 2, 5, 7],
};

export interface ChordMatch {
  root: number;
  quality: string;
  intervals: number[];
}

export type BarChordResult =
  | ({ kind: 'chord' } & ChordMatch)
  | { kind: 'unclear' }
  | { kind: 'no-chord-data' };

export function chordLabel(match: ChordMatch): string {
  return `${NOTE_NAMES[match.root]}${match.quality}`;
}

function pitchClassSet(midiPitches: number[]): Set<number> {
  return new Set(midiPitches.map((m) => ((m % 12) + 12) % 12));
}

function exactMatches(pcs: Set<number>): ChordMatch[] {
  const out: ChordMatch[] = [];
  for (let root = 0; root < 12; root++) {
    for (const [quality, intervals] of Object.entries(CHORD_TEMPLATES)) {
      const template = new Set(intervals.map((i) => (i + root) % 12));
      if (
        template.size === pcs.size &&
        [...template].every((p) => pcs.has(p))
      ) {
        out.push({ root, quality, intervals });
      }
    }
  }
  return out;
}

export function matchBar(
  harmonyPitches: number[],
  rootPitches: number[],
): BarChordResult {
  if (harmonyPitches.length === 0 && rootPitches.length === 0) {
    return { kind: 'no-chord-data' };
  }

  const rootLowestPc =
    rootPitches.length > 0 ? ((Math.min(...rootPitches) % 12) + 12) % 12 : null;

  const source = harmonyPitches.length > 0 ? harmonyPitches : rootPitches;
  const candidates = exactMatches(pitchClassSet(source));

  if (candidates.length === 0) return { kind: 'unclear' };
  if (candidates.length === 1) return { kind: 'chord', ...candidates[0] };

  if (rootLowestPc !== null) {
    const agreeing = candidates.filter((c) => c.root === rootLowestPc);
    if (agreeing.length === 1) return { kind: 'chord', ...agreeing[0] };
  }
  return { kind: 'unclear' };
}
