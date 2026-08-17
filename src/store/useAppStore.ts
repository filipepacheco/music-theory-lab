import { create } from 'zustand';
import type {
  AppState,
  SongSection,
  SectionType,
  Song,
  SongStructure,
  TimeSignature,
} from '@/types';
import type { ProgressionStep } from '@/constants/progressions';
import { getHarmonicField, getScaleNotes } from '@/utils/musicTheory';
import { structureDocument } from '@/domain/structureDocument';
import { transcriptionDocument } from '@/domain/transcriptionDocument';
import { appendStep, removeStep, setStepBeats } from '@/domain/stepList';
import {
  classifyScaleNotes,
  type ScaleHighlightKind,
} from '@/domain/scaleHighlights';
import { FUNCTION_COLORS } from '@/constants/functionColors';

const SCALE_HIGHLIGHT_COLORS: Record<ScaleHighlightKind, string> = {
  a: 'var(--color-scale-a)',
  b: 'var(--color-scale-b)',
  shared: 'var(--color-scale-shared)',
};

function highlightFromScaleNotes(notesA: number[], notesB: number[] | null) {
  const { notes, kinds } = classifyScaleNotes(notesA, notesB);
  const colors: Record<number, string> = {};
  kinds.forEach((kind, index) => {
    colors[notes[index]] = SCALE_HIGHLIGHT_COLORS[kind];
  });
  return { highlightedNotes: notes, highlightColors: colors };
}

function applySongState(song: {
  title: string;
  artist: string;
  key: number;
  mode: 'major' | 'minor';
  sections: SongSection[];
  id: string | null;
}) {
  const isMinor = song.mode === 'minor';
  return {
    activeSongId: song.id,
    songTitle: song.title,
    songArtist: song.artist,
    songSections: song.sections,
    activeSectionIndex: 0,
    rootNote: song.key,
    isMinor,
    harmonicField: getHarmonicField(song.key, isMinor),
    selectedChordIndex: null,
    highlightedNotes: [],
    highlightColors: {},
  };
}

