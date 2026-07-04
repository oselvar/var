# bididi website Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a single-page Astro marketing site for `bididi` (`@oselvar/bididi`) deployed to GitHub Pages from `packages/website`.

**Architecture:** Static Astro site, no UI framework integration, plain CSS, Monoton via Google Fonts, thick yellow/orange poster frame. One layout + one page + one global stylesheet. Deployed via GitHub Actions on push to `main`. Spec: `doc/superpowers/specs/2026-06-10-bididi-website-design.md`.

**Tech Stack:** Astro 5.x, TypeScript, plain CSS, pnpm workspace, GitHub Actions, GitHub Pages.

---

## File map

| Path | Role |
| --- | --- |
| `packages/website/package.json` | Manifest, scripts, `private: true` |
| `packages/website/tsconfig.json` | Extends `astro/tsconfigs/strict` |
| `packages/website/astro.config.mjs` | `site`, `base`, static output |
| `packages/website/src/layouts/Base.astro` | `<html>`, head, Google Fonts link, border frame wrapper, `<slot/>` |
| `packages/website/src/pages/index.astro` | All five page sections (hero, pitch, install, quotes, footer) |
| `packages/website/src/styles/global.css` | CSS vars, reset, typography, layout primitives |
| `packages/website/public/favicon.svg` | Minimal yellow-framed `b` SVG favicon |
| `.github/workflows/website.yml` | GitHub Pages deploy |

No biome lint applies to `.astro`/`.css`/`.yml`/`.svg`. The `package.json`, `tsconfig.json`, and `astro.config.mjs` will pass through biome's formatter — keep them in the project's house style (single quotes, no semicolons, 2-space indent).

---

## Task 1: Scaffold the Astro package

**Files:**
- Create: `packages/website/package.json`
- Create: `packages/website/tsconfig.json`
- Create: `packages/website/astro.config.mjs`
- Create: `packages/website/.gitignore`

- [ ] **Step 1: Write `packages/website/package.json`**

```json
{
  "name": "@oselvar/website",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "astro dev",
    "build": "astro build",
    "preview": "astro preview",
    "check": "astro check"
  },
  "devDependencies": {
    "astro": "^5.0.0"
  }
}
```

- [ ] **Step 2: Write `packages/website/tsconfig.json`**

```json
{
  "extends": "astro/tsconfigs/strict",
  "include": [".astro/types.d.ts", "**/*"],
  "exclude": ["dist"]
}
```

- [ ] **Step 3: Write `packages/website/astro.config.mjs`**

```js
import { defineConfig } from 'astro/config'

export default defineConfig({
  site: 'https://oselvar.github.io',
  base: '/bdd',
  output: 'static',
  trailingSlash: 'ignore',
})
```

- [ ] **Step 4: Write `packages/website/.gitignore`**

```
dist/
.astro/
node_modules/
```

- [ ] **Step 5: Install dependencies**

Run from repo root: `pnpm install`
Expected: pnpm resolves astro into `packages/website/node_modules/`, updates the lockfile, no errors.

- [ ] **Step 6: Verify Astro CLI is reachable**

Run: `pnpm --filter @oselvar/website exec astro --version`
Expected: prints an Astro version `5.x.x` and exits 0.

- [ ] **Step 7: Commit**

```bash
git add packages/website/package.json packages/website/tsconfig.json packages/website/astro.config.mjs packages/website/.gitignore pnpm-lock.yaml
git commit -m "feat(website): scaffold @oselvar/website Astro package"
```

---

## Task 2: Global stylesheet

**Files:**
- Create: `packages/website/src/styles/global.css`

- [ ] **Step 1: Write `packages/website/src/styles/global.css`**

