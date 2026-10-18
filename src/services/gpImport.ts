import { getHarmonicField } from '@/utils/musicTheory';
import { getNoteName, getPreferredRootName } from '@/utils/noteHelpers';
import type { GpFile } from '@/services/gpFile';
import { matchBar, chordLabel, type BarChordResult } from '@/services/gpChords';
import type { ProgressionStep } from '@/constants/progressions';
import type { SongSection } from '@/types';

const QUALITY_SYMBOL: Record<string, string> = {
  maj: '',
  min: 'm',
  dim: 'dim',
  aug: 'aug',
  maj7: 'maj7',
  min7: 'm7',
  dom7: '7',
  '5': '5',
  sus2: 'sus2',
  sus4: 'sus4',
  sus4add9: 'sus4(9)',
  add9: 'add9',
  minadd9: 'm(add9)',
  add11: 'add11',
  minadd11: 'm(add11)',
  '6': '6',
  min6: 'm6',
  '6no3': '6(no3)',
};

export const UNKNOWN_LABEL = '?';

export const SECTION_SIZE = 64;

export type QualityFamily = 'MAJ' | 'MIN' | 'DIM' | 'AUG' | 'NOTHIRD';

export function familyOf(intervals: number[]): QualityFamily {
  const s = new Set(intervals.map((i) => ((i % 12) + 12) % 12));
  if (s.has(4) && s.has(8)) return 'AUG';
  if (s.has(3) && s.has(6)) return 'DIM';
  if (s.has(4)) return 'MAJ';
  if (s.has(3)) return 'MIN';
  return 'NOTHIRD';
}

function clampBeats(beats: number): number {
  if (!Number.isFinite(beats)) return 4;
  return Math.max(0.5, Math.min(8, Math.round(beats * 2) / 2));
}

export interface ImportedBar {
  bar: number;
  result: BarChordResult;
  detected: string | null;
  carried: boolean;
  step: ProgressionStep;
}

export function analyzeBars(
  gp: GpFile,
  harmonyTrack: string,
  rootTrack: string,
  keyRoot: number,
  isMinor: boolean,
): ImportedBar[] {
  const field = getHarmonicField(keyRoot, isMinor);
  const keyName = getPreferredRootName(keyRoot);

  const degrees = field.map((c) => ({
    root: c.notes[0],
    family: familyOf(c.intervals),
    roman: c.romanNumeral,
  }));

  const bars: ImportedBar[] = [];
  let last: ProgressionStep | null = null;

  for (let i = 0; i < gp.masterBarCount; i++) {
    const beats = clampBeats(gp.quarterNoteBeats(i));
    const result = matchBar(
      gp.pitchesFor(i, harmonyTrack),
      gp.pitchesFor(i, rootTrack),
    );

    if (result.kind !== 'chord') {
      bars.push({
        bar: i + 1,
        result,
        detected: null,
        carried: last !== null,
        step: last
          ? { ...last, beats, confidence: 'unsure' }
          : { degree: null, label: UNKNOWN_LABEL, beats, confidence: 'unsure' },
      });
      continue;
    }

    const family = familyOf(result.intervals);
    const degIdx = degrees.findIndex(
      (d) =>
        d.root === result.root && (family === 'NOTHIRD' || d.family === family),
    );

    const step: ProgressionStep =
      degIdx >= 0
        ? { degree: degIdx, label: degrees[degIdx].roman, beats }
        : {
            degree: null,
            label: `${getNoteName(result.root, keyName)}${QUALITY_SYMBOL[result.quality] ?? result.quality}`,
            intervals: result.intervals.map(
              (iv) => (result.root - keyRoot + iv + 12) % 12,
            ),
            beats,
          };

    last = step;
    bars.push({
      bar: i + 1,
      result,
      detected: chordLabel(result),
      carried: false,
      step,
    });
  }

  return bars;
}

export interface ImportSummary {
  diatonic: number;
  chromatic: number;
  unclear: number;
  noData: number;
}

export function summarise(bars: ImportedBar[]): ImportSummary {
  return {
    diatonic: bars.filter((b) => !b.carried && b.step.degree !== null).length,
    chromatic: bars.filter(
      (b) => !b.carried && b.result.kind === 'chord' && b.step.degree === null,
    ).length,
    unclear: bars.filter((b) => b.result.kind === 'unclear').length,
    noData: bars.filter((b) => b.result.kind === 'no-chord-data').length,
  };
}

export function assembleSections(bars: ImportedBar[]): SongSection[] {
  const sections: SongSection[] = [];
  for (let i = 0; i < bars.length; i += SECTION_SIZE) {
    const n = sections.length + 1;
    sections.push({
      id: crypto.randomUUID(),
      type: 'custom',
      customLabel: `Parte ${n}`,
      steps: bars.slice(i, i + SECTION_SIZE).map((b) => b.step),
    });
  }
  return sections;
}
