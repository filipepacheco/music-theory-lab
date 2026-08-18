# UI surface registry

Written against: `f4f59f5` (branch `main`)

Purpose: canonical decomposition of the Music Theory Lab UI into coherent
audit surfaces, one per primary product task, so `/improve-ui` can run on
each separately. Every connection below is proven by the import/render
graph; shared components are not surfaces of their own — they are audited
inside each surface that renders them.

Governing design system (applies to every surface): `@theme` tokens in
`src/styles/globals.css` (colors, three radii `--radius-button` 0.5rem /
`--radius-card` 0.75rem / `--radius-section` 1rem, shadows, fonts),
CLAUDE.md (Design Tokens + Conventions), AGENTS.md (Tailwind v4, tokens in
`@theme`). No `DESIGN.md` exists.

Known app-wide rule already enforced on one surface: stock Tailwind radius
classes must be the token utilities (`rounded-lg` → `rounded-button`,
`rounded-xl` → `rounded-card`, `rounded-2xl` → `rounded-section`; bare
`rounded`, `rounded-md`, arbitrary values have no token and stay).
Precedent: transcription surface (`f4f59f5`) and plan
`design-plans/adopt-theme-radius-tokens-transcription.md`.

## Surfaces

### 1. App chrome — STATUS: audited (finding 1 reported, plan pending)

- Entry: `src/App.tsx` → `Header` → `ModuleNav`; `KeySelector` →
  `PresetSelector`, `MetronomeControl`; `BottomNav`.
- Task: navigate modules; set key/mode, timbre, BPM; toggle theme.
- Files: `App.tsx`, `layout/Header.tsx`, `layout/ModuleNav.tsx`,
  `layout/KeySelector.tsx`, `layout/PresetSelector.tsx`,
  `layout/BottomNav.tsx`, `shared/MetronomeControl.tsx`.
- Surface-specific evidence: BottomNav comment cites a "Paper X5-0"
  mockup as its design source.
- Open finding: radius-token conformance (`rounded-lg`/`rounded-xl` in
  Header, ModuleNav, BottomNav, KeySelector, MetronomeControl).

### 2. Instruments panel — STATUS: pending

- Entry: `src/App.tsx` section-panel ("Instrumentos") → `Piano` →
  `PianoKey`, `NoteIndicator`; `BassNeck` → `BassFret`.
- Task: play and visualize highlighted notes/octaves; works in every module.
- Files: `instruments/Piano.tsx`, `instruments/PianoKey.tsx`,
  `instruments/BassNeck.tsx`, `instruments/BassFret.tsx`,
  `instruments/NoteIndicator.tsx`; `hooks/useKeyboardPiano.ts`.
- Surface-specific evidence: bass voicing rules in CLAUDE.md
  (`highlightOctaveMap`, octave fallback); scale/function highlight
  colors are `@theme` tokens.

### 3. Harmonic field — STATUS: pending

- Entry: `harmonicField/HarmonicFieldModule.tsx` → `FunctionLegend`,
  `ChordGrid` → `ChordCard` + `shared/Badge`, `ProgressionExamples`,
  `shared/TeacherTip`, `BeatTimeline`, `ProgressionChordStrip`.
- Task: explore the 7 chords of the chosen key; play example progressions
  with beat timeline.
- Files: `harmonicField/HarmonicFieldModule.tsx`, `FunctionLegend.tsx`,
  `ChordGrid.tsx`, `ChordCard.tsx`, `ProgressionExamples.tsx`,
  `BeatTimeline.tsx`, `ProgressionChordStrip.tsx`, `shared/TeacherTip.tsx`,
  `shared/Badge.tsx`.
- Surface-specific evidence: `constants/functionColors.ts` maps harmonic
  function → `--color-tonic/subdominant/dominant`; glows in `@theme`.

### 4. Progressions — STATUS: pending

- Entry: `progressions/ProgressionsModule.tsx` → `ProgressionChordPicker` →
  `shared/DiatonicChordStrip` → `ChordCard`; `shared/ChromaticChordPicker`;
  `ProgressionTimeline`; `PlaybackControls`; `PresetList`;
  `ProgressionAnalysis`; plus `BeatTimeline` + `ProgressionChordStrip`.
