# Tailwind v4 Adoption Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the website's hand-written CSS with Tailwind v4 utilities and remove `@navikt/ds-css`, preserving the earthy light/dark theme and class-based dark mode. CodeMirror styling stays untouched.

**Architecture:** Strangler-fig migration in `packages/website`. Tailwind v4 (CSS-first, `@tailwindcss/vite`) is added alongside ds-css. The earthy colors are re-homed into Tailwind `@theme` under new idiomatic token names; the old `--ax-*` color tokens are *bridged* (`--ax-bg-default: var(--surface)`) so unconverted components stay pixel-identical. Components convert to utilities one at a time. ds-css imports, the bridge tokens, and the dead aliases are deleted in the final task, after every consumer is converted.

**Tech Stack:** Astro 7, Tailwind CSS v4 (`@tailwindcss/vite`), `@tailwindcss/typography`, `@fontsource-variable/source-sans-3`, CodeMirror (out of scope).

## Global Constraints

- **Scope:** `packages/website` only. Do not touch any other package.
- **CodeMirror is out of scope.** Never modify `src/lib/cm-var-theme.ts`, `src/lib/var-token-theme.ts`, `src/lib/cm-generate-step.ts`, or the `--ed-*` / `--syn-*` CSS-variable blocks. They are consumed by `var()` and must keep working.
- **Theme values do not change.** This is a refactor of *where* colors live, not *what* they are. The rendered site must look identical (modulo the deliberately-unchanged Source Sans 3 font) until ds-css is removed; after removal, still identical.
- **Bold is 600, not 700.** Aksel's `--ax-font-weight-bold` is `600` → use `font-semibold`. Only the doc `<strong>` (which was explicitly `700`) uses `font-bold`.
- **Square corners.** All radii are 0. Any rounded need uses `rounded-none`; the radius scale is zeroed in `@theme`.
- **Each task ends green:** `pnpm --filter @oselvar/website build` exits 0 AND the page renders unchanged in both light and dark mode.

### Color token map (use everywhere)

| old (`--ax-*` / `--var-*`) | utility |
|---|---|
| `--ax-bg-default` | `bg-surface` |
| `--ax-bg-raised` | `bg-raised` |
| `--ax-bg-sunken` | `bg-sunken` |
| `--ax-bg-accent-strong` | `bg-strong` |
| `--ax-bg-accent-strong-hover` | `bg-strong-hover` (usually `hover:bg-strong-hover`) |
| `--ax-text-default` | `text-ink` |
| `--ax-text-subtle` | `text-subtle` |
| `--ax-text-neutral-subtle` | `text-muted` |
| `--ax-text-accent` / `--var-accent` | `text-accent` (or `border-accent`) |
| `--ax-text-accent-contrast` | `text-accent-contrast` |
| `--ax-border-subtle` | `border-line-subtle` |
| `--ax-border-neutral-subtle` | `border-line-subtle` |
| `--ax-border-default` | `border-line` |
| `--var-accent-strong` | `text-highlight` / `bg-highlight` |

### Spacing map (`--ax-space-N` → utility number = N/4)

`4→1`, `8→2`, `12→3`, `16→4`, `20→5`, `24→6`, `32→8`, `40→10`, `48→12`, `64→16`. (e.g. `padding: var(--ax-space-24)` → `p-6`; `gap: var(--ax-space-16)` → `gap-4`.)

### Font-size map

`--ax-font-size-small` (.875rem) → `text-sm` · `--ax-font-size-large` (1.125rem) → `text-lg` · `--ax-font-size-heading-small` (1.25rem) → `text-xl` · `--ax-font-size-heading-medium` (1.5rem) → `text-2xl` · `--ax-font-size-heading-large` (1.75rem) → `text-[1.75rem]`.

### Other

- `1px solid <color>` border → Tailwind `border` (1px) + `border-<color>` (+ side, e.g. `border-b`).
- `--ax-font-family` → `font-sans`. `--ax-radius-*` / `--radius-5` → `rounded-none`.
- Non-token literal values stay as arbitrary utilities, e.g. `width: 2.25rem` → `w-9`, `font-size: 14px` → `text-[14px]`, `clamp(...)` → `text-[clamp(...)]`.

---

## Task 1: Install and wire Tailwind v4, typography plugin, and self-hosted font

**Files:**
- Modify: `packages/website/package.json`
- Modify: `packages/website/astro.config.mjs`
- Modify: `packages/website/src/layouts/Base.astro`
- Modify: `packages/website/src/styles/global.css:1` (add one import line at top)

**Interfaces:**
- Produces: Tailwind utilities available site-wide; `font-sans` resolves to Source Sans 3; `@tailwindcss/typography` registered for Task 3.

- [ ] **Step 1: Add dependencies**

Run from repo root:
```bash
pnpm --filter @oselvar/website add tailwindcss @tailwindcss/vite @tailwindcss/typography @fontsource-variable/source-sans-3
```
This adds all four to `packages/website/package.json` `dependencies` and installs them.

- [ ] **Step 2: Wire the Vite plugin in `astro.config.mjs`**

Replace the file contents with:
```js
import mdx from '@astrojs/mdx'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'astro/config'
import pagefind from 'astro-pagefind'

export default defineConfig({
  site: 'https://oselvar.github.io',
  base: '/var',
  output: 'static',
  trailingSlash: 'ignore',
  integrations: [mdx(), pagefind()],
  vite: {
    plugins: [tailwindcss()],
  },
})
```

- [ ] **Step 3: Add the Tailwind import at the top of `global.css`**

Insert as the very first line of `packages/website/src/styles/global.css` (before the existing `:root {`):
```css
@import 'tailwindcss';
```

- [ ] **Step 4: Import the font in `Base.astro`**

In `packages/website/src/layouts/Base.astro`, add the font import alongside the existing imports (keep the five ds-css imports for now — they are removed in the final task):
```astro
import '@fontsource-variable/source-sans-3'
```
Place it just above `import '../styles/global.css'`.

