# Website Docs Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the Vár docs a Stripe-style persistent sidebar, breadcrumbs, cross-area navigation, static client-side search, and a front-page entry point — all mobile-friendly.

**Architecture:** Migrate the four docs into an Astro Content Collection (single source of truth). A pure, unit-tested nav library turns collection entries into a grouped sidebar model, breadcrumbs, and a within-area "next" link. A presentational `DocsLayout` (wrapping `Base.astro`) renders the top bar, shallow grouped sidebar, breadcrumb, content slot, and a mobile hamburger drawer. Pagefind (`astro-pagefind`) indexes built HTML for fully static search.

**Tech Stack:** Astro 5 (static, `base: '/var'`), Content Collections (`glob` loader), `@astrojs/mdx`, `astro-pagefind` / Pagefind, vitest 4 (for the pure nav lib), vanilla TS for the mobile drawer. No new design system — reuse `global.css` tokens.

## Global Constraints

- Scope is `packages/website` only.
- ESM-only, `node:` imports, Node ≥ 22 LTS.
- All data shapes in the nav library are `readonly` / `ReadonlyArray<T>`; nav functions are pure (no I/O, no globals). Astro I/O (`getCollection`) lives only in `.astro` files and `src/lib/docs-collection.ts` (the imperative shell).
- Area reading order is fixed: **Start here → Guides → Reference → Concepts**.
- Visible area labels are natural terms; Diátaxis names appear only as captions:
  - `start-here` → label "Start here", caption "tutorials"
  - `guides` → label "Guides", caption "how-to guides"
  - `reference` → label "Reference", caption "reference"
  - `concepts` → label "Concepts", caption "explanation"
- New public URLs are `/docs/<area>/<slug>` (e.g. `/docs/start-here/hello-var-your-first-spec`). Old `/docs/{tutorials,how-to,explanation}/...` URLs are retired; no redirects (docs not yet indexed; all internal links updated in this plan).
- Run all tests from the repo root: `pnpm test <path-substring>` (vitest 4 projects). The website project globs `src/**/*.test.ts`.
- Run builds with `pnpm --filter @oselvar/website build`; preview with `pnpm --filter @oselvar/website preview`.
- Reuse existing CSS variables: `--ink`, `--cream`, `--orange`, `--yellow`, `--accent`, `--page-gutter`, `--radius-5`. Put new shell styles in scoped `<style>` blocks in the components, not in `global.css`.

---

### Task 1: Docs content collection, area registry, and pure nav library

**Files:**
- Modify: `packages/website/src/content.config.ts` (add `docs` collection alongside `blog`)
- Create: `packages/website/src/lib/docs-areas.ts`
- Create: `packages/website/src/lib/docs-nav.ts`
- Test: `packages/website/src/lib/docs-nav.test.ts`

**Interfaces:**
- Consumes: nothing (first task).
- Produces:
  - `type AreaId = 'start-here' | 'guides' | 'reference' | 'concepts'`
  - `interface Area { readonly id: AreaId; readonly label: string; readonly diataxis: string }`
  - `const AREAS: ReadonlyArray<Area>`
  - `interface DocEntry { readonly id: string; readonly area: AreaId; readonly order: number; readonly title: string }`
  - `interface NavLink { readonly id: string; readonly title: string; readonly href: string; readonly current: boolean }`
  - `interface NavGroup { readonly area: Area; readonly links: ReadonlyArray<NavLink> }`
  - `interface Breadcrumb { readonly area: Area; readonly title: string }`
  - `docHref(base: string, id: string): string`
  - `buildNav(entries: ReadonlyArray<DocEntry>, base: string, currentId: string | null): ReadonlyArray<NavGroup>`
  - `breadcrumbFor(entry: DocEntry): Breadcrumb`
  - `nextInArea(entries: ReadonlyArray<DocEntry>, base: string, currentId: string): NavLink | null`

- [ ] **Step 1: Add the `docs` collection to the content config**

Modify `packages/website/src/content.config.ts` to add a `docs` collection and export it. Keep the existing `blog` collection unchanged.

```ts
import { defineCollection, z } from 'astro:content'
import { glob } from 'astro/loaders'

const blog = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/blog' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    pubDate: z.coerce.date(),
    draft: z.boolean().optional(),
  }),
})

const docs = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/docs' }),
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
    area: z.enum(['start-here', 'guides', 'reference', 'concepts']),
    order: z.number(),
  }),
})

export const collections = { blog, docs }
```

- [ ] **Step 2: Create the area registry**

Create `packages/website/src/lib/docs-areas.ts`:

```ts
export type AreaId = 'start-here' | 'guides' | 'reference' | 'concepts'

export interface Area {
  readonly id: AreaId
  readonly label: string
  readonly diataxis: string
}

// Fixed reading order: Start here → Guides → Reference → Concepts.
export const AREAS: ReadonlyArray<Area> = [
  { id: 'start-here', label: 'Start here', diataxis: 'tutorials' },
  { id: 'guides', label: 'Guides', diataxis: 'how-to guides' },
  { id: 'reference', label: 'Reference', diataxis: 'reference' },
  { id: 'concepts', label: 'Concepts', diataxis: 'explanation' },
]
```

- [ ] **Step 3: Write the failing tests for the nav library**

