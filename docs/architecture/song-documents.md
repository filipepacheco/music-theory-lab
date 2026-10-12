# Progressions, transcriptions, and structures

## Progression steps

| Field | Meaning |
|---|---|
| `beats` | Duration in quarter notes. Default 4. Clamped to 0.5-8 in steps of 0.5. |
| `offsetEighths` | Shifts the chord change by N eighth notes. Positive is late. Negative is an anticipation (bossa nova feel). |
| `confidence` | Optional: `'sure'` or `'unsure'`, for transcription. |
| `degree` | `null` for a chromatic chord that is not in the harmonic field. Then `intervals` gives the notes directly. |

A custom progression holds at most 64 steps.

## Chromatic chord picker

Two ways to add a chord that is not diatonic:

- Manual: a root and a type (12 roots x 8 chord types).
- Common chromatic chords, in groups: secondary dominants, modal interchange, diminished passing chords. Their intervals are computed from the current key.

## Song transcription

- A song is a list of `SongSection` objects (intro, verso, refrao, and so on). Each section has its own step array.
- Songs are stored in the `songs` table, with the sections as JSON.
- `SongPlaybackControls` plays one section in a loop or the full song, with a speed slider of 50-150% of the BPM.

## GP import (transcription module)

Accepts GP7 and GP8 `.gp` files.

| File | Job |
|---|---|
| `src/services/gpFile.ts` | Parses the container. Gives the pitches of each bar, the time signatures, and title and artist hints. |
| `src/services/gpChords.ts` | Matches each bar against the chord vocabulary. |
| `src/services/gpImport.ts` | Builds a saved Song from the parsed bars and a chosen key. |
| `GpImportPanel` | The UI: a split layout with a live preview of each bar. |

- A bar that is unclear or silent carries the chord before it, marked unsure.
- Sections are split mechanically into chunks of 64 steps, with the names "Parte N".

## Song structure module

Records the arrangement of a song, bar by bar.

- The user taps the spacebar to record bars in real time. `useStructureRecorder` applies a 100 ms debounce.
- The user then puts the bars into named sections with drag-and-drop (@dnd-kit).
- Each bar has a time signature: 2/4, 3/4, 4/4, or 6/8.
- A section has a free comment and a `barsPerRow` layout setting.
- `src/domain/structureDocument.ts` owns the pure document commands. The store is a thin adapter that holds `structureBars`, `structureSections`, and `focusedSectionId`.

## Quiz

Four exercise types: interval identification, chord type recognition, chord ID (name the chord played), and degree recognition in a key.

| File | Job |
|---|---|
| `src/domain/quizSession.ts` | Pure session transitions and scoring. |
| `useQuiz` | Adapts the session to the Tone and Zustand side effects. |
| `quizGenerator.ts` | Makes random questions. |
| `quizData.ts` | Answer options and labels. |
