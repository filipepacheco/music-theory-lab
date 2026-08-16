import { dotsForTimeSignature } from '@/utils/structureLayout';
import type { StructureBar, StructureSection, TimeSignature } from '@/types';

export interface StructureDocument {
  bars: StructureBar[];
  sections: StructureSection[];
}

export interface StructureDocumentOptions {
  createId?: () => string;
}

export interface StructureDocumentModule {
  reindex(document: StructureDocument): StructureDocument;
  addBar(
    document: StructureDocument,
    sectionId: string,
    timeSignature: TimeSignature,
  ): StructureDocument;
  removeBar(document: StructureDocument, barId: string): StructureDocument;
  setBarTimeSignature(
    document: StructureDocument,
    barId: string,
    timeSignature: TimeSignature,
  ): StructureDocument;
  setBarColor(
    document: StructureDocument,
    barId: string,
    color: string | undefined,
  ): StructureDocument;
  toggleBarAccent(
    document: StructureDocument,
    barId: string,
    dotIndex: number,
  ): StructureDocument;
  addSection(
    document: StructureDocument,
    name: string,
    color: string,
  ): StructureDocument & { focusedSectionId: string };
  duplicateSection(
    document: StructureDocument,
    sectionId: string,
    fallbackTimeSignature: TimeSignature,
  ): (StructureDocument & { focusedSectionId: string }) | null;
  removeSection(
    document: StructureDocument,
    sectionId: string,
    focusedSectionId: string | null,
  ): StructureDocument & { focusedSectionId: string | null };
  setSectionName(
    document: StructureDocument,
    sectionId: string,
    name: string,
  ): StructureDocument;
  setSectionColor(
    document: StructureDocument,
    sectionId: string,
    color: string,
  ): StructureDocument;
  setSectionComment(
    document: StructureDocument,
    sectionId: string,
    comment: string,
  ): StructureDocument;
  setSectionBarsPerRow(
    document: StructureDocument,
    sectionId: string,
    barsPerRow: number | undefined,
  ): StructureDocument;
  reorderSections(
    document: StructureDocument,
    activeId: string,
    overId: string,
  ): StructureDocument;
  moveBarToSection(
    document: StructureDocument,
    barId: string,
    sectionId: string,
  ): StructureDocument;
}

function reindexBars(
  bars: StructureBar[],
  sections: StructureSection[],
): StructureBar[] {
  const barMap = new Map(bars.map((bar) => [bar.id, bar]));
  const ordered: StructureBar[] = [];

  for (const section of sections) {
    for (const barId of section.barIds) {
      const bar = barMap.get(barId);
      if (bar) ordered.push(bar);
    }
  }

  return ordered.map((bar, index) => ({ ...bar, index }));
}

function withReindexedBars(
  bars: StructureBar[],
  sections: StructureSection[],
): StructureDocument {
  return { bars: reindexBars(bars, sections), sections };
}

