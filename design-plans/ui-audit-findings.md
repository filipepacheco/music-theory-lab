# UI audit findings (aggregate)

Written against: `f4f59f5` (branch `main`). Companion to
`design-plans/ui-surfaces.md` (surface registry) — one round of
`/improve-ui` per surface, aggregated here by root cause.

## Completed rounds

### App chrome — audited

Surviving finding (already reported to the user; plan pending):

| # | Problem | Evidence | Proposed change | Scope | Confidence |
| --- | --- | --- | --- | --- | --- |
| C1 | Chrome hard-codes stock Tailwind radius classes, bypassing the documented "all radii are `@theme` tokens" rule | CLAUDE.md Design Tokens + AGENTS.md; `rounded-lg` (0.5rem = `--radius-button`) in `Header` (logo badge, theme toggle), `ModuleNav` (nav pill + tabs), `BottomNav` (menu items), `KeySelector` (mobile select wrapper, mode toggle), `MetronomeControl` (×3); `rounded-xl` (0.75rem = `--radius-card`) in `BottomNav` more-menu panel | Replace `rounded-lg` → `rounded-button`, `rounded-xl` → `rounded-card` in the five chrome files (value-identical). Leave `rounded-md` (selects), bare `rounded`, `rounded-sm`, `rounded-full`, arbitrary values — no token matches | `layout/Header.tsx`, `layout/ModuleNav.tsx`, `layout/BottomNav.tsx`, `layout/KeySelector.tsx`, `shared/MetronomeControl.tsx` | High |

Rejected candidates (chrome): `rounded-md` selects (no 6px token — correction invents a decision); `bg-emerald-400` BPM dot (no semantic status token; remapping to `--color-subdominant` invents meaning); `bg-black/40` scrim (no token); desktop vs mobile nav labels ("Campo Harmonico" vs "Campo" — deliberate abbreviations, correction ambiguous).

### Transcription — audited (re-audit)

- Radius conformance: already executed at `f4f59f5` (plan
  `design-plans/adopt-theme-radius-tokens-transcription.md`).
- Re-audit for non-radius candidates: **No supported findings.**
  Rejected: destructive reds (`red-300/400/500` — no @theme destructive
  token exists, correction invents one); the amber-vs-yellow "unsure"
  split (`bg-yellow-400/80` indicator in `SectionTimeline` vs amber-*
  everywhere else — two defensible winners, no documented rule);
  `GpImportPanel` summary colors (emerald/sky/amber — no semantic
  tokens); dead `SectionTabs.tsx`/`SongMetadataBar.tsx` excluded.

## App-wide radius rule — verified inventory (C1 extension)

Same contract/runtime/correction as C1, verified by direct grep across all
surfaces (`rounded-lg` 0.5rem → `rounded-button`, `rounded-xl` 0.75rem →
`rounded-card`, `rounded-2xl` 1rem → `rounded-section`; value-identical).
Files with token-mappable classes outside the already-fixed transcription
surface:

- Chrome (C1): `Header`, `ModuleNav`, `BottomNav`, `KeySelector`, `MetronomeControl`
- Harmonic field: `ProgressionExamples.tsx` (`sm:rounded-xl`)
- Progressions: `PlaybackControls.tsx`, `ProgressionAnalysis.tsx`, `PresetList.tsx` (×3), `ProgressionTimeline.tsx` (×2), `SaveProgressionDialog.tsx` (×3 — note it already uses `rounded-button` on two buttons: exemplar, not defect)
- Scales: `ScaleInfo.tsx`, `ScaleComparison.tsx`
- Quiz: `QuizCard.tsx` (×2), `QuizModeView.tsx`, `QuizOptions.tsx`, `QuizModule.tsx`
- Structure: `DraggableBar.tsx` (×2), `ColorPicker.tsx`, `StructureMetadataBar.tsx` (×3), `StructureSections.tsx` (×2), `StructureList.tsx`, `StructureRecorder.tsx` (×2), `StructureModule.tsx` (×3), `SaveStructureButton.tsx`, `BarEditorPopover.tsx` (`rounded-xl`)
- Shared, surface-traced: `TeacherTip.tsx` (`sm:rounded-lg`)

No-token values (excluded from the correction, recorded so no later audit
re-reports them): `rounded-md` (0.375rem — selects, `BassNeck`, quiz mode
buttons, `ScaleSelector`, `StructureRecorder`, `BarEditorPopover`,
`ProgressionChordStrip`), `rounded-sm` (`ScaleComparison` bars, `Badge`),
bare `rounded`, `rounded-full`, `rounded-[10px]`/`rounded-[3px]`.

## Audited module rounds (radius folded into the app-wide inventory above)

