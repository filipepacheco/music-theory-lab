import type { StructureBar, StructureSection, TimeSignature } from '@/types';

/** Eighth-note subdivisions per time signature — the one copy of this map. */
const DOTS_BY_TIME_SIGNATURE: Record<TimeSignature, number> = {
  '4/4': 8,
  '3/4': 6,
  '2/4': 4,
  '6/8': 6,
};

/** Resolves a section's bars, in order, dropping any bar id that no longer exists. */
export function getSectionBars(
  section: StructureSection,
  barMap: Map<string, StructureBar>,
): StructureBar[] {
  return section.barIds
    .map((id) => barMap.get(id))
    .filter((bar): bar is StructureBar => bar !== undefined);
}

/** Number of beat dots a bar renders, from its time signature. */
export function dotsForTimeSignature(ts: TimeSignature): number {
  return DOTS_BY_TIME_SIGNATURE[ts];
}

/** A bar shows its own color when set, otherwise the section's. */
export function effectiveBarColor(
  color: string | undefined,
  sectionColor: string | undefined,
): string | undefined {
  return color ?? sectionColor;
}

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.substring(0, 2), 16),
    parseInt(h.substring(2, 4), 16),
    parseInt(h.substring(4, 6), 16),
  ];
}

/** Mixes a hex color toward white — the print-side lightening rule. */
export function lightenRgb(
  hex: string,
  amount: number,
): [number, number, number] {
  const [r, g, b] = hexToRgb(hex);
  return [
    Math.min(255, r + (255 - r) * amount),
    Math.min(255, g + (255 - g) * amount),
    Math.min(255, b + (255 - b) * amount),
  ];
}
