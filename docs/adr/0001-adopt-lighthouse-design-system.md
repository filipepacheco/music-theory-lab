---
status: accepted
---

# Adopt the Lighthouse design system

The app takes its look from Lighthouse, the design system of the `specs-view`
skill in `satori-skills`: a graphite palette, JetBrains Mono for all text,
square corners, hard shadows with no blur, and one accent. We adopted it to
have one system with written rules for both themes, in place of a palette that
grew one module at a time.

The Lighthouse primitives (`--sea-*`, `--fog-*`, `--beam`, ...) live in
`src/styles/globals.css`. Components never use them directly. They use the
semantic `--color-*` tokens in `@theme`, which are aliases of the primitives.
This kept about 900 class usages unchanged, and it lets the primitives follow
a later version of Lighthouse without a change to the components.

## Consequences

- `--beam` (`--color-live`) marks only a live state: playing, recording, the
  current beat. Selected and primary controls use inverted text
  (`bg-accent text-on-accent`), not a hue.
- Lighthouse has one accent, but harmony needs categories. The music layer
  reuses the Lighthouse hues: tonic is `--sky`, subdominant is `--buoy`,
  dominant is `--flare`. The scale, octave, degree, and form tokens also come
  from those five hues. Where the old palette used amber as a category, the
  token is `--flare`, so `--beam` keeps its one meaning.
- The 12 colours of the structure palette are data. Saved and synced
  structures hold them as hex values, so they stay outside the system.
- The theme class `.light` is on `<html>`, not on the app root. An alias
  resolves where it is declared, so the day primitives must be on the same
  element as the aliases.
- Lighthouse is dense and made for a desktop pointer. Touch targets on mobile
  are an app-level override.
