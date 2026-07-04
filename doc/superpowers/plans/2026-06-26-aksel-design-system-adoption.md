# Aksel Design System Adoption Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-skin the Vár website onto Aksel's framework-agnostic foundation (design tokens, base CSS, Source Sans) with a site-wide TopNav + footer and a working dark-mode toggle, keeping the Vár identity as an accent layer.

**Architecture:** Adopt `@navikt/ds-css` (granular global + typography) and `@navikt/aksel-icons` SVGs. A one-time **token bridge** redefines the existing legacy CSS variables (`--ink`, `--cream`, …) in terms of Aksel's `--ax-*` tokens, so all 13 consumer files re-theme and gain light/dark support at once; later phases replace the bridge with direct semantic tokens in the chrome and match Aksel's docs proportions. `Base.astro` becomes the shared shell (theme class + pre-paint script + `TopNav` + `SiteFooter`); `DocsLayout` keeps only the sidebar/grid + drawer.

**Tech Stack:** Astro 5 (static, base `/var`), `@navikt/ds-css` v8, `@navikt/aksel-icons`, astro-pagefind, vanilla TS (theme toggle + existing drawer). No React/Svelte/Tailwind.

## Global Constraints

- Scope is `packages/website` only. Static output, no server component. No React, Svelte, or Tailwind.
- Aksel theming is pure CSS: a `light` / `dark` **class on `<html>`** (default `light`). No Aksel `<Theme>` React component.
- Aksel CSS comes from granular imports: `@navikt/ds-css/dist/global/tokens.css`, `…/global/fonts.css`, `…/global/reset.css`, `…/global/baseline.css` (all four required), plus `@navikt/ds-css/dist/component/typography.css`. Aksel ships its CSS in `@layer` (specificity 0), so our own un-layered rules win.
- Tokens use the `--ax-` prefix: `--ax-bg-default/raised/sunken`, `--ax-text-default/subtle/contrast`, `--ax-border-default/subtle/strong`, `--ax-space-*` (base-8 rem), `--ax-radius-2/4/8/12/16/full`, `--ax-font-family`/`--ax-font-size-*`/`--ax-font-weight-*`, `--ax-breakpoint-*`. When an exact token name is uncertain, verify it via the Aksel MCP (`aksel_get_token_details`) before using it; never ship a guessed token without a fallback.
- Vár accent is a custom layer: `--var-accent: #e67d00` (orange), `--var-accent-strong: #ffd60a` (yellow). Used only for identity (hero, rune, logo, saga blockquote, primary-CTA accent).
- Monoton is retired everywhere; the Monoton `<link>` is removed; headings use Aksel type.
- `TopNav` and `SiteFooter` are site-wide via `Base.astro`. Search (Pagefind) + dark toggle live in `TopNav`. The docs sidebar + mobile drawer stay in `DocsLayout`.
- Trunk-based development: commit each task directly to `main`, staging only that task's files. Working tree is otherwise clean.
- Every task ends green: `pnpm --filter @oselvar/website build` succeeds; `pnpm test docs-nav` stays 10/10; `pnpm --filter @oselvar/website check` shows no NEW errors (10 pre-existing in `idb-file-system.ts`/`var-worker.ts` are unrelated).
- This is a static-site re-skin: most tasks have no unit test. Verification = successful build + described inspection, in BOTH themes where visual. Capture build output + observations as evidence in lieu of TDD.

---

## Shared reference: token bridge map

Tasks reference this single mapping (defined in Task 2). Do not redefine it per task.

| Legacy var      | Aksel token (with fallback)                              | Notes |
|-----------------|----------------------------------------------------------|-------|
| `--cream`       | `var(--ax-bg-default)`                                    | page surface (white light / dark) |
| `--ink`         | `var(--ax-text-default)`                                 | body text |
| `--orange`      | `var(--var-accent)` (`#e67d00`)                          | Vár identity accent |
| `--yellow`      | `var(--var-accent-strong)` (`#ffd60a`)                   | Vár identity accent |
| `--accent`      | `var(--ax-text-accent, var(--var-accent))`              | interactive/link emphasis; confirm `--ax-text-accent` via MCP, else keep fallback |
| `--radius-5`    | `var(--ax-radius-12)`                                     | corner radius |
| `--page-gutter` | `var(--ax-space-16)`                                      | page gutter |
| `--content-max` | `760px` (literal)                                        | reading measure |

---

## Phase 1 — Foundation

### Task 1: Add Aksel packages and import its global CSS

**Files:**
- Modify: `packages/website/package.json` (dependencies)
- Modify: `packages/website/src/layouts/Base.astro` (frontmatter CSS imports)
- (lockfile) `pnpm-lock.yaml`

**Interfaces:**
- Consumes: nothing.
- Produces: Aksel `--ax-*` tokens + Source Sans available globally; `@navikt/aksel-icons` installed for later tasks.

- [ ] **Step 1: Install the packages**

Run from repo root:
```bash
pnpm --filter @oselvar/website add @navikt/ds-css @navikt/aksel-icons
```
Expected: both appear under `dependencies` in `packages/website/package.json`.

- [ ] **Step 2: Import Aksel global CSS in Base (before our global.css)**

