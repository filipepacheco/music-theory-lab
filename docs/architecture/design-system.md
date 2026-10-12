# Design system (Lighthouse, Tailwind v4)

The look is the Lighthouse design system. The decision is in `docs/adr/0001-adopt-lighthouse-design-system.md`.

## Tokens

- Colours, shadows, radii, and fonts are CSS variables in the `@theme {}` block of `src/styles/globals.css`. The repo has no `tailwind.config` file.
- Tailwind v4 makes a utility class from each `@theme` variable: `--color-bg-card` gives `bg-bg-card`, `--color-text-primary` gives `text-text-primary`.
- To add a token, add it in the `@theme {}` block.
- The primitives are declared on `:root` (night) and `:root.light` (day): `--sea-950/900/800`, `--rule`, `--rule-strong`, `--fog`, `--fog-bright`, `--fog-dim`, `--beam`, `--buoy`, `--flare`, `--wreck`, `--sky`, `--heather`.
- Each `@theme` token is an alias of a primitive. A component uses the alias: never a primitive, a hex value, or a Tailwind palette class (`text-red-400`).

## Look rules

| Topic | Rule |
|---|---|
| Type | All text is JetBrains Mono. `font-heading`, `font-body`, and `font-mono` are the same stack. Weights 400 and 600 only. |
| Type scale | `text-title`, `text-heading`, `text-ui`, `text-label`, `text-meta`, `text-prose`. For dense data (grids, bar cells): `text-small` (11px) and `text-micro` (10px, the floor). Never an arbitrary size (`text-[10px]`). |
| Corners | Square. The radius scale is 0. `rounded-full` is only for dots and pips. |
| Shadows | Hard (`shadow-lift`, `shadow-window`), never blurred. |
| Selected or primary control | `bg-accent text-on-accent`. |
| Live state | `--color-live` (the amber `--beam`) marks only a live state: playing, recording, the current beat. |
| Focus | One global `:focus-visible` outline in `globals.css`. Never add `focus:outline-none` or a focus ring class. |
| Tint | Never tint with a translucent accent (`bg-accent/15`). |

Hover rules:

| Element | Hover |
|---|---|
| Control | Inverts: `hover:bg-accent hover:text-on-accent`. |
| Row or cell in a list or grid | Quiet ground: `hover:bg-bg-tertiary`. |
| Card | Lifts: `hover:border-accent hover:shadow-lift`. |
| Destructive control | `hover:bg-danger hover:text-on-accent`. |

## Components

The Lighthouse components are the `lh-*` classes in `src/styles/lighthouse.css`. They load into the Tailwind `components` layer, so a utility on the same element wins. Use them through the wrappers in `src/components/shared/`:

| Wrapper | Use |
|---|---|
| `Frame` | A box with its title in the top border. Each module sits in one, with `titleAs="h2"`. |
| `Button` | `[ label ]`. `variant="primary"` for the one filled action. |
| `Tag` | `<WORD>`. |
| `Field` | A text input with an optional prompt glyph. |
| `Select` | A native select. |
| `Segmented` | One choice of a few. |
| `Callout` | A note with a glyph in its gutter. |

- A floating window uses the `lh-dialog` classes. A row of tabs uses `lh-tabs` and `lh-tab`.
- The open tab or the chosen option is inverted (`aria-current`, `aria-pressed`).
- The pointer gives a tab a quiet `--sea-800` ground, and inverts a button.
- A control whose thing runs now takes `live` (lamp colour).
- Only the components with a consumer are ported. Port one more from the Lighthouse source when it is necessary.
- `shared/` also holds `ConfirmHost`, `Badge`, `MetronomeControl`, `SpeedControl`, and `TeacherTip`.

## Confirmations

Never call `window.confirm`. Use `await confirmDialog({ title, message?, confirmLabel?, danger? })` from `@/services/confirm`. It resolves to a boolean. `ConfirmHost` (mounted one time in `App.tsx`) draws it as a native `<dialog class="lh-dialog">`. Pass `danger: true` for a destructive action.

## Motion

Framer Motion is only for an enter or exit animation that shows a state change (a panel that opens, a list item that leaves). No hover or tap feedback, no staggered entrances, no spring bounces.
