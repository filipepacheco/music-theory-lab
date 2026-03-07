# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Music Theory Lab - interactive educational app for learning music theory (Portuguese/pt-BR). Features real audio playback via Tone.js, visual instruments (piano + bass fretboard), harmonic field analysis, chord progression builder with persistence, scale comparison, and metronome-synced playback.

## Skills

The `music-theory` skill (registered globally at `~/.claude/skills/music-theory/`) provides a validated theory reference. It auto-triggers on music theory tasks. Consult the reference file before implementing theory features - do not generate harmonic field data, tension rules, or scale formulas from memory.

## Commands

```bash
npm run dev      # Vite dev server with HMR
npm run build    # tsc + vite build (type-checks then bundles)
npm run preview  # Preview production build
```

No test runner or linter configured. Prettier is available (`npx prettier --write .`): single quotes, 80 char width, 2-space indent.

Note: `postinstall` copies `sql-wasm.wasm` to `public/` - run `npm install` after cloning.

## Tech Stack

- React 19, TypeScript (strict mode), Vite 5
- Tailwind CSS v4 (uses `@theme` directive in `src/styles/globals.css`, NOT a tailwind.config file)
- Zustand for state (`src/store/useAppStore.ts` - single store)
- Tone.js for audio (`src/hooks/useSynth.ts`)
- sql.js with IndexedDB for client-side persistence (`src/services/db.ts`)
- Framer Motion for animations
- @dnd-kit for drag-and-drop (bars and sections in structure module)
- Path alias: `@` maps to `src/` - always use `@/` imports, never relative paths

## Architecture

```
src/
  constants/    Music theory data (scales, chords, harmonicFields, progressions, tonePresets, etc.)
  utils/        Pure functions (musicTheory.ts, noteHelpers.ts, quizGenerator.ts)
  hooks/        Side effects (useSynth, useMetronome, useKeyboardPiano, useSavedProgressions, useSongs, useQuiz, useStructures, useStructureRecorder)
  services/     Persistence (db.ts - sql.js/IndexedDB singleton, tables: saved_progressions, songs, structures; deviceId.ts - localStorage UUID per device)
  store/        Zustand store (single file)
  types/        TypeScript interfaces (Song, SongSection, SongStructure, StructureBar, StructureSection, HarmonicChord, AppState)
  components/
    layout/         App shell: Header, KeySelector, PresetSelector, ModuleNav, BottomNav (mobile sticky nav)
    instruments/    Piano + BassNeck (with memoized key/fret subcomponents)
    harmonicField/  Chord grid, chord cards, progression examples with beat timeline
    scales/         Scale selector, info display, and side-by-side comparison
    progressions/   Chord picker (diatonic + chromatic), timeline, analysis, playback, save/load
    quiz/           Four exercise types with quiz cards and scoreboard
    transcription/  Song sections, chord picking, playback controls, save/load
    structure/      Song structure recorder: DraggableBar, StructureSections, ColorPicker, drag-and-drop
    shared/         Badge, MetronomeControl, SpeedControl, TeacherTip
```

### Module System

Six modules controlled by `activeModule` in the store: `harmonicField`, `progressions`, `scales`, `quiz`, `transcription`, `structure`. App.tsx conditionally renders the active module component. Switching modules clears all highlights and scale selections.

### Data Flow

1. User picks root note + mode -> store recomputes `harmonicField` (7 chords)
2. User clicks chord -> store sets `selectedChordIndex`, `highlightedNotes`, `highlightColors`
3. Instruments subscribe via Zustand selectors and re-render highlighted keys/frets
4. `useSynth` plays audio on demand (supports scheduled playback via Tone.Transport)

**Bass voicing**: When a chord is selected, `highlightOctaveMap` (a `Record<number, number>` mapping note index to octave) provides octave-specific voicing for the bass fretboard. The bass computes independent voicings in octaves 1-2, separate from the piano which highlights all octaves. If a note maps to an unreachable octave on the bass (e.g., D1), the bass falls back to the nearest reachable octave.

Changing root note or mode resets `selectedChordIndex`, `highlightedNotes`, `highlightColors`, and scale selections automatically.

### Key Concepts