```css
:root {
  --cream: #faf5e9;
  --ink: #1a1a1a;
  --frame: #f5a524;
  --accent: #ff2e88;
  --frame-thickness: 14px;
  --frame-gap: 4px;
  --content-max: 960px;
}

@media (max-width: 720px) {
  :root {
    --frame-thickness: 8px;
    --frame-gap: 2px;
  }
}

*,
*::before,
*::after {
  box-sizing: border-box;
}

html,
body {
  margin: 0;
  padding: 0;
}

body {
  background: var(--cream);
  color: var(--ink);
  font-family: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif;
  font-size: 18px;
  line-height: 1.5;
  min-height: 100vh;
}

.frame {
  position: fixed;
  inset: var(--frame-gap);
  border: var(--frame-thickness) solid var(--frame);
  pointer-events: none;
  z-index: 100;
}

main {
  padding: calc(var(--frame-thickness) + var(--frame-gap) + 32px)
    calc(var(--frame-thickness) + var(--frame-gap) + 24px);
  max-width: var(--content-max);
  margin: 0 auto;
}

.hero {
  text-align: center;
  padding: 48px 0 24px;
}

.wordmark {
  font-family: 'Monoton', cursive;
  font-weight: 400;
  font-size: clamp(72px, 18vw, 220px);
  line-height: 0.95;
  letter-spacing: 0.02em;
  margin: 0;
  color: var(--ink);
}

.tagline {
  font-size: clamp(18px, 2.4vw, 24px);
  font-style: italic;
  margin: 16px 0 0;
  color: var(--ink);
}

.pitch {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;
  padding: 48px 0;
}

@media (max-width: 720px) {
  .pitch {
    grid-template-columns: 1fr;
  }
}

.pitch article {
  border: 2px solid var(--ink);
  padding: 24px;
  background: var(--cream);
}

.pitch h2 {
  font-family: 'Monoton', cursive;
  font-weight: 400;
  font-size: clamp(28px, 4vw, 40px);
  margin: 0 0 12px;
  letter-spacing: 0.02em;
}

.pitch p {
  margin: 0;
  font-size: 17px;
}

.install {
  padding: 24px 0 48px;
  text-align: center;
}

.install pre {
  display: inline-block;
  margin: 0;
  padding: 16px 24px;
  background: var(--ink);
  color: var(--cream);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 17px;
  border-radius: 4px;
}

.install pre::before {
  content: '$ ';
  color: var(--accent);
}

.quotes {
  padding: 48px 0;
}

.quotes h2 {
  font-family: 'Monoton', cursive;
  font-weight: 400;
  font-size: clamp(32px, 5vw, 56px);
  text-align: center;
  margin: 0 0 32px;
  letter-spacing: 0.02em;
}

.quotes ul {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 16px;
}

.quotes li {
  border: 2px solid var(--ink);
  padding: 20px;
  font-style: italic;
  font-size: 18px;
}

.quotes li::before {
  content: '“';
  font-size: 36px;
  line-height: 0;
  vertical-align: -10px;
  margin-right: 4px;
  color: var(--accent);
}

footer {
  padding: 48px 0 24px;
  text-align: center;
  font-size: 14px;
  border-top: 1px solid var(--ink);
  margin-top: 24px;
}

footer a {
  color: var(--ink);
  text-decoration: underline;
}

footer a:hover {
  color: var(--accent);
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/website/src/styles/global.css
git commit -m "feat(website): global stylesheet with frame and typography"
```

---

## Task 3: Base layout

**Files:**
- Create: `packages/website/src/layouts/Base.astro`

- [ ] **Step 1: Write `packages/website/src/layouts/Base.astro`**

```astro
---
import '../styles/global.css'

interface Props {
  title: string
  description: string
}

const { title, description } = Astro.props
---

<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="description" content={description} />
    <link rel="icon" type="image/svg+xml" href={`${import.meta.env.BASE_URL}favicon.svg`} />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      rel="stylesheet"
      href="https://fonts.googleapis.com/css2?family=Monoton&display=swap"
    />
    <title>{title}</title>
  </head>
  <body>
    <div class="frame" aria-hidden="true"></div>
    <slot />
  </body>
</html>
```

- [ ] **Step 2: Commit**

```bash
git add packages/website/src/layouts/Base.astro
git commit -m "feat(website): Base layout with Monoton font and poster frame"
```

---

## Task 4: Favicon

**Files:**
- Create: `packages/website/public/favicon.svg`

- [ ] **Step 1: Write `packages/website/public/favicon.svg`**

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect x="2" y="2" width="60" height="60" fill="#faf5e9" stroke="#f5a524" stroke-width="6"/>
  <text x="32" y="48" text-anchor="middle" font-family="Georgia, serif" font-weight="700" font-size="44" fill="#1a1a1a">b</text>
</svg>
```

- [ ] **Step 2: Commit**

```bash
git add packages/website/public/favicon.svg
git commit -m "feat(website): add favicon"
```

---

## Task 5: Front page

**Files:**
- Create: `packages/website/src/pages/index.astro`

- [ ] **Step 1: Write `packages/website/src/pages/index.astro`**

```astro
---
import Base from '../layouts/Base.astro'

const quotes = [
  'Move over vibeslop, here comes bididi',
  'BDD without the BS',
  'Like therapy for your test suite',
  'Specs you’d actually read',
  'Plain English in, working tests out',
  'Your team’s shared brain, in markdown',
]
---