Create `packages/website/src/lib/docs-nav.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { buildNav, breadcrumbFor, docHref, nextInArea, type DocEntry } from './docs-nav'

const base = '/var'

const entries: ReadonlyArray<DocEntry> = [
  { id: 'concepts/why-var', area: 'concepts', order: 1, title: 'Why Vár' },
  { id: 'start-here/hello-var', area: 'start-here', order: 1, title: 'Hello Vár' },
  { id: 'guides/drive-feature', area: 'guides', order: 2, title: 'Drive a feature' },
  { id: 'guides/wire-var', area: 'guides', order: 1, title: 'Wire Vár' },
]

describe('docHref', () => {
  it('prefixes the base and docs path', () => {
    expect(docHref(base, 'guides/wire-var')).toBe('/var/docs/guides/wire-var')
  })
})

describe('buildNav', () => {
  it('returns the four areas in fixed reading order', () => {
    const nav = buildNav(entries, base, null)
    expect(nav.map((g) => g.area.id)).toEqual(['start-here', 'guides', 'reference', 'concepts'])
  })

  it('sorts links within an area by order', () => {
    const nav = buildNav(entries, base, null)
    const guides = nav.find((g) => g.area.id === 'guides')!
    expect(guides.links.map((l) => l.title)).toEqual(['Wire Vár', 'Drive a feature'])
  })

  it('builds base-prefixed hrefs', () => {
    const nav = buildNav(entries, base, null)
    const start = nav.find((g) => g.area.id === 'start-here')!
    expect(start.links[0].href).toBe('/var/docs/start-here/hello-var')
  })

  it('marks only the current page', () => {
    const nav = buildNav(entries, base, 'guides/wire-var')
    const current = nav.flatMap((g) => g.links).filter((l) => l.current)
    expect(current.map((l) => l.id)).toEqual(['guides/wire-var'])
  })

  it('leaves areas with no entries empty', () => {
    const nav = buildNav(entries, base, null)
    const reference = nav.find((g) => g.area.id === 'reference')!
    expect(reference.links).toEqual([])
  })
})

describe('breadcrumbFor', () => {
  it('resolves the area and page title', () => {
    const crumb = breadcrumbFor(entries[1])
    expect(crumb.area.label).toBe('Start here')
    expect(crumb.title).toBe('Hello Vár')
  })
})

describe('nextInArea', () => {
  it('returns the next page in the same area by order', () => {
    const next = nextInArea(entries, base, 'guides/wire-var')
    expect(next?.title).toBe('Drive a feature')
    expect(next?.href).toBe('/var/docs/guides/drive-feature')
  })

  it('returns null for the last page in an area', () => {
    expect(nextInArea(entries, base, 'guides/drive-feature')).toBeNull()
  })

  it('returns null for an unknown id', () => {
    expect(nextInArea(entries, base, 'nope/nope')).toBeNull()
  })
})
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `pnpm test docs-nav`
Expected: FAIL — `Cannot find module './docs-nav'` (the module does not exist yet).

- [ ] **Step 5: Implement the nav library**

Create `packages/website/src/lib/docs-nav.ts`:

```ts
import { AREAS, type Area, type AreaId } from './docs-areas'

// Minimal shape needed from a docs collection entry. Kept independent of
// astro:content types so these functions stay pure and unit-testable.
export interface DocEntry {
  readonly id: string
  readonly area: AreaId
  readonly order: number
  readonly title: string
}

export interface NavLink {
  readonly id: string
  readonly title: string
  readonly href: string
  readonly current: boolean
}

export interface NavGroup {
  readonly area: Area
  readonly links: ReadonlyArray<NavLink>
}

export interface Breadcrumb {
  readonly area: Area
  readonly title: string
}

export function docHref(base: string, id: string): string {
  return `${base}/docs/${id}`
}

function sortedAreaEntries(
  entries: ReadonlyArray<DocEntry>,
  area: AreaId,
): ReadonlyArray<DocEntry> {
  return entries
    .filter((e) => e.area === area)
    .slice()
    .sort((a, b) => a.order - b.order)
}

export function buildNav(
  entries: ReadonlyArray<DocEntry>,
  base: string,
  currentId: string | null,
): ReadonlyArray<NavGroup> {
  return AREAS.map((area) => ({
    area,
    links: sortedAreaEntries(entries, area.id).map((e) => ({
      id: e.id,
      title: e.title,
      href: docHref(base, e.id),
      current: e.id === currentId,
    })),
  }))
}

export function breadcrumbFor(entry: DocEntry): Breadcrumb {
  const area = AREAS.find((a) => a.id === entry.area)
  if (!area) throw new Error(`Unknown area: ${entry.area}`)
  return { area, title: entry.title }
}

