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
import { savedLibrary } from '@/services/savedLibrary';
import { FUNCTION_COLORS } from '@/constants/functionColors';

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
  savedStructures: [],
  structuresLoading: true,

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

  addProgressionStep: (step) => {
    const { customProgression } = get();
    if (customProgression.length >= 64) return;
    set({ customProgression: [...customProgression, step] });
  },

  removeProgressionStep: (index) => {
    const { customProgression } = get();
    set({
      customProgression: customProgression.filter((_, i) => i !== index),
    });
  },

  setProgressionStepBeats: (index, beats) => {
    const { customProgression } = get();
    const clamped = Math.max(0.5, Math.min(8, Math.round(beats * 2) / 2));
    set({
      customProgression: customProgression.map((step, i) =>
        i === index ? { ...step, beats: clamped } : step,
      ),
    });
  },

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
    const colors: Record<number, string> = {};

    if (comparisonScaleId) {
      const notesB = getScaleNotes(rootNote, comparisonScaleId);
      const setB = new Set(notesB);
      const allNotes = [...new Set([...notesA, ...notesB])];
      for (const n of allNotes) {
        const inA = notesA.includes(n);
        const inB = setB.has(n);
        if (inA && inB) colors[n] = 'var(--color-scale-shared)';
        else if (inA) colors[n] = 'var(--color-scale-a)';
        else colors[n] = 'var(--color-scale-b)';
      }
      set({
        selectedScaleId: scaleId,
        highlightedNotes: allNotes,
        highlightColors: colors,
      });
    } else {
      for (const n of notesA) {
        colors[n] = 'var(--color-scale-a)';
      }
      set({
        selectedScaleId: scaleId,
        highlightedNotes: notesA,
        highlightColors: colors,
      });
    }
  },

  setInstrumentsPanelOpen: (open) => set({ instrumentsPanelOpen: open }),

  toggleTheme: () => {
    const next = get().theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('theme', next);
    set({ theme: next });
  },

  // --- Transcription actions ---

  loadSong: (song: Song) =>
    set({
      activeSongId: song.id,
      songTitle: song.title,
      songArtist: song.artist,
      songSections: song.sections,
      activeSectionIndex: 0,
      rootNote: song.key,
      isMinor: song.mode === 'minor',
      harmonicField: getHarmonicField(song.key, song.mode === 'minor'),
      selectedChordIndex: null,
      highlightedNotes: [],
      highlightColors: {},
    }),

  loadImportedSong: ({ title, artist, key, sections }) => {
    const { isMinor } = get();
    set({
      activeSongId: null,
      songTitle: title,
      songArtist: artist,
      songSections: sections,
      activeSectionIndex: 0,
      rootNote: key,
      harmonicField: getHarmonicField(key, isMinor),
      selectedChordIndex: null,
      highlightedNotes: [],
      highlightColors: {},
    });
  },

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
    const { songSections } = get();
    const newSection: SongSection = {
      id: crypto.randomUUID(),
      type,
      customLabel,
      steps: [],
    };
    set({
      songSections: [...songSections, newSection],
      activeSectionIndex: songSections.length,
    });
  },

  removeSection: (index: number) => {
    const { songSections, activeSectionIndex } = get();
    if (songSections.length <= 1) {
      set({ songSections: [], activeSectionIndex: 0 });
      return;
    }
    const updated = songSections.filter((_, i) => i !== index);
    set({
      songSections: updated,
      activeSectionIndex: Math.min(activeSectionIndex, updated.length - 1),
    });
  },

  setActiveSectionIndex: (index: number) => set({ activeSectionIndex: index }),

  addSongStep: (sectionIndex: number, step: ProgressionStep) => {
    const { songSections } = get();
    const section = songSections[sectionIndex];
    if (!section || section.steps.length >= 64) return;
    const updated = songSections.map((s, i) =>
      i === sectionIndex ? { ...s, steps: [...s.steps, step] } : s,
    );
    set({ songSections: updated });
  },

  removeSongStep: (sectionIndex: number, stepIndex: number) => {
    const { songSections } = get();
    const section = songSections[sectionIndex];
    if (!section) return;
    const updated = songSections.map((s, i) =>
      i === sectionIndex
        ? { ...s, steps: s.steps.filter((_, si) => si !== stepIndex) }
        : s,
    );
    set({ songSections: updated });
  },

  setSongStepBeats: (
    sectionIndex: number,
    stepIndex: number,
    beats: number,
  ) => {
    const { songSections } = get();
    const section = songSections[sectionIndex];
    if (!section) return;
    const clamped = Math.max(0.5, Math.min(8, Math.round(beats * 2) / 2));
    const updated = songSections.map((s, i) =>
      i === sectionIndex
        ? {
            ...s,
            steps: s.steps.map((step, si) =>
              si === stepIndex ? { ...step, beats: clamped } : step,
            ),
          }
        : s,
    );
    set({ songSections: updated });
  },

  setSongStepConfidence: (
    sectionIndex: number,
    stepIndex: number,
    confidence,
  ) => {
    const { songSections } = get();
    const section = songSections[sectionIndex];
    if (!section) return;
    const updated = songSections.map((s, i) =>
      i === sectionIndex
        ? {
            ...s,
            steps: s.steps.map((step, si) =>
              si === stepIndex ? { ...step, confidence } : step,
            ),
          }
        : s,
    );
    set({ songSections: updated });
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

  loadStructures: () => {
    const { savedStructures, structuresLoading } = get();
    if (savedStructures.length > 0 && !structuresLoading) return;

    set({ structuresLoading: true });
    savedLibrary
      .initialize()
      .then(() => {
        set({ savedStructures: savedLibrary.structures.list() });
        // Re-read after cloud sync merges remote data. Deliberately not
        // chained into the outer promise: the loading flag must clear on the
        // first read, not wait for the network.
        savedLibrary
          .waitUntilSynchronized()
          .then(() => set({ savedStructures: savedLibrary.structures.list() }))
          .catch(() => {
            // Sync merge failed; the first read already populated the list.
          });
      })
      // DB unavailable (IndexedDB blocked in private browsing, quota
      // exceeded, WASM load failure). Degrade to an empty list rather than
      // an unhandled rejection - finally() still clears the loading flag,
      // so the UI settles on "no structures" instead of a stuck spinner.
      .catch(() => {})
      .finally(() => set({ structuresLoading: false }));
  },

  createStructure: async (structure) => {
    try {
      await savedLibrary.initialize();
      const id = savedLibrary.structures.save(structure);
      set({
        savedStructures: savedLibrary.structures.list(),
        activeStructureId: id,
      });
      return id;
    } catch {
      throw new Error('Erro ao salvar estrutura');
    }
  },

  updateStructureRecord: async (id, updates) => {
    try {
      await savedLibrary.initialize();
      savedLibrary.structures.update(id, updates);
      set({ savedStructures: savedLibrary.structures.list() });
    } catch {
      throw new Error('Erro ao atualizar estrutura');
    }
  },

  removeStructureRecord: async (id) => {
    try {
      await savedLibrary.initialize();
      savedLibrary.structures.remove(id);
      set({ savedStructures: savedLibrary.structures.list() });
    } catch {
      throw new Error('Erro ao remover estrutura');
    }
  },

  setComparisonScale: (scaleId) => {
    if (scaleId === null) {
      const { selectedScaleId, rootNote } = get();
      if (selectedScaleId) {
        const notesA = getScaleNotes(rootNote, selectedScaleId);
        const colors: Record<number, string> = {};
        for (const n of notesA) {
          colors[n] = 'var(--color-scale-a)';
        }
        set({
          comparisonScaleId: null,
          highlightedNotes: notesA,
          highlightColors: colors,
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
    const setA = new Set(notesA);
    const allNotes = [...new Set([...notesA, ...notesB])];
    const colors: Record<number, string> = {};
    for (const n of allNotes) {
      const inA = setA.has(n);
      const inB = notesB.includes(n);
      if (inA && inB) colors[n] = 'var(--color-scale-shared)';
      else if (inA) colors[n] = 'var(--color-scale-a)';
      else colors[n] = 'var(--color-scale-b)';
    }
    set({
      comparisonScaleId: scaleId,
      highlightedNotes: allNotes,
      highlightColors: colors,
    });
  },
}));
