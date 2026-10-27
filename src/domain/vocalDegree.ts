import { analyzeBassChart, intervalDegreeLabel } from '@/domain/bassAnalysis';
import type { BassChart } from '@/domain/bassChart';
import { suggestKeys, type MusicalKey } from '@/domain/bassHarmony';

/** The degree of a pitch in a key, for example "3" for E in C major. */
export function vocalDegree(midi: number, tonic: number): string {
  return intervalDegreeLabel((((midi - tonic) % 12) + 12) % 12, null);
}

/**
 * The key of the bass chart of the song, or null when the bass gives none.
 * Only the bass chart feeds it: vocals never feed the harmony analysis.
 */
export function bassKeyOf(bass: BassChart | null): MusicalKey | null {
  if (!bass) return null;
  const [key] = suggestKeys(bass, analyzeBassChart(bass));
  return key ? { tonic: key.tonic, mode: key.mode } : null;
}
