# Changelog

## 2026-08-16 — Shared transcriptions

- **Changed**: transcriptions (songs) **and song structures** are now shared
  across all devices with no authentication. Their `GET` endpoints return
  every device's rows, deletes propagate globally, and the client pulls are
  unscoped. Progressions remain device-scoped.
- **Note**: both libraries are publicly visible and editable to anyone who
  reaches the API — deliberate for this app; revisit before adding
  sensitive content.

## 2026-08-16 — Design-token conformance and pt-BR pass

### User-visible

- **Added**: `--radius-control` (0.375rem) design token; selects, chips, and
  toggles now consume the token system.
- **Fixed**: key pickers (header and GP import panel) display the preferred
  key spelling — Bb, Eb, Ab… — matching the flat spellings used everywhere
  else.
- **Fixed**: the unsure-chord indicator now uses the same amber family as the
  rest of the review UI (was yellow).
- **Fixed**: user-facing copy restored to proper pt-BR diacritics across all
  modules, constants, and messages ("seção", "música", "progressão",
  "tônica", "Cadência Básica", …). Quiz answer labels stay consistent with
  the generator.
- **Removed**: dead code (`constants/index.ts` barrel, transcription
  `SectionTabs`/`SongMetadataBar`).

### Architecture

- The entire app now consumes the `@theme` radius tokens (`rounded-button` /
  `rounded-card` / `rounded-section` / `rounded-control`) — no stock Tailwind
  radius classes remain in rendered code.
- Instrument palette tokenized: `--color-octave-1/2/3` (+ `-dim`),
  `--color-octave-fallback`, `--color-bass-highlight`,
  `--color-key-black-border`, `--shadow-key`.
- UI audit artifacts committed under `design-plans/` (surface registry,
  findings, attack plan, execution plans).

## 2026-08-16 — Deep-module architecture pass

### User-visible

- **Fixed**: cloud sync now pulls only the current device's structures.
  `/api/structures` previously returned every device's rows and merged them
  into the local library.
- **Fixed**: flat keys (F, Bb, Eb, Ab, Db, Gb) spell flats everywhere —
  timelines, the chord strip, and the review workspace now agree with the
  quiz's spelling.
- **Added**: focused review workspace in the transcription module — review
  unsure chords, toggle confidence, edit beats, and navigate chords from a
  detail panel.
- **Improved**: one shared playback player for example progressions, the
  progression builder, and song playback. Stopping fully stops; unmounting
  mid-play no longer leaves a zombie metronome loop; the metronome supports
  multiple listeners.
- **Improved**: GP7 import parses each file once (was twice) and applies the
  same default track-selection policy everywhere.

### Architecture

- New pure, tested domain modules in `src/domain/`: `stepResolution`,
  `stepList`, `transcriptionDocument`, `scaleHighlights`, `migrations`,
  `chromaticStep`, `syncMerge` — rules that were previously duplicated across
  components and the store.
- `useStepPlayer` replaces three hand-rolled transport implementations;
  `useCollection` generates the saved-list hooks for songs, progressions, and
  structures.
- Shared `ChromaticChordPicker` and `DiatonicChordStrip` replace two
  near-duplicate pickers; the 64-step cap and the beats clamp each live in one
  place.
- `savedLibrary` is self-initializing and owns best-effort cloud pushes;
  `db.ts` is now a pure sql.js persistence adapter, and structure migrations
  moved to the domain with tests.
- Cloud sync consolidated behind per-collection seams (`syncAll` no longer
  takes seven db-internal callbacks).
- Test suite grew from 12 to 46 tests.
