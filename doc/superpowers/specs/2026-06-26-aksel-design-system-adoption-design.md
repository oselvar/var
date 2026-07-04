# Adopt the Aksel design system (foundation-only) — design

**Date:** 2026-06-26
**Status:** Approved (pending spec review)
**Scope:** `packages/website` only

## Problem / goal

The Vár website has a bespoke, hand-rolled visual layer (custom palette, the Monoton
display font, ad-hoc spacing) and a docs shell we recently built. We want a coherent,
accessible, well-organised look by adopting [Aksel](https://aksel.nav.no) — NAV's design
system — as the **foundation**, while keeping the Vár identity as the personality on top.

Aksel is React-first, but its foundation is framework-agnostic. We adopt only that
foundation; we do **not** introduce React, Svelte, or Tailwind.

## Decisions (from brainstorming)

- **Adoption depth:** foundation-only. Consume Aksel's design tokens + base CSS +
  Source Sans, and write our own thin component CSS on those tokens. Keep our Astro
  components, the IA/nav, Pagefind search, and the content collection.
- **Color:** Aksel's semantic palette for all UI chrome (surfaces, text, borders, links,
  buttons). The Vár warm accent (yellow/orange) is reserved for identity (hero, rune,
  logo, the saga blockquote, a key CTA accent) via a small custom `--var-accent-*` layer.
- **Typography:** Aksel's typeface (Source Sans 3) + type scale everywhere — body, docs,
  and headings. **Monoton is retired.** The "Vár" wordmark uses Aksel heading type; the
  logo image carries the visual identity.
- **Dark mode:** a top-bar **toggle** (☀/☽); default from `prefers-color-scheme`,
  persisted in `localStorage`, applied before paint to avoid flash. No framework.
- **TopNav is site-wide:** lifted out of `DocsLayout` into a shared layout, used on every
  page (front page, docs, blog, playground).
- **Footers:** restyled in the foundation phase (shared footer in the base layout), so the
  whole site is consistent immediately.

## Confirmed Aksel facts (verified via the Aksel MCP, v8)

- **Theming is pure CSS.** Aksel switches color theme via a `light` / `dark` **class on the
  `<html>` element** (falls back to `light` if absent). The React `<Theme>` component is
  only a convenience wrapper; in a non-React site we set the class ourselves. `data-color`
  (`neutral | accent | info | success | warning | danger | brand-magenta | brand-beige |
  brand-blue | meta-purple | meta-lime`) retints components; default app color is `accent`.
- **CSS import.** `@import "@navikt/ds-css";` pulls everything (built-in CSS layers →
  specificity 0). Granular imports exist under `@navikt/ds-css/dist/global/*` and
  `@navikt/ds-css/dist/component/*`. `tokens.css` and `fonts.css` are required; `reset.css`
  + `baseline.css` are expected; component CSS (`typography.css`, `button.css`, …) is opt-in.
- **Tokens** use the `--ax-` prefix: `--ax-bg-*` (default/raised/sunken, soft/moderate/
  strong + hover/pressed), `--ax-text-*` (default/subtle/contrast), `--ax-border-*`
  (default/subtle/strong/focus), `--ax-space-*` (base-8, rem), `--ax-radius-*`
  (2/4/8/12/16/full), `--ax-font-*` (family `'Source Sans 3'…`, size, weight 400/600, line
  height), `--ax-breakpoint-*`.
- **Icons:** `@navikt/aksel-icons` (e.g. `MagnifyingGlass`, plus menu/chevron/external/
  sun-moon). The package is React-first; we use the raw SVGs (inline the ~5 we need). The
  exact non-React SVG delivery path is verified at planning time.

## Architecture — shared layout

```
Base.astro  (every page)
  ├─ <html class="light|dark">  + pre-paint theme script
  ├─ global CSS: Aksel (granular) + our token-based styles
  ├─ <TopNav hasSidebar?>      ← site-wide
  ├─ <slot/>                    ← page content
  └─ <SiteFooter>               ← shared, restyled in foundation

TopNav.astro (new, used everywhere)
  Vár logo/word · links (Docs · Blog · GitHub) · Pagefind search ·
  dark toggle · optional mobile-menu button (only when hasSidebar)

DocsLayout.astro  (wraps Base)
  adds: sidebar (~280px, sticky) + content grid + Breadcrumb + MoreInArea
  owns: the mobile drawer script (the sidebar it controls)

Front page / blog / playground  → use Base directly (TopNav + footer, no sidebar)
```

Each unit has one clear job: `Base` owns the global shell + theming; `TopNav` owns the
site-wide header; `DocsLayout` owns the docs-only sidebar/grid. The theme toggle and
search live in `TopNav` (global); the drawer logic stays with `DocsLayout` (local to the
sidebar). `SiteFooter` is a single shared component.

## Styling system