In `packages/website/src/layouts/Base.astro`, change the frontmatter top so Aksel CSS is imported BEFORE `global.css` (Aksel is layered → specificity 0, so our rules still win; importing first keeps source order clean):

```astro
---
import '@navikt/ds-css/dist/global/tokens.css'
import '@navikt/ds-css/dist/global/fonts.css'
import '@navikt/ds-css/dist/global/reset.css'
import '@navikt/ds-css/dist/global/baseline.css'
import '@navikt/ds-css/dist/component/typography.css'
import '../styles/global.css'

interface Props {
  title: string
  description: string
}

const { title, description } = Astro.props
---
```

- [ ] **Step 3: Build and verify Aksel CSS + Source Sans are bundled**

Run: `pnpm --filter @oselvar/website build`
Expected: build succeeds. Then verify the tokens and font made it into the output:
```bash
grep -rl "\-\-ax-bg-default" packages/website/dist/_astro/*.css | head -1
grep -rl "Source Sans" packages/website/dist/_astro/*.css | head -1
```
Expected: at least one CSS file matches each (Aksel tokens + Source Sans `@font-face` are present).

> If the granular `dist/global/*` import paths fail to resolve under Vite, fall back to the single entry `import '@navikt/ds-css'` (everything) and note the deviation in the report. Verify the exact subpaths exist under `node_modules/@navikt/ds-css/dist/` first.

- [ ] **Step 4: Commit**

```bash
git add packages/website/package.json packages/website/src/layouts/Base.astro pnpm-lock.yaml
git commit -m "feat(website): add Aksel ds-css + aksel-icons, import global Aksel CSS"
```

---

### Task 2: Bridge legacy vars onto Aksel tokens + define Vár accent

**Files:**
- Modify: `packages/website/src/styles/global.css` (`:root`, `body`, the `@media` block)

**Interfaces:**
- Consumes: Aksel `--ax-*` tokens (Task 1).
- Produces: the legacy vars (`--ink`, `--cream`, `--orange`, `--yellow`, `--accent`, `--radius-5`, `--page-gutter`, `--content-max`) now resolve to Aksel tokens; `--var-accent`/`--var-accent-strong` defined. All 13 consumer files re-theme automatically and become dark-mode-ready.

- [ ] **Step 1: Confirm the accent-text token name via the Aksel MCP**

Use the Aksel MCP `aksel_get_token_details` to confirm the link/accent text token (try `text-accent`). If a bare accent text token exists, use it; otherwise keep the `var(--ax-text-accent, var(--var-accent))` fallback exactly as written below. Record the result in the report.

- [ ] **Step 2: Rewrite the `:root` block and body in global.css**

In `packages/website/src/styles/global.css`, replace the existing `:root { … }` block AND the `@media (max-width: 720px) { :root { … } }` block with the bridge below, and update the `body` rule to use Aksel font/size. Do NOT touch the rest of the file yet (later phases).

```css
:root {
  /* Vár identity accent (the only bespoke colors that survive) */
  --var-accent: #e67d00;        /* orange */
  --var-accent-strong: #ffd60a; /* yellow */

  /* Bridge: legacy brand vars now resolve to Aksel semantic tokens.
     This re-themes every existing component and enables light/dark at once. */
  --cream: var(--ax-bg-default);
  --ink: var(--ax-text-default);
  --orange: var(--var-accent);
  --yellow: var(--var-accent-strong);
  --accent: var(--ax-text-accent, var(--var-accent));
  --radius-5: var(--ax-radius-12);
  --page-gutter: var(--ax-space-16);
  --content-max: 760px;
}
```

Update `body` to inherit Aksel typography (remove the hardcoded cream background / system font / 18px so Aksel + tokens drive it):

```css
body {
  background: var(--ax-bg-default);
  color: var(--ax-text-default);
  font-family: var(--ax-font-family);
  font-size: var(--ax-font-size-large, 1.125rem);
  line-height: 1.6;
  min-height: 100vh;
}
```

