import type { HarmonicFunction } from "@/constants/harmonicFields";
import type {
  ProgressionExample,
  ProgressionStep,
} from "@/constants/progressions";

export type ActiveModule =
  | "harmonicField"
  | "progressions"
  | "scales"
  | "quiz"
  | "transcription"
  | "structure";

export type ChordConfidence = 'sure' | 'unsure';

export type SectionType =
  | 'intro'
  | 'verso'
  | 'pre-refrao'
  | 'refrao'
  | 'ponte'
  | 'solo'
  | 'outro'
  | 'custom';

export interface SongSection {
  id: string;
  type: SectionType;
  customLabel?: string;
  steps: ProgressionStep[];
}

export interface Song {
  id: string;
  title: string;
  artist: string;
  key: number;
  mode: 'major' | 'minor';
  originalBpm: number;
  presetId: string;
  sections: SongSection[];
  createdAt: string;
  updatedAt: string;
}

export type TimeSignature = '2/4' | '3/4' | '4/4' | '6/8';

export interface StructureBar {
  id: string;
  index: number;
  timeSignature: TimeSignature;
}

export interface StructureSection {
  id: string;
  type: SectionType;
  customLabel?: string;
  barIds: string[];
  repeatOf?: string;
  comment?: string;
}

export interface SongStructure {
  id: string;
  title: string;
  artist: string;
  bars: StructureBar[];
  sections: StructureSection[];
  createdAt: string;
  updatedAt: string;
}

export interface HarmonicChord {
  degree: number;
  romanNumeral: string;
  chordName: string;
  notes: number[];
  noteNames: string[];
  harmonicFunction: HarmonicFunction;
  intervals: number[];
  chordSymbol: string;
}

export interface AppState {
  // Key selection
  rootNote: number;
  isMinor: boolean;

  // Navigation
  activeModule: ActiveModule;

  // Harmonic field
  harmonicField: HarmonicChord[];
  selectedChordIndex: number | null;

  // Instrument highlights
  highlightedNotes: number[];
  highlightColors: Record<number, string>;
  highlightRootName: string | null;
  highlightOctaveMap: Record<number, number> | null;

  // Tone preset
  activePresetId: string;

  // Metronome
  bpm: number;
  isMetronomeOn: boolean;
  currentBeat: number;

  // Beat timeline
  currentEighth: number;
  playingProgression: ProgressionExample | null;

  // Custom progression builder
  customProgression: ProgressionStep[];

  // Scales module
  selectedScaleId: string | null;
  comparisonScaleId: string | null;

  // UI panels
  instrumentsPanelOpen: boolean;

  // Transcription
  activeSongId: string | null;
  songSections: SongSection[];
  activeSectionIndex: number;
  songTitle: string;
  songArtist: string;

  // Practice
  practiceSpeed: number;
  loopSection: boolean;

  // Structure
  structureBars: StructureBar[];
  structureSections: StructureSection[];
  activeStructureId: string | null;
  structureTitle: string;
  structureArtist: string;
  activeTimeSignature: TimeSignature;
  selectedBarIds: Set<string>;

  // Actions
  setRootNote: (note: number) => void;
  setIsMinor: (isMinor: boolean) => void;
  setActiveModule: (module: ActiveModule) => void;
  selectChord: (index: number | null) => void;
  setHighlightedNotes: (notes: number[], color: string, rootName?: string, octaveMap?: Record<number, number>) => void;
  clearHighlights: () => void;
  setActivePresetId: (id: string) => void;
  setBpm: (bpm: number) => void;
  setIsMetronomeOn: (on: boolean) => void;
  setCurrentBeat: (beat: number) => void;
  setCurrentEighth: (eighth: number) => void;
  setPlayingProgression: (prog: ProgressionExample | null) => void;
  addProgressionStep: (step: ProgressionStep) => void;
  removeProgressionStep: (index: number) => void;
  setProgressionStepBeats: (index: number, beats: number) => void;
  clearProgression: () => void;
  loadProgressionPreset: (steps: ProgressionStep[]) => void;
  selectScale: (scaleId: string | null) => void;
  setComparisonScale: (scaleId: string | null) => void;
  setInstrumentsPanelOpen: (open: boolean) => void;

  // Transcription actions
  loadSong: (song: Song) => void;
  clearSong: () => void;
  setSongTitle: (title: string) => void;
  setSongArtist: (artist: string) => void;
  addSection: (type: SectionType, customLabel?: string) => void;
  removeSection: (index: number) => void;
  setActiveSectionIndex: (index: number) => void;
  addSongStep: (sectionIndex: number, step: ProgressionStep) => void;
  removeSongStep: (sectionIndex: number, stepIndex: number) => void;
  setSongStepBeats: (sectionIndex: number, stepIndex: number, beats: number) => void;
  setSongStepConfidence: (sectionIndex: number, stepIndex: number, confidence: ChordConfidence) => void;

  // Practice actions
  setPracticeSpeed: (percent: number) => void;
  setLoopSection: (loop: boolean) => void;

  // Structure actions
  setStructureTitle: (title: string) => void;
  setStructureArtist: (artist: string) => void;
  setActiveTimeSignature: (ts: TimeSignature) => void;
  addBar: () => void;
  removeBar: (id: string) => void;
  setBarTimeSignature: (id: string, ts: TimeSignature) => void;
  selectBar: (id: string) => void;
  selectBarRange: (id: string) => void;
  toggleBar: (id: string) => void;
  clearBarSelection: () => void;
  assignBarsToSection: (type: SectionType, customLabel?: string) => void;
  removeStructureSection: (id: string) => void;
  setSectionRepeat: (sectionId: string, repeatOf: string | undefined) => void;
  setSectionComment: (sectionId: string, comment: string) => void;
  reorderBar: (activeId: string, overId: string) => void;
  reorderStructureSection: (activeId: string, overId: string) => void;
  moveBarToSection: (barId: string, sectionId: string) => void;
  unassignBar: (barId: string) => void;
  loadStructure: (structure: SongStructure) => void;
  clearStructure: () => void;
}