- [ ] **Step 5: Verify the build is green**

Run:
```bash
pnpm --filter @oselvar/website build
```
Expected: exits 0. (Tailwind is active but no utilities are used yet, so the site looks unchanged.)

- [ ] **Step 6: Commit**

```bash
git add packages/website/package.json packages/website/pnpm-lock.yaml pnpm-lock.yaml packages/website/astro.config.mjs packages/website/src/layouts/Base.astro packages/website/src/styles/global.css
git commit -m "build(website): add Tailwind v4, typography plugin, self-hosted Source Sans 3"
```
(Add whichever lockfile actually changed; `git status` will show it.)

---

## Task 2: Author the theme/token layer in `global.css`

Re-home the earthy colors into new idiomatic CSS vars + Tailwind `@theme`, and **bridge** the old `--ax-*` color tokens to them so unconverted components are unaffected. This task is purely additive in effect: the site must look identical afterward.

**Files:**
- Modify: `packages/website/src/styles/global.css:1-109` (the `:root`, `:root,.light`, and `.dark` blocks)

**Interfaces:**
- Produces: utilities `bg-surface bg-raised bg-sunken bg-strong bg-strong-hover text-ink text-subtle text-muted text-accent text-accent-contrast text-highlight bg-highlight border-line border-line-subtle border-accent`, all dark-mode aware; `font-sans`; zeroed radius scale; `dark:` variant bound to `.dark` class.

- [ ] **Step 1: Replace the top of `global.css` (lines 1 through 109) with the new token layer**

Replace everything from line 1 (`:root {`) through the end of the `.dark { … }` block (the line `}` at line 109) with the following. **Keep the `--ed-*` and `--syn-*` lines exactly as they are now** — they are reproduced verbatim below inside the light/dark blocks:

```css
@import 'tailwindcss';
@plugin '@tailwindcss/typography';

/* Dark mode follows the .dark class on <html> (set by the inline script in
   Base.astro). */
@custom-variant dark (&:where(.dark, .dark *));

/* Static scales. */
@theme {
  --font-sans: 'Source Sans 3 Variable', 'Source Sans 3', system-ui, sans-serif;

  /* Square corners — zero the whole radius scale. */
  --radius-xs: 0;
  --radius-sm: 0;
  --radius-md: 0;
  --radius-lg: 0;
  --radius-xl: 0;
  --radius-2xl: 0;
  --radius-3xl: 0;
}

/* Semantic colors → Tailwind utilities. `inline` means the utilities emit
   var(--…) references, so they resolve per-mode at runtime. */
@theme inline {
  --color-surface: var(--surface);
  --color-raised: var(--raised);
  --color-sunken: var(--sunken);
  --color-ink: var(--ink);
  --color-subtle: var(--subtle);
  --color-muted: var(--muted);
  --color-accent: var(--accent);
  --color-accent-contrast: var(--accent-contrast);
  --color-strong: var(--strong);
  --color-strong-hover: var(--strong-hover);
  --color-highlight: var(--highlight);
  --color-line: var(--line);
  --color-line-subtle: var(--line-subtle);
}

/* ── Earthy theme · LIGHT (Umber & Linen) ─────────────────────────────── */
:root,
.light {
  --surface: #f4f0e6; /* linen */
  --raised: #fbf8f0; /* cards, editor, code */
  --sunken: #ece5d5; /* fenced code blocks */
  --ink: #2a2017; /* umber — also the legacy --ink alias for CodeMirror */
  --subtle: #6b5d4c;
  --muted: #8a7b66;
  --accent: #b0552f; /* burnt sienna — links + identity accent */
  --accent-contrast: #fbf8f0;
  --strong: #3b2e20; /* brown buttons */
  --strong-hover: #2a2017;
  --highlight: #c8924a; /* warm tan */
  --line: #c8bba3;
  --line-subtle: #dcd3c0;

  /* Legacy aliases still read by CodeMirror code (out of scope). */
  --yellow: var(--highlight);

  /* Bridge: keep the old Aksel color tokens resolving to the new ones so
     not-yet-converted components stay identical. Removed in the final task. */
  --ax-bg-default: var(--surface);
  --ax-bg-raised: var(--raised);
  --ax-bg-sunken: var(--sunken);
  --ax-text-default: var(--ink);
  --ax-text-subtle: var(--subtle);
  --ax-text-neutral-subtle: var(--muted);
  --ax-text-accent: var(--accent);
  --ax-text-accent-contrast: var(--accent-contrast);
  --ax-bg-accent-strong: var(--strong);
  --ax-bg-accent-strong-hover: var(--strong-hover);
  --ax-border-subtle: var(--line-subtle);
  --ax-border-neutral-subtle: var(--line-subtle);
  --ax-border-default: var(--line);
  --var-accent: var(--accent);
  --var-accent-strong: var(--highlight);

  /* Editor (CodeMirror — out of scope, unchanged) */
  --ed-bg: #fbf8f0;
  --ed-text: #2a2017;
  --ed-gutter: #8a7b66;
  --ed-selection: #e4dac4;
  --ed-pass-bg: rgba(0, 158, 115, 0.15);
  --ed-fail-bg: rgba(213, 84, 0, 0.15);
  --ed-pass-mark: #009e73;
  --ed-fail-mark: #d55e00;
  --ed-step-bg: #5e9488;
  --ed-step-text: #fbf8f0;
  --ed-chip-bg: #3b2e20;
  --ed-chip-text: #f4f0e6;
  --ed-flash: rgba(94, 148, 136, 0.4);

  /* Syntax (CodeMirror — out of scope, unchanged) */
  --syn-keyword: #9a3e1b;
  --syn-string: #5e7a4e;
  --syn-comment: #a08c72;
  --syn-function: #7a5c2e;
  --syn-number: #8a5a2b;
  --syn-heading: #3b2e20;
  --syn-meta: #8a7b66;
}

/* ── Earthy theme · WARM DARK ─────────────────────────────────────────── */
.dark {
  --surface: #17120d;
  --raised: #221a12;
  --sunken: #110d09;
  --ink: #efe7d7;
  --subtle: #b7a892;
  --muted: #94866f;
  --accent: #cc6b3c; /* terracotta */
  --accent-contrast: #17120d;
  --strong: #cc6b3c;
  --strong-hover: #d9743f;
  --highlight: #d9a441;
  --line: #6a523b;
  --line-subtle: #3a2e22;

  --yellow: var(--highlight);

  /* Bridge (removed in final task) */
  --ax-bg-default: var(--surface);
  --ax-bg-raised: var(--raised);
  --ax-bg-sunken: var(--sunken);
  --ax-text-default: var(--ink);
  --ax-text-subtle: var(--subtle);
  --ax-text-neutral-subtle: var(--muted);
  --ax-text-accent: var(--accent);
  --ax-text-accent-contrast: var(--accent-contrast);
  --ax-bg-accent-strong: var(--strong);
  --ax-bg-accent-strong-hover: var(--strong-hover);
  --ax-border-subtle: var(--line-subtle);
  --ax-border-neutral-subtle: var(--line-subtle);
  --ax-border-default: var(--line);
  --var-accent: var(--accent);
  --var-accent-strong: var(--highlight);

  /* Editor (CodeMirror — out of scope, unchanged) */
  --ed-bg: #221a12;
  --ed-text: #efe7d7;
  --ed-gutter: #7c6e58;
  --ed-selection: #3a2e22;
  --ed-pass-bg: rgba(0, 158, 115, 0.24);
  --ed-fail-bg: rgba(213, 84, 0, 0.26);
  --ed-pass-mark: #2fb88e;
  --ed-fail-mark: #f2772b;
  --ed-step-bg: #6fa89b;
  --ed-step-text: #17120d;
  --ed-chip-bg: #8a6b4a;
  --ed-chip-text: #17120d;
  --ed-flash: rgba(111, 168, 155, 0.45);

  /* Syntax (CodeMirror — out of scope, unchanged) */
  --syn-keyword: #e08a57;
  --syn-string: #9cbe82;
  --syn-comment: #7c6e58;
  --syn-function: #d4a24c;
  --syn-number: #d38b4e;
  --syn-heading: #efe7d7;
  --syn-meta: #94866f;
}
```

