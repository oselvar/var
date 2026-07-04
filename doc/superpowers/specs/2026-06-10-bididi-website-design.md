# bididi website — front page

**Date:** 2026-06-10
**Status:** approved, ready for implementation

## Goal

Ship a single-page marketing site for the tool currently published as `@oselvar/bdd`, rebranded on the page as **bididi** (`@oselvar/bididi`). The site lives in this monorepo, builds as static HTML, and deploys to GitHub Pages.

Out of scope: docs, tutorial integration, blog, dark mode, analytics, JS-driven interactivity. Package names in the monorepo stay `@oselvar/bdd` for now — only the website surfaces the new name.

## Package

- Location: `packages/website`
- Name: `@oselvar/website`
- `private: true` (never published to npm)
- Stack: Astro + plain CSS + TypeScript. No UI framework integration. No Tailwind.
- Node ≥ 22, pnpm workspace member (picked up by the existing `packages/*` glob in `pnpm-workspace.yaml`).

Scripts:

- `dev` — `astro dev`
- `build` — `astro build`
- `preview` — `astro preview`

## Astro config

- Output: static (`output: 'static'`, the default).
- `site: 'https://oselvar.github.io'`, `base: '/bdd'` — matches the current repo name on GitHub Pages. Easy to switch to a custom domain later (remove `base`, change `site`).
- No integrations beyond Astro's built-in static toolchain.

## File layout

```
packages/website/
  package.json
  tsconfig.json
  astro.config.mjs
  src/
    layouts/
      Base.astro      # <html>, <head>, font link, border frame, <slot/>
    pages/
      index.astro     # the front page
    styles/
      global.css      # reset, vars, typography, layout primitives
  public/
    favicon.svg
```

## Visual treatment

- **Background:** cream / off-white (`#faf5e9`).
- **Border:** thick yellow/orange poster frame around the viewport. ~14px solid `#f5a524` with an inset 4px gap from the edge (`padding: 4px; border: 14px solid #f5a524;` on the body wrapper, or equivalent). Border is fixed-position so it stays even when the page scrolls.
- **Display font:** Monoton (Google Fonts, OFL). Used for the `bididi` wordmark and section headings. Loaded via a single `<link rel="stylesheet">` in `Base.astro`.
- **Body font:** system grotesk stack — `ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif`. No font load.
- **Ink:** near-black (`#1a1a1a`).
- **Accent:** one bold accent — hot magenta `#ff2e88` — used sparingly: install-snippet caret, hover state on links, one decorative element.
- Responsive: mobile-first; the side-by-side pitch grid collapses to a stack below ~720px. The border frame thins to ~8px on small screens.

## Sections (top → bottom, inside the frame)

1. **Hero**
   - `bididi` in massive Monoton, centered, weight goes the full viewport width.
   - Tagline below: *"Behaviour-Driven Development for people who hate ceremony."*

2. **Pitch — two cards**
   - Card 1 — `discover misunderstandings` — one-sentence elaboration: *"Pin down what 'done' means before anyone writes code. Bididi turns plain-English examples into runnable specs — the conversation becomes the test."*
   - Card 2 — `clear your head` — one-sentence elaboration: *"Stop juggling intent in your head. Write the example, run it, and let the tests hold the shape of the feature for you."*

3. **Install**
   - One-line code block: `pnpm add -D @oselvar/bididi`
   - Magenta `$` caret prefix.
   - No JS copy button — the snippet is selectable text inside `<pre><code>`.

4. **Quotes wall** — punchy grid of short quotes, no attributions:
   - "Move over vibeslop, here comes bididi"
   - "BDD without the BS"
   - "Like therapy for your test suite"
   - "Specs you'd actually read"
   - "Plain English in, working tests out"
   - "Your team's shared brain, in markdown"

5. **Footer**
   - GitHub link (`https://github.com/oselvar/bdd`)
   - `© 2026 Oselvar`

## Deploy

`.github/workflows/website.yml`:

- Trigger: `push` to `main` (and `workflow_dispatch`).
- Permissions: `pages: write`, `id-token: write`.
- Steps: checkout → setup-node (22) → setup-pnpm → `pnpm install --frozen-lockfile` → `pnpm --filter @oselvar/website build` → `actions/upload-pages-artifact` (path: `packages/website/dist`) → `actions/deploy-pages`.
- Concurrency: one in-flight deploy at a time on the `pages` group.

The workflow assumes GitHub Pages is configured to use "GitHub Actions" as the source in repo settings — that's a one-time manual step the user does in the GitHub UI.

## Acceptance criteria

- `pnpm --filter @oselvar/website build` succeeds locally and emits `packages/website/dist/index.html`.
- The page renders the hero wordmark in Monoton, framed by a thick yellow/orange border.
- All sections (hero, pitch, install, quotes, footer) are visible on desktop and mobile widths.
- No console errors when loaded.
- No regression to existing checks: `pnpm lint` and `pnpm test` still pass at repo root.
- The deploy workflow lints clean (valid YAML, valid `actions/*` versions).

## Not done in this task

- Custom domain configuration.
- Verifying the deploy actually publishes to a live URL (requires a one-time GitHub Pages settings change by the user).
- Renaming `@oselvar/bdd` → `@oselvar/bididi` in the workspace packages.
