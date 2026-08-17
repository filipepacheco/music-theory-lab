import { SECTION_COLORS, SECTION_LABELS } from '@/constants/songSections';
import { STRUCTURE_PALETTE } from '@/constants/structureColors';
import type { StructureBar, StructureSection } from '@/types';

/** Legacy section format (type+customLabel) as persisted before name+color. */
export interface LegacySection {
  id: string;
  type?: string;
  customLabel?: string;
  name?: string;
  color?: string;
  barIds: string[];
  repeatOf?: string;
  comment?: string;
}

/** Migrate one legacy section to the current name+color shape. */
export function migrateSection(raw: LegacySection): StructureSection {
  if (raw.name !== undefined && raw.color !== undefined) {
    return raw as StructureSection;
  }
  const sectionType = raw.type ?? 'custom';
  return {
    id: raw.id,
    name:
      sectionType === 'custom' && raw.customLabel
        ? raw.customLabel
        : (SECTION_LABELS[sectionType as keyof typeof SECTION_LABELS] ??
          sectionType),
    color:
      SECTION_COLORS[sectionType as keyof typeof SECTION_COLORS] ??
      STRUCTURE_PALETTE[0],
    barIds: raw.barIds,
    repeatOf: raw.repeatOf,
    comment: raw.comment,
  };
}

/**
 * Migrate a persisted structure document: legacy sections get name+color,
 * and bars not assigned to any section are collected under "Sem secao".
 */
export function migrateStructureData(
  bars: StructureBar[],
  rawSections: LegacySection[],
): { bars: StructureBar[]; sections: StructureSection[] } {
  const sections = rawSections.map(migrateSection);
  const assignedIds = new Set(sections.flatMap((s) => s.barIds));
  const unassigned = bars.filter((b) => !assignedIds.has(b.id));
  if (unassigned.length > 0) {
    sections.push({
      id: crypto.randomUUID(),
      name: 'Sem secao',
      color: '#9ca3af',
      barIds: unassigned.map((b) => b.id),
    });
  }
  return { bars, sections };
}
