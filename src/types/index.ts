import type { HarmonicChord } from '@/utils/musicTheory';
import type {
  ProgressionExample,
  ProgressionStep,
} from '@/constants/progressions';

export type ActiveModule =
  | 'harmonicField'
  | 'progressions'
  | 'scales'
  | 'quiz'
  | 'transcription'
  | 'structure';

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

/** One row of a groove grid: the drum pieces a groove can mark. */
export type DrumPiece = 'bumbo' | 'caixa' | 'chimbal';

/** The note subdivision used by a groove across one 4/4 measure. */
export type GrooveSubdivision = '4n' | '8n' | '16n' | '32n';

/** The main drum pattern of a section: a three-piece, variable-step grid. */
export interface GroovePattern {
  subdivision: GrooveSubdivision;
  bumbo: boolean[];
  caixa: boolean[];
  chimbal: boolean[];
}

export interface StructureBar {
  id: string;
  index: number;
  timeSignature: TimeSignature;
  color?: string;
  accents?: number[];
}

export interface StructureSection {
  id: string;
  name: string;
  color: string;
  barIds: string[];
  repeatOf?: string;
  comment?: string;
  barsPerRow?: number;
  /** Main drum pattern of the section (drawn in the section editor). */
  groove?: GroovePattern;
}

export interface SongStructure {
  id: string;
  title: string;
  artist: string;
  bpm: number;
  bars: StructureBar[];
  sections: StructureSection[];
  createdAt: string;
  updatedAt: string;
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
  theme: 'dark' | 'light';

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
  structureBpm: number;
  activeTimeSignature: TimeSignature;
  focusedSectionId: string | null;

  // Actions
  setRootNote: (note: number) => void;
  setIsMinor: (isMinor: boolean) => void;
  setActiveModule: (module: ActiveModule) => void;
  selectChord: (index: number | null) => void;
  setHighlightedNotes: (
    notes: number[],
    color: string,
    rootName?: string,
    octaveMap?: Record<number, number>,
  ) => void;
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
  toggleTheme: () => void;

  // Transcription actions
  loadSong: (song: Song) => void;
  loadImportedSong: (data: {
    title: string;
    artist: string;
    key: number;
    sections: SongSection[];
  }) => void;
  clearSong: () => void;
  setSongTitle: (title: string) => void;
  setSongArtist: (artist: string) => void;
  addSection: (type: SectionType, customLabel?: string) => void;
  removeSection: (index: number) => void;
  setActiveSectionIndex: (index: number) => void;
  addSongStep: (sectionIndex: number, step: ProgressionStep) => void;
  removeSongStep: (sectionIndex: number, stepIndex: number) => void;
  setSongStepBeats: (
    sectionIndex: number,
    stepIndex: number,
    beats: number,
  ) => void;
  setSongStepConfidence: (
    sectionIndex: number,
    stepIndex: number,
    confidence: ChordConfidence,
  ) => void;

  // Practice actions
  setPracticeSpeed: (percent: number) => void;
  setLoopSection: (loop: boolean) => void;

  // Structure actions
  setStructureTitle: (title: string) => void;
  setStructureArtist: (artist: string) => void;
  setStructureBpm: (bpm: number) => void;
  setActiveTimeSignature: (ts: TimeSignature) => void;
  addBarToSection: (sectionId: string) => void;
  removeBar: (id: string) => void;
  setBarTimeSignature: (id: string, ts: TimeSignature) => void;
  setBarColor: (id: string, color: string | undefined) => void;
  toggleBarAccent: (barId: string, dotIndex: number) => void;
  addStructureSection: (name: string, color: string) => void;
  duplicateStructureSection: (id: string) => void;
  removeStructureSection: (id: string) => void;
  setSectionName: (sectionId: string, name: string) => void;
  setSectionColor: (sectionId: string, color: string) => void;
  setSectionComment: (sectionId: string, comment: string) => void;
  setSectionBarsPerRow: (
    sectionId: string,
    barsPerRow: number | undefined,
  ) => void;
  toggleGrooveHit: (sectionId: string, piece: DrumPiece, step: number) => void;
  setGrooveSubdivision: (
    sectionId: string,
    subdivision: GrooveSubdivision,
  ) => void;
  clearGroove: (sectionId: string) => void;
  setFocusedSection: (id: string | null) => void;
  reorderStructureSection: (activeId: string, overId: string) => void;
  moveBarToSection: (barId: string, sectionId: string) => void;
  loadStructure: (structure: SongStructure) => void;
  clearStructure: () => void;

  // Saved structures actions
  setActiveStructureId: (id: string | null) => void;
}
