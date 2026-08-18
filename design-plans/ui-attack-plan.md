# UI attack plan

Written against: `f4f59f5` (branch `main`). Sources: `ui-audit-findings.md`
(all eight surface rounds, gate-verified) and `ui-surfaces.md` (registry).

## Surviving findings

| ID | Finding | Confidence | Reach |
| --- | --- | --- | --- |
| R | Stock radius classes bypass the `@theme` radius tokens on every remaining surface (chrome, harmonic field, progressions, scales, quiz, structure + traced shared files) | High | app-wide |
| I1 | `BassFret` octave palette + highlight are raw rgba/hex literals instead of `@theme` tokens | High | instruments |
| I2 | `PianoKey` black-key border + drop shadow are hardcoded, not `@theme` tokens | High | instruments |

## Proposed attack order

### 1. Radius conformance (R) — do first

- Why first: one root cause, highest reach, zero visual risk (value-for-value
  swaps: `rounded-lg` → `rounded-button` 0.5rem, `rounded-xl` → `rounded-card`
  0.75rem, `rounded-2xl` → `rounded-section` 1rem), and the execution pattern
  is already proven — the transcription surface was fixed the same way in
  `f4f59f5` (`design-plans/adopt-theme-radius-tokens-transcription.md`).
- Full per-file inventory lives in `ui-audit-findings.md` ("App-wide radius
  rule — verified inventory"). Dead files (`SectionTabs`,
  `SongMetadataBar`) and no-token values (`rounded-md`, `rounded-sm`, bare
  `rounded`, `rounded-full`, arbitrary values, corner variants) are excluded.
- **Execution plan written:** `design-plans/adopt-theme-radius-tokens-app-wide.md`
  (27 files, exact classes per file, preserve lists, validation, stop conditions).

### 2. Instruments tokenization (I1 + I2) — second

- Why second: single surface, small and contained, but it introduces new
  tokens, so it deserves its own review before wider adoption.
- Change: add to `@theme` in `src/styles/globals.css` the exact current
  values — `--color-octave-*` (bass octave fill/dimmed rgba pairs) and
  `--color-bass-highlight` (`#34d399`); `--color-key-black-border`
  (`#3a3a52`) and `--shadow-key` (`0 2px 4px rgba(0,0,0,0.4)`). Consume the
  generated utilities in `BassFret.tsx` / `PianoKey.tsx`. Pixel-identical by
  construction; token naming is the only new decision.
- **Execution plan written:** `design-plans/tokenize-instrument-palette.md`
  (ten tokens with exact values, both component changes, validation, stop
  conditions, and a CLAUDE.md documentation note for after acceptance).

## Execution-plan template (shared for both changes)

Each plan file must contain: evidence chain (contract + runtime +
correction, per `ui-audit-findings.md`), exact file/class inventory, the
"preserve" list, validation (`npm run build`, `npm test`, grep-confirm no
mappable stock radius classes remain outside the excluded list, visual
parity check), and stop conditions (token values changed upstream; a file
was re-scoped or deleted).

## Out of scope (falsified at the gate — do not re-report in future rounds)

- Stock semantic colors (emerald/sky/amber/red statuses, `bg-red-500`
  playback, `#0f1219` chip text): no semantic tokens exist; consolidation
  is ambiguous. Needs a design decision (new semantic token set) before it
  can become a finding.
- Unaccented pt-BR copy: consistent app-wide convention (CLAUDE.md itself
  is unaccented); mixed accents across surfaces have no determined
  normalization direction. Needs a documentation-level decision.
- `rounded-md`/`rounded-sm`/bare/arbitrary/corner radii: no tokens; adding
  them is a new design decision.
- Function/glow rgba literals (`BeatTimeline`, `ChordCard`): same
  ambiguity as the semantic colors.
- Usability/label-state candidates: need rendered or user evidence.

## Validation of this plan

- `ui-audit-findings.md` contains all eight rounds with rejected-candidate
  reasons; `ui-surfaces.md` defines the surfaces for any future re-audit.