Note what was intentionally dropped: the no-longer-used `--page-gutter`, `--content-max`, the `--ax-radius-*`/`--radius-5` zero-overrides (now handled by the zeroed `@theme` radius scale — but `--radius-5` is still read by `Editor.astro` until Task 8, so the bridge for it is added there; see Task 8 note), and the dead `--cream`/`--orange`/`--accent` aliases (0 uses). **Keep** `--content-max`/`--page-gutter` only if Step 2 below finds them still referenced.

- [ ] **Step 2: Confirm no surviving references to dropped vars**

Run:
```bash
cd packages/website && grep -rn "page-gutter\|content-max\|--radius-5\|var(--cream)\|var(--orange)\|var(--accent)" src/
```
Expected: the only hits are `--radius-5` in `src/components/Editor.astro` (handled in Task 8) and `--content-max`/`--page-gutter` inside `src/styles/global.css`'s own `main`/`:root` base rules (converted in Task 3). If `--content-max` or `--page-gutter` appear in any **component**, re-add them to the `:root` block. If `var(--cream)`/`var(--orange)`/`var(--accent)` appear anywhere, stop and reconsider — they were expected to be dead.

- [ ] **Step 3: Verify the build is green and the site is visually unchanged**

Run:
```bash
pnpm --filter @oselvar/website build
```
Expected: exits 0. Then `pnpm --filter @oselvar/website dev`, open the landing page, a doc page, and the playground; toggle light/dark. Expected: **identical** to before (font may differ slightly now that Source Sans 3 is self-hosted — that is the intended and only change).

- [ ] **Step 4: Commit**

```bash
git add packages/website/src/styles/global.css
git commit -m "refactor(website): re-home theme colors into Tailwind @theme, bridge --ax-* tokens"
```

---

## Task 3: Convert base + Markdown (`.doc-body`) styles to Tailwind/prose

Convert the remaining `global.css` base rules (`*`, `html`, `body`, `main`, `main.doc`) and replace the hand-written `.doc-body` element rules with `@tailwindcss/typography` `prose`, themed to our tokens.

**Files:**
- Modify: `packages/website/src/styles/global.css` (remove base + `.doc-body` rules; add prose theming)
- Modify: `packages/website/src/layouts/Base.astro` (body utilities)
- Modify: `packages/website/src/layouts/DocsLayout.astro:31` (add `prose` to the article)
- Modify: `packages/website/src/pages/blog/[...slug].astro:24` (add `prose` to the article)

**Interfaces:**
- Consumes: color utilities + `font-sans` from Task 2.
- Produces: `.doc-body` container styled by prose; CopyButton's `.doc-body .code-block` hook preserved (the `doc-body` class stays).

- [ ] **Step 1: Move body styling onto `<body>` in `Base.astro`**

In `Base.astro`, change `<body>` to:
```astro
<body class="bg-surface text-ink font-sans text-lg leading-[1.6] min-h-screen">
```
(Replaces global.css `body { background; color; font-family; font-size:1.125rem; line-height:1.6; min-height:100vh }`. Preflight already supplies `box-sizing`, the margin/padding reset, and `html`/`body` zeroing.)

- [ ] **Step 2: Theme prose + keep the page container, in `global.css`**

Delete from `global.css` these rule sets entirely (they are now handled by Preflight, body utilities, or prose): the `*,*::before,*::after`, `html,body`, `body`, and **all** `.doc-body …` rules. Replace `main { … }` and `main.doc { … }` and the `.doc-nav` rules per the notes below, then append this prose theming block:

