import type { SectionType, Song, SongSection } from '@/types';
import type { ProgressionStep } from '@/constants/progressions';
import { appendStep, removeStep, setStepBeats } from '@/domain/stepList';

/** The fields of a saved song, without its id and timestamps. */
export type SongRecord = Omit<Song, 'id' | 'createdAt' | 'updatedAt'>;

/** The sections of a transcription and the one being edited. */
export interface TranscriptionSections {
  sections: SongSection[];
  activeSectionIndex: number;
}

/**
 * The open song. The base tempo and the preset belong to the song, not to the
 * app-wide tempo and preset; the practice speed only scales the tempo that
 * plays. `saved` is the copy of the last saved state ("unsaved changes"
 * compares against it).
 */
export interface TranscriptionDocument extends TranscriptionSections {
  title: string;
  artist: string;
  key: number;
  mode: 'major' | 'minor';
  baseBpm: number;
  presetId: string;
  practiceSpeed: number;
  saved: SongRecord | null;
}

export interface TranscriptionDocumentOptions {
  createId?: () => string;
}

export const DEFAULT_SONG_BPM = 90;
export const DEFAULT_SONG_PRESET_ID = 'piano';
export const MIN_PRACTICE_SPEED = 50;
export const MAX_PRACTICE_SPEED = 150;
export const MIN_SONG_BPM = 40;
export const MAX_SONG_BPM = 200;

export interface TranscriptionDocumentModule {
  create(overrides?: Partial<TranscriptionDocument>): TranscriptionDocument;
  load(song: Song): TranscriptionDocument;
  toSongRecord(document: TranscriptionDocument): SongRecord;
  importRecord(
    document: TranscriptionDocument,
    data: Pick<SongRecord, 'title' | 'artist' | 'key' | 'mode' | 'sections'>,
  ): SongRecord;
  markSaved(
    document: TranscriptionDocument,
    record: SongRecord,
  ): TranscriptionDocument;
  hasUnsavedChanges(document: TranscriptionDocument): boolean;
  playbackBpm(document: TranscriptionDocument): number;
  setPracticeSpeed(
    document: TranscriptionDocument,
    percent: number,
  ): TranscriptionDocument;
  setBaseBpm(document: TranscriptionDocument, bpm: number): TranscriptionDocument;
  setPreset(
    document: TranscriptionDocument,
    presetId: string,
  ): TranscriptionDocument;
  addSection<D extends TranscriptionSections>(
    document: D,
    type: SectionType,
    customLabel: string | undefined,
    options?: TranscriptionDocumentOptions,
  ): D;
  removeSection<D extends TranscriptionSections>(document: D, index: number): D;
  setActiveSection<D extends TranscriptionSections>(
    document: D,
    index: number,
  ): D;
  addStepToSection<D extends TranscriptionSections>(
    document: D,
    sectionIndex: number,
    step: ProgressionStep,
  ): D;
  removeStepFromSection<D extends TranscriptionSections>(
    document: D,
    sectionIndex: number,
    stepIndex: number,
  ): D;
  setStepBeatsInSection<D extends TranscriptionSections>(
    document: D,
    sectionIndex: number,
    stepIndex: number,
    beats: number,
  ): D;
  setStepConfidenceInSection<D extends TranscriptionSections>(
    document: D,
    sectionIndex: number,
    stepIndex: number,
    confidence: ProgressionStep['confidence'],
  ): D;
}

function mapSection<D extends TranscriptionSections>(
  document: D,
  sectionIndex: number,
  update: (section: SongSection) => SongSection,
): D {
  const section = document.sections[sectionIndex];
  if (!section) return document;
  return {
    ...document,
    sections: document.sections.map((s, i) => (i === sectionIndex ? update(s) : s)),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function sameRecord(a: SongRecord, b: SongRecord): boolean {
  return (
    a.title === b.title &&
    a.artist === b.artist &&
    a.key === b.key &&
    a.mode === b.mode &&
    a.originalBpm === b.originalBpm &&
    a.presetId === b.presetId &&
    JSON.stringify(a.sections) === JSON.stringify(b.sections)
  );
}

export const transcriptionDocument: TranscriptionDocumentModule = {
  create(overrides) {
    return {
      sections: [],
      activeSectionIndex: 0,
      title: '',
      artist: '',
      key: 0,
      mode: 'major',
      baseBpm: DEFAULT_SONG_BPM,
      presetId: DEFAULT_SONG_PRESET_ID,
      practiceSpeed: 100,
      saved: null,
      ...overrides,
    };
  },

  load(song) {
    const record: SongRecord = {
      title: song.title,
      artist: song.artist,
      key: song.key,
      mode: song.mode,
      originalBpm: song.originalBpm,
      presetId: song.presetId,
      sections: song.sections,
    };
    return {
      sections: song.sections,
      activeSectionIndex: 0,
      title: song.title,
      artist: song.artist,
      key: song.key,
      mode: song.mode,
      baseBpm: song.originalBpm,
      presetId: song.presetId,
      practiceSpeed: 100,
      saved: record,
    };
  },

  toSongRecord(document) {
    return {
      title: document.title.trim(),
      artist: document.artist.trim(),
      key: document.key,
      mode: document.mode,
      originalBpm: document.baseBpm,
      presetId: document.presetId,
      sections: document.sections,
    };
  },

  importRecord(document, data) {
    return {
      title: data.title,
      artist: data.artist,
      key: data.key,
      mode: data.mode,
      originalBpm: document.baseBpm,
      presetId: document.presetId,
      sections: data.sections,
    };
  },

  markSaved(document, record) {
    return { ...document, saved: record };
  },

  hasUnsavedChanges(document) {
    if (!document.saved) {
      return document.sections.length > 0 || document.title.trim() !== '';
    }
    return !sameRecord(
      transcriptionDocument.toSongRecord(document),
      document.saved,
    );
  },

  playbackBpm(document) {
    return Math.round((document.baseBpm * document.practiceSpeed) / 100);
  },

  setPracticeSpeed(document, percent) {
    return {
      ...document,
      practiceSpeed: clamp(percent, MIN_PRACTICE_SPEED, MAX_PRACTICE_SPEED),
    };
  },

  setBaseBpm(document, bpm) {
    return { ...document, baseBpm: clamp(bpm, MIN_SONG_BPM, MAX_SONG_BPM) };
  },

  setPreset(document, presetId) {
    return { ...document, presetId };
  },

  addSection(document, type, customLabel, options) {
    const createId = options?.createId ?? (() => crypto.randomUUID());
    const newSection: SongSection = {
      id: createId(),
      type,
      customLabel,
      steps: [],
    };
    return {
      ...document,
      sections: [...document.sections, newSection],
      activeSectionIndex: document.sections.length,
    };
  },

  removeSection(document, index) {
    if (document.sections.length <= 1) {
      return { ...document, sections: [], activeSectionIndex: 0 };
    }
    const sections = document.sections.filter((_, i) => i !== index);
    return {
      ...document,
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
