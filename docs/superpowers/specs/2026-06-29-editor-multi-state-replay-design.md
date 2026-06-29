# Multi-state Editor with animated keystroke replay

**Date:** 2026-06-29
**Status:** Approved (design); ready for implementation plan
**Scope:** `@oselvar/website` only (presentation layer). No changes to `@oselvar/var*` core.

## Problem

The website's `<Editor>` (Astro + CodeMirror 6) shows a single document supplied
via its default slot. We want an editor that can hold **multiple named states**
and animate the transition between them, as if a person were live-editing the
document. The motivating use is docs/landing demonstrations of how a spec evolves
(e.g. `Given a var` → `Given a var with 3 oars`).

Behaviour:

- The editor is created with **N named states** (not just two — initial/final).
- It shows the first state initially.
- The chrome bar displays **one button per state**.
- Clicking a state's button **edits the live document** from its current text to
  that state's text, replaying the change keystroke-by-keystroke with a small
  delay between each, so it reads like someone typing.
- The user may freely edit the document first; pressing a button always animates
  from the **current** document to the target, so manual edits are respected.

## Authoring syntax

States are authored as **named Astro slots**. Source declaration order is
authoritative; the first slot is the initially-shown document; each slot's
**name is its button label** (verbatim — spaces allowed).

```astro
<Editor uri="hello.md" chrome>
  <Fragment slot="empty">{`Given a var`}</Fragment>
  <Fragment slot="one oar">{`Given a var with 1 oar`}</Fragment>
  <Fragment slot="three oars">{`Given a var with 3 oars`}</Fragment>
</Editor>
```

**Why named slots:** multi-line template-string content reads naturally as slot
children (awkward as a prop), and it is fully backward-compatible — existing
default-slot editors keep working untouched.

**Why source order is reliable:** Astro's `Slots` class
(`astro/dist/core/render/slots.js`) defines one enumerable property per slot key
while iterating `Object.keys($$slots)`, and `$$slots` is built in markup order.
Therefore `Object.keys(Astro.slots)` returns the named slots in source order.
A `default` key, if present, is ignored by the state machinery.

## Architecture

Follows the repo's functional-core / imperative-shell split:

- **Pure planner** computes the ordered list of single-character edit operations
  from `(currentText, targetText)`. Deterministic, no DOM, no timers — unit-tested.
- **Imperative scheduler** (in the existing client mount module) dispatches those
  ops onto the CodeMirror `EditorView` over time, and owns all side effects
  (timers, cancellation, DOM wiring).

### Component 1 — `Editor.astro` (changed)

- For each **named** slot, render via `await Astro.slots.render(name)`, then trim
  leading/trailing newlines and `decodeEntities(...)` — identical to today's
  default-slot handling (`Editor.astro:47-49`).
- The **first** state's text populates `data-doc` (unchanged mount path; the
  editor still boots from `data-doc`).
- Serialize the full state list `[{ name, text }, …]` as JSON into a
  `<script type="application/json" class="fe-states">…</script>` element inside
  the editor's `<figure>`. JSON (not data-attributes) avoids HTML-escaping
  pitfalls for arbitrary multi-line content.
- In the `chrome` `<figcaption class="fe-bar">`, render one
  `<button class="fe-state-btn" data-state-index="i">{name}</button>` per state.
  **Buttons are emitted only when there are ≥2 named states**, so ordinary
  single-document editors render no buttons and look exactly as before.
- When there are 0 named slots (only a default slot), behaviour is exactly today's.

### Component 2 — `src/lib/replay-plan.ts` (new, pure)

```ts
export type ReplayOp =
  | { kind: 'insert'; at: number; text: string } // text is exactly one character
  | { kind: 'delete'; at: number }               // delete one character at `at`

export function planReplay(from: string, to: string): ReplayOp[]
```

- Uses jsdiff `diffChars(from, to)` to get minimal equal/added/removed segments.
- Walks segments left-to-right maintaining an evolving caret index:
  - **equal** segment → advance caret by its length.
  - **removed** segment → emit one `{ kind: 'delete', at: caret }` per char
    (caret stays; the document shrinks under it).
  - **added** segment → emit one `{ kind: 'insert', at: caret, text: ch }` per
    char, advancing caret by 1 each time.
- Coordinates are **sequential**: each op is valid against the document as it
  stands at the moment it is applied (after all prior ops). `from === to` yields
  `[]`.
- This produces a natural left-to-right "typing" motion: localized edits (the
  common case — appends, single-region replaces) animate as a single contiguous
  region; an append is simply one `added` segment typed at the end.