export function nextInArea(
  entries: ReadonlyArray<DocEntry>,
  base: string,
  currentId: string,
): NavLink | null {
  const current = entries.find((e) => e.id === currentId)
  if (!current) return null
  const sameArea = sortedAreaEntries(entries, current.area)
  const idx = sameArea.findIndex((e) => e.id === currentId)
  const next = sameArea[idx + 1]
  if (!next) return null
  return { id: next.id, title: next.title, href: docHref(base, next.id), current: false }
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm test docs-nav`
Expected: PASS — all tests green.

- [ ] **Step 7: Commit**

```bash
git add packages/website/src/content.config.ts packages/website/src/lib/docs-areas.ts packages/website/src/lib/docs-nav.ts packages/website/src/lib/docs-nav.test.ts
git commit -m "feat(website): docs content collection schema + pure nav library"
```

---

### Task 2: Migrate the four docs into the collection and add the rendering route

**Files:**
- Create: `packages/website/src/content/docs/start-here/hello-var-your-first-spec.mdx`
- Create: `packages/website/src/content/docs/guides/wire-var-into-agent-instructions.md`
- Create: `packages/website/src/content/docs/guides/drive-features-with-var-and-an-agent.md`
- Create: `packages/website/src/content/docs/concepts/why-var-with-ai-agents.md`
- Delete: `packages/website/src/pages/docs/tutorials/hello-var-your-first-spec.mdx`
- Delete: `packages/website/src/pages/docs/how-to/wire-var-into-agent-instructions.md`
- Delete: `packages/website/src/pages/docs/how-to/drive-features-with-var-and-an-agent.md`
- Delete: `packages/website/src/pages/docs/explanation/why-var-with-ai-agents.md`
- Create: `packages/website/src/lib/docs-collection.ts`
- Create: `packages/website/src/pages/docs/[...slug].astro`

**Interfaces:**
- Consumes from Task 1: `buildNav`, `breadcrumbFor`, `nextInArea`, `DocEntry`, `AREAS`.
- Produces:
  - `loadDocEntries(): Promise<ReadonlyArray<DocEntry>>` in `docs-collection.ts`
  - A static route generating `/docs/<area>/<slug>` for every `docs` entry.

> Migration note: the four files keep their body content verbatim. Only the frontmatter changes — remove `layout:`, add `area:` and `order:`. The tutorial's relative imports (`../../../components/FileEditor.astro` and `../../../../../../docs/tutorial/steps/01-hello.steps.ts?raw`) resolve unchanged because `src/content/docs/start-here/` sits at the same depth under `src/` as the old `src/pages/docs/tutorials/`.

- [ ] **Step 1: Move the tutorial and rewrite its frontmatter**

Create `packages/website/src/content/docs/start-here/hello-var-your-first-spec.mdx` with the **exact body** of the old file (everything from the first `import` line onward, unchanged), but replace the frontmatter block with:

```mdx
---
title: 'Hello Vár: your first spec'
description: Write your first Vár spec — a plain Markdown file describing a behaviour with a concrete example.
area: start-here
order: 1
---
```

Keep the two import lines and all MDX body content exactly as they were:

```mdx
import FileEditor from '../../../components/FileEditor.astro'
import helloSteps from '../../../../../../docs/tutorial/steps/01-hello.steps.ts?raw'
```

Then delete `packages/website/src/pages/docs/tutorials/hello-var-your-first-spec.mdx`.

- [ ] **Step 2: Move the two how-to guides**

Create `packages/website/src/content/docs/guides/wire-var-into-agent-instructions.md` with the old body unchanged and frontmatter:

```md
---
title: Wire Vár into your AI agent's instructions
description: One-time setup so your coding agent defaults to writing a Vár spec before any production code.
area: guides
order: 1
---
```

Create `packages/website/src/content/docs/guides/drive-features-with-var-and-an-agent.md` with the old body unchanged and frontmatter:

```md
---
title: Drive a feature with Vár and an AI agent
description: The per-feature loop once your agent is wired up — talk in customer language, let the agent specify, then iterate on the spec.
area: guides
order: 2
---
```

Delete `packages/website/src/pages/docs/how-to/wire-var-into-agent-instructions.md` and `packages/website/src/pages/docs/how-to/drive-features-with-var-and-an-agent.md`.

- [ ] **Step 3: Move the explanation**

Create `packages/website/src/content/docs/concepts/why-var-with-ai-agents.md` with the old body unchanged and frontmatter:

```md
---
title: Why Vár pairs well with AI coding agents
description: ATDD is the deterministic counterweight to non-deterministic AI. The spec is the contract; the code is regeneratable.
area: concepts
order: 1
---
```

Delete `packages/website/src/pages/docs/explanation/why-var-with-ai-agents.md`.

- [ ] **Step 4: Create the collection loader (imperative shell)**

Create `packages/website/src/lib/docs-collection.ts`:

```ts
import { getCollection } from 'astro:content'
import type { AreaId, DocEntry } from './docs-nav'

// Imperative shell: reads the docs collection and maps entries to the pure
// DocEntry shape the nav library operates on.
export async function loadDocEntries(): Promise<ReadonlyArray<DocEntry>> {
  const docs = await getCollection('docs')
  return docs.map((d) => ({
    id: d.id,
    area: d.data.area as AreaId,
    order: d.data.order,
    title: d.data.title,
  }))
}
```

Add the `AreaId` re-export the loader needs by changing the top of `packages/website/src/lib/docs-nav.ts` to re-export it:

```ts
import { AREAS, type Area, type AreaId } from './docs-areas'
export type { AreaId } from './docs-areas'
```

- [ ] **Step 5: Create the rendering route (interim look)**

Create `packages/website/src/pages/docs/[...slug].astro`. This first version reuses the existing `.doc-*` styles so we can verify the migration in isolation; Task 3 swaps the wrapper for `DocsLayout`.

```astro
---
import { getCollection, render } from 'astro:content'
import Base from '../../layouts/Base.astro'
import { breadcrumbFor } from '../../lib/docs-nav'
import { loadDocEntries } from '../../lib/docs-collection'

export async function getStaticPaths() {
  const docs = await getCollection('docs')
  return docs.map((doc) => ({ params: { slug: doc.id }, props: { doc } }))
}

const { doc } = Astro.props
const { Content } = await render(doc)
const base = import.meta.env.BASE_URL.replace(/\/$/, '')

const entries = await loadDocEntries()
const entry = entries.find((e) => e.id === doc.id)!
const crumb = breadcrumbFor(entry)
---

<Base title={`${doc.data.title} — Vár docs`} description={doc.data.description ?? 'Vár documentation.'}>
  <main class="doc">
    <nav class="doc-nav" aria-label="Breadcrumb">
      <a href={`${base}/`}>Vár</a>
      <span aria-hidden="true">›</span>
      <a href={`${base}/docs/`}>docs</a>
      <span aria-hidden="true">›</span>
      <span>{crumb.area.label}</span>
    </nav>
    <article class="doc-body" data-pagefind-body>
      <Content />
    </article>
    <footer class="doc-footer">
      <a href={`${base}/docs/`}>← back to docs</a>
      <span> · </span>
      <a href="https://github.com/oselvar/var">github.com/oselvar/var</a>
    </footer>
  </main>
</Base>
```

- [ ] **Step 6: Build and verify the migrated docs render at new URLs**

Run: `pnpm --filter @oselvar/website build`
Expected: build succeeds; output includes:
- `dist/docs/start-here/hello-var-your-first-spec/index.html`
- `dist/docs/guides/wire-var-into-agent-instructions/index.html`
- `dist/docs/guides/drive-features-with-var-and-an-agent/index.html`
- `dist/docs/concepts/why-var-with-ai-agents/index.html`

Confirm with: `ls dist/docs/start-here dist/docs/guides dist/docs/concepts`

- [ ] **Step 7: Verify no leftover old doc routes**

Run: `ls dist/docs/tutorials dist/docs/how-to dist/docs/explanation 2>/dev/null; echo done`
Expected: the three old directories do not exist (only `done` prints).

- [ ] **Step 8: Commit**

```bash
git add -A packages/website/src/content/docs packages/website/src/pages/docs packages/website/src/lib/docs-collection.ts packages/website/src/lib/docs-nav.ts
git commit -m "feat(website): migrate docs into content collection with new URLs"
```

---

### Task 3: DocsLayout with persistent sidebar, breadcrumb, and within-area next link

**Files:**
- Create: `packages/website/src/components/Breadcrumb.astro`
- Create: `packages/website/src/components/DocsSidebar.astro`
- Create: `packages/website/src/components/MoreInArea.astro`
- Create: `packages/website/src/layouts/DocsLayout.astro`
- Modify: `packages/website/src/pages/docs/[...slug].astro` (swap interim wrapper for `DocsLayout`)

**Interfaces:**
- Consumes from Tasks 1–2: `NavGroup`, `NavLink`, `Breadcrumb`, `buildNav`, `breadcrumbFor`, `nextInArea`, `loadDocEntries`.
- Produces:
  - `DocsLayout` props: `{ title: string; description?: string; base: string; groups: ReadonlyArray<NavGroup>; breadcrumb: Breadcrumb | null; next?: NavLink | null }`
  - `DocsSidebar` props: `{ groups: ReadonlyArray<NavGroup> }`
  - `Breadcrumb` (component) props: `{ base: string; area?: string; title?: string }`
  - `MoreInArea` props: `{ next?: NavLink | null; areaLabel?: string }`

- [ ] **Step 1: Create the Breadcrumb component**

Create `packages/website/src/components/Breadcrumb.astro`:

```astro
---
interface Props {
  base: string
  area?: string
  title?: string
}
const { base, area, title } = Astro.props
---

<nav class="doc-nav" aria-label="Breadcrumb">
  <a href={`${base}/`}>Vár</a>
  <span aria-hidden="true">›</span>
  <a href={`${base}/docs/`}>docs</a>
  {area && (
    <>
      <span aria-hidden="true">›</span>
      <span>{area}</span>
    </>
  )}
  {title && (
    <>
      <span aria-hidden="true">›</span>
      <span aria-current="page">{title}</span>
    </>
  )}
</nav>
```

- [ ] **Step 2: Create the DocsSidebar component**

Create `packages/website/src/components/DocsSidebar.astro`. Shallow: group heading (label + caption) + flat link list; empty areas show a muted "coming soon".

```astro
---
import type { NavGroup } from '../lib/docs-nav'
interface Props {
  groups: ReadonlyArray<NavGroup>
}
const { groups } = Astro.props
---

<nav class="docs-sidebar" aria-label="Docs sections">
  {groups.map((group) => (
    <section class="docs-sidebar__group">
      <p class="docs-sidebar__label">
        {group.area.label}
        <span class="docs-sidebar__caption">{group.area.diataxis}</span>
      </p>
      {group.links.length > 0 ? (
        <ul>
          {group.links.map((link) => (
            <li>
              <a
                href={link.href}
                class={link.current ? 'is-current' : undefined}
                aria-current={link.current ? 'page' : undefined}
              >{link.title}</a>
            </li>
          ))}
        </ul>
      ) : (
        <p class="docs-sidebar__empty">Coming soon</p>
      )}
    </section>
  ))}
</nav>

<style>
  .docs-sidebar { font-size: 15px; }
  .docs-sidebar__group { margin: 0 0 24px; }
  .docs-sidebar__label {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    text-transform: uppercase;
    font-size: 12px;
    letter-spacing: 0.06em;
    margin: 0 0 8px;
    color: var(--ink);
  }
  .docs-sidebar__caption {
    display: block;
    text-transform: none;
    letter-spacing: 0;
    font-size: 11px;
    opacity: 0.55;
  }
  .docs-sidebar ul { list-style: none; padding: 0; margin: 0; }
  .docs-sidebar li { margin: 2px 0; }
  .docs-sidebar a {
    display: block;
    padding: 4px 8px;
    color: var(--ink);
    text-decoration: none;
    border-radius: 6px;
    border-left: 2px solid transparent;
  }
  .docs-sidebar a:hover { color: var(--accent); }
  .docs-sidebar a.is-current {
    border-left-color: var(--orange);
    background: var(--yellow);
    font-weight: 600;
  }
  .docs-sidebar__empty { margin: 0; padding: 4px 8px; font-size: 14px; opacity: 0.5; }
</style>
```

- [ ] **Step 3: Create the MoreInArea footer component**

Create `packages/website/src/components/MoreInArea.astro`:

```astro
---
import type { NavLink } from '../lib/docs-nav'
interface Props {
  next?: NavLink | null
  areaLabel?: string
}
const { next, areaLabel } = Astro.props
---

<footer class="more-in-area">
  {next && (
    <a class="more-in-area__next" href={next.href}>
      <span class="more-in-area__kicker">Next in {areaLabel}</span>
      <span class="more-in-area__title">{next.title} →</span>
    </a>
  )}
  <p class="more-in-area__github">
    <a href="https://github.com/oselvar/var">github.com/oselvar/var</a>
  </p>
</footer>

<style>
  .more-in-area { margin-top: 56px; padding-top: 24px; border-top: 1px solid var(--ink); }
  .more-in-area__next {
    display: inline-block;
    padding: 12px 16px;
    border: 2px solid var(--ink);
    border-radius: var(--radius-5);
    text-decoration: none;
    color: var(--ink);
  }
  .more-in-area__next:hover { background: var(--yellow); }
  .more-in-area__kicker { display: block; font-size: 12px; text-transform: uppercase; letter-spacing: 0.06em; opacity: 0.6; }
  .more-in-area__title { font-weight: 600; }
  .more-in-area__github { margin: 16px 0 0; font-size: 14px; }
</style>
```

- [ ] **Step 4: Create the DocsLayout**

Create `packages/website/src/layouts/DocsLayout.astro`. Presentational: receives nav data as props, renders top bar + sidebar + breadcrumb + content slot + next link. (Mobile drawer behavior is added in Task 4; the markup hooks — hamburger button, `data-docs-shell`, `data-docs-sidebar` — are included now and styled to a static sidebar.)

```astro
---
import Base from './Base.astro'
import Breadcrumb from '../components/Breadcrumb.astro'
import DocsSidebar from '../components/DocsSidebar.astro'
import MoreInArea from '../components/MoreInArea.astro'
import type { Breadcrumb as Crumb, NavGroup, NavLink } from '../lib/docs-nav'

interface Props {
  title: string
  description?: string
  base: string
  groups: ReadonlyArray<NavGroup>
  breadcrumb: Crumb | null
  next?: NavLink | null
}

const { title, description, base, groups, breadcrumb, next } = Astro.props
const fullTitle = `${title} — Vár docs`
const desc = description ?? 'Vár — Behaviour-Driven Development specs an AI agent can work against.'
---

<Base title={fullTitle} description={desc}>
  <div class="docs-topbar">
    <a class="docs-topbar__brand" href={`${base}/docs/`}>Vár · Docs</a>
    <div class="docs-topbar__search"><slot name="search" /></div>
    <a class="docs-topbar__gh" href="https://github.com/oselvar/var" aria-label="GitHub">GitHub</a>
    <button class="docs-topbar__menu" type="button" aria-label="Open navigation" aria-expanded="false" data-docs-menu>☰</button>
  </div>

  <div class="docs-shell" data-docs-shell>
    <div class="docs-shell__backdrop" data-docs-backdrop aria-hidden="true"></div>
    <aside class="docs-shell__sidebar" data-docs-sidebar>
      <DocsSidebar groups={groups} />
    </aside>
    <main class="docs-shell__main">
      <Breadcrumb base={base} area={breadcrumb?.area.label} title={breadcrumb?.title} />
      <article class="doc-body" data-pagefind-body>
        <slot />
      </article>
      <MoreInArea next={next} areaLabel={breadcrumb?.area.label} />
    </main>
  </div>

  <style>
    .docs-topbar {
      position: sticky; top: 0; z-index: 50;
      display: flex; align-items: center; gap: 16px;
      padding: 12px var(--page-gutter);
      background: var(--cream);
      border-bottom: 2px solid var(--ink);
    }
    .docs-topbar__brand {
      font-family: "Monoton", cursive; font-size: 20px;
      color: var(--ink); text-decoration: none; white-space: nowrap;
    }
    .docs-topbar__search { flex: 1; max-width: 420px; }
    .docs-topbar__gh { color: var(--ink); text-decoration: none; font-size: 14px; }
    .docs-topbar__gh:hover { color: var(--accent); }
    .docs-topbar__menu {
      display: none; background: none; border: none; font-size: 22px; cursor: pointer; color: var(--ink);
    }

    .docs-shell {
      display: grid;
      grid-template-columns: 240px minmax(0, 1fr);
      gap: 40px;
      max-width: 1100px;
      margin: 0 auto;
      padding: 32px var(--page-gutter) 64px;
    }
    .docs-shell__backdrop { display: none; }
    .docs-shell__sidebar { position: sticky; top: 72px; align-self: start; max-height: calc(100vh - 88px); overflow-y: auto; }
    .docs-shell__main { min-width: 0; }

    @media (max-width: 820px) {
      .docs-topbar__menu { display: block; order: -1; }
      .docs-shell { grid-template-columns: minmax(0, 1fr); }
      .docs-shell__sidebar {
        position: fixed; top: 0; left: 0; bottom: 0; z-index: 60;
        width: 280px; max-height: none; padding: 24px;
        background: var(--cream); border-right: 2px solid var(--ink);
        transform: translateX(-100%); transition: transform 0.2s ease;
      }
      .docs-shell.is-open .docs-shell__sidebar { transform: translateX(0); }
      .docs-shell.is-open .docs-shell__backdrop {
        display: block; position: fixed; inset: 0; z-index: 55; background: rgba(26,26,26,0.4);
      }
    }
  </style>
</Base>
```

- [ ] **Step 5: Wire the route to DocsLayout**

Replace the contents of `packages/website/src/pages/docs/[...slug].astro` with:

```astro
---
import { getCollection, render } from 'astro:content'
import DocsLayout from '../../layouts/DocsLayout.astro'
import Search from '../../components/Search.astro'
import { breadcrumbFor, buildNav, nextInArea } from '../../lib/docs-nav'
import { loadDocEntries } from '../../lib/docs-collection'

export async function getStaticPaths() {
  const docs = await getCollection('docs')
  return docs.map((doc) => ({ params: { slug: doc.id }, props: { doc } }))
}

const { doc } = Astro.props
const { Content } = await render(doc)
const base = import.meta.env.BASE_URL.replace(/\/$/, '')

const entries = await loadDocEntries()
const entry = entries.find((e) => e.id === doc.id)!
const groups = buildNav(entries, base, doc.id)
const breadcrumb = breadcrumbFor(entry)
const next = nextInArea(entries, base, doc.id)
---

<DocsLayout
  title={doc.data.title}
  description={doc.data.description}
  base={base}
  groups={groups}
  breadcrumb={breadcrumb}
  next={next}
>
  <Search slot="search" />
  <Content />
</DocsLayout>
```

> Note: `Search.astro` is created in Task 5. Until then, create a one-line placeholder so the build passes: `packages/website/src/components/Search.astro` containing only `<div class="search-placeholder"></div>`. Task 5 replaces its contents.

- [ ] **Step 6: Create the Search placeholder**

Create `packages/website/src/components/Search.astro`:

```astro
<div class="search-placeholder" aria-hidden="true"></div>
```

- [ ] **Step 7: Build and verify the new layout**

Run: `pnpm --filter @oselvar/website build`
Expected: build succeeds. Then:

Run: `pnpm --filter @oselvar/website preview` and open `/var/docs/guides/wire-var-into-agent-instructions`.
Expected (desktop width):
- Sticky top bar with "Vár · Docs" + GitHub link.
- Left sidebar listing all four areas in order; "Reference" shows "Coming soon"; the current page is highlighted.
- Breadcrumb `Vár › docs › Guides › Wire Vár into your AI agent's instructions`.
- A "Next in Guides → Drive a feature with Vár and an AI agent" link at the bottom.
- On the explanation page (`/var/docs/concepts/why-var-with-ai-agents`), no "Next" link (last in area), only the GitHub link.

- [ ] **Step 8: Commit**

```bash
git add packages/website/src/components/Breadcrumb.astro packages/website/src/components/DocsSidebar.astro packages/website/src/components/MoreInArea.astro packages/website/src/components/Search.astro packages/website/src/layouts/DocsLayout.astro packages/website/src/pages/docs/[...slug].astro
git commit -m "feat(website): DocsLayout with persistent sidebar, breadcrumb, next link"
```

---

### Task 4: Mobile hamburger drawer

**Files:**
- Modify: `packages/website/src/layouts/DocsLayout.astro` (add the drawer script)

**Interfaces:**
- Consumes: the markup hooks already in `DocsLayout` (`[data-docs-menu]`, `[data-docs-shell]`, `[data-docs-backdrop]`, `[data-docs-sidebar]`).
- Produces: client-side open/close behavior for the mobile sidebar.

- [ ] **Step 1: Add the drawer script to DocsLayout**

Append this `<script>` to `packages/website/src/layouts/DocsLayout.astro` (after the `<style>` block, still inside the `Base` slot). Astro bundles and scopes module scripts automatically.

```astro
<script>
  function initDocsDrawer() {
    const shell = document.querySelector('[data-docs-shell]')
    const menu = document.querySelector('[data-docs-menu]')
    const backdrop = document.querySelector('[data-docs-backdrop]')
    const sidebar = document.querySelector('[data-docs-sidebar]')
    if (!shell || !menu || !sidebar) return

    const open = () => {
      shell.classList.add('is-open')
      menu.setAttribute('aria-expanded', 'true')
    }
    const close = () => {
      shell.classList.remove('is-open')
      menu.setAttribute('aria-expanded', 'false')
    }

    menu.addEventListener('click', () =>
      shell.classList.contains('is-open') ? close() : open(),
    )
    backdrop?.addEventListener('click', close)
    sidebar.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('a')) close()
    })
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') close()
    })
  }

  initDocsDrawer()
  document.addEventListener('astro:after-swap', initDocsDrawer)
</script>
```

- [ ] **Step 2: Build and verify mobile behavior**

Run: `pnpm --filter @oselvar/website build && pnpm --filter @oselvar/website preview`
In the browser at a narrow width (≤ 820px, e.g. devtools mobile emulation), open a docs page and verify:
- The sidebar is hidden; a `☰` button shows in the top bar.
- Clicking `☰` slides the sidebar in over a dimmed backdrop.
- Clicking a sidebar link navigates and closes the drawer.
- Clicking the backdrop closes the drawer.
- Pressing Escape closes the drawer.

- [ ] **Step 3: Commit**

```bash
git add packages/website/src/layouts/DocsLayout.astro
git commit -m "feat(website): mobile hamburger drawer for docs sidebar"
```

---

### Task 5: Pagefind static search

**Files:**
- Modify: `packages/website/package.json` (add `astro-pagefind` dependency)
- Modify: `packages/website/astro.config.mjs` (register the integration)
- Modify: `packages/website/src/components/Search.astro` (replace placeholder with Pagefind UI)

**Interfaces:**
- Consumes: the `data-pagefind-body` attribute already on the docs `<article>`.
- Produces: a working search box in the docs top bar, backed by a build-time Pagefind index.

- [ ] **Step 1: Add the dependency**

Run from the repo root:

```bash
pnpm --filter @oselvar/website add astro-pagefind
```

Expected: `astro-pagefind` appears under `dependencies` in `packages/website/package.json`.

- [ ] **Step 2: Register the integration**

Modify `packages/website/astro.config.mjs` to add the Pagefind integration alongside `mdx()`:

```js
import mdx from '@astrojs/mdx'
import pagefind from 'astro-pagefind'
import { defineConfig } from 'astro/config'

export default defineConfig({
  site: 'https://oselvar.github.io',
  base: '/var',
  output: 'static',
  trailingSlash: 'ignore',
  integrations: [mdx(), pagefind()],
})
```

- [ ] **Step 3: Replace the Search placeholder with the Pagefind UI**

Replace the contents of `packages/website/src/components/Search.astro`:

```astro
---
import Search from 'astro-pagefind/components/Search'
---

<Search
  id="docs-search"
  className="docs-search"
  uiOptions={{ showImages: false, showSubResults: true }}
/>

<style is:global>
  .docs-search .pagefind-ui__search-input {
    background: var(--cream);
    border: 2px solid var(--ink);
    border-radius: var(--radius-5);
    font-size: 14px;
  }
  .docs-search .pagefind-ui__drawer { z-index: 70; }
</style>
```

> The `astro-pagefind` `Search` component loads the index from `import.meta.env.BASE_URL + 'pagefind/'`, so it works under the `/var` base automatically. The index is lazy-loaded on first interaction.

- [ ] **Step 4: Build and verify search**

Run: `pnpm --filter @oselvar/website build`
Expected: build succeeds and logs Pagefind indexing; confirm the index exists:

Run: `ls dist/pagefind/pagefind.js`
Expected: the file exists.

Run: `pnpm --filter @oselvar/website preview`, open any docs page, type `spec` into the search box.
Expected: ranked results appear (e.g. "Hello Vár: your first spec"), each linking to a docs page; clicking a result navigates there. No network/server calls beyond static asset fetches.

- [ ] **Step 5: Commit**

```bash
git add packages/website/package.json packages/website/astro.config.mjs packages/website/src/components/Search.astro ../../pnpm-lock.yaml
git commit -m "feat(website): static Pagefind search in docs top bar"
```

---

### Task 6: Restyle the /docs hub with DocsLayout and area cards

**Files:**
- Modify: `packages/website/src/pages/docs/index.astro`
- Modify: `packages/website/src/styles/global.css` (remove dead hub styles only if unused; see step)

**Interfaces:**
- Consumes: `AREAS`, `buildNav`, `loadDocEntries`, `DocsLayout`, `Search`.
- Produces: a `/docs` hub rendered inside `DocsLayout` (so it has the sidebar + search), with four area cards generated from the live collection.

- [ ] **Step 1: Rewrite the hub to use DocsLayout and live data**

Replace the contents of `packages/website/src/pages/docs/index.astro`:

```astro
---
import DocsLayout from '../../layouts/DocsLayout.astro'
import Search from '../../components/Search.astro'
import { AREAS } from '../../lib/docs-areas'
import { buildNav } from '../../lib/docs-nav'
import { loadDocEntries } from '../../lib/docs-collection'

const base = import.meta.env.BASE_URL.replace(/\/$/, '')
const entries = await loadDocEntries()
const groups = buildNav(entries, base, null)
---

<DocsLayout
  title="Docs"
  description="Vár documentation: tutorials, how-to guides, reference, and explanation."
  base={base}
  groups={groups}
  breadcrumb={null}
>
  <Search slot="search" />

  <h1>Docs</h1>
  <p class="lede">
    Vár is executable documentation. Run the docs against your system; if behaviour drifts,
    you get an error. Organised with <a href="https://diataxis.fr/">Diátaxis</a>.
  </p>

  <div class="docs-cards">
    {AREAS.map((area) => {
      const group = groups.find((g) => g.area.id === area.id)!
      return (
        <section class="docs-card">
          <p class="docs-card__kind">{area.diataxis}</p>
          <h2>{area.label}</h2>
          {group.links.length > 0 ? (
            <ul>
              {group.links.map((link) => (
                <li><a href={link.href}>{link.title}</a></li>
              ))}
            </ul>
          ) : (
            <p class="docs-card__empty">Coming soon — spec syntax, step matching, CLI flags.</p>
          )}
        </section>
      )
    })}
  </div>
</DocsLayout>

<style>
  .docs-cards {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    gap: 20px;
    margin: 40px 0;
  }
  .docs-card {
    border: 2px solid var(--ink);
    border-radius: var(--radius-5);
    padding: 20px;
  }
  .docs-card__kind {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    text-transform: uppercase; font-size: 11px; letter-spacing: 0.06em; opacity: 0.6; margin: 0;
  }
  .docs-card h2 { font-family: "Monoton", cursive; font-weight: 400; font-size: 24px; margin: 4px 0 12px; }
  .docs-card ul { list-style: none; padding: 0; margin: 0; }
  .docs-card li { margin: 6px 0; }
  .docs-card__empty { font-size: 14px; opacity: 0.6; margin: 0; }
</style>
```

- [ ] **Step 2: Remove now-dead hub styles from global.css**

In `packages/website/src/styles/global.css`, delete the rules that were only used by the old hub markup: `.docs-index`, `.docs-quadrants`, `.docs-quadrant`, `.docs-quadrant .kind`, `.docs-quadrant .empty` (and any `main.doc.docs-index` variant). Leave `.doc-body`, `.doc-nav`, `.doc-footer`, and `main.doc` intact — the blog still uses them.

Verify nothing else references the removed classes:

Run: `grep -rn "docs-quadrant\|docs-index" packages/website/src`
Expected: no matches.

- [ ] **Step 3: Build and verify the hub**

Run: `pnpm --filter @oselvar/website build && pnpm --filter @oselvar/website preview`
Open `/var/docs/`. Expected:
- Rendered inside the docs shell (top bar + sidebar + search).
- Four area cards in order; Start here / Guides / Concepts list their pages; Reference shows "Coming soon".
- Card links navigate to the correct doc URLs.

- [ ] **Step 4: Commit**

```bash
git add packages/website/src/pages/docs/index.astro packages/website/src/styles/global.css
git commit -m "feat(website): docs hub uses DocsLayout with live area cards"
```

---

### Task 7: Front-page entry point

**Files:**
- Modify: `packages/website/src/pages/index.astro`

**Interfaces:**
- Consumes: nothing new.
- Produces: a hero CTA to the first tutorial + a "Browse docs" link.

- [ ] **Step 1: Add the CTA row to the hero**

In `packages/website/src/pages/index.astro`, add a CTA section immediately after the closing `</section>` of the `hero` block (before the `pitch` section):

```astro
    <section class="cta" aria-label="Get started">
      <a class="cta__primary" href={`${base}/docs/start-here/hello-var-your-first-spec`}>Get started →</a>
      <a class="cta__secondary" href={`${base}/docs/`}>Browse docs</a>
    </section>
```

Add the matching styles inside the page's `<style>` block (or a new one if none exists):

```astro
<style>
  .cta {
    display: flex; flex-wrap: wrap; gap: 16px; align-items: center; justify-content: center;
    margin: 8px 0 24px;
  }
  .cta__primary {
    padding: 12px 24px;
    background: var(--ink); color: var(--cream);
    border-radius: var(--radius-5); text-decoration: none; font-weight: 600;
  }
  .cta__primary:hover { background: var(--accent); }
  .cta__secondary { color: var(--ink); text-decoration: underline; text-decoration-color: var(--orange); }
  .cta__secondary:hover { color: var(--accent); }
</style>
```

- [ ] **Step 2: Build and verify the front page**

Run: `pnpm --filter @oselvar/website build && pnpm --filter @oselvar/website preview`
Open `/var/`. Expected:
- A prominent "Get started →" button linking to `/var/docs/start-here/hello-var-your-first-spec`.
- A quieter "Browse docs" link to `/var/docs/`.
- Existing hero, install snippet, and quotes still present.

- [ ] **Step 3: Commit**

```bash
git add packages/website/src/pages/index.astro
git commit -m "feat(website): front-page Get started CTA + Browse docs link"
```

---

### Task 8: Cleanup and full verification sweep

**Files:**
- Delete: `packages/website/src/layouts/Doc.astro` (only after confirming it is unused)

**Interfaces:**
- Consumes: everything above.
- Produces: a clean tree with no dead layout and a green build/check.

- [ ] **Step 1: Confirm Doc.astro is unused and delete it**

Run: `grep -rn "Doc.astro" packages/website/src`
Expected: no matches (the blog uses `Base.astro`; migrated docs use `DocsLayout`). If there are no matches, delete the file:

```bash
git rm packages/website/src/layouts/Doc.astro
```

If there ARE matches, stop and update those references to `DocsLayout` first.

- [ ] **Step 2: Confirm no stale internal links to old doc URLs**

Run: `grep -rn "docs/tutorials\|docs/how-to\|docs/explanation" packages/website/src`
Expected: no matches. (If any are found, update them to the new `/docs/<area>/<slug>` URLs.)

- [ ] **Step 3: Run the unit tests**

Run: `pnpm test docs-nav`
Expected: PASS.

- [ ] **Step 4: Run the Astro type check**

Run: `pnpm --filter @oselvar/website check`
Expected: 0 errors.

- [ ] **Step 5: Full build + index verification**

Run: `pnpm --filter @oselvar/website build`
Expected: build succeeds. Verify all expected outputs:

```bash
ls dist/docs/start-here dist/docs/guides dist/docs/concepts dist/pagefind/pagefind.js
```

Expected: all four docs directories and the Pagefind bundle exist.

- [ ] **Step 6: Manual smoke test on a built preview**

Run: `pnpm --filter @oselvar/website preview`
Walk through, desktop and narrow widths:
- Front page → "Get started" → tutorial renders in the docs shell.
- From the tutorial, use the sidebar to jump to Guides, then Concepts (cross-area navigation without returning to the hub).
- Breadcrumb is correct on each page; current page highlighted in the sidebar.
- Search for "spec" returns ranked results that navigate correctly.
- Mobile: hamburger opens/closes the drawer (link tap, backdrop, Esc).

- [ ] **Step 7: Final commit**

```bash
git add -A packages/website
git commit -m "chore(website): remove unused Doc layout; verify docs nav end to end"
```

---

## Self-Review

**Spec coverage:**
- IA & labels → Task 1 (area registry), Tasks 3/6 (rendered).
- Content Collection backbone → Tasks 1–2.
- DocsLayout / sidebar / breadcrumb / MoreInArea → Task 3.
- Mobile drawer → Task 4.
- Pagefind search + `data-pagefind-body` → Tasks 2 (attribute) + 5 (integration/UI).
- Front-page CTA + Browse docs → Task 7.
- /docs hub restyle via DocsLayout → Task 6.
- URL change / no redirects / link updates → Tasks 2 + 8 (steps 1–2).
- Reuse palette/tokens, scoped styles → all UI tasks.
- Out-of-scope items (TOC, dark mode, tags, versioning, global prev/next, i18n) → not implemented, as intended.

**Type consistency:** `DocEntry`, `NavLink`, `NavGroup`, `Breadcrumb` names and field shapes are defined in Task 1 and used unchanged in Tasks 2/3/6. `buildNav(entries, base, currentId)`, `breadcrumbFor(entry)`, `nextInArea(entries, base, currentId)`, `loadDocEntries()` signatures match across tasks. `DocsLayout` prop names (`groups`, `breadcrumb`, `next`, `base`) match the route and hub callers.

**Placeholder scan:** No "TBD"/"add error handling"/"similar to" placeholders. The Task 3 → Task 5 `Search.astro` handoff is explicit: Task 3 creates a real one-line placeholder file, Task 5 replaces its contents (no broken import at any commit).