- Task: build, save/load, play, and analyze a custom progression.
- Files: `progressions/ProgressionsModule.tsx`,
  `ProgressionChordPicker.tsx`, `ProgressionTimeline.tsx`,
  `PlaybackControls.tsx`, `PresetList.tsx`, `ProgressionAnalysis.tsx`,
  `SaveProgressionDialog.tsx`, `shared/DiatonicChordStrip.tsx`,
  `shared/ChromaticChordPicker.tsx`.
- Surface-specific evidence: `SaveProgressionDialog` already uses
  `rounded-button` (radius exemplar for the whole app).

### 5. Scales — STATUS: pending

- Entry: `scales/ScalesModule.tsx` → `ScaleSelector`, `ScaleInfo`,
  `ScaleComparison`.
- Task: pick a scale, compare two scales side by side; highlights drive
  the instruments panel.
- Files: `scales/ScalesModule.tsx`, `ScaleSelector.tsx`, `ScaleInfo.tsx`,
  `ScaleComparison.tsx`.
- Surface-specific evidence: three-color system `--color-scale-a/b/shared`
  documented in CLAUDE.md and implemented via `domain/scaleHighlights`.

### 6. Quiz — STATUS: pending

- Entry: `quiz/QuizModule.tsx` → `QuizModeView` (driven by
  `quiz/quizModes.ts` config) → `QuizCard` → `QuizOptions`; `ScoreBoard`.
- Task: answer randomized exercises across four modes.
- Files: `quiz/QuizModule.tsx`, `QuizModeView.tsx`, `quizModes.ts`,
  `QuizCard.tsx`, `QuizOptions.tsx`, `ScoreBoard.tsx`.
- Surface-specific evidence: `constants/quizData.ts` labels/tips;
  quiz modes are config-driven since `dfad6d9`.

### 7. Transcription — STATUS: audited, radius plan executed

- Entry: `transcription/TranscriptionModule.tsx` → `GpImportPanel`,
  `TranscriptionReviewWorkspace`, `SectionTimeline`,
  `TranscriptionChordPicker` → shared strips, `SongPlaybackControls` →
  `shared/SpeedControl`, `SaveSongButton`, `SongList`, `HearKeyButton`;
  plus `BeatTimeline` + `ProgressionChordStrip`.
- Task: import a `.gp` file or build a transcription manually; review
  unsure chords; play sections.
- Files: all under `transcription/` except dead `SectionTabs.tsx` and
  `SongMetadataBar.tsx` (excluded — no longer imported).
- Surface-specific evidence: issue #14 settled the import panel shape
  (split layout, preview right, collapsed by default); radius plan
  executed at `f4f59f5`. Re-audits should look beyond radius.

### 8. Structure — STATUS: pending

- Entry: `structure/StructureModule.tsx` → `StructureMetadataBar`,
  `StructureRecorder`, `StructureSections` → `DraggableBar` → `BeatDots`,
  `BarEditorPopover`, `ColorPicker`, `SaveStructureButton`,
  `StructureList`.
- Task: record a song's bar-level arrangement in real time; organize bars
  into sections with drag-and-drop.
- Files: all under `structure/`.
- Surface-specific evidence: `domain/structureDocument` owns the pure
  rules; `utils/structureLayout.ts` owns beat-dot/color layout;
  PDF export seam (`utils/exportStructurePdf.ts`).

## Attack plan (proposed order)

1. Chrome — findings already reported; convert the surviving finding into
   a plan when a round of planning starts.
2. Harmonic field (3) — most central task, highest shared-component reach
   (`ChordCard`, `Badge`, `TeacherTip`).
3. Progressions (4) — builder task, shares `ChordCard` + strips.
4. Instruments (2) — shared visual panel, token-heavy highlighting.
5. Scales (5), 6. Quiz (6), 7. Structure (8) — remaining modules.
8. Transcription (7) — re-audit only for non-radius candidates.

Aggregation: after each round, append the surviving findings table (with
the required contract/runtime/correction evidence) to a new
`design-plans/ui-audit-findings.md`, deduplicating across surfaces by root
cause. Once all rounds are done, produce one `design-plans/ui-attack-plan.md`
with the selected changes prioritized; each selected change then gets its
own plan file under `design-plans/`.
