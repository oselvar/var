# Adopt Tailwind CSS v4, drop `@navikt/ds-css`

**Date:** 2026-06-29
**Scope:** `packages/website` only.

## Goal

Replace as much hand-written CSS as possible in the website with Tailwind CSS v4
utilities, and remove the `@navikt/ds-css` (Aksel) dependency entirely. Preserve
the existing earthy color theme (light + warm-dark) and the class-based dark-mode
toggle. CodeMirror styling is explicitly **out of scope** and stays as-is.

## Current state

- The site imports five Aksel stylesheets in `src/layouts/Base.astro`
  (`tokens.css`, `fonts.css`, `reset.css`, `baseline.css`, `typography.css`) plus
  `src/styles/global.css`.
- `global.css` (271 lines) overrides Aksel's **color** tokens with an earthy
  theme in `:root,.light` and `.dark` blocks, defines layout/base/`.doc-body`
  styles, and defines the CodeMirror `--ed-*` / `--syn-*` token blocks.
- The rest of the site still consumes Aksel's **non-color** tokens:
  `--ax-space-*` (68×), `--ax-font-*` (34×), `--ax-radius-*` (10×), and the
  `--ax-font-family` (Source Sans 3, shipped by `fonts.css`).
- Custom CSS also lives in `<style>` blocks across 15 components/pages; the
  largest is `src/pages/index.astro` (249 lines).
- Dark mode: an inline script in `Base.astro` adds `.light`/`.dark` to `<html>`
  from `localStorage`/`prefers-color-scheme`. `window.__setTheme` toggles it.
- CodeMirror themes (`src/lib/cm-var-theme.ts`, `src/lib/var-token-theme.ts`)
  read `--ed-*` and `--syn-*` CSS variables via `var()`.

## Decisions

- **Font:** self-host Source Sans 3 (`@fontsource-variable/source-sans-3`), wired
  as Tailwind's `--font-sans`. No visual change to the typeface.
- **Token naming:** rename color tokens to Tailwind-idiomatic names in `@theme`.
  Drop the legacy `--cream`/`--ink`/`--orange`/`--yellow`/`--accent` aliases and
  collapse redundant tokens. Keep `--ed-*`/`--syn-*` names for CodeMirror.
- **Scope/aggressiveness:** replace everything possible — `global.css` base
  styles, all component chrome, and the bespoke `index.astro`. Only CodeMirror
  tokens and any irreducible custom CSS remain.
- **Markdown docs:** use `@tailwindcss/typography` (`prose`) themed with our color
  tokens, replacing the hand-written `.doc-body` element rules.

## Design

### 1. Integration & dependencies

- Run `pnpm astro add tailwind` → adds `@tailwindcss/vite` to
  `astro.config.mjs` `vite.plugins`, and `@import "tailwindcss";` at the top of
  `global.css`. Tailwind v4, CSS-first (no `tailwind.config.js`).
- Add `@tailwindcss/typography` and `@plugin "@tailwindcss/typography";` in
  `global.css`.
- Add `@fontsource-variable/source-sans-3`, imported once in `Base.astro`.
- **Remove** the five `@navikt/ds-css` imports from `Base.astro` and the
  dependency from `package.json`. Tailwind **Preflight** replaces Aksel's
  reset/baseline; `prose` replaces its typography component CSS.

### 2. Color theme → Tailwind `@theme` + class dark mode

- Keep the inline theme script in `Base.astro` and the `window.__setTheme`
  toggle untouched (`.light`/`.dark` on `<html>`).
- Add `@custom-variant dark (&:where(.dark, .dark *));` so Tailwind's `dark:`
  variant follows the class.
- Declare each two-valued semantic color as a plain CSS var in `:root,.light`
  and `.dark`, then expose to Tailwind with `@theme inline { --color-*: var(--*) }`
  so utilities auto-follow dark mode. Renamed map:

  | role (was) | new token | utility |
  |---|---|---|
  | `--ax-bg-default` | `--color-surface` | `bg-surface` |
  | `--ax-bg-raised` | `--color-raised` | `bg-raised` |
  | `--ax-bg-sunken` | `--color-sunken` | `bg-sunken` |
  | `--ax-text-default` | `--color-ink` | `text-ink` |
  | `--ax-text-subtle` | `--color-subtle` | `text-subtle` |
  | `--ax-text-neutral-subtle` | `--color-muted` | `text-muted` |
  | `--ax-text-accent` / `--var-accent` | `--color-accent` | `text-accent` `border-accent` |
  | `--ax-text-accent-contrast` | `--color-accent-contrast` | `text-accent-contrast` |
  | `--ax-bg-accent-strong` | `--color-strong` | `bg-strong` |
  | `--ax-bg-accent-strong-hover` | `--color-strong-hover` | `bg-strong-hover` |
  | `--var-accent-strong` | `--color-highlight` | `text-highlight` |
  | `--ax-border-default` | `--color-line` | `border-line` |
  | `--ax-border-subtle` | `--color-line-subtle` | `border-line-subtle` |

- **CodeMirror out of scope:** the `--ed-*` and `--syn-*` blocks stay verbatim in
  `:root`/`.dark`. The legacy aliases the CM theme files relied on
  (`--cream`/`--ink`/`--orange`/`--yellow`) are only needed if those files
  reference them — verify during implementation; CM reads `--ed-*`/`--syn-*`
  directly, so the aliases should be removable.
- **Square corners:** override the radius scale to `0` in `@theme` so any
  `rounded-*` stays square, matching current intent.

### 3. Non-color Aksel tokens → Tailwind scales

- `--ax-space-*` → spacing utilities (`p-*`, `m-*`, `gap-*`) via a rem→Tailwind
  mapping (Aksel space tokens are rem-based; Tailwind's scale is 0.25rem-based).
- `--ax-font-size-*` heading sizes → custom `--text-*` entries in `@theme` to
  preserve exact sizes; `--ax-font-weight-bold` → `font-bold`.
- `--ax-radius-*` → `rounded-none`.
- `--ax-font-family` → `--font-sans` (Source Sans 3).

### 4. Migration order

Each step keeps `astro build` + `astro check` green:

1. Add Tailwind + typography plugin + font + `@theme` (colors, dark variant,
   sizes, square radius). Preflight on. Remove ds-css imports from `Base.astro`.
2. Convert `global.css` base styles + `.doc-body` → `prose` themed with tokens.
3. Convert component `<style>` blocks → utilities, one component at a time.
4. Convert `index.astro` (the 249-line landing page).
5. Delete dead vars/aliases; remove `@navikt/ds-css` from `package.json`.

## Verification

- `pnpm --filter @oselvar/website build` (exit 0) and `astro check`.
- Manual visual check of the landing page, a doc page, the blog, and the
  playground/editor in **both** light and dark mode.
- The lib vitest suite is unaffected (no CSS under test).

## Out of scope

- CodeMirror editor/syntax styling (`--ed-*` / `--syn-*`, `cm-var-theme.ts`,
  `var-token-theme.ts`).
- Any change to site content, routing, or the theme's actual color values
  (a refactor of *where* colors are defined, not *what* they are).
