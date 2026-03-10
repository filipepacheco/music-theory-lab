import { create } from "zustand";
import type {
  AppState,
  SongSection,
  SectionType,
  Song,
  SongStructure,
  TimeSignature,
  StructureBar,
  StructureSection,
} from "@/types";
import type { ProgressionStep } from "@/constants/progressions";
import { getHarmonicField, getScaleNotes } from "@/utils/musicTheory";

/** Reindex bars so numbers follow section order: section1 bars, section2 bars, ... */
function reindexBars(
  bars: StructureBar[],
  sections: StructureSection[],
): StructureBar[] {
  const barMap = new Map(bars.map((b) => [b.id, b]));
  const ordered: StructureBar[] = [];
  for (const section of sections) {
    for (const bid of section.barIds) {
      const bar = barMap.get(bid);
      if (bar) ordered.push(bar);
    }
  }
  return ordered.map((b, i) => ({ ...b, index: i }));
}

const FUNCTION_COLORS: Record<string, string> = {
  T: "var(--color-tonic)",
  SD: "var(--color-subdominant)",
  D: "var(--color-dominant)",
};

export const useAppStore = create<AppState>((set, get) => ({
  rootNote: 0, // C
  isMinor: false,
  activeModule: "harmonicField",
  harmonicField: getHarmonicField(0, false),
  selectedChordIndex: null,
  highlightedNotes: [],
  highlightColors: {},
  highlightRootName: null,
  highlightOctaveMap: null,
  activePresetId: "piano",
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

    const color = FUNCTION_COLORS[chord.harmonicFunction] ?? "#fff";
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
        if (inA && inB) colors[n] = "var(--color-scale-shared)";
        else if (inA) colors[n] = "var(--color-scale-a)";
        else colors[n] = "var(--color-scale-b)";
      }
      set({
        selectedScaleId: scaleId,
        highlightedNotes: allNotes,
        highlightColors: colors,
      });
    } else {
      for (const n of notesA) {
        colors[n] = "var(--color-scale-a)";
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

  setSongStepBeats: (sectionIndex: number, stepIndex: number, beats: number) => {
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

  setSongStepConfidence: (sectionIndex: number, stepIndex: number, confidence) => {
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
  setActiveTimeSignature: (ts) => set({ activeTimeSignature: ts }),

  addBarToSection: (sectionId) => {
    const { structureBars, structureSections, activeTimeSignature } = get();
    const bar: StructureBar = {
      id: crypto.randomUUID(),
      index: structureBars.length,
      timeSignature: activeTimeSignature,
    };
    const newSections = structureSections.map((s) =>
      s.id === sectionId ? { ...s, barIds: [...s.barIds, bar.id] } : s,
    );
    const newBars = reindexBars([...structureBars, bar], newSections);
    set({ structureBars: newBars, structureSections: newSections });
  },

  removeBar: (id) => {
    const { structureBars, structureSections } = get();
    const updated = structureBars.filter((b) => b.id !== id);
    const updatedSections = structureSections.map((s) => ({
      ...s,
      barIds: s.barIds.filter((bid) => bid !== id),
    }));
    set({
      structureBars: reindexBars(updated, updatedSections),
      structureSections: updatedSections,
    });
  },

  setBarTimeSignature: (id, ts) => {
    const { structureBars } = get();
    set({
      structureBars: structureBars.map((b) =>
        b.id === id ? { ...b, timeSignature: ts } : b,
      ),
    });
  },

  addStructureSection: (name, color) => {
    const { structureSections } = get();
    const newSection: StructureSection = {
      id: crypto.randomUUID(),
      name,
      color,
      barIds: [],
    };
    set({
      structureSections: [...structureSections, newSection],
      focusedSectionId: newSection.id,
    });
  },

  duplicateStructureSection: (sectionId) => {
    const { structureSections, structureBars, activeTimeSignature } = get();
    const source = structureSections.find((s) => s.id === sectionId);
    if (!source) return;

    const newBars: StructureBar[] = source.barIds.map((bid) => {
      const original = structureBars.find((b) => b.id === bid);
      return {
        id: crypto.randomUUID(),
        index: 0,
        timeSignature: original?.timeSignature ?? activeTimeSignature,
        color: original?.color,
      };
    });

    const newSection: StructureSection = {
      id: crypto.randomUUID(),
      name: source.name,
      color: source.color,
      barIds: newBars.map((b) => b.id),
      comment: source.comment,
      barsPerRow: source.barsPerRow,
    };

    const insertIndex = structureSections.indexOf(source) + 1;
    const newSections = [...structureSections];
    newSections.splice(insertIndex, 0, newSection);

    set({
      structureSections: newSections,
      structureBars: reindexBars([...structureBars, ...newBars], newSections),
      focusedSectionId: newSection.id,
    });
  },

  removeStructureSection: (id) => {
    const { structureSections, structureBars, focusedSectionId } = get();
    const sectionToRemove = structureSections.find((s) => s.id === id);
    const removedBarIds = new Set(sectionToRemove?.barIds ?? []);
    const newSections = structureSections
      .filter((s) => s.id !== id)
      .map((s) => s.repeatOf === id ? { ...s, repeatOf: undefined } : s);
    const newBars = structureBars.filter((b) => !removedBarIds.has(b.id));
    set({
      structureSections: newSections,
      structureBars: reindexBars(newBars, newSections),
      focusedSectionId: focusedSectionId === id ? null : focusedSectionId,
    });
  },

  setSectionName: (sectionId, name) => {
    const { structureSections } = get();
    set({
      structureSections: structureSections.map((s) =>
        s.id === sectionId ? { ...s, name } : s,
      ),
    });
  },

  setSectionColor: (sectionId, color) => {
    const { structureSections } = get();
    set({
      structureSections: structureSections.map((s) =>
        s.id === sectionId ? { ...s, color } : s,
      ),
    });
  },

  setSectionComment: (sectionId, comment) => {
    const { structureSections } = get();
    set({
      structureSections: structureSections.map((s) =>
        s.id === sectionId ? { ...s, comment } : s,
      ),
    });
  },

  setSectionBarsPerRow: (sectionId, barsPerRow) => {
    const { structureSections } = get();
    set({
      structureSections: structureSections.map((s) =>
        s.id === sectionId ? { ...s, barsPerRow } : s,
      ),
    });
  },

  setFocusedSection: (id) => set({ focusedSectionId: id }),

  reorderStructureSection: (activeId, overId) => {
    const { structureSections, structureBars } = get();
    const oldIndex = structureSections.findIndex((s) => s.id === activeId);
    const newIndex = structureSections.findIndex((s) => s.id === overId);
    if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return;
    const updated = [...structureSections];
    const [moved] = updated.splice(oldIndex, 1);
    updated.splice(newIndex, 0, moved);
    set({
      structureSections: updated,
      structureBars: reindexBars(structureBars, updated),
    });
  },

  moveBarToSection: (barId, sectionId) => {
    const { structureSections, structureBars } = get();
    const newSections = structureSections.map((s) => {
      const without = s.barIds.filter((bid) => bid !== barId);
      if (s.id === sectionId) return { ...s, barIds: [...without, barId] };
      return { ...s, barIds: without };
    });
    set({
      structureSections: newSections,
      structureBars: reindexBars(structureBars, newSections),
    });
  },

  loadStructure: (structure: SongStructure) =>
    set({
      activeStructureId: structure.id,
      structureTitle: structure.title,
      structureArtist: structure.artist,
      structureBars: structure.bars,
      structureSections: structure.sections,
      focusedSectionId: null,
    }),

  clearStructure: () =>
    set({
      activeStructureId: null,
      structureTitle: '',
      structureArtist: '',
      structureBars: [],
      structureSections: [],
      focusedSectionId: null,
    }),

  setComparisonScale: (scaleId) => {
    if (scaleId === null) {
      const { selectedScaleId, rootNote } = get();
      if (selectedScaleId) {
        const notesA = getScaleNotes(rootNote, selectedScaleId);
        const colors: Record<number, string> = {};
        for (const n of notesA) {
          colors[n] = "var(--color-scale-a)";
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
      if (inA && inB) colors[n] = "var(--color-scale-shared)";
      else if (inA) colors[n] = "var(--color-scale-a)";
      else colors[n] = "var(--color-scale-b)";
    }
    set({
      comparisonScaleId: scaleId,
      highlightedNotes: allNotes,
      highlightColors: colors,
    });
  },
}));