<Base
  title="bididi — Behaviour-Driven Development that doesn’t make you cry"
  description="bididi turns plain-English examples into runnable specs. Discover misunderstandings, clear your head."
>
  <main>
    <section class="hero">
      <h1 class="wordmark">bididi</h1>
      <p class="tagline">Behaviour-Driven Development for people who hate ceremony.</p>
    </section>

    <section class="pitch" aria-label="What bididi gives you">
      <article>
        <h2>discover misunderstandings</h2>
        <p>
          Pin down what “done” means before anyone writes code. Bididi turns plain-English
          examples into runnable specs — the conversation becomes the test.
        </p>
      </article>
      <article>
        <h2>clear your head</h2>
        <p>
          Stop juggling intent in your head. Write the example, run it, and let the tests hold
          the shape of the feature for you.
        </p>
      </article>
    </section>

    <section class="install" aria-label="Install">
      <pre><code>pnpm add -D @oselvar/bididi</code></pre>
    </section>

    <section class="quotes" aria-label="Quotes">
      <h2>word on the street</h2>
      <ul>
        {quotes.map((q) => <li>{q}</li>)}
      </ul>
    </section>

    <footer>
      <a href="https://github.com/oselvar/bdd">github.com/oselvar/bdd</a>
      <span> · © 2026 Oselvar</span>
    </footer>
  </main>
</Base>
```

- [ ] **Step 2: Commit**

```bash
git add packages/website/src/pages/index.astro
git commit -m "feat(website): front page with hero, pitch, install, quotes, footer"
```

---

## Task 6: GitHub Pages deploy workflow

**Files:**
- Create: `.github/workflows/website.yml`

- [ ] **Step 1: Confirm the workflows directory exists**

Run: `mkdir -p .github/workflows`
Expected: directory exists, no output.

- [ ] **Step 2: Write `.github/workflows/website.yml`**

```yaml
name: Deploy website

on:
  push:
    branches: [main]
    paths:
      - 'packages/website/**'
      - '.github/workflows/website.yml'
      - 'pnpm-lock.yaml'
      - 'pnpm-workspace.yaml'
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 9.12.0

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm

      - run: pnpm install --frozen-lockfile

      - run: pnpm --filter @oselvar/website build

      - uses: actions/configure-pages@v5

      - uses: actions/upload-pages-artifact@v3
        with:
          path: packages/website/dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/website.yml
git commit -m "ci(website): deploy to GitHub Pages on push to main"
```

---

## Task 7: Verify build locally

This task has no code changes — it confirms everything compiles and the output looks right.

- [ ] **Step 1: Build the site**

Run: `pnpm --filter @oselvar/website build`
Expected: Astro reports a successful build, no errors, no warnings about missing files. Build time ~1–3 seconds.

- [ ] **Step 2: Confirm output exists**

Run: `ls packages/website/dist/`
Expected output includes at minimum:
```
favicon.svg
index.html
```

- [ ] **Step 3: Confirm the rendered HTML contains expected strings**

Run: `grep -c 'bididi' packages/website/dist/index.html`
Expected: a number ≥ 4 (wordmark, tagline reference, install snippet, title).

Run: `grep 'Move over vibeslop' packages/website/dist/index.html`
Expected: matches one line.

Run: `grep 'fonts.googleapis.com/css2?family=Monoton' packages/website/dist/index.html`
Expected: matches one line.

- [ ] **Step 4: Smoke-test the dev server (optional but recommended)**

Run: `pnpm --filter @oselvar/website dev` in one terminal.
Open `http://localhost:4321/bdd/` in a browser.
Expected: yellow/orange poster frame around the viewport; massive `bididi` wordmark in Monoton; two pitch cards; install snippet with a magenta `$`; six quotes; footer with GitHub link.
Kill the dev server with Ctrl-C.

- [ ] **Step 5: Confirm root checks still pass**

Run: `pnpm lint`
Expected: biome reports `Checked N files in Xms. No fixes applied.` — no errors.

Run: `pnpm test`
Expected: existing vitest suites still pass; the website package has no tests and is ignored by vitest.

- [ ] **Step 6: No commit needed — this task is verification only.**

---

## Done criteria

- All seven tasks committed.
- `packages/website/dist/index.html` exists after `pnpm --filter @oselvar/website build`.
- Visual check in a browser matches the spec's layout.
- `pnpm lint` and `pnpm test` still pass at repo root.
- The workflow YAML is valid (GitHub Actions UI will surface any errors on first push, but `actionlint` is not required here).
