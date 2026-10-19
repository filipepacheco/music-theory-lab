import type { StructureBar, StructureSection, TimeSignature } from '@/types';

const DOTS_BY_TIME_SIGNATURE: Record<TimeSignature, number> = {
  '4/4': 8,
  '3/4': 6,
  '2/4': 4,
  '6/8': 6,
};

export function getSectionBars(
  section: StructureSection,
  barMap: Map<string, StructureBar>,
): StructureBar[] {
  return section.barIds
    .map((id) => barMap.get(id))
    .filter((bar): bar is StructureBar => bar !== undefined);
}

export function dotsForTimeSignature(ts: TimeSignature): number {
  return DOTS_BY_TIME_SIGNATURE[ts];
}

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