- **CSS entry:** granular Aksel imports to stay lean — `tokens.css`, `fonts.css`,
  `reset.css`, `baseline.css`, plus `typography.css`; add `button.css`/`alert.css` only if
  we use those primitives. Our own `global.css` is rewritten to consume `--ax-*` tokens.
- **Semantic usage:** components read semantic tokens (`--ax-bg-default`, `--ax-text-default`,
  `--ax-border-subtle`, `--ax-space-*`, `--ax-radius-*`) so both themes work automatically.
- **Vár accent layer:** define `--var-accent` / `--var-accent-strong` (yellow/orange) once,
  used only for identity surfaces (hero, rune, logo backdrop, saga blockquote border, a
  primary-CTA accent). Everything else uses Aksel tokens.
- **Type:** drop the Monoton `@font-face`/usages; headings and body use `--ax-font-*`.

## Theming + dark mode

- The base layout renders `<html class="...">`. A tiny inline script in `<head>` runs
  before paint: read `localStorage.theme`; else `matchMedia('(prefers-color-scheme: dark)')`;
  set `light`/`dark` on `<html>`. No FOUC.
- A `TopNav` toggle button flips the class and writes `localStorage.theme`; `aria-pressed`
  reflects state. Re-bind on `astro:after-swap`. Pure vanilla TS, no framework.
- All surfaces use `--ax-bg-*`, so the background follows the theme (no Aksel `<Theme>`
  background wrapper needed).

## Layout proportions (emulate Aksel docs)

- **TopNav:** sticky, comfortable height, logo left, links + search + toggle right; mobile
  collapses (search to icon, links behind the menu where applicable).
- **Sidebar:** ~280px, sticky, independent scroll, grouped by area (Start here / Guides /
  Reference / Concepts) with Aksel grouping style + clear active indicator. Keep our
  **shallow** structure (no deep nesting yet).
- **Content column:** constrained measure (~640–720px) for legibility; vertical rhythm via
  `--ax-space-*`; generous whitespace.
- Mobile drawer (existing focus/inert a11y) restyled to tokens.

## Phasing (one spec, phased plan)

1. **Foundation** — add `@navikt/ds-css` + `@navikt/aksel-icons`; wire granular Aksel CSS +
   Source Sans; rewrite `global.css` onto `--ax-*` tokens + the `--var-accent-*` layer;
   retire Monoton; build `Base.astro` shared shell with the theme class + pre-paint script +
   dark toggle; create `TopNav.astro` (site-wide) and `SiteFooter.astro` (restyled). Existing
   pages keep rendering through the new `Base`.
2. **Docs shell** — restyle `DocsLayout`/sidebar/`Breadcrumb`/`Search`/cards/`MoreInArea` to
   Aksel tokens + proportions; swap in aksel-icons; wire `TopNav hasSidebar` + the drawer.
3. **Front page** — hero with Vár accents on the Aksel base; Aksel-style CTAs; uses `Base`.
4. **Blog + playground** — restyle to tokens; use `Base`.

Each phase builds green and lands as small trunk commits.

## What stays / what goes

- **Stays:** Vár name, saga taglines, rune, logo image, warm accent; the IA/nav, Pagefind
  search, content collection, the docs nav we built (DocsLayout structure, mobile drawer).
- **Goes:** Monoton; the yellow/orange-dominant palette (demoted to accent); hand-rolled
  color/space/type values in `global.css` (replaced by `--ax-*`).

## Out of scope (YAGNI)

`@navikt/ds-react` and any React/Svelte runtime; Tailwind / `@navikt/ds-tailwind`; a
right-hand "on this page" TOC; i18n; Aksel's NAV-specific components (forms, date pickers,
data grid); doc versioning.

## Testing / verification

- `pnpm --filter @oselvar/website build` succeeds each phase; Pagefind index still produced.
- Existing unit tests (docs-nav) stay green; `pnpm --filter @oselvar/website check` shows no
  new errors.
- Manual per phase, in **both** themes: theme toggle persists + no FOUC on reload; TopNav
  present and consistent on front page, docs, blog, playground; docs sidebar/breadcrumb/
  search/drawer work; front-page hero shows Vár accent; no Monoton remains; legibility +
  spacing match Aksel proportions at desktop and ≤ mobile widths.
- Static guarantee holds: ds-css is CSS-only; aksel-icons are inline SVGs; the only JS is
  the theme toggle + the existing drawer + Pagefind.

## Risks

- **Aksel font delivery** (`fonts.css` `@font-face` source) — confirm Source Sans loads from
  the package (or fall back to a self-hosted/Google Source Sans 3) at planning time.
- **Non-React icon delivery** — confirm the raw-SVG path for `@navikt/aksel-icons`; inline
  the ~5 icons we need.
- **CSS-layer interplay** — Aksel ships its CSS in `@layer` (specificity 0); ensure our
  styles sit in a layer (or after) so our overrides win predictably.
- **Visual regressions across 4 page types** — mitigated by phasing + per-phase both-theme
  checks.