export function createStructureDocumentModule(
  options: StructureDocumentOptions = {},
): StructureDocumentModule {
  const createId = options.createId ?? (() => crypto.randomUUID());

  return {
    reindex: (document) => withReindexedBars(document.bars, document.sections),

    addBar: (document, sectionId, timeSignature) => {
      const bar: StructureBar = {
        id: createId(),
        index: document.bars.length,
        timeSignature,
      };
      const sections = document.sections.map((section) =>
        section.id === sectionId
          ? { ...section, barIds: [...section.barIds, bar.id] }
          : section,
      );
      return withReindexedBars([...document.bars, bar], sections);
    },

    removeBar: (document, barId) => {
      const bars = document.bars.filter((bar) => bar.id !== barId);
      const sections = document.sections.map((section) => ({
        ...section,
        barIds: section.barIds.filter((id) => id !== barId),
      }));
      return withReindexedBars(bars, sections);
    },

    setBarTimeSignature: (document, barId, timeSignature) => {
      const dotCount = dotsForTimeSignature(timeSignature);
      const bars = document.bars.map((bar) => {
        if (bar.id !== barId) return bar;
        const accents = bar.accents?.filter((index) => index < dotCount);
        return {
          ...bar,
          timeSignature,
          accents: accents && accents.length > 0 ? accents : undefined,
        };
      });
      return { bars, sections: document.sections };
    },

    setBarColor: (document, barId, color) => ({
      bars: document.bars.map((bar) =>
        bar.id === barId ? { ...bar, color } : bar,
      ),
      sections: document.sections,
    }),

    toggleBarAccent: (document, barId, dotIndex) => ({
      bars: document.bars.map((bar) => {
        if (bar.id !== barId) return bar;
        const accents = bar.accents ?? [];
        const next = accents.includes(dotIndex)
          ? accents.filter((index) => index !== dotIndex)
          : [...accents, dotIndex].sort((a, b) => a - b);
        return { ...bar, accents: next.length > 0 ? next : undefined };
      }),
      sections: document.sections,
    }),

    addSection: (document, name, color) => {
      const id = createId();
      return {
        sections: [...document.sections, { id, name, color, barIds: [] }],
        bars: document.bars,
        focusedSectionId: id,
      };
    },

    duplicateSection: (document, sectionId, fallbackTimeSignature) => {
      const source = document.sections.find(
        (section) => section.id === sectionId,
      );
      if (!source) return null;

      const newBars = source.barIds.map((barId) => {
        const original = document.bars.find((bar) => bar.id === barId);
        return {
          id: createId(),
          index: 0,
          timeSignature: original?.timeSignature ?? fallbackTimeSignature,
          color: original?.color,
          accents: original?.accents ? [...original.accents] : undefined,
        };
      });
      const newSectionId = createId();
      const newSection: StructureSection = {
        id: newSectionId,
        name: source.name,
        color: source.color,
        barIds: newBars.map((bar) => bar.id),
        comment: source.comment,
        barsPerRow: source.barsPerRow,
      };
      const insertIndex = document.sections.indexOf(source) + 1;
      const sections = [...document.sections];
      sections.splice(insertIndex, 0, newSection);

      return {
        ...withReindexedBars([...document.bars, ...newBars], sections),
        focusedSectionId: newSectionId,
      };
    },

    removeSection: (document, sectionId, focusedSectionId) => {
      const section = document.sections.find((item) => item.id === sectionId);
      const removedBarIds = new Set(section?.barIds ?? []);
      const sections = document.sections
        .filter((item) => item.id !== sectionId)
        .map((item) =>
          item.repeatOf === sectionId ? { ...item, repeatOf: undefined } : item,
        );
      const bars = document.bars.filter((bar) => !removedBarIds.has(bar.id));

      return {
        ...withReindexedBars(bars, sections),
        focusedSectionId:
          focusedSectionId === sectionId ? null : focusedSectionId,
      };
    },

    setSectionName: (document, sectionId, name) => ({
      bars: document.bars,
      sections: document.sections.map((section) =>
        section.id === sectionId ? { ...section, name } : section,
      ),
    }),

    setSectionColor: (document, sectionId, color) => ({
      bars: document.bars,
      sections: document.sections.map((section) =>
        section.id === sectionId ? { ...section, color } : section,
      ),
    }),

    setSectionComment: (document, sectionId, comment) => ({
      bars: document.bars,
      sections: document.sections.map((section) =>
        section.id === sectionId ? { ...section, comment } : section,
      ),
    }),

    setSectionBarsPerRow: (document, sectionId, barsPerRow) => ({
      bars: document.bars,
      sections: document.sections.map((section) =>
        section.id === sectionId ? { ...section, barsPerRow } : section,
      ),
    }),

    reorderSections: (document, activeId, overId) => {
      const oldIndex = document.sections.findIndex(
        (section) => section.id === activeId,
      );
      const newIndex = document.sections.findIndex(
        (section) => section.id === overId,
      );
      if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) {
        return document;
      }

      const sections = [...document.sections];
      const [moved] = sections.splice(oldIndex, 1);
      sections.splice(newIndex, 0, moved);
      return withReindexedBars(document.bars, sections);
    },

    moveBarToSection: (document, barId, sectionId) => {
      const sections = document.sections.map((section) => {
        const withoutBar = section.barIds.filter((id) => id !== barId);
        return section.id === sectionId
          ? { ...section, barIds: [...withoutBar, barId] }
          : { ...section, barIds: withoutBar };
      });
      return withReindexedBars(document.bars, sections);
    },
  };
}

export const structureDocument = createStructureDocumentModule();
