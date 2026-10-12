# Highlights, instrument colours, and theme

## Data flow of a selection

1. The user picks a root note and a mode. The store computes `harmonicField` again (7 chords).
2. The user clicks a chord. The store sets `selectedChordIndex`, `highlightedNotes`, and `highlightColors`.
3. The instruments subscribe through Zustand selectors and render the highlighted keys and frets.
4. `useSynth` plays the audio on demand.

A change of root note or mode resets `selectedChordIndex`, `highlightedNotes`, `highlightColors`, and the scale selections. A change of module clears all highlights and scale selections.

## Bass voicing

- When a chord is selected, `highlightOctaveMap` (`Record<number, number>`, note index to octave) gives the octave of each note for the bass fretboard.
- The bass computes its own voicings in octaves 1-2. The piano highlights all octaves.
- When a note maps to an octave that the bass cannot reach (for example D1), the bass uses the nearest octave that it can reach.

## Colour systems

| System | Values |
|---|---|
| Harmonic functions | Tonic (T, blue), Subdominant (SD, green), Dominant (D, orange). Each has base, light, and border variants. |
| Scale comparison | `scale-a` (blue) for the primary scale, `scale-b` (purple) for the comparison, `scale-shared` (amber) for notes in both. |
| Instruments | `--color-octave-1/2/3` with `-dim` variants, `--color-octave-fallback`, `--color-bass-highlight`, `--color-bass-root-highlight`, `--color-fret-bg`, `--color-fret-border`, `--color-string`. |

All are CSS variables in `src/styles/globals.css`. The token rules are in `docs/architecture/design-system.md`.

## Piano keys

Piano keys show a physical object, so they do not follow the theme.

- A white key has the class `ink-day`, and a black key `ink-night`. The class pins the day or night primitives to that element and resolves again the aliases that the element uses.
- The list of those aliases is in `globals.css`. Add an alias there before you use it inside a key.
- This keeps a highlight at 4.5:1 or better against the keys beside it, in both themes.
- A pressed key takes `--color-live`.

## Theme

- The store holds `theme: 'dark' | 'light'`, read from `localStorage` at start, and a `toggleTheme()` action.
- The value is written back to `localStorage`. `App.tsx` sets it as the `light` class on `<html>`.
- The class must be on `<html>`: the `@theme` aliases resolve on `:root`, so the day primitives of `:root.light` only take effect there.
