# Adopt the @theme radius tokens across the transcription surface

Written against: `f03bc64` (branch `pr-18`, repo music-theory-lab)

## Evidence chain

- Surface: the transcription module path — `TranscriptionModule` and its rendered children: `GpImportPanel`, `TranscriptionReviewWorkspace`, `SectionTimeline`, `TranscriptionChordPicker` → `DiatonicChordStrip` / `ChromaticChordPicker` / `ChordCard`, `SongPlaybackControls` → `SpeedControl`, `SaveSongButton`, `SongList`, `HearKeyButton`.
- Problem: every rendered file on the path hard-codes stock Tailwind radius classes instead of the repo's radius tokens. The values happen to equal the three tokens exactly: `rounded-lg` = 0.5rem = `--radius-button`, `rounded-xl` = 0.75rem = `--radius-card`, `rounded-2xl` = 1rem = `--radius-section`.
- Design evidence:
  - CLAUDE.md → Design Tokens: "All colors, shadows, radii, and fonts are defined as CSS variables inside `@theme {}`".
  - AGENTS.md → Coding Style: "add design tokens in `src/styles/globals.css` (`@theme`)".
  - `src/styles/globals.css` `@theme` block defines exactly three radii: `--radius-button: 0.5rem` (line 78), `--radius-card: 0.75rem` (line 76), `--radius-section: 1rem` (line 77). Tailwind v4 generates the utilities `rounded-button`, `rounded-card`, `rounded-section` from them.
- Owner: the `@theme` radius tokens; existing consumer exemplar: `src/components/progressions/SaveProgressionDialog.tsx` (lines 108 and 115 use `rounded-button`).
- Scope and affected surfaces: the 9 rendered transcription-path files listed under Changes. `ChordCard` is also rendered by the progressions surface — the swap there is pixel-identical, so both surfaces inherit with zero visual delta.
- Uncertainty: none. The mapping is value-for-value; the change must not alter a single pixel.

## Design decision

Replace the three stock classes with their exact-value token utilities on the transcription path: `rounded-lg` → `rounded-button`, `rounded-xl` → `rounded-card`, `rounded-2xl` → `rounded-section`. This makes the surface conform to the documented token rule with zero visual change. Bare `rounded` (0.25rem) and arbitrary values (`rounded-[3px]`, `rounded-[10px]`) have no token counterpart — leave them untouched; no new token is introduced because none is needed.

## Reuse

- Tokens: `rounded-button` (0.5rem), `rounded-card` (0.75rem), `rounded-section` (1rem), all from `@theme` in `src/styles/globals.css`.
- Exemplar: `src/components/progressions/SaveProgressionDialog.tsx` — `rounded-button` on its buttons.
- No new primitive: the existing token set expresses every radius currently in use on this surface except bare `rounded` (0.25rem), which is out of scope.

## Changes

For each file, change only the listed classes; leave every other class, including bare `rounded`, `rounded-full`, and arbitrary values, unchanged.

1. `src/components/transcription/TranscriptionModule.tsx`
   - Change: `rounded-lg` (artist input, key chip) → `rounded-button`; `rounded-2xl` (chord-picker accordion wrapper, practice box) → `rounded-section`.
   - Preserve: all layout, text, and conditional rendering.
   - Verify: both wrappers and inputs render with identical corner radii.

2. `src/components/transcription/GpImportPanel.tsx`
   - Change: all five `rounded-lg` (panel container, file label, preview box, import button, track select) → `rounded-button`. Leave the key/mode pills' and `BarCell`'s bare `rounded` untouched.
   - Preserve: split layout, collapsed-by-default state, preview behavior.
   - Verify: panel chrome unchanged; pills unchanged.

3. `src/components/transcription/TranscriptionReviewWorkspace.tsx`
   - Change: `rounded-xl` (review card, amber guidance banner) → `rounded-card`; `rounded-2xl` (empty state, main pane, aside) → `rounded-section`; `rounded-lg` (section select, "Manter incerto"/"Confirmar", nav buttons) → `rounded-button`.
   - Preserve: confident/unsure styling, selection behavior.
   - Verify: cards, panes, and buttons visually identical.

4. `src/components/transcription/SectionTimeline.tsx`
   - Change: `rounded-lg` (empty state, step card) → `rounded-button`. Leave the beat stepper's bare `rounded` untouched.
   - Preserve: dashed/solid unsure border, beat controls.
   - Verify: unchanged card appearance.

5. `src/components/transcription/SongList.tsx`
   - Change: `rounded-lg` (song card) → `rounded-button`. Leave the section pill's bare `rounded` untouched.
   - Preserve: active-card accent border, hover shadow.
   - Verify: unchanged card appearance.

6. `src/components/transcription/SaveSongButton.tsx`
   - Change: `rounded-lg` (save button) → `rounded-button`.
   - Verify: unchanged button appearance.

7. `src/components/transcription/HearKeyButton.tsx`
   - Change: `rounded-lg` (button) → `rounded-button`.
   - Verify: unchanged button appearance.

8. `src/components/transcription/SongPlaybackControls.tsx`
   - Change: both `rounded-lg` (play button, loop toggle) → `rounded-button`.
   - Preserve: playing-state colors and labels.
   - Verify: unchanged controls.

9. `src/components/harmonicField/ChordCard.tsx`
   - Change: the responsive pair `rounded-xl sm:rounded-lg` (card) → `rounded-card sm:rounded-button`. Leave `rounded-[3px] sm:rounded` (note-name chip) untouched.
   - Preserve: shared usage with the progressions surface.
   - Verify: pixel-identical cards in both the transcription picker and the progressions picker.

## Scope

- Inherit: the progressions surface inherits the `ChordCard` change automatically (value-identical).
- Verify: harmonic-field chord grid also renders `ChordCard`; no other file needs checking.
- Exclude: dead files `src/components/transcription/SectionTabs.tsx` and `src/components/transcription/SongMetadataBar.tsx` (no longer imported by the module) — do not touch them. Also exclude `shared/TeacherTip.tsx` (not on this path), all other modules, bare `rounded`, `rounded-full`, and every arbitrary-value radius class.

## Validation

- Product: no visible change anywhere — this is conformance-only.
- Interface: transcription module at desktop and mobile widths; panel open (preview with many bars) and collapsed; an unsure-chord review state; progressions module chord grid.
- System: `rounded-button`, `rounded-card`, and `rounded-section` now appear in the transcription path; the only remaining non-token radii on the path are bare `rounded` (0.25rem) and `rounded-full`/arbitrary structural values — both deliberate exclusions.
- Repository: `npm run build` → success; `npm test` → all tests pass; `npx prettier --check` on the 9 changed files → clean (or run `npx prettier --write` on them and keep the diff class-only).

## Stop conditions

- Stop if a token value in `@theme` differs from the stock value assumed here (0.5/0.75/1rem) — the pixel-identical premise would break.
- Stop if `SectionTabs`/`SongMetadataBar` are re-mounted by the module before this plan runs; re-scope to include them or exclude them explicitly.

## Design documentation

- None. The tokens already exist and are documented in `globals.css`; this plan only makes one surface consume them. No new design decision is recorded.
