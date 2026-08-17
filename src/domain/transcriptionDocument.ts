import type { SectionType, SongSection } from '@/types';
import type { ProgressionStep } from '@/constants/progressions';
import { appendStep, removeStep, setStepBeats } from '@/domain/stepList';

export interface TranscriptionDocument {
  sections: SongSection[];
  activeSectionIndex: number;
}

export interface TranscriptionDocumentOptions {
  createId?: () => string;
}

export interface TranscriptionDocumentModule {
  addSection(
    document: TranscriptionDocument,
    type: SectionType,
    customLabel: string | undefined,
    options?: TranscriptionDocumentOptions,
  ): TranscriptionDocument;
  removeSection(
    document: TranscriptionDocument,
    index: number,
  ): TranscriptionDocument;
  setActiveSection(
    document: TranscriptionDocument,
    index: number,
  ): TranscriptionDocument;
  addStepToSection(
    document: TranscriptionDocument,
    sectionIndex: number,
    step: ProgressionStep,
  ): TranscriptionDocument;
  removeStepFromSection(
    document: TranscriptionDocument,
    sectionIndex: number,
    stepIndex: number,
  ): TranscriptionDocument;
  setStepBeatsInSection(
    document: TranscriptionDocument,
    sectionIndex: number,
    stepIndex: number,
    beats: number,
  ): TranscriptionDocument;
  setStepConfidenceInSection(
    document: TranscriptionDocument,
    sectionIndex: number,
    stepIndex: number,
    confidence: ProgressionStep['confidence'],
  ): TranscriptionDocument;
}

function mapSection(
  document: TranscriptionDocument,
  sectionIndex: number,
  update: (section: SongSection) => SongSection,
): TranscriptionDocument {
  const section = document.sections[sectionIndex];
  if (!section) return document;
  return {
    ...document,
    sections: document.sections.map((s, i) => (i === sectionIndex ? update(s) : s)),
  };
}

export const transcriptionDocument: TranscriptionDocumentModule = {
  addSection(document, type, customLabel, options) {
    const createId = options?.createId ?? (() => crypto.randomUUID());
    const newSection: SongSection = {
      id: createId(),
      type,
      customLabel,
      steps: [],
    };
    return {
      sections: [...document.sections, newSection],
      activeSectionIndex: document.sections.length,
    };
  },

  removeSection(document, index) {
    if (document.sections.length <= 1) {
      return { sections: [], activeSectionIndex: 0 };
    }
    const sections = document.sections.filter((_, i) => i !== index);
    return {
      sections,
      activeSectionIndex: Math.min(
        document.activeSectionIndex,
        sections.length - 1,
      ),
    };
  },

  setActiveSection(document, index) {
    return { ...document, activeSectionIndex: index };
  },

  addStepToSection(document, sectionIndex, step) {
    return mapSection(document, sectionIndex, (section) => ({
      ...section,
      steps: appendStep(section.steps, step),
    }));
  },

  removeStepFromSection(document, sectionIndex, stepIndex) {
    return mapSection(document, sectionIndex, (section) => ({
      ...section,
      steps: removeStep(section.steps, stepIndex),
    }));
  },

  setStepBeatsInSection(document, sectionIndex, stepIndex, beats) {
    return mapSection(document, sectionIndex, (section) => ({
      ...section,
      steps: setStepBeats(section.steps, stepIndex, beats),
    }));
  },

  setStepConfidenceInSection(document, sectionIndex, stepIndex, confidence) {
    return mapSection(document, sectionIndex, (section) => ({
      ...section,
      steps: section.steps.map((step, si) =>
        si === stepIndex ? { ...step, confidence } : step,
      ),
    }));
  },
};
