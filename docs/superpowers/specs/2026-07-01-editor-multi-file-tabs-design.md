# Editor multi-file tabs (`<Editor>`/`<File>`) — Design

**Date:** 2026-07-01
**Status:** Approved (brainstorm complete)
**Area:** `packages/website-starlight` only — `packages/website`'s `Editor.astro` is untouched.

## Goal

Replace the current `<Editor uri chrome steps>` API — one visible document plus
an optional hidden step-files array — with `<Editor><File uri>…</File><File
uri>…</File></Editor>`: every file involved (spec + its step files) is an
explicit, visible `<File>` child, switchable via tabs in an always-present
chrome bar. Remove the `steps`, `chrome`, and `group` props entirely.

## Current state (what's being replaced)

- `Editor.astro` takes one document (default slot or named-slot "states"), an
  optional `steps` prop carrying *hidden* companion files, an optional
  `chrome` prop, and a `group` string used to make multiple `<Editor>`
  instances on a page run together and share LSP indexing.
- `editor-mount.ts` keeps a **global `groups: Map<string, Group>`** keyed by
  that user-supplied string, used both for scheduling runs (find the `.md`
  view in the group, run it against the `.steps.ts` views/hidden steps in the
  same group) and nothing else — LSP indexing is actually global across the
  whole page (one shared `LSPClient`/worker), not per-group.
- `var-worker.ts` (the LSP worker) seeds its in-browser filesystem from a
  **hardcoded `SEED_FILES` map** built from raw imports chosen by hand. This
  session added to it twice for two new examples — a recurring maintenance
  step every time a new example is authored.
- Multi-file "state" replay (a single file animating keystroke-by-keystroke
  between named versions) already exists via named slots on `<Editor>`.

## Component design

### `<File uri="...">` — data-only, no chrome, no CodeMirror concerns

Renders one hidden marker element carrying the file's `uri` and document text,
plus (unchanged from today's `<Editor>` states mechanism, just moved down one
level) JSON-encoded `states` if authored with named `<Fragment slot="...">`
children instead of a single default-slot document:

```astro
---
import { decodeEntities } from './step-highlight.js'
interface Props { uri: string }
const { uri } = Astro.props
const renderState = async (name: string) =>
  decodeEntities((await Astro.slots.render(name)).replace(/^\n+/, '').replace(/\n+$/, ''))
const stateNames = Object.keys(Astro.slots).filter((n) => n !== 'default')
const states = await Promise.all(stateNames.map(async (name) => ({ name, text: await renderState(name) })))
const doc = states.length > 0 ? states[0].text : await renderState('default')
---
<div
  data-var-file
  data-uri={uri}
  data-doc={doc}
  data-states={states.length >= 2 ? JSON.stringify(states) : undefined}
  hidden
></div>
```

No CSS, no CodeMirror, no run/LSP logic — purely a data carrier the parent
`<Editor>`'s client script reads out of the live DOM. This is the exact
`decodeEntities` → JSON-attribute technique `Editor.astro` already uses for
states today, moved to a smaller, focused component.

### `<Editor>` — always-on chrome, owns mounting/tabs/run/LSP wiring

```astro
---
interface Props {
  lineNumbers?: boolean   // default false, applies to every File tab
  folding?: boolean       // default false, applies to every File tab
  define?: boolean        // default true; step-gen affordance, markdown files only
  replayMs?: number       // default 100; per-keystroke delay for state replay
}
const { lineNumbers = false, folding = false, define = true, replayMs = 100 } = Astro.props
---
<figure
  class="file-editor"
  data-line-numbers={String(lineNumbers)}
  data-folding={String(folding)}
  data-define={String(define)}
  data-replay-ms={String(replayMs)}
>
  <div class="fe-tabs" role="tablist"></div>          <!-- populated client-side -->
  <div class="cm-mount not-content"></div>
  <div class="fe-footer" hidden></div>                 <!-- populated client-side, only when active File has ≥2 states -->
  <div hidden><slot /></div>                            <!-- <File> marker elements render here -->
</figure>
<script>
  import '../scripts/editor-mount.ts'
</script>
```

No more `chrome`/`steps`/`group` props. `uri` moves to `<File>` (an `<Editor>`
with one `<File>` is the trivial single-file case — no special-casing needed,
the tab bar just renders one tab).

## Client-side architecture (`editor-mount.ts`)

### The global `groups` map is deleted

Each `<Editor>` (a `.file-editor` element) is now self-contained: its own
`<File>` children are unambiguously "this editor's files" — no cross-component
string key needed to associate a spec with its step files, or to decide what
runs together. `mountEditor(el)` becomes the single unit of state (a plain
object/closure per `.file-editor` instance) holding:
- one `EditorView` per `<File>` (created eagerly for all files on mount, not
  lazily on first tab activation — consistent with how the two front-page
  examples already both mount eagerly today; hidden via CSS except the active
  one, so each file keeps its own edit/undo/scroll state when you switch tabs)
- which tab is active
- the debounced auto-run timer (was per-group, now per-editor-instance)

Running: among an editor's File views, whichever `uri` ends in `.md` is the
spec; the rest (`.steps.ts`) are step files — same split `run-grouping.ts`
already does, just scoped to one `.file-editor`'s own views instead of a
global map lookup. `run-grouping.ts`'s pure logic is reusable as-is; only the
*caller* (which today reaches into the global `groups` map) changes.

