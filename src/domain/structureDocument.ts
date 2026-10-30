import { dotsForTimeSignature } from '@/utils/structureLayout';
import {
  DEFAULT_GROOVE_MEASURE_COUNT,
  DEFAULT_GROOVE_SUBDIVISION,
  DRUM_PIECES,
  GROOVE_SUBDIVISIONS,
  grooveBeatCount,
  grooveMeasureCount,
  grooveRow,
  grooveStepsPerBeat,
  grooveTotalStepCount,
} from '@/constants/groove';
import type {
  DrumPiece,
  GrooveMeasureCount,
  GroovePattern,
  GrooveSubdivision,
  StructureBar,
  StructureSection,
  TimeSignature,
} from '@/types';

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
  toggleGrooveHit(
    document: StructureDocument,
    sectionId: string,
    piece: DrumPiece,
    beat: number,
    step: number,
  ): StructureDocument;
  setGrooveBeatSubdivision(
    document: StructureDocument,
    sectionId: string,
    beat: number,
    subdivision: GrooveSubdivision,
  ): StructureDocument;
  setGrooveSubdivision(
    document: StructureDocument,
    sectionId: string,
    subdivision: GrooveSubdivision,
  ): StructureDocument;
  setGrooveMeasureCount(
    document: StructureDocument,
    sectionId: string,
    measureCount: GrooveMeasureCount,
  ): StructureDocument;
  clearGroove(
    document: StructureDocument,
    sectionId: string,
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

function emptyGroove(
  subdivision: GrooveSubdivision = DEFAULT_GROOVE_SUBDIVISION,
  measureCount: GrooveMeasureCount = DEFAULT_GROOVE_MEASURE_COUNT,
): GroovePattern {
  const stepCount = grooveTotalStepCount(subdivision, measureCount);
  const groove: GroovePattern = {
    subdivision,
    measureCount,
    bumbo: [],
    caixa: [],
    chimbal: [],
  };
  for (const piece of DRUM_PIECES) {
    groove[piece.id] = Array(stepCount).fill(false);
  }
  return groove;
}

/** The resolution and the hits of one beat of a groove. */
interface BeatContent {
  subdivision: GrooveSubdivision;
  /** True when the beat has its own resolution, not the base one. */
  own: boolean;
  rows: Record<DrumPiece, boolean[]>;
}

function isGrooveSubdivision(value: unknown): value is GrooveSubdivision {
  return GROOVE_SUBDIVISIONS.some((option) => option.id === value);
}

function baseSubdivision(groove: GroovePattern): GrooveSubdivision {
  return isGrooveSubdivision(groove.subdivision)
    ? groove.subdivision
    : DEFAULT_GROOVE_SUBDIVISION;
}

function beatRows(
  steps: number,
  read: (piece: DrumPiece) => unknown,
): Record<DrumPiece, boolean[]> {
  const rows = {} as Record<DrumPiece, boolean[]>;
  for (const piece of DRUM_PIECES) {
    const row = read(piece.id);
    rows[piece.id] = Array.from(
      { length: steps },
      (_, step) => Array.isArray(row) && row[step] === true,
    );
  }
  return rows;
}

/** Each beat of a groove as stored, with unknown or missing data dropped. */
function beatContents(groove: GroovePattern): BeatContent[] {
  const base = baseSubdivision(groove);
  const baseSteps = grooveStepsPerBeat(base);
  return Array.from(
    { length: grooveBeatCount(groove.measureCount) },
    (_, beat) => {
      const own = groove.beats?.[beat];
      if (own && isGrooveSubdivision(own.subdivision)) {
        return {
          subdivision: own.subdivision,
          own: true,
          rows: beatRows(
            grooveStepsPerBeat(own.subdivision),
            (piece) => own.hits?.[piece],
          ),
        };
      }
      return {
        subdivision: base,
        own: false,
        rows: beatRows(baseSteps, (piece) =>
          grooveRow(groove, piece).slice(
            beat * baseSteps,
            (beat + 1) * baseSteps,
          ),
        ),
      };
    },
  );
}

/** A beat row at another resolution: the hits that fall on its grid. */
function resampleBeatRow(row: boolean[], steps: number): boolean[] {
  const target: boolean[] = Array(steps).fill(false);
  row.forEach((hit, step) => {
    const scaled = step * steps;
    if (hit && scaled % row.length === 0) target[scaled / row.length] = true;
  });
  return target;
}

/**
 * A groove from the content of its beats. A beat at the base resolution, or
 * not marked as its own, goes to the base rows; any other keeps its own entry.
 */
function buildGroove(
  subdivision: GrooveSubdivision,
  measureCount: GrooveMeasureCount,
  contents: BeatContent[],
): GroovePattern {
  const groove = emptyGroove(subdivision, measureCount);
  const steps = grooveStepsPerBeat(subdivision);
  const beatCount = grooveBeatCount(measureCount);
  contents.slice(0, beatCount).forEach((content, beat) => {
    if (content.own && content.subdivision !== subdivision) {
      groove.beats = {
        ...groove.beats,
        [beat]: { subdivision: content.subdivision, hits: content.rows },
      };
      return;
    }
    for (const piece of DRUM_PIECES) {
      const row = resampleBeatRow(content.rows[piece.id], steps);
      grooveRow(groove, piece.id).splice(beat * steps, steps, ...row);
    }
  });
  return groove;
}

function normalizedGroove(groove: GroovePattern): GroovePattern {
  return buildGroove(
    baseSubdivision(groove),
    grooveMeasureCount(groove.measureCount),
    beatContents(groove),
  );
}

function resampleGroove(
  groove: GroovePattern,
  subdivision: GrooveSubdivision,
  measureCount = grooveMeasureCount(groove.measureCount),
): GroovePattern {
  return buildGroove(subdivision, measureCount, beatContents(groove));
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
      const sourceGroove = source.groove
        ? normalizedGroove(source.groove)
        : undefined;
      const newSection: StructureSection = {
        id: newSectionId,
        name: source.name,
        color: source.color,
        barIds: newBars.map((bar) => bar.id),
        comment: source.comment,
        barsPerRow: source.barsPerRow,
        groove: sourceGroove ? normalizedGroove(sourceGroove) : undefined,
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

    toggleGrooveHit: (document, sectionId, piece, beat, step) => {
      const section = document.sections.find((item) => item.id === sectionId);
      if (!section) return document;
      const source = section.groove ?? emptyGroove();
      const contents = beatContents(source);
      const row = contents[beat]?.rows[piece];
      if (!row || step < 0 || step >= row.length) return document;
      row[step] = !row[step];
      const groove = buildGroove(
        baseSubdivision(source),
        grooveMeasureCount(source.measureCount),
        contents,
      );
      return {
        bars: document.bars,
        sections: document.sections.map((item) =>
          item.id === sectionId ? { ...item, groove } : item,
        ),
      };
    },

    setGrooveBeatSubdivision: (document, sectionId, beat, subdivision) => {
      const section = document.sections.find((item) => item.id === sectionId);
      if (!section || !isGrooveSubdivision(subdivision)) return document;
      const source = normalizedGroove(section.groove ?? emptyGroove());
      const contents = beatContents(source);
      const content = contents[beat];
      if (!content) return document;
      const steps = grooveStepsPerBeat(subdivision);
      for (const piece of DRUM_PIECES) {
        content.rows[piece.id] = resampleBeatRow(content.rows[piece.id], steps);
      }
      content.subdivision = subdivision;
      content.own = subdivision !== source.subdivision;
      const groove = buildGroove(
        source.subdivision,
        grooveMeasureCount(source.measureCount),
        contents,
      );
      return {
        bars: document.bars,
        sections: document.sections.map((item) =>
          item.id === sectionId ? { ...item, groove } : item,
        ),
      };
    },

    setGrooveSubdivision: (document, sectionId, subdivision) => {
      const section = document.sections.find((item) => item.id === sectionId);
      if (!section) return document;

      const groove = section.groove
        ? resampleGroove(section.groove, subdivision)
        : emptyGroove(subdivision);
      return {
        bars: document.bars,
        sections: document.sections.map((item) =>
          item.id === sectionId ? { ...item, groove } : item,
        ),
      };
    },

    setGrooveMeasureCount: (document, sectionId, measureCount) => {
      const section = document.sections.find((item) => item.id === sectionId);
      if (!section) return document;

      const groove = section.groove
        ? resampleGroove(
            section.groove,
            section.groove.subdivision,
            measureCount,
          )
        : emptyGroove(DEFAULT_GROOVE_SUBDIVISION, measureCount);
      return {
        bars: document.bars,
        sections: document.sections.map((item) =>
          item.id === sectionId ? { ...item, groove } : item,
        ),
      };
    },

    clearGroove: (document, sectionId) => ({
      bars: document.bars,
      sections: document.sections.map((section) =>
        section.id === sectionId ? { ...section, groove: undefined } : section,
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