### Component 3 — replay scheduler in `src/scripts/editor-mount.ts` (changed)

- At mount, if the editor's `<figure>` contains `.fe-states`, parse the JSON and
  bind each `.fe-state-btn` click to `replayTo(view, states[index].text)`.
  Wiring is local to mount, where both the `EditorView` and the chrome DOM are in
  hand — **no global exposure of the module-private `groups` map**.
- `replayTo(view, target)`:
  1. Cancel any in-flight replay for this view (token bump + `clearTimeout`).
  2. Compute `ops = planReplay(view.state.doc.toString(), target)`.
  3. Dispatch ops one per tick via `setTimeout` at a **constant interval**
     (default ~35 ms). Each dispatch carries:
     - the op's `changes` (`{ from: at, insert: text }` or `{ from: at, to: at+1 }`),
     - `selection: { anchor: caretAfterEdit }` so the cursor visibly moves,
     - `scrollIntoView: true` so long documents follow.
  4. On completion, update the active-button highlight.
- **Cancellation / "user wins":** a per-view replay token. Starting a new replay
  cancels the previous one. A user keystroke during a replay (detected in the
  existing `updateListener` by distinguishing user transactions from replay ones,
  e.g. via a transaction annotation set on replay dispatches) cancels the active
  replay. Because every replay diffs from the live document, both mid-replay edits
  and "edit first, then press a button" are handled by construction.
- **Active-state highlight:** after a replay settles, and on user edits, mark the
  button whose state text equals the current document as active (`aria-pressed` /
  active class); none if the document matches no state.
- **Auto-run is unchanged:** replayed keystrokes fire `docChanged` → the existing
  300 ms debounced run (`editor-mount.ts:100-108`), so run results refresh as the
  editor "types."

### Dependency

- Declare `diff@^8.0.4` as a **direct** dependency of `@oselvar/website`
  (currently only transitive in the lockfile). It ships its own ESM types
  (`import { diffChars } from 'diff'`), so no `@types/diff` is needed.

## Data flow

```
Author markup (named slots)
  → Editor.astro renders+decodes each slot, JSON → .fe-states, buttons in .fe-bar
    → editor-mount.ts (mount) parses .fe-states, binds button clicks
      → click: replayTo(view, target)
        → planReplay(liveDoc, target)  [pure]  → ReplayOp[]
        → timed view.dispatch per op   [shell] → CodeMirror animates
          → docChanged → existing debounced auto-run refreshes results
```

## Styling

- `.fe-state-btn` styled with Tailwind utilities to match the existing chrome bar
  (consistent with the recent "Editor chrome to Tailwind utilities" work).
- Active state visually distinguished; buttons are real `<button>`s (keyboard /
  screen-reader accessible), labelled by slot name.

## Testing

- **`replay-plan.test.ts`** (vitest, alongside existing `src/lib/*.test.ts`):
  pure append, pure delete, replace-in-middle, multiple scattered edits, identity
  (`from === to` → `[]`), empty→nonempty and nonempty→empty, and a unicode case.
  Each case applies the ops sequentially to `from` and asserts the result equals
  `to`, plus asserts op count/shape for representative inputs.
- The scheduler (timers, DOM) is imperative shell and not unit-tested; verified by
  building the site and exercising an example page.
- Gate: `pnpm -r build` (type-checks `src/`), `pnpm --filter @oselvar/website build`
  (Astro build), and `pnpm check` / `pnpm typecheck` for test files.

## Decisions & rejected alternatives

- **Named slots** over a `final`/`states` prop or an in-slot delimiter: cleanest
  multi-line authoring and backward-compatible. (Chosen by user.)
- **Infer order from slot source order** over an explicit `states` prop: less
  verbose; Astro's enumerable-slot order makes it reliable. (Chosen by user.)
- **N states, any→any** over a fixed initial/final toggle: every button simply
  diffs current→its target, which subsumes "toggle back" and supports any number
  of states. (Chosen by user.)
- **jsdiff `diffChars`** over common-prefix/suffix collapse: minimal edits for
  scattered changes while still contiguous for the common localized case.
- **Constant typing speed**, no jitter/easing/variable speed: YAGNI.

## Out of scope (YAGNI)

- Per-keystroke jitter, variable speed, easing.
- Any new diff algorithm in `var-core` (the domain `*-diff.ts` files are
  unrelated cell/param/doc-string comparisons).
- Global registry / external accessor for the `groups` map.
- Tags, lifecycle hooks, or any core-package changes.