export const useAppStore = create<AppState>((set, get) => ({
  rootNote: 0, // C
  isMinor: false,
  activeModule: 'harmonicField',
  harmonicField: getHarmonicField(0, false),
  selectedChordIndex: null,
  highlightedNotes: [],
  highlightColors: {},
  highlightRootName: null,
  highlightOctaveMap: null,
  activePresetId: 'piano',
  bpm: 90,
  isMetronomeOn: false,
  currentBeat: -1,
  currentEighth: -1,
  playingProgression: null,
  customProgression: [],
  selectedScaleId: null,
  comparisonScaleId: null,
  instrumentsPanelOpen: true,
  theme: (localStorage.getItem('theme') as 'dark' | 'light') || 'dark',

  // Transcription
  activeSongId: null,
  songSections: [],
  activeSectionIndex: 0,
  songTitle: '',
  songArtist: '',

  // Practice
  practiceSpeed: 100,
  loopSection: true,

  // Structure
  structureBars: [],
  structureSections: [],
  activeStructureId: null,
  structureTitle: '',
  structureArtist: '',
  structureBpm: 120,
  activeTimeSignature: '4/4' as TimeSignature,
  focusedSectionId: null,

  setRootNote: (note) => {
    const { isMinor } = get();
    set({
      rootNote: note,
      harmonicField: getHarmonicField(note, isMinor),
      selectedChordIndex: null,
      highlightedNotes: [],
      highlightColors: {},
      selectedScaleId: null,
      comparisonScaleId: null,
    });
  },

  setIsMinor: (isMinor) => {
    const { rootNote } = get();
    set({
      isMinor,
      harmonicField: getHarmonicField(rootNote, isMinor),
      selectedChordIndex: null,
      highlightedNotes: [],
      highlightColors: {},
    });
  },

  setActiveModule: (module) =>
    set({
      activeModule: module,
      selectedChordIndex: null,
      highlightedNotes: [],
      highlightColors: {},
      selectedScaleId: null,
      comparisonScaleId: null,
    }),

  selectChord: (index) => {
    if (index === null) {
      set({
        selectedChordIndex: null,
        highlightedNotes: [],
        highlightColors: {},
      });
      return;
    }
    const { harmonicField } = get();
    const chord = harmonicField[index];
    if (!chord) return;

    const color = FUNCTION_COLORS[chord.harmonicFunction] ?? '#fff';
    const colors: Record<number, string> = {};
    chord.notes.forEach((n) => {
      colors[n] = color;
    });

    set({
      selectedChordIndex: index,
      highlightedNotes: chord.notes,
      highlightColors: colors,
    });
  },

  setHighlightedNotes: (notes, color, rootName, octaveMap) => {
    const colors: Record<number, string> = {};
    notes.forEach((n) => {
      colors[n] = color;
    });
    set({
      highlightedNotes: notes,
      highlightColors: colors,
      highlightRootName: rootName ?? null,
      highlightOctaveMap: octaveMap ?? null,
    });
  },

  clearHighlights: () =>
    set({
      selectedChordIndex: null,
      highlightedNotes: [],
      highlightColors: {},
      highlightRootName: null,
      highlightOctaveMap: null,
    }),

  setActivePresetId: (id) => set({ activePresetId: id }),
  setBpm: (bpm) => set({ bpm }),
  setIsMetronomeOn: (on) => set({ isMetronomeOn: on }),
  setCurrentBeat: (beat) => set({ currentBeat: beat }),
  setCurrentEighth: (eighth) => set({ currentEighth: eighth }),
  setPlayingProgression: (prog) => set({ playingProgression: prog }),

  addProgressionStep: (step) =>
    set({ customProgression: appendStep(get().customProgression, step) }),

  removeProgressionStep: (index) =>
    set({ customProgression: removeStep(get().customProgression, index) }),

  setProgressionStepBeats: (index, beats) =>
    set({
      customProgression: setStepBeats(get().customProgression, index, beats),
    }),

  clearProgression: () => set({ customProgression: [] }),

  loadProgressionPreset: (steps) => set({ customProgression: [...steps] }),

  selectScale: (scaleId) => {
    if (scaleId === null) {
      set({
        selectedScaleId: null,
        comparisonScaleId: null,
        highlightedNotes: [],
        highlightColors: {},
      });
      return;
    }
    const { rootNote, comparisonScaleId } = get();
    const notesA = getScaleNotes(rootNote, scaleId);
    const notesB = comparisonScaleId
      ? getScaleNotes(rootNote, comparisonScaleId)
      : null;
    set({
      selectedScaleId: scaleId,
      ...highlightFromScaleNotes(notesA, notesB),
    });
  },

  setInstrumentsPanelOpen: (open) => set({ instrumentsPanelOpen: open }),

  toggleTheme: () => {
    const next = get().theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('theme', next);
    set({ theme: next });
  },

  // --- Transcription actions ---

  loadSong: (song: Song) =>
    set(
      applySongState({
        title: song.title,
        artist: song.artist,
        key: song.key,
        mode: song.mode,
        sections: song.sections,
        id: song.id,
      }),
    ),

  loadImportedSong: ({ title, artist, key, sections }) =>
    set(
      applySongState({
        title,
        artist,
        key,
        mode: get().isMinor ? 'minor' : 'major',
        sections,
        id: null,
      }),
    ),

  clearSong: () =>
    set({
      activeSongId: null,
      songTitle: '',
      songArtist: '',
      songSections: [],
      activeSectionIndex: 0,
    }),

  setSongTitle: (title) => set({ songTitle: title }),
  setSongArtist: (artist) => set({ songArtist: artist }),

  addSection: (type: SectionType, customLabel?: string) => {
    const { songSections, activeSectionIndex } = get();
    const next = transcriptionDocument.addSection(
      { sections: songSections, activeSectionIndex },
      type,
      customLabel,
    );
    set({
      songSections: next.sections,
      activeSectionIndex: next.activeSectionIndex,
    });
  },

  removeSection: (index: number) => {
    const { songSections, activeSectionIndex } = get();
    const next = transcriptionDocument.removeSection(
      { sections: songSections, activeSectionIndex },
      index,
    );
    set({
      songSections: next.sections,
      activeSectionIndex: next.activeSectionIndex,
    });
  },

  setActiveSectionIndex: (index: number) => set({ activeSectionIndex: index }),

  addSongStep: (sectionIndex: number, step: ProgressionStep) => {
    const { songSections, activeSectionIndex } = get();
    const next = transcriptionDocument.addStepToSection(
      { sections: songSections, activeSectionIndex },
      sectionIndex,
      step,
    );
    set({ songSections: next.sections });
  },

  removeSongStep: (sectionIndex: number, stepIndex: number) => {
    const { songSections, activeSectionIndex } = get();
    const next = transcriptionDocument.removeStepFromSection(
      { sections: songSections, activeSectionIndex },
      sectionIndex,
      stepIndex,
    );
    set({ songSections: next.sections });
  },

  setSongStepBeats: (
    sectionIndex: number,
    stepIndex: number,
    beats: number,
  ) => {
    const { songSections, activeSectionIndex } = get();
    const next = transcriptionDocument.setStepBeatsInSection(
      { sections: songSections, activeSectionIndex },
      sectionIndex,
      stepIndex,
      beats,
    );
    set({ songSections: next.sections });
  },

  setSongStepConfidence: (
    sectionIndex: number,
    stepIndex: number,
    confidence,
  ) => {
    const { songSections, activeSectionIndex } = get();
    const next = transcriptionDocument.setStepConfidenceInSection(
      { sections: songSections, activeSectionIndex },
      sectionIndex,
      stepIndex,
      confidence,
    );
    set({ songSections: next.sections });
  },

  // --- Practice actions ---

  setPracticeSpeed: (percent: number) =>
    set({ practiceSpeed: Math.max(50, Math.min(150, percent)) }),

  setLoopSection: (loop: boolean) => set({ loopSection: loop }),

  // --- Structure actions ---

  setStructureTitle: (title) => set({ structureTitle: title }),
  setStructureArtist: (artist) => set({ structureArtist: artist }),
  setStructureBpm: (bpm) => set({ structureBpm: bpm }),
  setActiveTimeSignature: (ts) => set({ activeTimeSignature: ts }),

  addBarToSection: (sectionId) => {
    const { structureBars, structureSections, activeTimeSignature } = get();
    const next = structureDocument.addBar(
      { bars: structureBars, sections: structureSections },
      sectionId,
      activeTimeSignature,
    );
    set({ structureBars: next.bars, structureSections: next.sections });
  },

  removeBar: (id) => {
    const { structureBars, structureSections } = get();
    const next = structureDocument.removeBar(
      { bars: structureBars, sections: structureSections },
      id,
    );
    set({
      structureBars: next.bars,
      structureSections: next.sections,
    });
  },

  setBarTimeSignature: (id, ts) => {
    const { structureBars, structureSections } = get();
    const next = structureDocument.setBarTimeSignature(
      { bars: structureBars, sections: structureSections },
      id,
      ts,
    );
    set({ structureBars: next.bars });
  },

  setBarColor: (id, color) => {
    const { structureBars, structureSections } = get();
    const next = structureDocument.setBarColor(
      { bars: structureBars, sections: structureSections },
      id,
      color,
    );
    set({ structureBars: next.bars });
  },

  toggleBarAccent: (barId, dotIndex) => {
    const { structureBars, structureSections } = get();
    const next = structureDocument.toggleBarAccent(
      { bars: structureBars, sections: structureSections },
      barId,
      dotIndex,
    );
    set({ structureBars: next.bars });
  },

  addStructureSection: (name, color) => {
    const { structureSections } = get();
    const next = structureDocument.addSection(
      { bars: get().structureBars, sections: structureSections },
      name,
      color,
    );
    set({
      structureSections: next.sections,
      focusedSectionId: next.focusedSectionId,
    });
  },

  duplicateStructureSection: (sectionId) => {
    const { structureSections, structureBars, activeTimeSignature } = get();
    const next = structureDocument.duplicateSection(
      { bars: structureBars, sections: structureSections },
      sectionId,
      activeTimeSignature,
    );
    if (!next) return;
    set({
      structureSections: next.sections,
      structureBars: next.bars,
      focusedSectionId: next.focusedSectionId,
    });
  },

  removeStructureSection: (id) => {
    const { structureSections, structureBars, focusedSectionId } = get();
    const next = structureDocument.removeSection(
      { bars: structureBars, sections: structureSections },
      id,
      focusedSectionId,
    );
    set({
      structureSections: next.sections,
      structureBars: next.bars,
      focusedSectionId: next.focusedSectionId,
    });
  },

  setSectionName: (sectionId, name) => {
    const { structureBars, structureSections } = get();
    const next = structureDocument.setSectionName(
      { bars: structureBars, sections: structureSections },
      sectionId,
      name,
    );
    set({ structureSections: next.sections });
  },

  setSectionColor: (sectionId, color) => {
    const { structureBars, structureSections } = get();
    const next = structureDocument.setSectionColor(
      { bars: structureBars, sections: structureSections },
      sectionId,
      color,
    );
    set({ structureSections: next.sections });
  },

  setSectionComment: (sectionId, comment) => {
    const { structureBars, structureSections } = get();
    const next = structureDocument.setSectionComment(
      { bars: structureBars, sections: structureSections },
      sectionId,
      comment,
    );
    set({ structureSections: next.sections });
  },

  setSectionBarsPerRow: (sectionId, barsPerRow) => {
    const { structureBars, structureSections } = get();
    const next = structureDocument.setSectionBarsPerRow(
      { bars: structureBars, sections: structureSections },
      sectionId,
      barsPerRow,
    );
    set({ structureSections: next.sections });
  },

  setFocusedSection: (id) => set({ focusedSectionId: id }),

  reorderStructureSection: (activeId, overId) => {
    const { structureSections, structureBars } = get();
    const next = structureDocument.reorderSections(
      { bars: structureBars, sections: structureSections },
      activeId,
      overId,
    );
    set({
      structureSections: next.sections,
      structureBars: next.bars,
    });
  },

  moveBarToSection: (barId, sectionId) => {
    const { structureSections, structureBars } = get();
    const next = structureDocument.moveBarToSection(
      { bars: structureBars, sections: structureSections },
      barId,
      sectionId,
    );
    set({
      structureSections: next.sections,
      structureBars: next.bars,
    });
  },

  loadStructure: (structure: SongStructure) =>
    set({
      activeStructureId: structure.id,
      structureTitle: structure.title,
      structureArtist: structure.artist,
      structureBpm: structure.bpm,
      structureBars: structure.bars,
      structureSections: structure.sections,
      focusedSectionId: null,
    }),

  clearStructure: () =>
    set({
      activeStructureId: null,
      structureTitle: '',
      structureArtist: '',
      structureBpm: 120,
      structureBars: [],
      structureSections: [],
      focusedSectionId: null,
    }),

  // --- Saved structures actions ---

  setActiveStructureId: (id) => set({ activeStructureId: id }),

  setComparisonScale: (scaleId) => {
    if (scaleId === null) {
      const { selectedScaleId, rootNote } = get();
      if (selectedScaleId) {
        const notesA = getScaleNotes(rootNote, selectedScaleId);
        set({
          comparisonScaleId: null,
          ...highlightFromScaleNotes(notesA, null),
        });
      } else {
        set({
          comparisonScaleId: null,
          highlightedNotes: [],
          highlightColors: {},
        });
      }
      return;
    }
    const { selectedScaleId, rootNote } = get();
    if (!selectedScaleId) {
      set({ comparisonScaleId: scaleId });
      return;
    }
    const notesA = getScaleNotes(rootNote, selectedScaleId);
    const notesB = getScaleNotes(rootNote, scaleId);
    set({
      comparisonScaleId: scaleId,
      ...highlightFromScaleNotes(notesA, notesB),
    });
  },
}));
