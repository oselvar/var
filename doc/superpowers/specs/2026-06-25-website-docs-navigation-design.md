# Website docs navigation, breadcrumbs, layout & search — design

**Date:** 2026-06-25
**Status:** Approved (pending spec review)
**Scope:** `packages/website` only

## Problem

The Vár website uses Diátaxis to organize its docs, but navigation is weak:

- Each doc page (`Doc.astro`) has only a two-level breadcrumb (`Vár › docs`) and a
  "back to docs" footer. There is **no way to move from one area of the docs to another
  without returning to the `/docs` hub.**
- There is **no search.**
- The front page only exposes docs via a small footer link; nothing ramps a newcomer
  into a quick start.
- The experience is not designed for phones.

The goal is renowned-project-grade navigation (Stripe-style sidebar; pagefind.app's
clean, shallow nav as a visual reference) that stays easy to read and use on a phone,
without a deep expand/collapse tree.

## Decisions (from brainstorming)

- **Nav model:** Stripe-style persistent left sidebar, shallow (group heading + flat
  link list per area, no nested expand/collapse). Hidden behind a hamburger on mobile.
- **Area labels:** natural terms, with Diátaxis as the invisible organizing principle:
  - **Start here** → Tutorials
  - **Guides** → How-to guides
  - **Reference** → Reference
  - **Concepts** → Explanation
- **Front page:** primary `Get started →` CTA to the first tutorial, plus a quieter
  `Browse docs` link to the `/docs` hub.
- **Search:** Pagefind (`astro-pagefind`) — fully static, client-side, no server.
- **Nav backbone:** migrate docs to an Astro Content Collection (single source of truth).

## Information architecture

Fixed reading order: Start here → Guides → Reference → Concepts.

| Sidebar label | Diátaxis    | Current pages                                            |
|---------------|-------------|---------------------------------------------------------|
| Start here    | Tutorials   | Hello Vár — your first spec                              |
| Guides        | How-to      | Wire Vár into instructions · Drive a feature with Vár    |
| Reference     | Reference   | (coming soon)                                            |
| Concepts      | Explanation | Why Vár pairs well with AI coding agents                 |

## Architecture

### Nav backbone — Astro Content Collection (single source of truth)

The sidebar, breadcrumbs, and ordering must all derive from one place. Migrate the docs
to a content collection so adding a file makes it appear in the nav automatically,
type-checked, with no hand-maintained config to drift.

- Define a `docs` collection in `src/content.config.ts` (Astro 5 content layer) with a
  Zod schema:
  - `title: string`
  - `description: string` (optional; falls back to a site default)
  - `area: 'start-here' | 'guides' | 'reference' | 'concepts'`
  - `order: number` (sort within an area)
- Move the existing files into `src/content/docs/<area>/<slug>.md(x)`:
  - `tutorials/hello-var-your-first-spec.mdx` → `start-here/`
  - `how-to/wire-var-into-agent-instructions.md` → `guides/`
  - `how-to/drive-features-with-var-and-an-agent.md` → `guides/`
  - `explanation/why-var-with-ai-agents.md` → `concepts/`
  - Add `area` + `order` frontmatter to each.
- Render every doc through one route: `src/pages/docs/[...slug].astro`, which loads the
  entry, renders its body, and wraps it in `DocsLayout`.

**URL policy:** the public URL is `/docs/<area>/<slug>` derived from the collection
entry's id (folder + filename). Because the folder names change
(`tutorials` → `start-here`, `how-to` → `guides`, `explanation` → `concepts`), the URLs
change. The docs are not yet indexed by search engines and the only internal links are
the ones we control (hub, front page, layout), which we update in the same change, so no
redirects are needed.

An **area registry** (`src/lib/docs-areas.ts`) holds the ordered list of areas with their
label and Diátaxis caption. The sidebar is built by joining this registry with
`getCollection('docs')` grouped by `area` and sorted by `order`.

### Layout & components

A new `DocsLayout.astro` wraps the existing `Base.astro` and is used by every docs page
(the `[...slug].astro` route and the `/docs` hub).