### Tab bar (header) vs. state controls (footer) — two separate UIs

- **Header (`.fe-tabs`, always visible):** one button per `<File>`, label =
  the `uri`'s basename (same `filename` derivation `Editor.astro` already
  does today). Click → show that file's `EditorView`, hide the others, update
  which file the footer reflects.
- **Footer (`.fe-footer`, hidden unless the *active* file has ≥2 states):**
  the state-replay buttons that exist today (`replayTo`), scoped to whichever
  file is currently the active tab. Switching tabs re-renders the footer for
  the newly-active file (empty/hidden if that file has 0 or 1 states).

These are independent: tab-switching never triggers a replay, and picking a
state replay never changes which tab is shown.

### LSP seeding: MessageChannel handshake, not a hardcoded list

Verified before writing this down (`node_modules/vscode-jsonrpc/lib/browser/main.js`):
`BrowserMessageReader`'s constructor does `port.onmessage = this._messageListener`
— a direct property assignment on whatever port it's given. `var-worker.ts`
currently calls `new BrowserMessageReader(self as DedicatedWorkerGlobalScope)`,
which claims `self`'s entire message channel for LSP JSON-RPC. A second,
independent `postMessage` for seed data over that same channel would either
be silently swallowed by the LSP reader or clobber it, depending on
assignment order — not safe to just bolt on.

Fix: hand the worker a **dedicated `MessagePort`** for LSP traffic, reserving
`self`'s default channel for a one-time startup handshake only:

1. `editor-mount.ts`, before creating the worker, walks the whole page:
   `document.querySelectorAll('[data-var-file]')` → `{ path, content }` for
   every mounted `<File>` (path = `uri` with the `file://` scheme stripped;
   content = that file's *initial* document — states aren't seeded
   separately, only the one live document per `uri`, matching today's
   behavior for the two examples that don't use states at all).
2. Create the worker, create a `new MessageChannel()`, and
   `worker.postMessage({ seed }, [channel.port2])` — the one and only message
   ever sent over the worker's default channel.
3. In `var-worker.ts`, `self.onmessage` (used exactly once) receives
   `{ seed }` in `event.data` and the transferred port as `event.ports[0]`
   (the standard way a transferred `MessagePort` arrives — not embedded in
   `.data`). It then does `self.onmessage = null` (stop listening on the
   default channel entirely) and constructs
   `new BrowserMessageReader(port)` / `new BrowserMessageWriter(port)` against
   that dedicated port instead of `self`. `createMemoryFileSystem(seed)`
   already exists and takes exactly this shape.
4. `editor-mount.ts` keeps `channel.port1` and passes it to
   `workerTransport(...)` instead of the raw `Worker`. `worker-transport.ts`
   itself needs no logic change — it only calls `.postMessage`/
   `.addEventListener('message', …)`, which `MessagePort` and `Worker` both
   support identically — just a type signature widening (or a small shared
   structural type) so it accepts either.
5. No explicit `port.start()` call is needed: per spec, assigning
   `.onmessage` on a `MessagePort` implicitly starts it, and `MessagePort`
   buffers messages sent before a receiver is listening — no race between
   "worker not ready yet" and "main thread already posting", since
   `client.plugin(uri)` calls (which are what actually send LSP traffic)
   only happen after `lspClient()` returns, which is after the handshake
   `postMessage` call.

This removes `var-worker.ts`'s hardcoded `SEED_FILES` map and its raw
`?raw` imports of every example file entirely — the seed is now exactly
"every `<File>` actually on the current page," derived live, with zero
manual maintenance per new example.

## What's out of scope

- `packages/website`'s `Editor.astro`/`editor-mount.ts` — untouched, keeps
  today's `steps`/`chrome`/`group` API. This redesign is `website-starlight`
  only.
- No change to how `run-worker.ts` executes a spec once it has a `.md` +
  step-file bundle, or to `run-spec.ts`'s pure execution logic — only *how
  that bundle gets assembled* changes (per-`.file-editor` instance instead of
  a global group-keyed map).
- No change to `cm-run.ts`'s decoration logic, `cm-semantic-tokens.ts`, or
  the request-ID correlation fix already landed in `run-client.ts` — this
  redesign builds on top of that fix, doesn't touch it.
- `idb-file-system.ts` is now dead code (superseded by the already-landed
  `memory-file-system.ts`) and gets deleted as part of this work, since
  nothing references it anymore.

## Migration

`index.mdx`'s two `<Editor>` invocations (Yahtzee, Roman numerals) are
rewritten from the `steps`-prop form to explicit `<File>` children each. Both
currently pass exactly one step file, so each becomes a two-`<File>` editor
(the `.md`, then the `.steps.ts`).

## Testing

- Build: `pnpm -r build` / `pnpm check` green, same bar as every prior step
  this session.
- Manual, via Playwright (the same methodology that caught the margin bug and
  the request-ID race this session): verify tab-switching preserves each
  file's independent edit state, verify the run result is still correct for
  both examples (yahtzee all-pass, roman-numerals single-fail-on-the-paragraph-line,
  matching the ground truth already established via the CLI), verify semantic
  highlighting still works with the dynamically-derived seed, verify a fresh
  page load with **only** the roman-numerals tab active still seeds yahtzee's
  files too (seed collection happens once up front, across the whole page,
  before any single editor mounts).
