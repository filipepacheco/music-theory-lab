import { SECTION_COLORS, SECTION_LABELS } from '@/constants/songSections';
import { STRUCTURE_PALETTE } from '@/constants/structureColors';
import { normalizedGroove } from '@/domain/structureDocument';
import type { GroovePattern, StructureBar, StructureSection } from '@/types';

export interface LegacySection {
  id: string;
  type?: string;
  customLabel?: string;
  name?: string;
  color?: string;
  barIds: string[];
  repeatOf?: string;
  comment?: string;
  groove?: GroovePattern;
}

/** A stored groove, normalized, or none when it is not an object. */
function loadedGroove(groove: unknown): GroovePattern | undefined {
  if (typeof groove !== 'object' || groove === null || Array.isArray(groove)) {
    return undefined;
  }
  return normalizedGroove(groove as GroovePattern);
}

export function migrateSection(raw: LegacySection): StructureSection {
  if (raw.name !== undefined && raw.color !== undefined) {
    if (raw.groove === undefined) return raw as StructureSection;
    return { ...(raw as StructureSection), groove: loadedGroove(raw.groove) };
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
    groove: loadedGroove(raw.groove),
  };
}

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
      name: 'Sem seção',
      color: '#9ca3af',
      barIds: unassigned.map((b) => b.id),
    });
  }
  return { bars, sections };
}