**Notes are integers 0-11** (C=0, C#=1, ..., B=11). All music theory logic operates on these indices with modulo 12 arithmetic.

**Harmonic functions**: Tonic (T/blue), Subdominant (SD/green), Dominant (D/orange). Colors defined as CSS variables in globals.css (base, light, and border variants).

**Tone presets** can be `SynthPreset` (oscillator-based, instant) or `SamplerPreset` (real audio samples, async loading with synth fallback). Samplers are cached globally and eagerly loaded at module init - never dispose cached samplers.

**Progression steps** have `beats` (duration in quarter notes, default 4), `offsetEighths` (shift chord change by N eighth notes: positive = late, negative = anticipation/bossa nova feel), and optional `confidence` ('sure'/'unsure' for transcription). A step with `degree: null` indicates a chromatic/out-of-field chord, using `intervals` array to specify notes directly. Custom progressions are capped at 64 steps; beats are clamped to 0.5-8 in 0.5 increments.

**Chromatic chord picker** provides two ways to add non-diatonic chords: manual root+type selection (12 roots x 8 chord types), and pre-organized common chromatic chords (secondary dominants, modal interchange, diminished passing chords) that auto-compute intervals from the current key.

**Song transcription** uses `SongSection` objects (intro, verso, refrao, etc.) with per-section step arrays. Songs are persisted in a separate `songs` table with JSON-serialized sections. The `SongPlaybackControls` supports loop-by-section or full-song playback with a speed control slider (50-150% BPM).

**Quiz module** has four exercise types: interval identification, chord type recognition, chord ID (name the chord played), and degree recognition within a key. `useQuiz` hook manages quiz state, `quizGenerator.ts` produces randomized questions, and `quizData.ts` holds answer options and labels.

**Scale comparison** uses a three-color system: `scale-a` (blue) for primary scale, `scale-b` (purple) for comparison, `scale-shared` (amber) for notes in both. These colors are CSS variables used for instrument highlights.

**Song structure module** records the bar-level arrangement of a song. Users tap spacebar to record bars in real-time (100ms debounce via `useStructureRecorder`), then organize bars into named sections (intro, verso, refrao, etc.) using drag-and-drop (@dnd-kit). Each bar has a configurable time signature (2/4, 3/4, 4/4, 6/8). Sections support freeform comments. The store maintains `structureBars`, `structureSections`, and `selectedBarIds` (Set) with a `reindexBars()` helper that recalculates bar indices when sections change. State is shared between `SaveStructureButton` and `StructureList` via prop drilling from `StructureModule` (which owns the single `useStructures()` hook instance) to avoid stale state bugs from independent hook instances.

### Audio System (`useSynth`)

- Global effects chain: Limiter(-6dB) -> Reverb -> Destination
- `playNote()` for single notes, `playChord()` for simultaneous notes, `playScale()` for sequential notes
- `playChord` creates a fresh PolySynth per invocation to avoid polyphony issues, auto-disposes after 2s
- `ensureAudio()` handles browser AudioContext restrictions (must call Tone.start() on user gesture)
- Chord voicing algorithm ensures notes ascend by octave to prevent muddy low-register chords

### Metronome & Progression Playback

- `useMetronome` runs a Tone.Loop on audio thread for precise quarter-note timing
- Fires `onBeat` callbacks that ProgressionExamples hooks into via `onBeat(callback)` registration
- ProgressionExamples tracks beat position, maps to progression steps, and handles look-ahead scheduling for steps with negative `offsetEighths`
- **Critical pattern**: Use `Tone.getDraw().schedule()` for UI updates triggered by audio events - never update React state directly in audio callbacks
- Store fields `currentEighth` and `playingProgression` drive the BeatTimeline visualization

### Persistence (sql.js)

- `src/services/db.ts` manages a sql.js SQLite database stored in IndexedDB as a binary blob
- Module-level singleton pattern: `initDB()` lazily initializes and seeds example progressions from `PROGRESSION_EXAMPLES`
- `useSavedProgressions` hook wraps the DB API with React state and provides CRUD operations
- `useSongs` hook wraps the songs CRUD API with React state for the transcription module
- `useStructures` hook wraps the structures CRUD API with React state for the structure module
- Example progressions are seeded once (flagged `is_example = 1`) and cannot be deleted by users
- Songs table stores transcriptions with title, artist, key, mode, BPM, preset ID, and JSON sections
- Structures table stores song arrangements with title, artist, bars (JSON), and sections (JSON)
- The WASM binary is served from `/sql-wasm.wasm` (copied by postinstall script)

### Cloud Sync (Vercel API Routes)

Three serverless API routes in `api/` provide cloud sync via Turso (LibSQL):
- `api/progressions.ts` - GET/POST/DELETE for saved progressions
- `api/songs.ts` - GET/POST/DELETE for song transcriptions
- `api/structures.ts` - GET/POST/DELETE for song structures

All routes use the same pattern: inlined Turso client (no shared module), device_id-based ownership, batch upsert on POST. Requires `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` environment variables.

### Design Tokens (Tailwind v4)

All colors, shadows, radii, and fonts are defined as CSS variables inside `@theme {}` in `src/styles/globals.css`. Tailwind v4 auto-generates utility classes from `@theme` variables - e.g., `--color-bg-card` becomes `bg-bg-card`, `--color-text-primary` becomes `text-text-primary`. To add a new token, add it inside the `@theme {}` block (not in a tailwind.config file, which does not exist). Custom fonts: `font-heading` (JetBrains Mono) and `font-body` (JetBrains Sans).

## Conventions

- Tailwind utility classes with CSS variables (e.g., `bg-bg-card`, `text-text-primary`)
- Zustand selector pattern: `useAppStore((s) => s.fieldName)` for minimal re-renders
- React.memo on performance-critical components (PianoKey, BassFret)
- Framer Motion for enter/exit animations and hover/tap feedback
- All user-facing text in Portuguese (pt-BR)
- TypeScript strict mode with `noUnusedLocals` and `noUnusedParameters` enabled