(The `@media (max-width: 720px)` `:root` overrides for `--page-gutter`/`--radius-5` are deleted — Aksel's `--ax-space-*`/`--ax-radius-*` are already responsive-appropriate.)

- [ ] **Step 3: Build and verify the bridge resolves (light theme)**

Run: `pnpm --filter @oselvar/website build`
Expected: build succeeds. Open `pnpm --filter @oselvar/website preview` and load `/var/` and `/var/docs/`: the site now renders on Aksel surfaces/text (white/neutral light theme) and Source Sans, with the existing layout intact (chrome still works because the legacy vars resolve). No broken/unstyled colors. Capture observations.

- [ ] **Step 4: Commit**

```bash
git add packages/website/src/styles/global.css
git commit -m "feat(website): bridge legacy vars onto Aksel tokens + Vár accent layer"
```

---

### Task 3: Retire Monoton

**Files:**
- Modify: `packages/website/src/layouts/Base.astro` (remove Monoton `<link>` + preconnects if unused)
- Modify: `packages/website/src/styles/global.css` (5 usages)
- Modify: `packages/website/src/layouts/DocsLayout.astro` (1 usage)
- Modify: `packages/website/src/pages/docs/index.astro` (1 usage)
- Modify: `packages/website/src/pages/blog/index.astro` (1 usage)

**Interfaces:**
- Consumes: `--ax-font-family` (Aksel).
- Produces: no Monoton anywhere; headings/wordmark use Aksel type.

- [ ] **Step 1: Remove the Monoton font link from Base**

In `packages/website/src/layouts/Base.astro`, delete the Google Fonts Monoton `<link>` (the `family=Monoton` stylesheet line). Remove the two `fonts.googleapis.com`/`fonts.gstatic.com` preconnect `<link>`s only if no other webfont uses them (Aksel ships Source Sans via `fonts.css`, so they are now unused — remove them).

- [ ] **Step 2: Replace every Monoton font-family with Aksel type**

Replace each occurrence of `font-family: "Monoton", cursive;` (and the inline `font-family: "Monoton", cursive; font-size: 20px;` in DocsLayout) with `font-family: var(--ax-font-family);` in:
- `packages/website/src/styles/global.css` (5 occurrences: doc h1, doc h2, and others)
- `packages/website/src/layouts/DocsLayout.astro` (`.docs-topbar__brand`)
- `packages/website/src/pages/docs/index.astro` (`.docs-card h2`)
- `packages/website/src/pages/blog/index.astro` (`.post-title`)

For heading weight/character, where a Monoton heading was purely decorative, set `font-weight: var(--ax-font-weight-bold);` alongside the family so headings keep emphasis.

- [ ] **Step 3: Verify no Monoton remains**

Run: `grep -rn "Monoton" packages/website/src packages/website/public`
Expected: zero matches.

- [ ] **Step 4: Build and verify**

Run: `pnpm --filter @oselvar/website build`
Expected: build succeeds; preview `/var/` and `/var/docs/` — headings/wordmark render in Source Sans (no decorative Monoton, no `cursive` fallback). Capture observations.

- [ ] **Step 5: Commit**

```bash
git add packages/website/src/layouts/Base.astro packages/website/src/styles/global.css packages/website/src/layouts/DocsLayout.astro packages/website/src/pages/docs/index.astro packages/website/src/pages/blog/index.astro
git commit -m "feat(website): retire Monoton, use Aksel typography for headings"
```

---

### Task 4: Dark-mode theme infrastructure in Base

**Files:**
- Modify: `packages/website/src/layouts/Base.astro` (html class + pre-paint inline script)

**Interfaces:**
- Consumes: Aksel `light`/`dark` class theming.
- Produces: `<html>` carries the resolved theme class before paint; a global `window.__setTheme(next)` helper + `theme:change` event for the toggle button (Task 5) to call. No visual control yet.

- [ ] **Step 1: Add the pre-paint theme script and html wiring**

In `packages/website/src/layouts/Base.astro`, add a `class` to `<html>` is not statically possible (theme is per-visitor), so set it via an inline script that runs FIRST in `<head>` (before any CSS paints). Add this as the very first child of `<head>`:

```astro
  <head>
    <script is:inline>
      ;(() => {
        try {
          const saved = localStorage.getItem('theme')
          const sysDark = window.matchMedia('(prefers-color-scheme: dark)').matches
          const theme = saved === 'light' || saved === 'dark' ? saved : sysDark ? 'dark' : 'light'
          document.documentElement.classList.remove('light', 'dark')
          document.documentElement.classList.add(theme)
        } catch {
          document.documentElement.classList.add('light')
        }
        // Global helper the TopNav toggle calls.
        window.__setTheme = (next) => {
          document.documentElement.classList.remove('light', 'dark')
          document.documentElement.classList.add(next)
          try { localStorage.setItem('theme', next) } catch {}
          window.dispatchEvent(new CustomEvent('theme:change', { detail: next }))
        }
      })()
    </script>
    <meta charset="UTF-8" />
    ...rest unchanged...
  </head>
```

> `is:inline` keeps Astro from bundling/deferring it, so it runs before paint (no FOUC). It must precede the stylesheet links.

- [ ] **Step 2: Build and verify theme resolves with no flash**

Run: `pnpm --filter @oselvar/website build && pnpm --filter @oselvar/website preview`
- Default load: `<html>` has class `light` (or `dark` if your OS prefers dark) — check the elements panel.
- In devtools console: `window.__setTheme('dark')` → the page switches to Aksel dark surfaces immediately; `localStorage.theme === 'dark'`; reload → still dark, no white flash.
- `window.__setTheme('light')` → back to light; reload → light, no flash.
Capture observations (both directions, no FOUC).

- [ ] **Step 3: Commit**

```bash
git add packages/website/src/layouts/Base.astro
git commit -m "feat(website): pre-paint light/dark theme resolution + __setTheme helper"
```

---

### Task 5: Shared SiteFooter

**Files:**
- Create: `packages/website/src/components/SiteFooter.astro`
- Modify: `packages/website/src/layouts/Base.astro` (render `<SiteFooter />` after the slot)
- Modify: `packages/website/src/pages/index.astro` (remove its bespoke `<footer>`)
- Modify: `packages/website/src/pages/blog/index.astro` (remove its `.doc-footer`)
- Modify: `packages/website/src/pages/blog/[...slug].astro` (remove its `.doc-footer`)
- Modify: `packages/website/src/components/MoreInArea.astro` (drop its GitHub line — now in the shared footer) OR keep next-link only

**Interfaces:**
- Consumes: `base` from `import.meta.env.BASE_URL`.
- Produces: one site-wide footer rendered by `Base` on every page.

- [ ] **Step 1: Create SiteFooter**

Create `packages/website/src/components/SiteFooter.astro`:

```astro
---
const base = import.meta.env.BASE_URL.replace(/\/$/, '')
---

<footer class="site-footer">
  <nav aria-label="Footer">
    <a href={`${base}/docs/`}>Docs</a>
    <a href={`${base}/blog/`}>Blog</a>
    <a href={`${base}/playground`}>Playground</a>
    <a href="https://github.com/oselvar/var">GitHub</a>
  </nav>
  <p class="site-footer__legal">© 2026 Oselvar</p>
</footer>

<style>
  .site-footer {
    border-top: 1px solid var(--ax-border-subtle);
    padding: var(--ax-space-32) var(--ax-space-24);
    margin-top: var(--ax-space-64);
    display: flex; flex-wrap: wrap; gap: var(--ax-space-16);
    align-items: center; justify-content: space-between;
    font-size: var(--ax-font-size-small);
    color: var(--ax-text-subtle);
  }
  .site-footer nav { display: flex; gap: var(--ax-space-20, 1.25rem); flex-wrap: wrap; }
  .site-footer a { color: var(--ax-text-default); text-decoration: none; }
  .site-footer a:hover { text-decoration: underline; }
  .site-footer__legal { margin: 0; }
</style>
```

- [ ] **Step 2: Render it in Base after the slot**

In `packages/website/src/layouts/Base.astro`, import and render it inside `<body>` after `<slot />`:

```astro
---
import SiteFooter from '../components/SiteFooter.astro'
// ...existing imports
---
  <body>
    <slot />
    <SiteFooter />
  </body>
```

- [ ] **Step 3: Remove the now-duplicated page footers**

- `packages/website/src/pages/index.astro`: delete the `<footer>…</footer>` block.
- `packages/website/src/pages/blog/index.astro` and `blog/[...slug].astro`: delete their `.doc-footer` blocks.
- `packages/website/src/components/MoreInArea.astro`: remove the GitHub `<p class="more-in-area__github">…` line (the footer covers GitHub); keep the within-area "next" link.

- [ ] **Step 4: Build and verify one footer everywhere**

Run: `pnpm --filter @oselvar/website build && pnpm --filter @oselvar/website preview`
Expected: every page (`/var/`, `/var/docs/`, `/var/docs/start-here/hello-var-your-first-spec`, `/var/blog/`, `/var/playground`) shows exactly ONE shared footer; no leftover bespoke footers. Looks right in light and dark. Capture observations.

- [ ] **Step 5: Commit**

```bash
git add packages/website/src/components/SiteFooter.astro packages/website/src/layouts/Base.astro packages/website/src/pages/index.astro packages/website/src/pages/blog/index.astro "packages/website/src/pages/blog/[...slug].astro" packages/website/src/components/MoreInArea.astro
git commit -m "feat(website): shared site-wide footer in Base"
```

---

### Task 6: Shared TopNav (logo, links, search, dark toggle, optional hamburger)

**Files:**
- Create: `packages/website/src/components/TopNav.astro`
- Create: `packages/website/src/components/ThemeToggle.astro`
- Modify: `packages/website/src/layouts/Base.astro` (render `<TopNav>` before the slot)
- Modify: `packages/website/src/layouts/DocsLayout.astro` (remove its own `.docs-topbar`; pass `hasSidebar`/menu wiring to TopNav)
- Modify: `packages/website/src/pages/docs/index.astro` and `packages/website/src/pages/docs/[...slug].astro` (they currently pass `<Search slot="search" />` into DocsLayout — search now lives in TopNav, so drop that slot usage)

**Interfaces:**
- Consumes: `Search.astro` (Pagefind), `ThemeToggle.astro`, `window.__setTheme`/`theme:change` (Task 4), the drawer hooks `[data-docs-menu]`.
- Produces: site-wide top bar. Prop `hasSidebar?: boolean` controls whether the mobile-menu (hamburger) button renders; default `false`.

- [ ] **Step 1: Create ThemeToggle**

Create `packages/website/src/components/ThemeToggle.astro`. Inline SVG sun/moon (no React); button calls `window.__setTheme`:

```astro
<button class="theme-toggle" type="button" aria-label="Toggle dark mode" data-theme-toggle>
  <span class="theme-toggle__sun" aria-hidden="true">☀</span>
  <span class="theme-toggle__moon" aria-hidden="true">☾</span>
</button>

<script>
  function initThemeToggle() {
    const btn = document.querySelector('[data-theme-toggle]')
    if (!btn) return
    const sync = () => {
      const dark = document.documentElement.classList.contains('dark')
      btn.setAttribute('aria-pressed', dark ? 'true' : 'false')
    }
    btn.addEventListener('click', () => {
      const dark = document.documentElement.classList.contains('dark')
      ;(window as any).__setTheme?.(dark ? 'light' : 'dark')
    })
    window.addEventListener('theme:change', sync)
    sync()
  }
  initThemeToggle()
  document.addEventListener('astro:after-swap', initThemeToggle)
</script>

<style>
  .theme-toggle {
    background: none; border: 1px solid var(--ax-border-subtle); cursor: pointer;
    border-radius: var(--ax-radius-full); width: 2.25rem; height: 2.25rem;
    color: var(--ax-text-default); font-size: 1rem; line-height: 1;
  }
  .theme-toggle:hover { background: var(--ax-bg-raised); }
  /* Show the icon for the theme you'll switch TO. */
  :global(html.light) .theme-toggle__sun { display: none; }
  :global(html.dark) .theme-toggle__moon { display: none; }
</style>
```

> Optional polish: swap the `☀`/`☾` glyphs for `@navikt/aksel-icons` `SunIcon`/`MoonIcon` SVGs (inline the raw SVG via `?raw` import — confirm the SVG path under `node_modules/@navikt/aksel-icons`). Glyphs are acceptable if the SVG path is unavailable.

- [ ] **Step 2: Create TopNav**

Create `packages/website/src/components/TopNav.astro`:

```astro
---
import Search from './Search.astro'
import ThemeToggle from './ThemeToggle.astro'

interface Props {
  hasSidebar?: boolean
}
const { hasSidebar = false } = Astro.props
const base = import.meta.env.BASE_URL.replace(/\/$/, '')
---

<header class="topnav">
  {hasSidebar && (
    <button class="topnav__menu" type="button" aria-label="Open navigation" aria-expanded="false" data-docs-menu>☰</button>
  )}
  <a class="topnav__brand" href={`${base}/`}>
    <img class="topnav__logo" src={`${base}/logo2-transparent.png`} alt="" width="28" height="28" />
    <span>Vár</span>
  </a>
  <nav class="topnav__links" aria-label="Primary">
    <a href={`${base}/docs/`}>Docs</a>
    <a href={`${base}/blog/`}>Blog</a>
    <a href="https://github.com/oselvar/var">GitHub</a>
  </nav>
  <div class="topnav__search"><Search /></div>
  <ThemeToggle />
</header>

<style>
  .topnav {
    position: sticky; top: 0; z-index: 50;
    display: flex; align-items: center; gap: var(--ax-space-16);
    padding: var(--ax-space-12, 0.75rem) var(--ax-space-24);
    background: var(--ax-bg-default);
    border-bottom: 1px solid var(--ax-border-subtle);
  }
  .topnav__brand {
    display: flex; align-items: center; gap: var(--ax-space-8);
    font-weight: var(--ax-font-weight-bold); font-size: 1.125rem;
    color: var(--ax-text-default); text-decoration: none; white-space: nowrap;
  }
  .topnav__links { display: flex; gap: var(--ax-space-16); }
  .topnav__links a { color: var(--ax-text-default); text-decoration: none; }
  .topnav__links a:hover { color: var(--ax-text-accent, var(--var-accent)); }
  .topnav__search { flex: 1; max-width: 22rem; }
  .topnav__menu { display: none; background: none; border: none; font-size: 1.4rem; cursor: pointer; color: var(--ax-text-default); }

  @media (max-width: 820px) {
    .topnav__menu { display: block; order: -1; }
    .topnav__links { display: none; }
  }
</style>
```

- [ ] **Step 3: Render TopNav in Base**

In `packages/website/src/layouts/Base.astro`, import `TopNav` and render it as the first child of `<body>`. Because most pages have no sidebar, default `hasSidebar` is false. Allow docs pages to opt in by reading a prop on Base:

Add `hasSidebar?: boolean` to Base's `Props`, default false, and render:
```astro
  <body>
    <TopNav hasSidebar={hasSidebar} />
    <slot />
    <SiteFooter />
  </body>
```
Where Base destructures: `const { title, description, hasSidebar = false } = Astro.props`.

- [ ] **Step 4: Update DocsLayout to drop its own top bar and use TopNav's**

In `packages/website/src/layouts/DocsLayout.astro`:
- Pass `hasSidebar={true}` to `<Base>`.
- DELETE the entire `<div class="docs-topbar">…</div>` block and its `.docs-topbar*` styles — the top bar now comes from Base's `TopNav` (which renders the `[data-docs-menu]` hamburger when `hasSidebar`).
- Keep the `docs-shell` / sidebar / drawer markup, backdrop, and the drawer `<script>` unchanged (the script still queries `[data-docs-menu]`, now rendered by TopNav — same selector, so it keeps working).
- Remove the `<slot name="search" />` usage (search is in TopNav now).

- [ ] **Step 5: Remove the search slot from docs pages**

In `packages/website/src/pages/docs/[...slug].astro` and `packages/website/src/pages/docs/index.astro`, remove the `<Search slot="search" />` line (and the now-unused `Search` import). Search is global in TopNav.

- [ ] **Step 6: Build and verify TopNav everywhere + docs drawer still works**

Run: `pnpm --filter @oselvar/website build && pnpm --filter @oselvar/website preview`
Expected:
- Every page (`/var/`, `/var/docs/…`, `/var/blog/`, `/var/playground`) shows the same sticky TopNav with brand, links, search, and the theme toggle.
- The theme toggle flips light/dark and persists across reloads (no FOUC).
- On docs pages only, the hamburger appears at ≤820px and opens the sidebar drawer (focus enters drawer, Escape/backdrop/link close, focus returns to button — the Task-from-prior-feature behavior intact).
- Exactly one top bar on docs pages (no double bar).
Capture observations in both themes.

- [ ] **Step 7: Commit**

```bash
git add packages/website/src/components/TopNav.astro packages/website/src/components/ThemeToggle.astro packages/website/src/layouts/Base.astro packages/website/src/layouts/DocsLayout.astro "packages/website/src/pages/docs/[...slug].astro" packages/website/src/pages/docs/index.astro
git commit -m "feat(website): site-wide TopNav with search + dark toggle; lift out of DocsLayout"
```

---

## Phase 2 — Docs shell to Aksel proportions

### Task 7: Restyle the docs shell with Aksel tokens + proportions + icons

**Files:**
- Modify: `packages/website/src/layouts/DocsLayout.astro` (shell grid + drawer CSS)
- Modify: `packages/website/src/components/DocsSidebar.astro`
- Modify: `packages/website/src/components/Breadcrumb.astro`
- Modify: `packages/website/src/components/MoreInArea.astro`
- Modify: `packages/website/src/components/Search.astro` (token-ize)
- Modify: `packages/website/src/pages/docs/index.astro` (`.docs-card*` styles)

**Interfaces:**
- Consumes: Aksel tokens; the bridge (still in place).
- Produces: docs shell visually matching Aksel docs (sidebar ~280px, constrained content measure, Aksel spacing rhythm, semantic colors). Uses semantic `--ax-*` tokens DIRECTLY (not the legacy bridge aliases) in these chrome components.

- [ ] **Step 1: Restyle the shell grid + sidebar container in DocsLayout**

Replace the `docs-shell*` scoped styles in `DocsLayout.astro` to use Aksel tokens and Aksel-like proportions. Concretely:
- `.docs-shell`: `grid-template-columns: 280px minmax(0, 1fr); gap: var(--ax-space-48); max-width: 1200px; margin: 0 auto; padding: var(--ax-space-32) var(--ax-space-24) var(--ax-space-64);`
- `.docs-shell__sidebar`: `position: sticky; top: var(--ax-space-64); align-self: start; max-height: calc(100vh - 5rem); overflow-y: auto;`
- `.docs-shell__main`: `min-width: 0; max-width: 46rem;` (≈ 736px reading measure)
- Keep the existing `@media (max-width: 820px)` drawer rules but swap colors to tokens: backdrop `color-mix(in srgb, var(--ax-text-default) 40%, transparent)`; sidebar drawer `background: var(--ax-bg-default); border-right: 1px solid var(--ax-border-subtle);`.

- [ ] **Step 2: Restyle DocsSidebar to Aksel grouping**

In `packages/website/src/components/DocsSidebar.astro`, change the scoped styles to Aksel tokens:
- group label: `font-size: var(--ax-font-size-small); font-weight: var(--ax-font-weight-bold); color: var(--ax-text-subtle); text-transform: uppercase; letter-spacing: 0.04em;`
- links: `color: var(--ax-text-default); padding: var(--ax-space-4) var(--ax-space-8); border-radius: var(--ax-radius-4);`
- hover: `background: var(--ax-bg-raised);`
- current (`.is-current`): `background: var(--ax-bg-raised); color: var(--ax-text-accent, var(--var-accent)); font-weight: var(--ax-font-weight-bold); box-shadow: inset 2px 0 0 var(--ax-border-accent, var(--var-accent));`
- "Coming soon" empty: `color: var(--ax-text-subtle);`

- [ ] **Step 3: Restyle Breadcrumb + MoreInArea**

- `Breadcrumb.astro`: `font-size: var(--ax-font-size-small); color: var(--ax-text-subtle);` links `color: var(--ax-text-default)`; separators `color: var(--ax-text-subtle)`.
- `MoreInArea.astro`: `border-top: 1px solid var(--ax-border-subtle); margin-top: var(--ax-space-48); padding-top: var(--ax-space-24);` the next link as an Aksel-style affordance: `border: 1px solid var(--ax-border-default); border-radius: var(--ax-radius-8); padding: var(--ax-space-12) var(--ax-space-16);` hover `background: var(--ax-bg-raised)`.

- [ ] **Step 4: Token-ize Search + restyle docs hub cards**

- `Search.astro`: in its `<style is:global>`, replace `var(--cream)`/`var(--ink)`/`var(--radius-5)` with `var(--ax-bg-default)`/`var(--ax-text-default)`/`var(--ax-radius-8)`; input border `1px solid var(--ax-border-default)`.
- `docs/index.astro` `.docs-card*`: `border: 1px solid var(--ax-border-subtle); border-radius: var(--ax-radius-12); padding: var(--ax-space-24);` heading uses `var(--ax-font-size-heading-small)`; kind label `color: var(--ax-text-subtle)`.

- [ ] **Step 5: Build and verify the docs shell**

Run: `pnpm --filter @oselvar/website build && pnpm --filter @oselvar/website preview`
Expected (both themes, desktop + ≤820px): sidebar ~280px with Aksel grouping + clear active state; content column constrained (~46rem) with comfortable measure; Aksel spacing rhythm; breadcrumb/next/cards/search all on Aksel tokens; legibility close to aksel.nav.no/designsystemet. Drawer still works. `pnpm test docs-nav` stays 10/10. Capture observations.

- [ ] **Step 6: Commit**

```bash
git add packages/website/src/layouts/DocsLayout.astro packages/website/src/components/DocsSidebar.astro packages/website/src/components/Breadcrumb.astro packages/website/src/components/MoreInArea.astro packages/website/src/components/Search.astro packages/website/src/pages/docs/index.astro
git commit -m "feat(website): restyle docs shell to Aksel tokens + proportions"
```

---

## Phase 3 — Front page

### Task 8: Restyle the front page on Aksel + Vár accent

**Files:**
- Modify: `packages/website/src/pages/index.astro` (hero, pitch, install, quotes, CTA styles)

**Interfaces:**
- Consumes: Aksel tokens + `--var-accent*`.
- Produces: a front page on Aksel surfaces/type with the Vár warm accent reserved for identity; Aksel-style CTAs. TopNav + footer already provided by Base.

- [ ] **Step 1: Restyle hero + sections to Aksel tokens, Vár accent for identity**

In `packages/website/src/pages/index.astro` `<style>`:
- `.wordmark`: `font-size: var(--ax-font-size-heading-2xlarge); font-weight: var(--ax-font-weight-bold); color: var(--ax-text-default);`
- `.rune`: `color: var(--var-accent);` (identity accent)
- `.tagline`: `color: var(--ax-text-subtle); max-width: 46rem; margin: 0 auto;`
- `.cta__primary`: Aksel-accent button: `background: var(--ax-bg-accent-strong, var(--var-accent)); color: var(--ax-text-contrast, #fff); border-radius: var(--ax-radius-8); padding: var(--ax-space-12) var(--ax-space-24); font-weight: var(--ax-font-weight-bold); text-decoration: none;` hover `background: var(--ax-bg-accent-strong-hover, var(--var-accent))`.
- `.cta__secondary`: `color: var(--ax-text-default); text-decoration: underline; text-decoration-color: var(--var-accent);`
- `.install pre/code`, `.pitch`, `.quotes`: surfaces use `var(--ax-bg-raised)`, borders `var(--ax-border-subtle)`, radius `var(--ax-radius-12)`, text `var(--ax-text-default)`; section spacing via `--ax-space-*`.
- `.pitch h2`, `.quotes h2`: `font-size: var(--ax-font-size-heading-medium)`.
- Keep the logo image + saga taglines as-is (identity content).

Confirm `--ax-bg-accent-strong` / `--ax-text-contrast` token names via the Aksel MCP; keep the `--var-accent`/`#fff` fallbacks if a name differs.

- [ ] **Step 2: Build and verify the front page**

Run: `pnpm --filter @oselvar/website build && pnpm --filter @oselvar/website preview`
Expected (both themes): front page reads as Aksel-styled (neutral surfaces, Source Sans) with the Vár warm accent only on identity bits (rune, CTA accent, saga blockquote); CTAs look like Aksel buttons; TopNav + footer present; logo + saga intact. Capture observations.

- [ ] **Step 3: Commit**

```bash
git add packages/website/src/pages/index.astro
git commit -m "feat(website): restyle front page on Aksel with Vár accent identity"
```

---

## Phase 4 — Blog, playground, cleanup

### Task 9: Restyle blog + playground

**Files:**
- Modify: `packages/website/src/pages/blog/index.astro`
- Modify: `packages/website/src/pages/blog/[...slug].astro`
- Modify: `packages/website/src/pages/playground.astro`
- Modify: `packages/website/src/styles/global.css` (the `.doc-body`/`.doc-nav`/`main.doc` shared styles → token-ize)

**Interfaces:**
- Consumes: Aksel tokens.
- Produces: blog + playground on Aksel tokens; the shared `.doc-*` content styles use semantic tokens.

- [ ] **Step 1: Token-ize the shared content styles in global.css**

In `packages/website/src/styles/global.css`, update `.doc-body` (h1/h2/h3, p, ul/ol, blockquote, a, code, pre), `.doc-nav`, `.doc-footer`, and `main.doc` to use `--ax-*` tokens directly:
- headings: `font-family: var(--ax-font-family); font-weight: var(--ax-font-weight-bold);` sizes from `--ax-font-size-heading-*`.
- body text: `color: var(--ax-text-default);` links `color: var(--ax-text-accent, var(--var-accent)); text-decoration-color: var(--var-accent);`
- `blockquote`: `border-left: 4px solid var(--var-accent); background: var(--ax-bg-raised);` (the saga/identity accent stays warm).
- `code`: `background: var(--ax-bg-raised); border-radius: var(--ax-radius-4);` `pre`: `background: var(--ax-bg-sunken, var(--ax-bg-raised)); color: var(--ax-text-default);`
- `main.doc`: `max-width: 46rem; padding: var(--ax-space-32) var(--ax-space-24) var(--ax-space-64);`

- [ ] **Step 2: Restyle blog pages**

`blog/index.astro` + `blog/[...slug].astro`: `.post-list`/`.post-title`/`.post-meta` styles to tokens (`--ax-text-default`, `--ax-text-subtle`, borders `--ax-border-subtle`, spacing `--ax-space-*`). The `.post-title` already de-Monoton'd (Task 3) — ensure it uses `var(--ax-font-size-heading-medium)`.

- [ ] **Step 3: Restyle playground chrome**

`playground.astro`: it uses `main.doc` (now token-ized) — verify the page + the `<Editor>` mounts read fine on Aksel surfaces in both themes. The CodeMirror editor themes (`var-token-theme.ts`, `cm-run.ts`, `cm-generate-step.ts`) still consume the bridged legacy vars and are out of scope here (they keep working via the bridge). No change unless visibly broken.

- [ ] **Step 4: Build and verify blog + playground**

Run: `pnpm --filter @oselvar/website build && pnpm --filter @oselvar/website preview`
Expected (both themes): `/var/blog/`, a blog post, and `/var/playground` render on Aksel tokens with TopNav + footer; editors legible. Capture observations.

- [ ] **Step 5: Commit**

```bash
git add packages/website/src/pages/blog/index.astro "packages/website/src/pages/blog/[...slug].astro" packages/website/src/pages/playground.astro packages/website/src/styles/global.css
git commit -m "feat(website): restyle blog + playground on Aksel tokens"
```

---

### Task 10: Final verification sweep

**Files:** none (verification); small fixes only if a gate fails.

- [ ] **Step 1: No Monoton, no leftover bespoke palette literals in chrome**

Run:
```bash
grep -rn "Monoton" packages/website/src
grep -rn "#faf5e9\|#1a1a1a\|cursive" packages/website/src
```
Expected: no Monoton; the only remaining literal brand colors are `--var-accent`/`--var-accent-strong` (`#e67d00`/`#ffd60a`) in `global.css`. Report anything else (e.g. editor theme files intentionally keep bridged vars).

- [ ] **Step 2: Gates**

Run and confirm:
- `pnpm test docs-nav` → 10/10.
- `pnpm --filter @oselvar/website check` → no NEW errors (10 pre-existing in `idb-file-system.ts`/`var-worker.ts`).
- `pnpm --filter @oselvar/website build` → succeeds; `ls packages/website/dist/pagefind/pagefind.js` exists; the four docs URLs still build.

- [ ] **Step 3: Manual both-theme smoke test**

`pnpm --filter @oselvar/website preview`, in light AND dark, desktop AND ≤820px:
- Theme toggle in TopNav flips + persists across reload, no FOUC.
- TopNav + footer identical on front, docs, blog, playground.
- Docs: sidebar grouping + active state, breadcrumb, search (from any page) returns results, mobile drawer focus/Escape/backdrop/restore.
- Front page hero shows Vár accent; CTAs are Aksel buttons.
- Legibility/spacing comparable to aksel.nav.no/designsystemet.

- [ ] **Step 4: Commit (if any fixes were made)**

```bash
git add -A packages/website
git commit -m "chore(website): final Aksel adoption verification + fixes"
```

---

## Self-Review

**Spec coverage:**
- Foundation-only / no React-Svelte-Tailwind → Tasks 1–9 (CSS-only + vanilla TS).
- Aksel packages + granular CSS → Task 1. Token bridge → Task 2. Monoton retired → Task 3.
- Dark mode (class on `<html>`, pre-paint, localStorage, OS default, toggle) → Tasks 4 (infra) + 6 (toggle UI).
- Color: Aksel chrome + Vár accent layer → Task 2 (bridge + `--var-accent`), applied per-surface in Tasks 7–9.
- Typography: Source Sans wholesale → Tasks 1 (font) + 3 (Monoton out) + 7–9 (scale).
- Site-wide TopNav lifted out of DocsLayout → Task 6. Shared footer in foundation → Task 5.
- Emulate Aksel docs proportions → Task 7.
- Phasing foundation → docs → front → blog/playground → Tasks 1–6 / 7 / 8 / 9.
- YAGNI (no ds-react, Tailwind, TOC, i18n, NAV components) → not implemented.
- Verification each phase + both themes + static guarantee → per-task verify steps + Task 10.

**Placeholder scan:** No "TBD"/"add styling later". Where an exact Aksel token name is uncertain (`--ax-text-accent`, `--ax-bg-accent-strong`, `--ax-text-contrast`), the plan gives a concrete fallback AND instructs MCP verification — these are real values with a guard, not placeholders. Representative CSS values are concrete.

**Type/name consistency:** `window.__setTheme(next)` + `theme:change` event defined in Task 4, consumed in Task 6. `[data-docs-menu]` rendered by TopNav (Task 6), queried by the existing drawer script (unchanged). `hasSidebar` prop flows Base→TopNav (Task 6) and DocsLayout→Base (Task 6). `--var-accent`/`--var-accent-strong` defined in Task 2, used in Tasks 7–9. Bridge map defined once (Task 2), referenced by later tasks.
