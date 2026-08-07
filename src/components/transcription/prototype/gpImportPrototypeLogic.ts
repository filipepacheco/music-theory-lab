// PROTOTYPE — throwaway. Answers "what should the .gp import panel look like?"
// for https://github.com/filipepacheco/music-theory-lab/issues/14.
//
// Deliberately does NOT save anything. Building the real Song and persisting it
// belongs to the assembler ticket (#15); this only shows what *would* be
// imported so the layout can be judged against real data.
//
// The mapping below implements the rule decided on #13, but roughly — the
// production version lands with the assembler.

import { getHarmonicField } from '@/utils/musicTheory';
import { getNoteName } from '@/utils/noteHelpers';
import type { GpFile } from '@/services/gpFile';
import { matchBar, chordLabel, type BarChordResult } from '@/services/gpChords';

/** Display symbols for the extractor qualities the app's CHORD_TYPES lacks. */
const QUALITY_SYMBOL: Record<string, string> = {
  maj: '', min: 'm', dim: 'dim', aug: 'aug',
  maj7: 'maj7', min7: 'm7', dom7: '7',
  '5': '5', sus2: 'sus2', sus4: 'sus4', sus4add9: 'sus4(9)',
  add9: 'add9', minadd9: 'm(add9)', add11: 'add11', minadd11: 'm(add11)',
  '6': '6', min6: 'm6', '6no3': '6(no3)',
};

export type QualityFamily = 'MAJ' | 'MIN' | 'DIM' | 'AUG' | 'NOTHIRD';

/**
 * Derived from intervals rather than a lookup table, so it works for both the
 * extractor's templates and the harmonic field's chords without a second map
 * to keep in sync.
 */
export function familyOf(intervals: number[]): QualityFamily {
  const s = new Set(intervals.map((i) => ((i % 12) + 12) % 12));
  if (s.has(4) && s.has(8)) return 'AUG';
  if (s.has(3) && s.has(6)) return 'DIM';
  if (s.has(4)) return 'MAJ';
  if (s.has(3)) return 'MIN';
  return 'NOTHIRD';
}

export interface PreviewRow {
  bar: number;
  /** What the matcher found, before any key is applied. */
  result: BarChordResult;
  /** Raw absolute chord name, e.g. "G#min". Null unless resolved. */
  detected: string | null;
  /** Index into the harmonic field, or null for a chromatic step. */
  degree: number | null;
  /** What the step would display: roman numeral, or absolute symbol. */
  label: string;
  /** True when this bar inherited the previous bar's chord. */
  carried: boolean;
}

export function buildPreview(
  gp: GpFile,
  harmonyTrack: string,
  rootTrack: string,
  keyRoot: number,
  isMinor: boolean,
): PreviewRow[] {
  const field = getHarmonicField(keyRoot, isMinor);
  const keyName = getNoteName(keyRoot);

  const degrees = field.map((c) => ({
    root: c.notes[0],
    family: familyOf(c.intervals),
    roman: c.romanNumeral,
  }));

  const rows: PreviewRow[] = [];
  let lastResolved: { degree: number | null; label: string } | null = null;

  for (let i = 0; i < gp.masterBarCount; i++) {
    const result = matchBar(
      gp.pitchesFor(i, harmonyTrack),
      gp.pitchesFor(i, rootTrack),
    );

    if (result.kind !== 'chord') {
      // Unclear and no-chord-data both carry the previous chord forward,
      // flagged so the user can see which bars to review.
      rows.push({
        bar: i + 1,
        result,
        detected: null,
        degree: lastResolved?.degree ?? null,
        label: lastResolved?.label ?? '—',
        carried: lastResolved !== null,
      });
      continue;
    }

    const family = familyOf(result.intervals);
    const degIdx = degrees.findIndex(
      (d) =>
        d.root === result.root &&
        (family === 'NOTHIRD' || d.family === family),
    );

    const label =
      degIdx >= 0
        ? degrees[degIdx].roman
        : `${getNoteName(result.root, keyName)}${QUALITY_SYMBOL[result.quality] ?? result.quality}`;

    lastResolved = { degree: degIdx >= 0 ? degIdx : null, label };
    rows.push({
      bar: i + 1,
      result,
      detected: chordLabel(result),
      degree: degIdx >= 0 ? degIdx : null,
      label,
      carried: false,
    });
  }

  return rows;
}

export interface PreviewSummary {
  total: number;
  diatonic: number;
  chromatic: number;
  unclear: number;
  noData: number;
}

export function summarise(rows: PreviewRow[]): PreviewSummary {
  return {
    total: rows.length,
    diatonic: rows.filter((r) => !r.carried && r.degree !== null).length,
    chromatic: rows.filter((r) => !r.carried && r.result.kind === 'chord' && r.degree === null).length,
    unclear: rows.filter((r) => r.result.kind === 'unclear').length,
    noData: rows.filter((r) => r.result.kind === 'no-chord-data').length,
  };
}

/** pt-BR message per rejection kind, for the error state each variant shows. */
export const ERROR_MESSAGE: Record<string, string> = {
  'legacy-binary':
    'Formato antigo do Guitar Pro (.gp3/.gp4/.gp5). Só arquivos .gp do Guitar Pro 7 ou 8 são suportados.',
  'gpx-container':
    'Arquivo .gpx do Guitar Pro 6. Só arquivos .gp do Guitar Pro 7 ou 8 são suportados.',
  'not-a-zip': 'Este arquivo não parece ser um arquivo do Guitar Pro.',
  'not-a-gp-file': 'O arquivo está compactado, mas não contém uma partitura do Guitar Pro.',
  corrupt: 'O arquivo parece estar corrompido e não pôde ser lido.',
};
