import type { StructureBar, StructureSection } from '@/types';

/** Fixed-page outputs (print view, PDF) fall back to this when a section has no explicit barsPerRow. */
export const DEFAULT_PRINT_BARS_PER_ROW = 4;

/** Resolves a section's bars, in order, dropping any bar id that no longer exists. */
export function getSectionBars(
  section: StructureSection,
  barMap: Map<string, StructureBar>,
): StructureBar[] {
  return section.barIds
    .map((id) => barMap.get(id))
    .filter((bar): bar is StructureBar => bar !== undefined);
}