```
┌──────────────────────────────────────────────────┐
│ Vár · Docs            [⌕ Search docs…]    GitHub   │  ← top bar (sticky)
├───────────────┬──────────────────────────────────┤
│ START HERE    │ Vár › Docs › Start here › Hello   │  ← breadcrumb
│  Hello Vár ●  │                                   │
│ GUIDES        │ # Hello Vár — your first spec     │
│  Wire Vár…    │ body…                             │
│  Drive a…     │                                   │
│ REFERENCE     │                                   │
│  (soon)       │                                   │
│ CONCEPTS      │ ── More in Start here ──          │
│  Why Vár…     │  → next page in this area         │
└───────────────┴──────────────────────────────────┘
```

New components, each independently understandable and testable in isolation:

- **`DocsLayout.astro`** — owns the grid (top bar, sidebar, content column), the sticky
  top bar, and the mobile drawer wiring. Props: `title`, `description`, `slug` (current
  page id) so it can highlight the active link and build the breadcrumb.
- **`DocsSidebar.astro`** — renders the shallow grouped list from the area registry +
  collection. Marks the current page. Empty areas (Reference) render a muted
  "coming soon" line. No expand/collapse.
- **`Breadcrumb.astro`** — `Vár › Docs › <Area> › <Page>`. "Docs" links to the hub;
  the area segment is plain text; the page segment is the current title.
- **`Search.astro`** — Pagefind UI trigger in the top bar (see Search).
- **`MoreInArea.astro`** (page footer) — a within-area "next" link plus a GitHub link.
  When the current page is the last (or only) one in its area, the "next" link is omitted
  and only the GitHub link shows. Global prev/next is intentionally omitted (keeps
  tutorial readers out of reference; YAGNI for a small set).

### Search (Pagefind)

- Add the `astro-pagefind` integration. It runs Pagefind after `astro build` to index the
  generated `dist/` HTML. Nothing runs server-side at request time.
- The doc `<article>` carries `data-pagefind-body` so Pagefind indexes page content, not
  the sidebar/top-bar chrome. The `<h1>`/title is the result heading.
- `Search.astro` mounts Pagefind's prebuilt UI in the top bar; the index is lazy-loaded
  on first focus to keep initial load light.
- Works against a local `astro build` + `astro preview`.

### Mobile

- Sidebar hidden by default; a hamburger in the top bar opens it as a slide-in drawer:
  focus-trapped, closes on link tap, Esc, or backdrop click.
- Search stays in the top bar — icon-only when space is tight, expanding to the Pagefind
  overlay.
- Top bar is sticky; tap targets are comfortable; no horizontal scroll. The existing
  `--page-gutter` responsive variable continues to drive padding.

### Front page

- The hero gains a primary `Get started →` button → the `Hello Vár` tutorial, and a
  quieter `Browse docs` link → `/docs`. The install snippet stays.
- `/docs` hub remains as the "browse" target, restyled into four area cards using the new
  labels, and itself rendered through `DocsLayout` (so it has the sidebar + search too).

## Styling

- Reuse the existing palette and `global.css` variables (`--ink`, `--cream`, `--orange`,
  `--yellow`, `--accent`, `--page-gutter`, `--radius-5`). No new design system.
- Add docs-shell styles (grid, sidebar, top bar, drawer) scoped to the docs components,
  not leaked into `global.css` beyond shared tokens.

## Testing / verification

- `pnpm --filter @oselvar/website build` succeeds and Pagefind produces an index.
- Every migrated doc renders at its new URL with correct sidebar highlight + breadcrumb.
- Sidebar lists all areas in order; current page is marked; Reference shows "coming soon".
- Front page CTAs resolve to the tutorial and the hub.
- Manual: mobile drawer opens/closes (tap, Esc, backdrop); search returns ranked results
  for a known term (e.g. "spec") against a built preview.
- No internal link 404s (old `/docs/tutorials/...`, `/docs/how-to/...`,
  `/docs/explanation/...` references are all updated).

## Out of scope (YAGNI)

Right-hand "on this page" TOC, dark mode, tags, versioning, global prev/next, i18n.
All can be added later on this backbone if wanted.
