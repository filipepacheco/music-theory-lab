# Repository Guidelines

## Project Structure & Module Organization

- `src/` contains the React/TypeScript application. Feature UI lives in
  `src/components/<module>`; domain modules, shared state, side effects,
  persistence, types, constants, and pure helpers live in `domain/`, `store/`,
  `hooks/`, `services/`, `types/`, `constants/`, and `utils/` respectively.
- `api/` contains Vercel serverless routes for cloud sync. `public/` holds
  fonts and generated web assets. `research/` and `init-project-*/` contain
  exploratory import/chord-recognition work; keep prototypes separate from
  production code.
- Read `CONTEXT.md` for domain vocabulary and the nearest `CLAUDE.md` before
  changing a scoped area. Workflow notes are in `docs/agents/`.

## Build, Test, and Development Commands

```bash
npm install       # Install dependencies and copy sql-wasm.wasm into public/
npm run dev       # Start Vite with hot module replacement
npm run build     # Run strict TypeScript checks and create the production bundle
npm test          # Run the Vitest suite
npm run preview   # Serve the production bundle locally
npx prettier --write .  # Format files using the repository configuration
```

Vitest is the test runner; no lint script is configured. Run `npm test` and
`npm run build` before submitting changes, then manually exercise the affected
module with `npm run dev`.

## Coding Style & Naming Conventions

Use TypeScript strict mode, two-space indentation, single quotes, and an
80-column format. Use `@/` imports for `src` paths. Name React components and
types in PascalCase, hooks as `useThing`, and variables/functions in camelCase.
Keep user-facing text in Brazilian Portuguese. Use Tailwind v4 utilities and
add design tokens in `src/styles/globals.css` (`@theme`); there is no
`tailwind.config` file.

## Testing Guidelines

No coverage threshold exists. When adding tests, colocate them near the code
under test with `*.test.ts` or `*.test.tsx` and document the command needed to
run them in the PR.

## Commit & Pull Request Guidelines

Use concise imperative subjects with the established prefixes, such as
`feat:`, `fix:`, `refactor(scope):`, `docs:`, or `research:`. PRs should explain
the user-visible or architectural change, link the relevant GitHub issue,
report validation (`npm run build` plus manual checks), and include screenshots
or a short recording for UI changes. Keep secrets in local `.env` files; do
not commit database credentials or other environment values.