```css
/* Default page container (was `main`). Applied via the .page class. */
.page {
  max-width: 760px;
  margin-inline: auto;
  padding: 48px;
}

/* Markdown body: prose themed to the earthy palette. The `doc-body` class is
   kept as a JS/CopyButton hook; `prose` does the styling. */
.doc-body {
  --tw-prose-body: var(--ink);
  --tw-prose-headings: var(--ink);
  --tw-prose-links: var(--accent);
  --tw-prose-bold: var(--ink);
  --tw-prose-counters: var(--subtle);
  --tw-prose-bullets: var(--line);
  --tw-prose-hr: var(--line-subtle);
  --tw-prose-quotes: var(--ink);
  --tw-prose-quote-borders: var(--accent);
  --tw-prose-code: var(--ink);
  --tw-prose-pre-code: var(--ink);
  --tw-prose-pre-bg: var(--sunken);
  --tw-prose-th-borders: var(--line);
  --tw-prose-td-borders: var(--line-subtle);
}
```
- `.doc-nav` (Breadcrumb's class) is owned by `Breadcrumb.astro`'s own scoped style today AND duplicated in global.css. Delete the global.css `.doc-nav …` rules; Breadcrumb is converted in Task 5.
- The legacy `main`/`main.doc` selectors are replaced by the `.page` class; apply `.page` in Step 4 and wherever a bare `<main>` relied on the old global rule (blog/playground pages handle their own `<main>` in Task 9).

- [ ] **Step 3: Add `prose` (themed) to the two Markdown containers**

In `DocsLayout.astro:31`, change:
```astro
<article class="doc-body prose max-w-none prose-headings:font-semibold prose-h1:text-[1.75rem] prose-h1:leading-[1.05] prose-h2:text-2xl prose-h3:text-xl prose-a:no-underline prose-a:underline prose-a:decoration-accent prose-a:decoration-2 prose-a:underline-offset-2" data-pagefind-body>
```
In `blog/[...slug].astro:24`, change `<article class="doc-body">` to the same `class="doc-body prose max-w-none prose-headings:font-semibold prose-h2:text-2xl prose-h3:text-xl prose-a:decoration-accent prose-a:decoration-2 prose-a:underline-offset-2"`.

(`prose-a:no-underline prose-a:underline` is a no-op pair — drop it; links are underlined by prose default. Keep the decoration overrides to match the old accent 2px underline.)

- [ ] **Step 4: Apply `.page` to the default `<main>`s**

Search for bare default-width `<main>` usages and add `class="page"`:
```bash
cd packages/website && grep -rn "<main" src/pages src/layouts
```
For each `<main>` that previously relied on the global `main {}` rule (e.g. `docs/index.astro`, `blog/index.astro`), add `class="page"`. Pages with their own `<main class="landing">` / `<main class="playground">` are handled in their own tasks (10, 9). DocsLayout uses `.docs-shell`, not `.page`.

- [ ] **Step 5: Verify a doc page and a blog post render correctly in both modes**

```bash
pnpm --filter @oselvar/website build && pnpm --filter @oselvar/website dev
```
Open a docs page (e.g. `/var/docs/start-here/hello-var-your-first-spec`) and a blog post. Check: headings are semibold at the right sizes, links are sienna with a 2px accent underline, blockquotes have the accent left-border, fenced code uses the sunken bg, tables read correctly. Toggle dark mode. Compare against `git stash`-ed `main` if unsure.

- [ ] **Step 6: Commit**

```bash
git add packages/website/src/styles/global.css packages/website/src/layouts/Base.astro packages/website/src/layouts/DocsLayout.astro "packages/website/src/pages/blog/[...slug].astro" packages/website/src/pages/docs/index.astro packages/website/src/pages/blog/index.astro
git commit -m "refactor(website): convert base + Markdown styles to Tailwind prose"
```
(Only stage the page files you actually edited in Step 4.)

---

## Task 4: Convert `TopNav.astro` + `ThemeToggle.astro`

**Files:**
- Modify: `packages/website/src/components/TopNav.astro`
- Modify: `packages/website/src/components/ThemeToggle.astro`

- [ ] **Step 1: TopNav — apply utilities, delete `<style>`**

Apply these classes, then delete the entire `<style>` block:
- `.topnav` → `sticky top-0 z-50 flex items-center gap-4 px-6 py-3 bg-surface border-b border-line-subtle`
- `.topnav__icon` → `inline-flex items-center justify-center w-9 h-9 text-ink no-underline hover:text-accent`
- `.topnav__brand` → `flex items-center gap-2 font-semibold text-lg text-ink no-underline whitespace-nowrap`
- `.topnav__links` → `flex gap-4 max-[820px]:hidden` ; each link `<a>` → `text-ink no-underline hover:text-accent`
- `.topnav__search` → `ml-auto w-[clamp(10rem,22vw,18rem)]`
- `.topnav__menu` → `hidden max-[820px]:block max-[820px]:order-first bg-none border-0 text-[1.4rem] cursor-pointer text-ink`

(The `@media (max-width:820px)` rules become the `max-[820px]:` variants above: links hidden, menu shown + `order-first`.)

- [ ] **Step 2: ThemeToggle — apply utilities, keep the two `:global(html.light/dark)` icon rules**

- `.theme-toggle` → `bg-none border border-line-subtle cursor-pointer rounded-none w-9 h-9 text-ink text-base leading-none hover:bg-raised`

The two icon-visibility rules use `html.light`/`html.dark` global selectors that can't be expressed as element utilities cleanly. Keep a minimal scoped block:
```astro
<style>
  :global(html.light) .theme-toggle__sun { display: none; }
  :global(html.dark) .theme-toggle__moon { display: none; }
</style>
```

- [ ] **Step 3: Verify + commit**

```bash
pnpm --filter @oselvar/website build
```
Dev-check the header in both modes (sticky, hover sienna, mobile menu < 820px, toggle icon flips). Then:
```bash
git add packages/website/src/components/TopNav.astro packages/website/src/components/ThemeToggle.astro
git commit -m "refactor(website): convert TopNav and ThemeToggle to Tailwind utilities"
```

---

## Task 5: Convert `SiteFooter.astro` + `Breadcrumb.astro`

**Files:**
- Modify: `packages/website/src/components/SiteFooter.astro`
- Modify: `packages/website/src/components/Breadcrumb.astro`

- [ ] **Step 1: SiteFooter — apply utilities, delete `<style>`**

- `.site-footer` → `border-t border-line-subtle px-6 py-8 mt-16 flex flex-wrap gap-4 items-center justify-between text-sm text-subtle`
- `.site-footer nav` → on the `<nav>`: `flex gap-5 flex-wrap`
- `.site-footer a` → each `<a>`: `text-ink no-underline hover:underline`
- `.site-footer__legal` → `m-0`

- [ ] **Step 2: Breadcrumb — apply utilities, delete `<style>`**

- `.doc-nav` → `text-sm text-subtle mb-6`
- `.doc-nav a` → `text-ink no-underline hover:underline`
- the separator `<span aria-hidden="true">` → `text-subtle mx-1`

- [ ] **Step 3: Verify + commit**

```bash
pnpm --filter @oselvar/website build
```
Dev-check footer + a doc breadcrumb in both modes. Then:
```bash
git add packages/website/src/components/SiteFooter.astro packages/website/src/components/Breadcrumb.astro
git commit -m "refactor(website): convert SiteFooter and Breadcrumb to Tailwind utilities"
```

---

## Task 6: Convert `DocsSidebar.astro` + `DocsLayout.astro`

**Files:**
- Modify: `packages/website/src/components/DocsSidebar.astro`
- Modify: `packages/website/src/layouts/DocsLayout.astro`

- [ ] **Step 1: DocsSidebar — apply utilities, delete `<style>`**

- `.docs-sidebar__group` → `mb-6`
- `.docs-sidebar__label` → `text-sm font-semibold text-subtle uppercase tracking-[0.04em] mb-2`
- `.docs-sidebar__caption` → `block normal-case tracking-normal text-sm opacity-70`
- `.docs-sidebar ul` → `list-none p-0 m-0` ; `.docs-sidebar li` → `my-0.5`
- `.docs-sidebar a` → `block px-2 py-1 text-ink no-underline rounded-none hover:bg-raised`
- `.docs-sidebar a.is-current` → add `bg-raised text-accent font-semibold shadow-[inset_2px_0_0_var(--accent)]`
- `.docs-sidebar__empty` → `m-0 px-2 py-1 text-subtle`

(`var(--ax-space-4) var(--ax-space-8)` padding = `py-1 px-2`. The `is-current` inset box-shadow uses the `--accent` token directly via arbitrary value.)

- [ ] **Step 2: DocsLayout — convert `.docs-shell` grid, keep the mobile-drawer behavior**

The desktop grid + the `is-open` drawer toggling (driven by JS adding `.is-open`) is awkward as pure utilities because `.is-open` is a runtime class on the shell. Convert the static rules to utilities on the elements and keep a **small** scoped block only for the `.is-open`-dependent and backdrop rules:

Element utilities:
- `.docs-shell` → `grid grid-cols-[280px_minmax(0,1fr)] gap-12 max-w-[1200px] mx-auto px-6 pt-8 pb-16 max-[820px]:grid-cols-[minmax(0,1fr)]`
- `.docs-shell__main` → `min-w-0 max-w-[46rem]`
- `.docs-shell__sidebar` → `sticky top-16 self-start max-h-[calc(100vh-5rem)] overflow-y-auto max-[820px]:fixed max-[820px]:top-0 max-[820px]:left-0 max-[820px]:bottom-0 max-[820px]:z-[60] max-[820px]:w-[280px] max-[820px]:max-h-none max-[820px]:p-6 max-[820px]:bg-surface max-[820px]:border-r max-[820px]:border-line-subtle max-[820px]:-translate-x-full max-[820px]:transition-transform max-[820px]:duration-200`

Keep this scoped block for the runtime-class-dependent bits (backdrop default-hidden + open states):
```astro
<style>
  .docs-shell__backdrop { display: none; }
  @media (max-width: 820px) {
    .docs-shell.is-open .docs-shell__sidebar { transform: translateX(0); }
    .docs-shell.is-open .docs-shell__backdrop {
      display: block; position: fixed; inset: 0; z-index: 55;
      background: color-mix(in srgb, var(--ink) 40%, transparent);
    }
  }
</style>
```
(Note: the backdrop's `var(--ax-text-default)` becomes `var(--ink)`.)

- [ ] **Step 3: Verify + commit**

```bash
pnpm --filter @oselvar/website build
```
Dev-check the docs layout: desktop two-column grid, sticky sidebar, current-item accent inset bar; shrink < 820px and toggle the mobile drawer (open slides in, backdrop appears). Both modes. Then:
```bash
git add packages/website/src/components/DocsSidebar.astro packages/website/src/layouts/DocsLayout.astro
git commit -m "refactor(website): convert DocsSidebar and DocsLayout to Tailwind utilities"
```

---

## Task 7: Convert `MoreInArea.astro` + `Search.astro` + `CopyButton.astro`

**Files:**
- Modify: `packages/website/src/components/MoreInArea.astro`
- Modify: `packages/website/src/components/Search.astro`
- Modify: `packages/website/src/components/CopyButton.astro`

- [ ] **Step 1: MoreInArea — apply utilities, delete `<style>`**

- `.more-in-area` → `mt-12 pt-6 border-t border-line-subtle`
- `.more-in-area__next` → `inline-block px-4 py-3 border border-line rounded-none no-underline text-ink hover:bg-raised`
- `.more-in-area__kicker` → `block text-sm uppercase tracking-[0.04em] text-subtle`
- `.more-in-area__title` → `font-semibold`

- [ ] **Step 2: Search — keep the `<style is:global>`, just swap tokens**

`Search.astro` styles third-party Pagefind web-component internals via `::part()` and global selectors — these **cannot** be Tailwind utilities (no element to put classes on). Keep the `<style is:global>` block but replace the `--ax-*`/radius tokens with the new ones:
- `--ax-bg-default` → `var(--surface)`, `--ax-text-default` → `var(--ink)`, `--ax-border-default` → `var(--line)`, `--ax-radius-8` → `0`.

Resulting block:
```astro
<style is:global>
  .docs-search { display: contents; }
  .docs-search pagefind-searchbox { width: 100%; max-width: 28rem; }
  .docs-search .pagefind-ui__search-input,
  pagefind-searchbox::part(input) {
    background: var(--surface);
    color: var(--ink);
    border: 1px solid var(--line);
    border-radius: 0;
    font-size: 14px;
  }
  pagefind-searchbox::part(results) { z-index: 70; }
</style>
```

- [ ] **Step 3: CopyButton — apply utilities where possible; keep a scoped block for hover/opacity state machine**

`.copybtn` is injected and toggled (`.copybtn--active`, hover-reveal driven by `.doc-body .code-block:hover`). Put the static look on utilities if the button markup is authored here; but the show/hide logic depends on parent-hover and runtime classes, so keep a scoped block with tokens swapped. Replace the whole `<style is:global>` with (tokens updated `--ax-bg-default`→`--surface`, `--ax-text-subtle`→`--subtle`, `--ax-text-default`→`--ink`, `--ax-bg-raised`→`--raised`, `--ax-border-subtle`→`--line-subtle`, radii→0):
```astro
<style is:global>
  .doc-body .code-block { position: relative; }
  .copybtn {
    position: absolute; top: 8px; right: 8px;
    display: inline-flex; align-items: center; justify-content: center;
    width: 2rem; height: 2rem; padding: 0;
    border: 1px solid var(--line-subtle); border-radius: 0;
    background: var(--surface); color: var(--subtle);
    cursor: pointer; opacity: 0;
    transition: opacity 0.12s ease, color 0.12s ease, background 0.12s ease;
  }
  .doc-body .code-block:hover .copybtn,
  .copybtn:focus-visible,
  .copybtn.copybtn--active { opacity: 1; }
  .copybtn:hover { color: var(--ink); background: var(--raised); }
  .copybtn__icon { width: 1.15rem; height: 1.15rem; }
  .copybtn__icon--check { display: none; }
  .copybtn--active { color: var(--ink); }
  .copybtn--active .copybtn__icon--copy { display: none; }
  .copybtn--active .copybtn__icon--check { display: inline; }
  @media (hover: none) { .copybtn { opacity: 1; } }
</style>
```
(Rationale: this is a hover/state-machine on JS-injected markup over Markdown-rendered code blocks; utilities would need `group`/`peer` plumbing on elements we don't author. Token-swapping the scoped block is the honest minimal change. CodeMirror is untouched.)

- [ ] **Step 4: Verify + commit**

```bash
pnpm --filter @oselvar/website build
```
Dev-check: "More in area" footer link; the docs search box border/colors; hover a fenced code block and confirm the copy button reveals, click it and confirm the check icon swaps. Both modes. Then:
```bash
git add packages/website/src/components/MoreInArea.astro packages/website/src/components/Search.astro packages/website/src/components/CopyButton.astro
git commit -m "refactor(website): convert MoreInArea to utilities; retoken Search and CopyButton"
```

---

## Task 8: Convert `Editor.astro`

**Files:**
- Modify: `packages/website/src/components/Editor.astro`

**Note:** `.cm-mount` uses `var(--radius-5)` and the `.fe-bar` uses `var(--ink)`. The CodeMirror inner styling (`:global(.cm-editor)`) stays scoped. `--ink` still exists (kept in Task 2). `--radius-5` was dropped in Task 2 — replace it with `rounded-none`/`0` here, do not reintroduce the token.

- [ ] **Step 1: Apply utilities to the wrapper elements; keep `:global(.cm-*)` scoped**

- `.cm-mount` → `border border-line-subtle rounded-none overflow-hidden my-6`
- `.file-editor` → `my-6`
- `.fe-bar` → `px-[14px] py-2 bg-line-subtle text-ink font-mono text-[14px] font-semibold tracking-[0.01em]`

(`bg-line-subtle`: the bar background was `var(--ax-border-subtle)` → `bg-line-subtle`. `--ink` text → `text-ink`. `font-mono` = the `ui-monospace,…` stack via Tailwind's default `--font-mono`. `8px 14px` → `py-2 px-[14px]`. `24px 0` margin → `my-6`.)

Keep a scoped block for the CodeMirror-internal selectors and the nested-margin reset:
```astro
<style>
  .cm-mount :global(.cm-editor) { font-size: 14px; }
  .cm-mount :global(.cm-editor.cm-focused) { outline: none; }
  .file-editor .cm-mount { margin: 0; }
</style>
```

- [ ] **Step 2: Verify + commit**

```bash
pnpm --filter @oselvar/website build
```
Dev-check the editor on the landing page and an `Editor` with a `filename` (the `.fe-bar` header). Confirm border, square corners, mono header bar. Both modes. Then:
```bash
git add packages/website/src/components/Editor.astro
git commit -m "refactor(website): convert Editor chrome to Tailwind utilities"
```

---

## Task 9: Convert `docs/index.astro` + `blog/index.astro` + `blog/[...slug].astro` + `playground.astro`

**Files:**
- Modify: `packages/website/src/pages/docs/index.astro`
- Modify: `packages/website/src/pages/blog/index.astro`
- Modify: `packages/website/src/pages/blog/[...slug].astro`
- Modify: `packages/website/src/pages/playground.astro`

- [ ] **Step 1: docs/index cards — apply utilities, delete `<style>`**

- `.docs-cards` → `grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-5 my-10`
- `.docs-card` → `border border-line-subtle rounded-none p-6`
- `.docs-card__kind` → `uppercase text-sm tracking-[0.04em] text-subtle m-0`
- `.docs-card h2` → `font-sans font-semibold text-xl mt-1 mb-3`
- `.docs-card ul` → `list-none p-0 m-0` ; `.docs-card li` → `my-1.5`
- `.docs-card__empty` → `text-[14px] opacity-60 m-0`

(`gap:20px`→`gap-5`, `margin:40px 0`→`my-10`, `heading-small`→`text-xl`, `4px 0 12px`→`mt-1 mb-3`, `6px`→`my-1.5`.)

- [ ] **Step 2: blog/index — apply utilities, delete `<style>`**

- `.post-list` → `list-none p-0 my-8`
- `.post-list li` → `py-4 border-b border-line-subtle`
- `.post-title` → `font-sans font-semibold text-2xl text-ink no-underline hover:text-accent`
- `.post-list time` → `block text-[13px] text-muted my-1`
- `.post-list p` → `mt-1.5 mb-0`

(`var(--ax-space-32) 0`→`my-8`, `var(--ax-space-16) 0`→`py-4`, `--ax-border-neutral-subtle`→`border-line-subtle`, `heading-medium`→`text-2xl`, `4px 0`→`my-1`, `6px 0 0`→`mt-1.5`.)

- [ ] **Step 3: blog/[...slug] — apply utilities, delete `<style>`**

- `.post-meta` → `text-[13px] text-muted mb-6`

(The `prose` class on the `.doc-body` article was added in Task 3.)

- [ ] **Step 4: playground — apply utilities to `<main class="playground">`, delete `<style>`**

Change `<main class="playground">` → `<main class="playground max-w-[62rem] mx-auto px-4 pt-20 pb-20">` and delete the `<style>` block. (The old `main.playground` only overrode `max-width` + horizontal padding on top of the global `main`; reproduce the full container here since the global `main` rule is gone: `max-w-[62rem] mx-auto` + the old `main` vertical padding `calc(--page-gutter+32px)` ≈ `80px` → `pt-20 pb-20`, horizontal `px-4` = `var(--ax-space-16)`.) Verify the editors get the wider column.

- [ ] **Step 5: Verify + commit**

```bash
pnpm --filter @oselvar/website build
```
Dev-check `/var/docs/` cards, `/var/blog/` list, a blog post header, and `/var/playground` width. Both modes. Then:
```bash
git add packages/website/src/pages/docs/index.astro packages/website/src/pages/blog/index.astro "packages/website/src/pages/blog/[...slug].astro" packages/website/src/pages/playground.astro
git commit -m "refactor(website): convert docs/blog/playground pages to Tailwind utilities"
```

---

## Task 10: Convert the landing page `index.astro`

The big one (249 lines of scoped CSS). Apply utilities to each element and delete the `<style>` block. Pseudo-elements (`::before` decorations) use Tailwind `before:` variants; `clamp()` sizes use arbitrary values.

**Files:**
- Modify: `packages/website/src/pages/index.astro`

- [ ] **Step 1: Apply utilities element-by-element**

- `<main class="landing">` → `class="landing max-w-[70rem] mx-auto px-12 pt-20 pb-20"` (replaces the gone global `main` container + the `.landing { max-width:70rem }` override; `px-12` ≈ the old 48px gutter, adjust to taste during visual check)
- `.hero` → `text-center pt-12 pb-6`
- `.brand` → `flex items-center justify-center gap-[clamp(12px,3vw,40px)]`
- `.logo` → `h-[clamp(72px,16vw,200px)] w-auto`
- `.wordmark` → `font-sans font-semibold text-[clamp(72px,18vw,220px)] leading-[0.95] tracking-[0.02em] m-0 text-ink`
- `.pitch-line` → `mt-4 mb-0 text-[clamp(20px,3.2vw,34px)] font-semibold text-subtle`
- `.split` → `grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-10 items-start pt-6 pb-12 max-[880px]:grid-cols-1 max-[880px]:gap-6`
- `.split__explain` → `text-center`
- `.split__explain pre` → `mt-4 text-[clamp(11px,1.6vw,14px)] overflow-x-auto`
- `.hero__lead` → `max-w-[42rem] mt-4 mx-auto text-center text-[17px] text-subtle`
- `.demo` (inside split) → `p-0` ; the standalone `.demo` spacing is owned by the grid now
- `.demo h2` → `font-sans font-semibold text-2xl tracking-[0.02em] mb-3 text-center`
- `.demo__lead` → `max-w-[42rem] mx-auto mb-6 text-center text-[17px] text-subtle`
- `.demo__steps` → `absolute left-[-99999px] top-0 w-[700px]`
- `.demo__more` → `text-center mt-4` ; its `<a>` → `text-ink underline decoration-accent`
- `.cta` → `flex flex-wrap gap-4 items-center justify-center mt-2 mb-6`
- `.cta__primary` → `bg-strong text-accent-contrast rounded-none px-6 py-3 font-semibold no-underline hover:bg-strong-hover`
- `.cta__secondary` → `text-ink underline decoration-accent hover:text-ink`
- `.pitch` → `grid grid-cols-2 gap-6 py-12 max-[720px]:grid-cols-1`
- `.pitch article` → `bg-raised border border-line-subtle rounded-none text-ink p-6`
- `.pitch h2` → `font-sans font-semibold text-2xl tracking-[0.02em] mb-3`
- `.pitch p` → `m-0 text-[17px]`
- `.install` → `py-12 text-center` (was `var(--ax-space-24) 0 var(--ax-space-48)` → `pt-6 pb-12`; use `pt-6 pb-12`)
- `.install pre` → `bg-raised border border-line-subtle rounded-none text-ink inline-block m-0 px-6 py-4 font-mono text-[17px] before:content-['$_'] before:text-accent`
- `.quotes` → `py-12`
- `.quotes h2` → `font-sans font-semibold text-2xl tracking-[0.02em] text-center mb-8`
- `.quotes ul` → `list-none p-0 m-0 grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-4`
- `.quotes li` → `bg-raised border border-line-subtle rounded-none text-ink p-5 italic text-[18px] before:content-['“'] before:text-[36px] before:leading-[0] before:align-[-10px] before:mr-1 before:text-accent`

Notes:
- The three "raised surface" selectors (`.pitch article, .quotes li, .install pre`) are folded into each element's classes above (`bg-raised border border-line-subtle rounded-none text-ink`).
- `before:content-['$_']`: the `_` encodes the trailing space; verify it renders `"$ "`. If Tailwind strips it, use `before:content-["$\00a0"]` or keep a 2-line scoped `::before` block for the `$ ` and `“` decorations — acceptable fallback since they're pure decoration.
- `--ax-space-40`→`gap-10`, `--ax-space-48`→`py-12`/`pt-12`, `--ax-space-24`→`6`, `--ax-space-16`→`4`, `--ax-space-20`→`5`, `--ax-space-8`→`2`, `--ax-space-12`→`3`.

- [ ] **Step 2: Delete the `<style>` block**

Remove the entire `<style>…</style>` (lines ~115–363).

- [ ] **Step 3: Verify + commit**

```bash
pnpm --filter @oselvar/website build
```
Dev-check the landing page closely against `main` in both modes: hero wordmark clamp scaling, two-column split collapsing < 880px, pitch cards, CTA buttons (brown bg, contrast text, hover), install `$ ` prefix, quote `“` marks. Then:
```bash
git add packages/website/src/pages/index.astro
git commit -m "refactor(website): convert landing page to Tailwind utilities"
```

---

## Task 11: Remove ds-css, bridge tokens, and dead vars

Everything is converted; cut the bridge and the dependency.

**Files:**
- Modify: `packages/website/src/layouts/Base.astro` (remove 5 ds-css imports)
- Modify: `packages/website/src/styles/global.css` (remove the `--ax-*` / `--var-*` bridge blocks)
- Modify: `packages/website/package.json` (remove `@navikt/ds-css`)

- [ ] **Step 1: Confirm no `--ax-*` / `--var-*` references remain in non-CodeMirror code**

```bash
cd packages/website && grep -rn "\-\-ax-\|var(--var-accent" src/ | grep -v "cm-var-theme\|var-token-theme\|cm-generate-step"
```
Expected: **no output**. If anything appears, convert it before continuing. Also confirm the only remaining legacy aliases are the CodeMirror ones:
```bash
grep -rn "var(--ink)\|var(--yellow)" src/
```
Expected: only `src/lib/cm-generate-step.ts` (and nothing in `.astro` — `Editor.astro` now uses `text-ink`).

- [ ] **Step 2: Remove the five ds-css imports from `Base.astro`**

Delete these lines:
```astro
import '@navikt/ds-css/dist/global/tokens.css'
import '@navikt/ds-css/dist/global/fonts.css'
import '@navikt/ds-css/dist/global/reset.css'
import '@navikt/ds-css/dist/global/baseline.css'
import '@navikt/ds-css/dist/component/typography.css'
```
Keep `import '@fontsource-variable/source-sans-3'` and `import '../styles/global.css'`.

- [ ] **Step 3: Remove the bridge blocks from `global.css`**

In both `:root,.light` and `.dark`, delete the `/* Bridge: … */` comment and every `--ax-*` and `--var-accent`/`--var-accent-strong` line. Keep `--surface … --line-subtle`, the `--yellow: var(--highlight)` alias, and the `--ed-*`/`--syn-*` blocks.

- [ ] **Step 4: Remove the dependency**

In `packages/website/package.json`, delete the `"@navikt/ds-css": "^8.14.0",` line from `dependencies`, then:
```bash
pnpm install
```

- [ ] **Step 5: Full verification in both modes**

```bash
pnpm --filter @oselvar/website build && pnpm --filter @oselvar/website check
```
Expected: both exit 0. Then `pnpm --filter @oselvar/website dev` and sweep: landing, a docs page, docs index, blog index, a blog post, playground — each in **light and dark**. Confirm fonts, colors, borders, spacing, the CodeMirror editor (still themed via `--ed-*`/`--syn-*`), search, copy buttons, and the mobile docs drawer all look right. Confirm no console errors and no flash of unstyled/wrong-theme content on load.

- [ ] **Step 6: Confirm ds-css is fully gone**

```bash
cd packages/website && grep -rn "navikt\|ds-css" . --include="*.astro" --include="*.ts" --include="*.json" | grep -v node_modules
```
Expected: **no output**.

- [ ] **Step 7: Commit**

```bash
git add packages/website/src/layouts/Base.astro packages/website/src/styles/global.css packages/website/package.json packages/website/pnpm-lock.yaml pnpm-lock.yaml
git commit -m "refactor(website): drop @navikt/ds-css and the --ax-* bridge tokens"
```

---

## Self-review notes

- **Spec coverage:** integration/deps (T1), color theme → `@theme` + dark variant (T2), non-color Aksel tokens → scales (T2 maps + applied across T3–T10), font self-host (T1), prose for Markdown (T3), all component/page conversions incl. `index.astro` (T4–T10), ds-css removal (T11). CodeMirror left untouched throughout (Global Constraints + per-task notes). ✓
- **Sequencing:** the bridge (`--ax-*: var(--new)`) keeps every intermediate task visually identical and green; ds-css is removed only after the grep in T11/Step 1 proves no consumers remain. ✓
- **Known soft spots flagged inline:** `before:content-['$_']` whitespace encoding (T10/Step 1 fallback), and the legitimately-irreducible scoped blocks (ThemeToggle icon visibility, DocsLayout `.is-open` drawer, Pagefind `::part()`, CopyButton hover state machine, CodeMirror `:global(.cm-*)`) — these are "as much custom CSS as possible," with the residue justified per the user's CodeMirror/third-party carve-outs.
