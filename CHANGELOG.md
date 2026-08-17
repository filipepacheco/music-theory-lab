# Changelog

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
