# Groove playback spec (visual → audio)

Written against: `cdf053d` (branch `main`). Executor target: implement audio
playback of a structure section's groove. Grooves are currently visual-only.

## Goal

In the Structure module, a focused section with a groove can be **played**:
a button starts a loop that sounds the 16-step pattern at the current BPM,
bumbo/caixa/chimbal each with a distinct timbre, and stops cleanly on
unmount/toggle. No new dependencies — Tone.js is already a dependency.

## Ground truth (single source of truth — read these, do not copy values)

- `src/constants/groove.ts` — `GROOVE_STEPS = 16` and `DRUM_PIECES` (ids +
  display labels, current order: `chimbal/HH`, `caixa/C`, `bumbo/B`).
- `src/types/index.ts` — `DrumPiece`, `GroovePattern` (`{ bumbo, caixa,
  chimbal }` each `boolean[16]`), `StructureSection.groove?`.
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

- `grooveHits(groove: GroovePattern): DrumPiece[][]` — index-aligned by
  step 0..15; each entry lists which pieces fire at that step.
- `grooveStepDuration(bpm: number): number` — one 16th at 4/4 = `60 / bpm /
  4` seconds.

Completion: both pure functions covered by tests; no audio types leak in.

### Drum synthesis

Add to `src/services/playbackEngine.ts` a `playGrooveHit(piece: DrumPiece,
time: number)` that plays through the existing effects chain (do not create
an independent `.toDestination()`; the metronome's bypass is the exception,
not the pattern). Suggested synth recipes, tune by ear:

- `bumbo` (kick): `Tone.MembraneSynth`, pitch ~80, short decay (~0.25s).
- `caixa` (snare): `Tone.NoiseSynth` (white), fast decay (~0.15s), plus a
  low membrane tone for body.
- `chimbal` (hi-hat): `Tone.NoiseSynth` (white) through a high-pass (~7kHz),
  very short decay (~0.03s).

Cache the three synths once (module scope, like the metronome's clicks);
never dispose cached synths.

### Playback loop + hook

New `src/hooks/useGroovePlayer.ts`, modeled on `useStepPlayer`:

- `play(groove: GroovePattern, bpm: number)` — uses `Tone.Transport` (or a
  `Tone.Loop` at 16th resolution) to schedule `playGrooveHit(piece,
  time + step * grooveStepDuration(bpm))` for each piece at each step, and
  **loops the 16 steps**. Respect `Tone.start()` on user gesture.
- `stop()` — cancels the scheduled loop, resets state.
- Returns `{ play, stop, isPlaying }`. `isPlaying` drives the button label
  (pt-BR: "Ouvir groove" / "Parar").
- UI updates from audio callbacks go through `Tone.getDraw().schedule()`,
  never React state directly in the audio thread.
- Disposes the loop on unmount.

### UI

In `src/components/structure/GrooveEditor.tsx`, add a play/stop button in
the editor header (next to "Limpar"). It reads the section's groove and the
store `bpm`. Hook into the focused section: the groove to play is the
section currently being edited.

## Completion criteria

- `npm test` passes, including the new `grooveSchedule` tests.
- `npm run build` passes (strict TS).
- Manual: Estrutura → open a section's Groove → draw a pattern → "Ouvir
  groove" loops it at the app BPM with three audibly distinct pieces;
  "Parar" stops; switching sections or leaving the module stops playback.
- No `.toDestination()` bypass in the groove path; no new dependencies;
  no dead/duplicate synth code (cache once).

## Deferrals (not in scope)

- Time-signature-aware grids; extra drum pieces; drag-to-paint; MIDI/export;
  syncing playback to the section's bars rather than the fixed 16-step grid.

## Notes for the implementer

- Follow the repo conventions: `@/` imports, strict TS, pt-BR user-facing
  text, colocated `*.test.ts`. `design-plans/groove-playback-spec.md` is
  the single source for the spec; the code is the single source for the
  current data model — re-read the ground-truth files before editing.
