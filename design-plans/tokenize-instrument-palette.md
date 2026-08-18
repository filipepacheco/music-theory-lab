# Tokenize the instrument palette (findings I1 + I2)

Written against: `f4f59f5` (branch `main`)

## Evidence chain

- Surface: the instruments panel (`src/App.tsx` section-panel) —
  `Piano` → `PianoKey` and `BassNeck` → `BassFret` → `NoteIndicator`.
- Problem: unique raw literals that govern instrument appearance bypass
  the documented token rule. I1: `BassFret.tsx` lines 17–29 define
  `OCTAVE_COLORS` (rgba(251,191,36,0.75) / rgba(94,234,212,0.75) /
  rgba(147,197,253,0.75)), `DIMMED_OCTAVE_COLORS` (same hues at 0.25),
  and `BASS_HIGHLIGHT_COLOR = "#34d399"`; line 75 also falls back to
  `rgba(255,255,255,0.3)`. I2: `PianoKey.tsx` line 32 hardcodes
  `border-[#3a3a52]` and `shadow-[0_2px_4px_rgba(0,0,0,0.4)]`.
- Design evidence: CLAUDE.md → Design Tokens ("All colors, shadows,
  radii, and fonts are defined as CSS variables inside `@theme {}`");
  AGENTS.md → Coding Style (tokens in `@theme`).
- Owner: the `@theme` block in `src/styles/globals.css`. Exemplar for the
  pattern: the existing `--color-key-white`/`--color-key-black`/
  `--color-fret-bg` instrument tokens in the same block, already consumed
  by `PianoKey`/`BassFret`.
- Scope and affected surfaces: `src/styles/globals.css`,
  `src/components/instruments/BassFret.tsx`,
  `src/components/instruments/PianoKey.tsx`.
- Uncertainty: none — the correction moves the exact current values into
  tokens; rendering is pixel-identical by construction.

## Design decision

Declare the exact values the instruments already use as `@theme` tokens
and reference those tokens from the components. No value changes; only
the values' home moves into the token system, which the documented rule
requires. Token names below are fixed by this plan.

## Reuse

- Existing instrument tokens as naming precedent: `--color-key-white`,
  `--color-key-black`, `--color-fret-bg`, `--color-fret-border`,
  `--color-string` (all in `@theme`).
- New tokens (exact values from the cited code):
  - `--color-octave-1: rgba(251, 191, 36, 0.75)`
  - `--color-octave-2: rgba(94, 234, 212, 0.75)`
  - `--color-octave-3: rgba(147, 197, 253, 0.75)`
  - `--color-octave-1-dim: rgba(251, 191, 36, 0.25)`
  - `--color-octave-2-dim: rgba(94, 234, 212, 0.25)`
  - `--color-octave-3-dim: rgba(147, 197, 253, 0.25)`
  - `--color-octave-fallback: rgba(255, 255, 255, 0.3)`
  - `--color-bass-highlight: #34d399`
  - `--color-key-black-border: #3a3a52`
  - `--shadow-key: 0 2px 4px rgba(0, 0, 0, 0.4)`
- Why new tokens: the existing system has no tokens for these values
  (verified against the `@theme` block), and the values are unique to the
  instruments surface — no consolidation decision is involved.

## Changes

1. `src/styles/globals.css` — in the `@theme` block, next to the existing
   instrument tokens (the `--color-key-*`/`--color-fret-*` group):
   - Add the ten tokens above with the exact values.
   - Preserve: every existing token, both theme blocks (dark/light),
     and all CSS below `@theme`.
   - Verify: `npm run build` emits `bg-octave-*`, `border-key-black-border`,
     and `shadow-key` utilities (or `var()` works in the style lookups
     below regardless of utility generation).

2. `src/components/instruments/BassFret.tsx`
   - Change: replace the raw values in the two `Record<number, string>`
     constants with `var()` references — `1: "var(--color-octave-1)"` etc.
     (and `-dim` variants); replace `BASS_HIGHLIGHT_COLOR`'s value with
     `"var(--color-bass-highlight)"`; replace the fallback literal at line
     75 with `"var(--color-octave-fallback)"`.
   - Preserve: the dynamic octave lookup shape (the Records stay — they
     map the runtime octave to a var reference), `NoteIndicator`'s `color`
     prop contract, and all rendering behavior.
   - Verify: bass fretboard renders identically with and without
     highlights, in both themes.

3. `src/components/instruments/PianoKey.tsx`
   - Change: on the black-key button (line 32), replace
     `border-[#3a3a52]` with `border-key-black-border` and
     `shadow-[0_2px_4px_rgba(0,0,0,0.4)]` with `shadow-key`.
   - Preserve: the white-key button (already token-compliant:
     `border-border-default`), pressed/highlighted background logic, and
     the `rounded-b-md` corner radius (no token — out of scope).
   - Verify: black keys look identical (border and drop shadow) in both
     themes, pressed and unpressed.

## Scope

- Inherit: `NoteIndicator` inherits nothing new — it already receives a
  color string; the string is now a `var()`.
- Verify: nothing else reads `OCTAVE_COLORS`/`DIMMED_OCTAVE_COLORS`/
  `BASS_HIGHLIGHT_COLOR` (grep before editing — they are module-local).
- Exclude: the radius rule (separate plan), `rounded-b-md`, `rounded-md`,
  `bg-white/[0.03]` octave-start overlay, and any behavior changes.

## Validation

- Product: instruments panel looks identical; highlighting and octave
  dimming behave as before in dark and light themes.
- Interface: open the instruments panel in any module; press keyboard
  keys; toggle "Todas as notas" on the bass.
- System: the raw literals appear only inside `@theme` after the change
  (grep the two component files to confirm).
- Repository: `npm run build` → success; `npm test` → all tests pass;
  `git diff` shows only the token additions and the var/class references.

## Stop conditions

- Stop if any cited literal's current value differs from what is recorded
  here (the pixel-identical premise breaks — re-derive from source).
- Stop if `BassFret`/`PianoKey` were refactored in the meantime; re-trace
  the affected lines instead of applying blindly.

## Design documentation

- After acceptance: append one line to CLAUDE.md → Design Tokens noting
  the instrument tokens (`--color-octave-*`, `--color-bass-highlight`,
  `--color-key-black-border`, `--shadow-key`) so future audits know they
  exist and are intentional.
