# Multi-state Editor with animated keystroke replay — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a website `<Editor>` hold N named states (authored as named Astro slots) and, on a per-state chrome button, animate the live document from its current text to that state's text keystroke-by-keystroke.

**Architecture:** A pure planner (`replay-plan.ts`) turns `(currentText, targetText)` into an ordered list of single-character insert/delete ops. The imperative shell in `editor-mount.ts` dispatches those ops onto the CodeMirror `EditorView` on a timer, owning all side effects (timers, cancellation, button wiring). `Editor.astro` renders the named slots into per-state data + buttons.

**Tech Stack:** Astro 7, CodeMirror 6 (`@codemirror/state`, `@codemirror/view`, `codemirror`), jsdiff (`diff@^8`), vitest, Tailwind utilities, Biome.

## Global Constraints

- **Scope:** `@oselvar/website` only. Do **not** modify `@oselvar/var*` core packages.
- **ESM-only**, `node:` imports, Node ≥ 22. Local TS imports in this package use explicit extensions (`.ts` in `src/scripts`/`src/lib` runtime imports; `.js` in `*.test.ts` imports — match the file you are editing).
- **Pure core / imperative shell:** `replay-plan.ts` must be pure — no DOM, no timers, no globals, deterministic. All timers/DOM live in `editor-mount.ts`.
- **Backward compatibility:** existing default-slot `<Editor>` usages must render and behave exactly as before. Buttons appear only when there are ≥2 named states **and** `chrome` is set.
- **Default replay speed:** constant `35` ms per keystroke. No jitter/easing/variable speed.
- **Build gates (must pass before "done"):**
  - `pnpm --filter @oselvar/website test` (vitest)
  - `pnpm -r build` (type-checks each package's `src/`)
  - `pnpm --filter @oselvar/website build` (Astro build)
  - `pnpm check` (Biome + typecheck of test files)
- **Design tokens (Tailwind colors available):** `surface`, `raised`, `sunken`, `ink`, `subtle`, `muted`, `accent`, `accent-contrast`, `strong`, `line`, `line-subtle`.

---

## File Structure

- **Create** `packages/website/src/lib/replay-plan.ts` — pure planner. Exports `ReplayOp`, `planReplay`.
- **Create** `packages/website/src/lib/replay-plan.test.ts` — vitest unit tests for the planner.
- **Modify** `packages/website/package.json` — add `diff` to `dependencies`.
- **Modify** `packages/website/src/components/Editor.astro` — render named slots → `data-states` + per-state buttons in the chrome bar.
- **Modify** `packages/website/src/scripts/editor-mount.ts` — replay scheduler, button wiring, cancellation, active-state highlight.
- **Modify** an existing demo page (chosen in Task 5) — add one multi-state `<Editor>` to exercise the feature, and verify the Astro build.

---

## Task 1: Pure replay planner

**Files:**
- Create: `packages/website/src/lib/replay-plan.ts`
- Test: `packages/website/src/lib/replay-plan.test.ts`
- Modify: `packages/website/package.json` (add `diff` dependency)

**Interfaces:**
- Consumes: jsdiff `diffChars` from `diff`.
- Produces:
  ```ts
  export type ReplayOp =
    | { kind: 'insert'; at: number; text: string } // text is exactly one character
    | { kind: 'delete'; at: number }               // delete one character at `at`
  export function planReplay(from: string, to: string): ReplayOp[]
  ```
  Guarantee: applying the ops in order to `from` (insert = splice-in `text` at `at`; delete = remove one char at `at`) yields exactly `to`. `from === to` returns `[]`.

- [ ] **Step 1: Add the `diff` dependency**

Edit `packages/website/package.json` — add to the `dependencies` object (keep the object alphabetically sorted if it already is):

```json
"diff": "^8.0.4",
```

Then install:

```bash
cd /Users/aslakhellesoy/git/oselvar/bdd && pnpm install
```

Expected: install completes; `diff` resolves to 8.0.4 (already in the lockfile transitively).

- [ ] **Step 2: Write the failing test**

Create `packages/website/src/lib/replay-plan.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { type ReplayOp, planReplay } from './replay-plan.js'

// Apply ops the same way the scheduler will: insert splices one char in,
// delete removes one char. Proves the plan actually transforms from -> to.
function applyOps(from: string, ops: readonly ReplayOp[]): string {
  let s = from
  for (const op of ops) {
    s =
      op.kind === 'insert'
        ? s.slice(0, op.at) + op.text + s.slice(op.at)
        : s.slice(0, op.at) + s.slice(op.at + 1)
  }
  return s
}

describe('planReplay', () => {
  const cases: ReadonlyArray<readonly [string, string, string]> = [
    ['identity', 'Given a var', 'Given a var'],
    ['pure append', 'Given a var', 'Given a var with 3 oars'],
    ['pure prepend', 'a var', 'Given a var'],
    ['pure delete tail', 'Given a var with 3 oars', 'Given a var'],
    ['replace in middle', 'Given a var with 1 oar', 'Given a var with 3 oars'],
    ['empty to nonempty', '', 'hello'],
    ['nonempty to empty', 'hello', ''],
    ['scattered edits', 'aXbYc', 'a1b2c'],
    ['unicode', 'café', 'cafés ☕'],
  ]

  for (const [name, from, to] of cases) {
    it(`transforms ${name}`, () => {
      const ops = planReplay(from, to)
      expect(applyOps(from, ops)).toBe(to)
    })
  }

  it('returns no ops when from === to', () => {
    expect(planReplay('same', 'same')).toEqual([])
  })

  it('emits one insert per appended character', () => {
    const ops = planReplay('ab', 'abcd')
    expect(ops).toEqual([
      { kind: 'insert', at: 2, text: 'c' },
      { kind: 'insert', at: 3, text: 'd' },
    ])
  })

  it('emits one delete per removed character at a stable index', () => {
    // Deleting "cd" from "abcd": both deletions target index 2, because each
    // delete shifts the remaining tail left under the caret.
    const ops = planReplay('abcd', 'ab')
    expect(ops).toEqual([
      { kind: 'delete', at: 2 },
      { kind: 'delete', at: 2 },
    ])
  })
})
```

- [ ] **Step 3: Run the test to verify it fails**

Run:

```bash
cd /Users/aslakhellesoy/git/oselvar/bdd && pnpm --filter @oselvar/website test -- run replay-plan
```

Expected: FAIL — `Cannot find module './replay-plan.js'` (file not yet created).

- [ ] **Step 4: Write the planner**

Create `packages/website/src/lib/replay-plan.ts`:

```ts
import { diffChars } from 'diff'

// A single keystroke-sized edit. Coordinates are sequential: each op is valid
// against the document as it stands the moment it is applied (after all prior
// ops). `insert.text` is always exactly one character.
export type ReplayOp =
  | { kind: 'insert'; at: number; text: string }
  | { kind: 'delete'; at: number }

// Plan the character-by-character transformation of `from` into `to`, in
// left-to-right document order, as if a person were typing the change.
//
// Pure and deterministic: no DOM, no timers. Uses jsdiff's minimal char diff,
// then walks the segments maintaining an evolving caret:
//   - equal   -> advance the caret past it
//   - removed -> delete one char at the caret per char (the caret stays; the
//                document shrinks left under it)
//   - added   -> insert one char at the caret per char, advancing the caret
export function planReplay(from: string, to: string): ReplayOp[] {
  const ops: ReplayOp[] = []
  let caret = 0
  for (const part of diffChars(from, to)) {
    if (part.added) {
      for (const ch of part.value) {
        ops.push({ kind: 'insert', at: caret, text: ch })
        caret += 1
      }
    } else if (part.removed) {
      for (const _ of part.value) {
        ops.push({ kind: 'delete', at: caret })
      }
    } else {
      caret += part.value.length
    }
  }
  return ops
}
```

Note on the `for (const ch of part.value)` loops: iterating a string yields code points, which keeps multi-byte characters (e.g. `☕`) as single inserts — matching how CodeMirror counts positions for BMP text in these specs. The unicode test case guards the round-trip.

- [ ] **Step 5: Run the test to verify it passes**

Run:

```bash
cd /Users/aslakhellesoy/git/oselvar/bdd && pnpm --filter @oselvar/website test -- run replay-plan
```

Expected: PASS — all `planReplay` cases green.

- [ ] **Step 6: Type-check and lint**

Run:

```bash
cd /Users/aslakhellesoy/git/oselvar/bdd && pnpm -r build && pnpm check
```

Expected: exit 0 (the new `src/` file type-checks; Biome clean; test file type-checks).

- [ ] **Step 7: Commit**

```bash
cd /Users/aslakhellesoy/git/oselvar/bdd && git add packages/website/src/lib/replay-plan.ts packages/website/src/lib/replay-plan.test.ts packages/website/package.json pnpm-lock.yaml && git commit -m "feat(website): pure planReplay for keystroke-by-keystroke edits

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Editor.astro renders named-slot states

**Files:**
- Modify: `packages/website/src/components/Editor.astro`

**Interfaces:**
- Consumes: `decodeEntities` from `../lib/step-highlight.js` (already imported); `Astro.slots`.
- Produces (read by Task 3 in `editor-mount.ts`):
  - On the `.cm-mount` element: `data-states` attribute = JSON string of `Array<{ name: string; text: string }>`, present only when there are ≥2 named slots. `data-doc` = the first state's text when named slots exist (else the default-slot text, unchanged).
  - In the chrome `<figcaption>`: one `<button class="fe-state-btn" data-state-index="{i}">{name}</button>` per state, present only when `chrome` and ≥2 named slots.

- [ ] **Step 1: Compute the named-slot states in the frontmatter**

In `packages/website/src/components/Editor.astro`, replace the current `doc` computation (lines 43-49) with state derivation. Replace this block:

```astro
// The document is the default slot. Author it as a raw string child —
// `<Editor uri="…">{`line one\nline two`}</Editor>` — so MDX/Astro passes the
// text through verbatim. The rendered slot is HTML-escaped, so decode it back
// to the raw source before handing it to CodeMirror via `data-doc`.
const doc = decodeEntities(
  (await Astro.slots.render('default')).replace(/^\n+/, '').replace(/\n+$/, ''),
)
```

with:

```astro
// The document may be authored two ways:
//  1. Default slot — a single document (backward-compatible original form).
//  2. N named slots — each is a "state"; source order is authoritative and the
//     first is shown initially. Slot name = button label. Astro's Slots class
//     exposes one enumerable property per slot in markup order, so
//     `Object.keys(Astro.slots)` preserves authoring order.
// The rendered slot is HTML-escaped, so decode it back to raw source for
// CodeMirror (via `data-doc`) and for the carried state list (via `data-states`).
const renderState = async (name: string) =>
  decodeEntities((await Astro.slots.render(name)).replace(/^\n+/, '').replace(/\n+$/, ''))

const stateNames = Object.keys(Astro.slots).filter((name) => name !== 'default')
const states = await Promise.all(
  stateNames.map(async (name) => ({ name, text: await renderState(name) })),
)

const doc = states.length > 0 ? states[0].text : await renderState('default')
const hasStates = states.length >= 2
```

- [ ] **Step 2: Carry the states to the client via a data attribute**

In the `mountAttrs` object (currently lines 51-61), add a `data-states` entry alongside the existing `data-steps` line:

```astro
  'data-steps': steps ? JSON.stringify(steps) : undefined,
  'data-states': hasStates ? JSON.stringify(states) : undefined,
```

- [ ] **Step 3: Render the state buttons in the chrome bar**

Replace the `chrome` branch of the template (currently lines 63-70):

```astro
{chrome ? (
  <figure class="file-editor my-6">
    <figcaption class="fe-bar px-[14px] py-2 bg-line-subtle text-ink font-mono text-[14px] font-semibold tracking-[0.01em]">{filename}</figcaption>
    <div {...mountAttrs}></div>
  </figure>
) : (
  <div {...mountAttrs}></div>
)}
```

with:

```astro
{chrome ? (
  <figure class="file-editor my-6">
    <figcaption class="fe-bar flex items-center gap-2 px-[14px] py-2 bg-line-subtle text-ink font-mono text-[14px] font-semibold tracking-[0.01em]">
      <span>{filename}</span>
      {hasStates && (
        <span class="fe-states-btns ml-auto flex items-center gap-1">
          {states.map((s, i) => (
            <button
              type="button"
              class="fe-state-btn px-2 py-0.5 text-[12px] font-normal rounded-none border border-line bg-surface text-ink cursor-pointer hover:bg-raised aria-pressed:bg-accent aria-pressed:text-accent-contrast aria-pressed:border-accent"
              data-state-index={i}
              aria-pressed="false"
            >{s.name}</button>
          ))}
        </span>
      )}
    </figcaption>
    <div {...mountAttrs}></div>
  </figure>
) : (
  <div {...mountAttrs}></div>
)}
```

- [ ] **Step 4: Type-check and Astro-build**

Run:

```bash
cd /Users/aslakhellesoy/git/oselvar/bdd && pnpm --filter @oselvar/website build
```

Expected: Astro build completes with exit 0. (No multi-state usage exists on a page yet — this just confirms the component compiles. Existing default-slot editors must still build.)

- [ ] **Step 5: Commit**

```bash
cd /Users/aslakhellesoy/git/oselvar/bdd && git add packages/website/src/components/Editor.astro && git commit -m "feat(website): Editor renders named-slot states and buttons

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Replay scheduler and button wiring in editor-mount.ts

**Files:**
- Modify: `packages/website/src/scripts/editor-mount.ts`

**Interfaces:**
- Consumes: `planReplay`, `ReplayOp` from `../lib/replay-plan.ts`; `Annotation` from `@codemirror/state`; the `EditorView` created in `mountEditor`; the `data-states` attribute and `.fe-state-btn` buttons from Task 2.
- Produces: replay behavior wired at mount. No new exports.

- [ ] **Step 1: Import `Annotation` and the planner**

At the top of `packages/website/src/scripts/editor-mount.ts`, extend the existing `@codemirror/state` import and add the planner import. Change:

```ts
import type { Extension } from '@codemirror/state'
```

to:

```ts
import { Annotation, type Extension } from '@codemirror/state'
```

and add alongside the other `../lib/*` imports:

```ts
import { planReplay } from '../lib/replay-plan.ts'
```

- [ ] **Step 2: Add the replay scheduler block**

Insert this block immediately above `function mountEditor(` (after `autoRun`, around line 116):

```ts
// Transactions produced by replay are tagged so the auto-run listener can tell
// them apart from genuine user edits (a real user edit cancels an active replay
// — the user always wins).
const replayTxn = Annotation.define<boolean>()

const REPLAY_MS = 35 // constant per-keystroke delay

type ReplayState = { token: number; timer?: ReturnType<typeof setTimeout> }
const replays = new WeakMap<EditorView, ReplayState>()

// Per-view UI for the active-state highlight: the ordered states and their
// buttons, so we can mark the button whose text equals the current document.
type StateUI = {
  readonly states: ReadonlyArray<{ name: string; text: string }>
  readonly buttons: ReadonlyArray<HTMLButtonElement>
}
const stateUIs = new WeakMap<EditorView, StateUI>()

function cancelReplay(view: EditorView): void {
  const r = replays.get(view)
  if (r) {
    r.token += 1
    if (r.timer) clearTimeout(r.timer)
    r.timer = undefined
  }
}

// Mark the button whose state text equals the current document; clear the rest.
function refreshActiveState(view: EditorView): void {
  const ui = stateUIs.get(view)
  if (!ui) return
  const current = view.state.doc.toString()
  ui.buttons.forEach((btn, i) => {
    btn.setAttribute('aria-pressed', String(ui.states[i]?.text === current))
  })
}

// Animate the live document into `target`, one keystroke per REPLAY_MS tick.
// Always diffs from the *current* doc, so manual edits (before or mid-replay)
// are respected.
function replayTo(view: EditorView, target: string): void {
  cancelReplay(view)
  const r = replays.get(view) ?? { token: 0 }
  replays.set(view, r)
  const token = r.token
  const ops = planReplay(view.state.doc.toString(), target)
  let i = 0
  const step = (): void => {
    const cur = replays.get(view)
    if (!cur || cur.token !== token) return // superseded or cancelled
    if (i >= ops.length) {
      refreshActiveState(view)
      return
    }
    const op: ReplayOp = ops[i++] as ReplayOp
    if (op.kind === 'insert') {
      const caret = op.at + op.text.length
      view.dispatch({
        changes: { from: op.at, insert: op.text },
        selection: { anchor: caret },
        scrollIntoView: true,
        annotations: replayTxn.of(true),
      })
    } else {
      view.dispatch({
        changes: { from: op.at, to: op.at + 1 },
        selection: { anchor: op.at },
        scrollIntoView: true,
        annotations: replayTxn.of(true),
      })
    }
    cur.timer = setTimeout(step, REPLAY_MS)
  }
  step()
}
```

Note: `ReplayOp` is referenced for the local annotation — add it to the planner import: change `import { planReplay } from '../lib/replay-plan.ts'` to `import { type ReplayOp, planReplay } from '../lib/replay-plan.ts'`.

- [ ] **Step 3: Cancel replay on genuine user edits (extend `autoRun`)**

Replace the existing `autoRun` (currently lines 110-115):

```ts
// Re-run (debounced) only the group whose editor changed — no run buttons.
function autoRun(groupId: string) {
  return EditorView.updateListener.of((u) => {
    if (u.docChanged) scheduleRun(groupId)
  })
}
```

with:

```ts
// Re-run (debounced) only the group whose editor changed — no run buttons.
// A genuine user edit (not one of our replay transactions) cancels any active
// replay and refreshes the active-state highlight.
function autoRun(groupId: string) {
  return EditorView.updateListener.of((u) => {
    if (!u.docChanged) return
    const isReplay = u.transactions.some((tr) => tr.annotation(replayTxn))
    if (!isReplay) cancelReplay(u.view)
    refreshActiveState(u.view)
    scheduleRun(groupId)
  })
}
```

(`autoRun` is defined above the scheduler block from Step 2, but `replayTxn`/`cancelReplay`/`refreshActiveState` are module-level bindings — hoisting makes them available at call time. If your linter flags use-before-define for these `const`s, move the Step 2 block to just above `autoRun` instead; behavior is identical.)

- [ ] **Step 4: Wire the buttons at mount time**

In `mountEditor`, after `const view = new EditorView({ doc, extensions: ext, parent: el })` and `group.views.set(uri, view)` (currently lines 169-170), and before `return view`, insert:

```ts
  // Wire multi-state replay buttons, if this editor carries states. The buttons
  // were rendered server-side in the enclosing chrome figcaption; bind each to a
  // replay toward its state's text. Wiring is local to mount — no global view map.
  if (el.dataset.states) {
    try {
      const states = JSON.parse(el.dataset.states) as Array<{ name: string; text: string }>
      const figure = el.closest('figure.file-editor')
      const buttons = figure
        ? [...figure.querySelectorAll<HTMLButtonElement>('.fe-state-btn')]
        : []
      if (buttons.length === states.length && buttons.length > 0) {
        buttons.forEach((btn, i) => {
          btn.addEventListener('click', () => replayTo(view, states[i].text))
        })
        stateUIs.set(view, { states, buttons })
        refreshActiveState(view)
      }
    } catch {
      // Malformed states — the editor simply renders without replay buttons.
    }
  }
```

- [ ] **Step 5: Type-check, lint, and Astro-build**

Run:

```bash
cd /Users/aslakhellesoy/git/oselvar/bdd && pnpm -r build && pnpm check && pnpm --filter @oselvar/website build
```

Expected: all exit 0.

- [ ] **Step 6: Commit**

```bash
cd /Users/aslakhellesoy/git/oselvar/bdd && git add packages/website/src/scripts/editor-mount.ts && git commit -m "feat(website): animate editor between named states on button click

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Manual verification with a real example

**Files:**
- Modify: `packages/website/src/pages/playground.astro` (add one multi-state editor for verification)

**Interfaces:**
- Consumes: the `<Editor>` component (named-slot form).

- [ ] **Step 1: Add a multi-state editor to the playground page**

Open `packages/website/src/pages/playground.astro`. Add a multi-state `<Editor>` instance (place it near the existing editors in the page body — match the surrounding indentation):

```astro
<Editor uri="oars.md" chrome lineNumbers>
  <Fragment slot="empty">{`Feature: Oars

Scenario: counting
  Given a var`}</Fragment>
  <Fragment slot="one oar">{`Feature: Oars

Scenario: counting
  Given a var with 1 oar`}</Fragment>
  <Fragment slot="three oars">{`Feature: Oars

Scenario: counting
  Given a var with 3 oars`}</Fragment>
</Editor>
```

- [ ] **Step 2: Build the site**

Run:

```bash
cd /Users/aslakhellesoy/git/oselvar/bdd && pnpm --filter @oselvar/website build
```

Expected: exit 0.

- [ ] **Step 3: Manually verify in the dev server**

Run:

```bash
cd /Users/aslakhellesoy/git/oselvar/bdd && pnpm --filter @oselvar/website dev
```

Then open the playground page in a browser and confirm:
- The editor shows the `empty` state initially, and the `empty` button is highlighted (`aria-pressed="true"`).
- Clicking `three oars` animates the document changing `1 oar`/empty → `with 3 oars` keystroke-by-keystroke (cursor visibly moves).
- Clicking `empty` animates back.
- Typing into the editor manually mid-animation stops the animation (the user wins) and clears the active highlight if the text no longer matches a state.
- Editing the doc first, then clicking a state, animates from the edited text.

Stop the dev server (Ctrl-C) when done.

- [ ] **Step 4: Decide whether to keep the example**

The playground editor was added for verification. Keep it if it reads as a useful demo; otherwise revert just that file:

```bash
cd /Users/aslakhellesoy/git/oselvar/bdd && git checkout packages/website/src/pages/playground.astro
```

- [ ] **Step 5: Commit (only if the example is kept)**

```bash
cd /Users/aslakhellesoy/git/oselvar/bdd && git add packages/website/src/pages/playground.astro && git commit -m "docs(website): multi-state replay demo on playground

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- N named states via named slots, source order, first = initial → Task 2 (Step 1) + Task 1 data shape. ✅
- Slot name = button label → Task 2 (Step 3). ✅
- Buttons only when ≥2 states and `chrome`; backward-compatible default slot → Task 2 (`hasStates`, Step 3 guard; Step 1 default-slot fallback). ✅
- Pure planner `planReplay` with `ReplayOp` shape, jsdiff, sequential coords, identity → `[]` → Task 1. ✅
- Replay scheduler: constant 35 ms, dispatch with `changes`+`selection`+`scrollIntoView` → Task 3 (Step 2). ✅
- Cancellation: new replay supersedes; user edit during replay cancels (transaction annotation) → Task 3 (Steps 2-3). ✅
- Always diff from live doc (edit-then-press, edit-mid-replay) → Task 3 (`replayTo` reads `view.state.doc`). ✅
- Active-state highlight; none when doc matches no state → Task 3 (`refreshActiveState`). ✅
- Auto-run unchanged (debounced 300 ms) → Task 3 keeps `scheduleRun`. ✅
- `diff` declared as direct dependency → Task 1 (Step 1). ✅
- No `var-core`/global-map changes; wiring local to mount → Task 3 (Step 4). ✅
- Unit tests for planner (append, delete, replace, scattered, identity, empty↔, unicode) → Task 1 (Step 2). ✅

**Placeholder scan:** No TBD/TODO; every code step shows complete code; commands have expected output. ✅

**Type consistency:** `ReplayOp` shape identical in Task 1 (defined) and Task 3 (imported/used). `planReplay(from, to): ReplayOp[]` signature consistent. `data-states` JSON shape `{name, text}` consistent between Task 2 (writer) and Task 3 (reader). `replayTxn`/`cancelReplay`/`refreshActiveState`/`replayTo`/`stateUIs` names consistent across Task 3 steps. ✅