- **Quiz** — audited. Only survivor: radius rule (verified: `QuizModule.tsx:29`, `QuizModeView.tsx:68`, `QuizCard.tsx:62,86`, `QuizOptions.tsx:43`). Rejected: success/error colors (no `@theme` token — correction invents one); arbitrary accent glow shadows (no token, multiple corrections); unaccented pt-BR (consistent surface-wide style, not a contradiction).
- **Progressions** — audited. Only survivor: radius rule (verified: `SaveProgressionDialog.tsx:78,91,102`, `ProgressionTimeline.tsx:18,72`, `ProgressionAnalysis.tsx:91`, `PlaybackControls.tsx:26`, `PresetList.tsx:47,77,123`). Rejected: hardcoded `#0f1219` chip text (deliberate — a `--color-bg-primary` swap breaks light theme); red/white + arbitrary glow shadows (no token); unaccented pt-BR (consistent, deliberate).
- **Harmonic field** — audited. Only survivor: radius rule, verified at `ProgressionExamples.tsx` (`sm:rounded-xl` → `sm:rounded-card`) and `shared/TeacherTip.tsx` (`sm:rounded-lg` → `sm:rounded-button`; TeacherTip is surface-traced via `HarmonicFieldModule`). Rejected: hardcoded rgba function/glow fills in `BeatTimeline` (no 15%/45% alpha tokens — correction invents one); duplicated `FUNCTION_BORDER_COLORS`/`FUNCTION_LABELS` maps (repetition, not a contract); unaccented pt-BR (deliberate app-wide convention); `text-white` on `bg-accent` (no on-accent token).

- **Scales** — verification complete (agent report pending). Survivors: radius rule at `ScaleInfo.tsx:142` and `ScaleComparison.tsx:50` (`rounded-lg` → `rounded-button`). Rejected: `rounded-md` selects/play button (no 6px token); hardcoded `#0f1219` chip text in `ScaleInfo`/`ScaleComparison` (deliberate dark-on-color chips — a token swap breaks light theme; same verdict as progressions).

- **Instruments** — audited. Two surviving findings (non-radius):
  - I1: `BassFret.tsx` octave palette + highlight are raw literals (`OCTAVE_COLORS`/`DIMMED_OCTAVE_COLORS` rgba maps, `BASS_HIGHLIGHT_COLOR = "#34d399"`), bypassing the "all colors in @theme" rule. Correction: define the exact values as tokens (`--color-octave-*`, `--color-bass-highlight`) and consume them. High confidence.
  - I2: `PianoKey.tsx` black-key border `border-[#3a3a52]` and drop shadow `shadow-[0_2px_4px_rgba(0,0,0,0.4)]` are hardcoded, not @theme. Correction: `--color-key-black-border` and `--shadow-key` tokens with the exact values. High confidence.
  - Rejected: `rounded-md` (`BassNeck` toggle — no token); `rounded-b-md` corner variant; `bg-white/[0.03]` octave overlay (subtle, correction ambiguous); bass emerald highlight vs function colors (no contract; inventing intent); toggle label showing state (interaction, out of scope).
  - Distinction from the rejected stock-class cases elsewhere: these are unique concrete literals with clear per-octave/structural semantics — tokenization is deterministic and preserves pixels exactly; consolidating reused stock classes across surfaces was the ambiguous case.

- **Scales** — audited. Only survivor: radius rule at `ScaleInfo.tsx:142` and `ScaleComparison.tsx:50` (`rounded-lg` → `rounded-button`). Rejected: `rounded-md` selects/play button and `rounded-sm` bars (no token); hardcoded `#0f1219` chip text (deliberate dark-on-color chips; a token swap breaks light theme); the "Comparacao" diacritics candidate — the scales surface is internally consistent ASCII, and the app's mixed accented/ASCII pt-BR is cross-surface drift whose normalization direction the evidence does not determine (same verdict as quiz/structure).

## All rounds complete — surviving findings (deduplicated)

1. **R — App-wide radius conformance** (High). One root cause, every surface:
   stock `rounded-lg`/`rounded-xl`/`rounded-2xl` instead of the value-identical
   `rounded-button`/`rounded-card`/`rounded-section` token utilities.
   Full per-file inventory in the "App-wide radius rule" section above.
   Transcription already fixed (`f4f59f5`).
2. **I1 — Bass fretboard palette is raw literals** (High).
   `BassFret.tsx`: `OCTAVE_COLORS`/`DIMMED_OCTAVE_COLORS` rgba maps and
   `BASS_HIGHLIGHT_COLOR = "#34d399"` bypass the "all colors in @theme" rule.
   Correction: define the exact values as `@theme` tokens
   (`--color-octave-*`, `--color-bass-highlight`) and consume them.
3. **I2 — Piano key border/shadow hardcoded** (High).
   `PianoKey.tsx`: `border-[#3a3a52]` and `shadow-[0_2px_4px_rgba(0,0,0,0.4)]`.
   Correction: `--color-key-black-border` and `--shadow-key` tokens with the
   exact values.

Everything else across all eight rounds was falsified at the gate
(no semantic status tokens exist; reused stock classes consolidate
ambiguously; unaccented pt-BR is a consistent app-wide convention; mixed
accents are cross-surface drift with no determined direction; corner
variants and no-token radii are excluded by rule).
