# CLAUDE.md

Music Theory Lab: an interactive app to learn music theory, in Portuguese (pt-BR). Real audio with Tone.js, a piano and a bass fretboard, harmonic field analysis, a progression builder, scale comparison, song transcription, a song structure recorder, and the Biblioteca of bass charts.

## Rules for this file

- Hard cap: 2,500 words. Check with `wc -w CLAUDE.md` before you finish.
- Add a fact only if an agent cannot get it from the code in one minute.
- Prefer to change an existing line over adding a paragraph.
- Detail longer than one paragraph goes to `docs/architecture/<topic>.md`, with a row in the deep-dive table.
- Rationale and history go in the PR body and `CHANGELOG.md`.

## Git workflow override

The user's global "never commit, never push" rule is waived for **this repo only** (2026-08-06): local commits are allowed, on side branches too.

When a task is finished on its feature branch, push that branch and open the pull request without asking first (2026-10-02). A merge to `main` waits for the user.

## Commands

```bash
npm run dev      # Vite dev server with HMR
npm run build    # tsc + vite build (type-checks, then bundles)
npm test         # Vitest unit tests (pure domain behaviour), about 7 s
npx tsc --noEmit                 # fast type check, about 10 s
npx vitest related <files>       # tests of the code you touched
npx vitest run <dir>
npx prettier --write <files>     # single quotes, 80 chars, 2 spaces
```

- No linter is configured.
- Run `npm install` after a clone: `postinstall` copies `sql-wasm.wasm` to `public/`.
- The Growlybass asset test skips where `ffprobe` is missing. CI runs it in its own workflow (`.github/workflows/bass-assets.yml`), only when the assets, their manifest, the generated contract, or the script change.

## Architecture

React 19, TypeScript strict, Vite 5, Tailwind CSS v4, Zustand, Tone.js, sql.js in IndexedDB, Framer Motion, @dnd-kit. Vercel API routes in `api/` sync to Turso.

| Folder of `src/` | Holds |
|---|---|
| `constants/` | Music theory data: scales, chords, harmonic fields, progressions, tone presets. |
| `domain/` | Pure application rules: documents, quiz sessions, playback schedules, sync merges, bass charts and their analysis. |
| `utils/` | Pure functions. |
| `hooks/` | UI adapters and side effects. |
| `services/` | Infrastructure: playback engine, database, saved library, sync, file imports. |
| `store/` | One Zustand store, `useAppStore.ts`. |
| `components/<module>/` | One folder for each module, plus `layout/`, `instruments/`, `shared/`. |

`activeModule` in the store selects the module, and `App.tsx` renders it. A change of module, root note, or mode clears the highlights and the scale selections.

## Deep dives

Open the doc **before** you edit anything in its trigger column:

| Read | Before you touch |
|---|---|
| `docs/architecture/audio.md` | `playbackEngine.ts`, `useSynth`, `useMetronome`, tone presets, `ProgressionExamples`, any Tone.js callback |
| `docs/architecture/persistence-and-sync.md` | `db.ts`, `savedLibrary.ts`, `sync.ts`, `useCollection`, any file in `api/`, the `TURSO_*` env vars |
| `docs/architecture/song-documents.md` | Progression steps, the chromatic chord picker, `transcription/`, `gp*.ts`, `structure/`, `structureDocument.ts`, the quiz files |
| `docs/architecture/bass-charts.md` | `components/library/`, `services/rocksmith/`, `services/midi/`, `bassSynthTransport.ts`, `domain/bass*.ts`, `midiBassChart.ts`, `circleOfFifths.ts` |
| `docs/library-imports.md` | The Guitar Pro import of the Biblioteca, transposition, chart persistence |
| `docs/architecture/design-system.md` | Any component markup or class, `globals.css`, `lighthouse.css`, `components/shared/`, a confirmation, an animation |
| `docs/architecture/highlights-and-theme.md` | `instruments/`, `highlight*` store fields, bass voicing, scale comparison colours, piano key colours, the theme |
| `CONTEXT.md`, `docs/adr/` | Any domain term or decision. See `docs/agents/domain.md`. |

## Invariants that are easy to break

- **Notes are integers 0-11** (C=0, C#=1, ..., B=11). All theory logic uses these indices with modulo 12.
- **Imports use the `@/` alias** for `src/`. Use `@/` in each import, not a relative path.
- **Domain code is pure.** `domain/` files hold the rules; the store and the hooks are thin adapters.
- **Audio callbacks do not set React state.** Schedule each UI update with `Tone.getDraw().schedule()`.
- **Cached samplers stay alive.** They are global and loaded at module init. Never dispose one.
- **`Tone.start()` needs a user gesture.** Call `ensureAudio()` before playback.
- **Database access goes through `savedLibrary.ts`.** Hooks and the store do not import `db.ts`.
- **Songs and structures are shared by all devices with no authentication.** Progressions are scoped by `device_id`. Keep the pulls of songs and structures unscoped.
- **Sync pushes are fire-and-forget.** A sync error must never block the UI.
- **Progression limits:** at most 64 steps; `beats` from 0.5 to 8 in steps of 0.5. A step with `degree: null` is chromatic and gives its notes in `intervals`.
- **Tailwind v4 has no config file.** Tokens are CSS variables in the `@theme {}` block of `src/styles/globals.css`; add a token there.
- **Components use `@theme` aliases only** (`bg-bg-card`, `text-text-primary`). Never a Lighthouse primitive (`--sea-900`), a hex value, a Tailwind palette class (`text-red-400`), an arbitrary size (`text-[10px]`), or a translucent accent (`bg-accent/15`).
- **Lighthouse look:** square corners, hard shadows, JetBrains Mono in weights 400 and 600. Use the wrappers of `src/components/shared/` (`Frame`, `Button`, `Tag`, `Field`, `Select`, `Segmented`, `Callout`).
- **Focus is one global `:focus-visible` outline.** Never add `focus:outline-none` or a focus ring class.
- **Never call `window.confirm`.** Use `await confirmDialog(...)` from `@/services/confirm`.
- **The theme class `light` goes on `<html>`**, because the `@theme` aliases resolve on `:root`.

## Conventions

- All user-facing text is in Portuguese (pt-BR).
- Zustand selectors: `useAppStore((s) => s.fieldName)`.
- `React.memo` on performance-critical components (`PianoKey`, `BassFret`).
- Framer Motion only for an enter or exit animation that shows a state change. No hover or tap feedback, staggered entrances, or spring bounces.
- `noUnusedLocals` and `noUnusedParameters` are on.

## Agent skills

- **Issue tracker:** GitHub Issues (filipepacheco/music-theory-lab), with the `gh` CLI. See `docs/agents/issue-tracker.md`.
- **Triage labels:** needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix. See `docs/agents/triage-labels.md`.
- **Domain docs:** single-context: `CONTEXT.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
