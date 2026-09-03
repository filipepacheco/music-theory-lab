# Groove playback spec (visual → audio)

Written against: `cdf053d` (branch `main`). Executor target: implement audio
playback of a structure section's groove. Grooves are currently visual-only.

## Goal

In the Structure module, a focused section with a groove can be **played**:
a button starts a loop that sounds the selected grid resolution at the
structure BPM, bumbo/caixa/chimbal each with a recorded acoustic kit timbre,
and stops cleanly on unmount/toggle. No new dependencies — Tone.js is already
a dependency.

## Ground truth (single source of truth — read these, do not copy values)

- `src/constants/groove.ts` — the default `GROOVE_STEPS = 16`, supported
  `GROOVE_SUBDIVISIONS`, and `DRUM_PIECES` (ids + display labels, current
  order: `chimbal/HH`, `caixa/C`, `bumbo/B`).
- `src/types/index.ts` — `DrumPiece`, `GroovePattern` (`{ bumbo, caixa,
chimbal }` each matching the selected subdivision's step count),
  `GrooveSubdivision`, `GrooveMeasureCount`, and `StructureSection.groove?`.
- `src/domain/structureDocument.ts` — `toggleGrooveHit`/`clearGroove`
  commands; the section's groove is the playback source.
- `src/components/structure/GrooveEditor.tsx` — where the play button goes
  (editor header and/or preview strip).
- `src/services/playbackEngine.ts` — the audio seam (effects chain,
  `ensureAudio()` for the AudioContext user-gesture requirement).
- `src/hooks/useStepPlayer.ts` — the exemplar for a playback hook (Tone
  scheduling, `Tone.getDraw().schedule()` for UI, dispose-on-unmount).

## Design

### Pure scheduling (the testable part)

New `src/domain/grooveSchedule.ts` (colocated `grooveSchedule.test.ts`),
pure, no Tone:

- `grooveHits(groove: GroovePattern): DrumPiece[][]` — index-aligned by the
  selected grid step; each entry lists which pieces fire at that step.
- `grooveStepDuration(bpm: number, subdivision?: GrooveSubdivision): number` —
  one selected grid step at 4/4.

Completion: both pure functions covered by tests; no audio types leak in.

### Drum voices

Add to `src/services/playbackEngine.ts` a `playGrooveHit(piece: DrumPiece,
time: number)` that plays through the existing effects chain (do not create
an independent `.toDestination()`; the metronome's bypass is the exception,
not the pattern). Use the cached acoustic-kit one-shot recordings from the
Tone.js audio collection:

- `bumbo`: `kick.mp3`
- `caixa`: `snare.mp3`
- `chimbal`: `hihat.mp3`

Cache the three `Tone.Player` voices once (module scope, like the metronome's
clicks); never dispose cached players. They must connect to the existing
effects chain, not directly to `.toDestination()`. Keep the acoustic-leaning
synth voices as a fallback when a sample cannot load.

### Playback loop + hook

New `src/hooks/useGroovePlayer.ts`, modeled on `useStepPlayer`:

- `play(groove: GroovePattern, bpm: number)` — uses `Tone.Transport` and a
  fixed 32nd-note scheduler so the current pattern, selected resolution, and
  one/two-measure length can be read before every tick. Edits to hits or
  resolution take effect on the next representable tick without restarting
  the loop. It loops the complete groove and respects `Tone.start()` on user
  gesture.
- `stop()` — cancels the scheduled loop, resets state.
- Returns `{ play, stop, isPlaying }`. `isPlaying` drives the button label
  (pt-BR: "Ouvir groove" / "Parar").
- UI updates from audio callbacks go through `Tone.getDraw().schedule()`,
  never React state directly in the audio thread.
- Disposes the loop on unmount.

### UI

In `src/components/structure/GrooveEditor.tsx`, add a play/stop button in
the editor header (next to "Limpar"). It reads the section's groove and the
store `structureBpm`. Hook into the focused section: the groove to play is
the section currently being edited.

The Structure PDF export includes a compact visual copy of every section's
groove, including a section that has a groove but no bars. The visual copy is
a compact percussion chart with barlines and drum noteheads.

## Completion criteria

- `npm test` passes, including the new `grooveSchedule` tests.
- `npm run build` passes (strict TS).
- Structure PDF export includes the chart at the selected resolution and
  measure count.
- Manual: Estrutura → open a section's Groove → choose a resolution → draw a
  pattern → "Ouvir groove" loops it at the structure BPM with three audibly
  distinct acoustic pieces; edits to the pattern while playing are audible on
  subsequent ticks;
  "Parar" stops; switching sections or leaving the module stops playback.
- No `.toDestination()` bypass in the groove path; no new dependencies; all
  acoustic kit voices are cached once.

## Deferrals (not in scope)

- Time-signature-aware grids; extra drum pieces; drag-to-paint; MIDI/export;
  syncing playback to the section's bars rather than the fixed 4/4 groove grid.

## Notes for the implementer

- Follow the repo conventions: `@/` imports, strict TS, pt-BR user-facing
  text, colocated `*.test.ts`. `design-plans/groove-playback-spec.md` is
  the single source for the spec; the code is the single source for the
  current data model — re-read the ground-truth files before editing.
