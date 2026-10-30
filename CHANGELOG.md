# Changelog

## 2026-10-30 - Groove triplets, toms, and cymbals

- **Added**: two triplet resolutions for the groove of a structure section:
  "1/8T · Tercinas de colcheia" (3 steps a beat) and "1/16T · Sextinas"
  (6 steps a beat). The chart beams each tuplet beat and writes its 3 or 6.
  Each beat also has its own resolution select, so a fill can put a triplet
  or a sextuplet on the snare and toms in one beat of a straight groove.
  Changing a beat's resolution keeps the hits that fall on its new grid.
- **Added**: five rows in the groove editor: Ataque (crash), Condução (ride),
  Tom 1, Tom 2, and Surdo. They play the Virtuosity Drums samples and sit at
  their standard drum-notation places in the chart. Grooves saved before this
  change load with these rows empty.
- **Changed**: the groove player counts 96 ticks a measure instead of 32, so
  the straight and the triplet grids share one clock.
- **Changed**: the groove chart of a section draws one measure per line,
  1.75 times larger, and stays in view while the groove editor is open.
- **Changed**: with the Instrumentos panel collapsed, the module takes the
  full width and the collapsed panel bar sits above it.

## 2026-10-22 - Bass tab player layout

- **Changed**: the Biblioteca uses the full width of the page. The
  Instrumentos panel does not show on this page.
- **Changed**: a click on a bar selects it. Its detail shows in the bottom
  bar, not in the bar.
- **Changed**: the chord name of a bar is larger. A confirmed chord has a solid
  box. A guessed chord has a dashed box and a `?`.
- **Added**: three views of the tab: "Tocar junto", "Graus", and "Análise
  completa". Only "Análise completa" shows the section analysis, the key, and
  the analysis of the full song.
- **Changed**: Transpor, Afinação, and Digitação are in one box. Each action
  is a button. The fixed help text is in a closed "Como funcionam" section.
- **Added**: the transposition and the tuning of a song are saved in the chart
  settings and sync to other devices. The bar octaves then stay correct after
  a reload. The "Oitava por compasso" mode is also saved.

## 2026-10-14 - Drum symbols and groove notation

- **Changed**: the drum grid gives each cymbal and tom a symbol of its own.
  The crash is a star, the ride is a diamond, and the hi-hat stays `x`. Tom 1
  is a triangle up and tom 2 is a triangle down, in the same row.
- **Changed**: in each bar of the drum grid, a solid line marks each beat and
  a dotted line marks each half beat.
- **Changed**: the section groove chart uses standard drum notation, close to
  Songsterr: a percussion clef and 4/4, the hi-hat above the staff, the snare
  in the third space, the kick in the first space, and stems down to beams.
  The Estrutura groove chart and the PDF use the same note places.

## 2026-10-12 - Agent docs

- **Changed**: `CLAUDE.md` is now a map (3,396 to 966 words). The detail on
  audio, persistence and sync, song documents, bass charts, the design
  system, and highlights and theme moved to `docs/architecture/`, behind a
  pointer table. The empty `CLAUDE.md` stubs of a removed plugin are gone.

## 2026-08-18 — Sync hardening

- **Fixed**: failed sync pushes are now retried — sync re-runs whenever the
  tab regains focus (30s cooldown, idempotent upserts), and the collection
  hooks re-read their lists on the same focus event, so mounted lists update
  without a reload. Stale tabs pick up data from other devices automatically.
- **Fixed**: API routes parse JSON bodies explicitly (deployed runtimes did
  not provide `req.body`) and the structures route self-migrates the missing
  Turso `bpm` column.

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
