# Adopt the @theme radius tokens across the whole app (finding R)

Written against: `f4f59f5` (branch `main`)

## Evidence chain

- Surface: every remaining surface after the transcription fix —
  chrome (`Header`, `ModuleNav`, `BottomNav`, `KeySelector`,
  `MetronomeControl`), harmonic field (`ProgressionExamples`,
  traced `shared/TeacherTip`), progressions, scales, quiz, structure.
- Problem: these files hard-code stock Tailwind radius classes instead of
  the repo's radius tokens, though the values are identical.
- Design evidence: CLAUDE.md → Design Tokens ("All colors, shadows,
  radii, and fonts are defined as CSS variables inside `@theme {}`");
  AGENTS.md → Coding Style ("add design tokens in
  `src/styles/globals.css` (`@theme`)"); `globals.css` `@theme` defines
  `--radius-button: 0.5rem` (line 78), `--radius-card: 0.75rem` (line 76),
  `--radius-section: 1rem` (line 77), generating the utilities
  `rounded-button` / `rounded-card` / `rounded-section`.
- Owner: the `@theme` radius tokens. Exemplars already in the repo:
  `SaveProgressionDialog.tsx` (`rounded-button`) and the executed
  transcription plan `design-plans/adopt-theme-radius-tokens-transcription.md`
  (landed at `f4f59f5`).
- Scope and affected surfaces: the exact files under Changes below.
- Uncertainty: none. Every swap is value-for-value (0.5/0.75/1rem), so the
  change must not alter a single pixel.

## Design decision

Replace each stock radius class with the token utility of the identical
value: `rounded-lg` → `rounded-button`, `rounded-xl` → `rounded-card`,
`rounded-2xl` → `rounded-section`. No new tokens are introduced and no
class with a value that has no token (`rounded-md` 0.375rem, `rounded-sm`,
bare `rounded`, `rounded-full`, arbitrary `rounded-[…]`, corner variants
like `rounded-b-md`/`rounded-l-lg`) is touched.

## Reuse

- Tokens: `rounded-button`, `rounded-card`, `rounded-section` (from
  `@theme` in `src/styles/globals.css`).
- Exemplar: `src/components/progressions/SaveProgressionDialog.tsx`
  (`rounded-button` on buttons); transcription files fixed at `f4f59f5`.

## Changes

For each file, change only the listed class occurrences; preserve every
other class and all behavior.

1. `src/components/layout/Header.tsx`
   - Change: `rounded-lg` (logo badge line 13, theme toggle line 37) →
     `rounded-button`.
2. `src/components/layout/ModuleNav.tsx`
   - Change: `rounded-lg` (nav pill line 19, tabs line 30) →
     `rounded-button`.
3. `src/components/layout/BottomNav.tsx`
   - Change: `rounded-xl` (more-menu panel line 90) → `rounded-card`;
     `rounded-lg` (menu items line 100) → `rounded-button`.
4. `src/components/layout/KeySelector.tsx`
   - Change: `rounded-lg` (mobile select wrapper line 38, mode toggle line
     56) → `rounded-button`. Leave `rounded-md` (select, line 26).
5. `src/components/shared/MetronomeControl.tsx`
   - Change: `rounded-lg` (lines 14, 43, 53) → `rounded-button`.
6. `src/components/harmonicField/ProgressionExamples.tsx`
   - Change: `sm:rounded-xl` (card line 46) → `sm:rounded-card`. Leave
     `rounded-[10px]`.
7. `src/components/shared/TeacherTip.tsx`
   - Change: `sm:rounded-lg` (line 27) → `sm:rounded-button`. Leave
     `rounded-[10px]`.
8. `src/components/progressions/PlaybackControls.tsx`
   - Change: `rounded-lg` (play button line 26) → `rounded-button`.
9. `src/components/progressions/ProgressionAnalysis.tsx`
   - Change: `rounded-lg` (analysis card line 91) → `rounded-button`.
10. `src/components/progressions/PresetList.tsx`
    - Change: `rounded-lg` (save button line 47, preset cards lines 77 and
      123) → `rounded-button`.
11. `src/components/progressions/ProgressionTimeline.tsx`
    - Change: `rounded-lg` (empty state line 18, step card line 72) →
      `rounded-button`. Leave the beat steppers' bare `rounded`.
12. `src/components/progressions/SaveProgressionDialog.tsx`
    - Change: `rounded-lg` (dialog line 78, inputs lines 91 and 102) →
      `rounded-button`. Keep the existing `rounded-button` on lines 108
      and 115 (they are the exemplar).
13. `src/components/scales/ScaleInfo.tsx`
    - Change: `rounded-lg` (info card line 142) → `rounded-button`. Leave
      `rounded-md` (play button line 72) and bare `rounded` chips.
14. `src/components/scales/ScaleComparison.tsx`
    - Change: `rounded-lg` (comparison card line 50) → `rounded-button`.
      Leave `rounded-sm` bars.
15. `src/components/quiz/QuizModule.tsx`
    - Change: `rounded-lg` (mode buttons line 29) → `rounded-button`.
16. `src/components/quiz/QuizModeView.tsx`
    - Change: `rounded-lg` (start button line 68) → `rounded-button`.
17. `src/components/quiz/QuizCard.tsx`
    - Change: `rounded-lg` (result/next buttons lines 62 and 86) →
      `rounded-button`. Leave `rounded-md` (mode chip line 37).
18. `src/components/quiz/QuizOptions.tsx`
    - Change: `rounded-lg` (answer options line 43) → `rounded-button`.
19. `src/components/structure/StructureModule.tsx`
    - Change: `rounded-lg` (inputs/buttons lines 145, 166, 262) →
      `rounded-button`. Leave `rounded-md` (lines 27-adjacent and 179 —
      no token).
20. `src/components/structure/StructureMetadataBar.tsx`
    - Change: `rounded-lg` (lines 18, 25, 37) → `rounded-button`.
21. `src/components/structure/StructureRecorder.tsx`
    - Change: `rounded-lg` (recorder group line 22, record button line 46)
      → `rounded-button`. Leave `rounded-md` (mode buttons line 27).
22. `src/components/structure/StructureSections.tsx`
    - Change: `rounded-lg` (overlay line 124, section card line 194) →
      `rounded-button`.
23. `src/components/structure/DraggableBar.tsx`
    - Change: `rounded-lg` (bar line 36, drag overlay line 101) →
      `rounded-button`.
24. `src/components/structure/ColorPicker.tsx`
    - Change: `rounded-lg` (popover line 52) → `rounded-button`.
25. `src/components/structure/SaveStructureButton.tsx`
    - Change: `rounded-lg` (save button line 53) → `rounded-button`.
26. `src/components/structure/StructureList.tsx`
    - Change: `rounded-lg` (structure card line 36) → `rounded-button`.
27. `src/components/structure/BarEditorPopover.tsx`
    - Change: `rounded-xl` (popover line 58) → `rounded-card`. Leave
      `rounded-md` (segment buttons line 72).

## Scope

- Inherit: none beyond these files (pixel-identical swaps).
- Verify: `TeacherTip` and `MetronomeControl` are shared — confirm no
  other rendering surface is affected (grep imports before editing).
- Exclude: dead files `src/components/transcription/SectionTabs.tsx` and
  `SongMetadataBar.tsx`; the already-fixed transcription files; every
  no-token radius listed in the design decision.

## Validation

- Product: no visible change anywhere — conformance-only.
- Interface: smoke-check one file per surface at desktop and mobile widths.
- System: after the change, `rounded-lg`/`rounded-xl`/`rounded-2xl` should
  no longer appear in any rendered (non-dead) component file outside the
  excluded no-token list; `rounded-button`/`rounded-card` are in use.
- Repository: `npm run build` → success; `npm test` → all tests pass;
  `git diff` shows only radius-class lines changed.

## Stop conditions

- Stop if any `@theme` radius value differs from 0.5/0.75/1rem (the
  pixel-identical premise breaks).
- Stop if a listed file no longer renders (was deleted or re-scoped) —
  re-derive the inventory instead of guessing.

## Design documentation

- None. Tokens already exist; this plan only extends their adoption.
