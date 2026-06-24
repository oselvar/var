# Generate Step Definition Affordance — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In the browser playground, selecting a phrase in the `.var.md` editor shows a "Create step definition" affordance that, on confirm, appends a generated `step(...)` block to the `.steps.ts` editor — selected, flashed, and scrolled into view.

**Architecture:** One new client module (`packages/website/src/lib/cm-generate-step.ts`) holding a pure placement helper, an await-able orchestration function, a flash decoration, and the on-selection affordance (CodeMirror tooltip + debounce + keymap). One wiring change in `editor-mount.ts`. Snippet generation reuses the existing `var/generateSnippet` worker request unchanged — no core/LSP/worker changes.

**Tech Stack:** TypeScript (ESM), CodeMirror 6 (`@codemirror/state`, `@codemirror/view`, `@codemirror/lsp-client`), Astro website package, vitest (node env).

## Global Constraints

- **ESM only**, Node ≥ 22. Relative imports use `.js` extensions even from `.ts` sources (e.g. `import { x } from './cm-generate-step.js'`).
- **Biome style:** single quotes, no semicolons, 2-space indent, trailing commas `all`, line width 100. Run `pnpm lint` (= `biome check .`) — it must pass.
- **Immutable data, pure core.** `appendStepDef` and `runGenerateStepDef`'s placement logic are pure; the only side effects are `view.dispatch`/`focus` and DOM in the view layer.
- **No changes** to `packages/var`, `packages/var-lsp`, or the worker protocol. Reuse `var/generateSnippet`.
- **Tests run from repo root** with `pnpm test <pattern>` (= `NODE_OPTIONS="--import tsx" vitest run <pattern>`). The website test env is **node — no DOM**. Only headless logic (pure functions + `EditorState`-level `StateField` behavior) is unit-tested; tooltip DOM, debounce timers, and keymap wiring are verified by building and a manual browser check.
- Website build/lint commands: `pnpm --filter @oselvar/website build` and `pnpm lint`.

---

### Task 1: Pure placement helper `appendStepDef`

**Files:**
- Create: `packages/website/src/lib/cm-generate-step.ts`
- Test: `packages/website/src/lib/cm-generate-step.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `appendStepDef(stepsDoc: string, fullCode: string): { changes: ChangeSpec; from: number; to: number }` — computes a change that appends `fullCode` (trimmed) at end of `stepsDoc`, separated from existing content by exactly one blank line, ending with a newline. `from`/`to` are the offsets of the inserted block **in the resulting document**.

- [ ] **Step 1: Write the failing test**

Create `packages/website/src/lib/cm-generate-step.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { appendStepDef } from './cm-generate-step.js'

// Apply the returned change to the original string the way CodeMirror would,
// so we can assert on the resulting document and the [from, to) slice.
function apply(doc: string, change: { from: number; to: number; insert: string }): string {
  return doc.slice(0, change.from) + change.insert + doc.slice(change.to)
}

const BLOCK = "step('I greet {string}', (ctx, user: string) => {\n})\n"

describe('appendStepDef', () => {
  it('appends to an empty document with no leading separator', () => {
    const { changes, from, to } = appendStepDef('', BLOCK)
    const result = apply('', changes as { from: number; to: number; insert: string })
    expect(result).toBe("step('I greet {string}', (ctx, user: string) => {\n})\n")
    expect(result.slice(from, to)).toBe(BLOCK.trim())
  })

  it('separates from existing content with exactly one blank line', () => {
    const existing = "step('a', (ctx) => {\n})\n"
    const { changes, from, to } = appendStepDef(existing, BLOCK)
    const result = apply(existing, changes as { from: number; to: number; insert: string })
    expect(result).toBe("step('a', (ctx) => {\n})\n\n" + BLOCK.trim() + '\n')
    expect(result.slice(from, to)).toBe(BLOCK.trim())
  })

  it('normalises an existing trailing blank-line run to a single separator', () => {
    const existing = "step('a', (ctx) => {\n})\n\n\n"
    const { changes, from, to } = appendStepDef(existing, BLOCK)
    const result = apply(existing, changes as { from: number; to: number; insert: string })
    expect(result).toBe("step('a', (ctx) => {\n})\n\n" + BLOCK.trim() + '\n')
    expect(result.slice(from, to)).toBe(BLOCK.trim())
  })

  it('two successive appends stack with single separators', () => {
    const first = appendStepDef('', BLOCK)
    const doc1 = apply('', first.changes as { from: number; to: number; insert: string })
    const second = appendStepDef(doc1, BLOCK)
    const doc2 = apply(doc1, second.changes as { from: number; to: number; insert: string })
    expect(doc2).toBe(BLOCK.trim() + '\n\n' + BLOCK.trim() + '\n')
    expect(doc2.slice(second.from, second.to)).toBe(BLOCK.trim())
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test cm-generate-step`
Expected: FAIL — cannot resolve `./cm-generate-step.js` / `appendStepDef is not a function`.

- [ ] **Step 3: Write minimal implementation**

Create `packages/website/src/lib/cm-generate-step.ts`:

```ts
import type { ChangeSpec } from '@codemirror/state'

// Pure: compute the change that appends `fullCode` to the end of `stepsDoc`,
// separated from existing content by exactly one blank line, with a trailing
// newline. Returns the change plus the [from, to) offsets of the inserted
// block in the resulting document.
export function appendStepDef(
  stepsDoc: string,
  fullCode: string,
): { changes: ChangeSpec; from: number; to: number } {
  const block = fullCode.trim()
  const body = stepsDoc.replace(/\s*$/, '') // existing content without trailing whitespace
  if (body.length === 0) {
    return { changes: { from: 0, to: stepsDoc.length, insert: `${block}\n` }, from: 0, to: block.length }
  }
  const insert = `\n\n${block}\n`
  const from = body.length + 2
  return { changes: { from: body.length, to: stepsDoc.length, insert }, from, to: from + block.length }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test cm-generate-step`
Expected: PASS (4 tests).

- [ ] **Step 5: Lint**

Run: `pnpm lint`
Expected: no errors for the new files.

- [ ] **Step 6: Commit**

```bash
git add packages/website/src/lib/cm-generate-step.ts packages/website/src/lib/cm-generate-step.test.ts
git commit -m "feat(website): pure appendStepDef placement helper"
```

---

### Task 2: Orchestration `runGenerateStepDef` + `flashRange` effect

**Files:**
- Modify: `packages/website/src/lib/cm-generate-step.ts`
- Test: `packages/website/src/lib/cm-generate-step.test.ts`

**Interfaces:**
- Consumes: `appendStepDef` (Task 1).
- Produces:
  - `type EditorLike = { state: EditorState; dispatch: (tr: TransactionSpec) => void; focus?: () => void }` — `EditorView` satisfies this; tests pass an `EditorState` + capturing `dispatch`.
  - `type GenerateSnippet = (text: string) => Promise<{ fullCode: string; expression: string }>`
  - `flashRange: StateEffect<{ from: number; to: number } | null>`
  - `runGenerateStepDef(opts: { specView: EditorLike; stepsView: EditorLike; generate: GenerateSnippet }): Promise<{ from: number; to: number; expression: string } | null>` — reads the spec's primary selection (empty → `null`), awaits `generate(text)`, appends to the steps view, dispatches selection + flash + `scrollIntoView`, focuses, and resolves with the inserted range.

- [ ] **Step 1: Write the failing test**

Append to `packages/website/src/lib/cm-generate-step.test.ts`:

```ts
import { EditorSelection, EditorState, type TransactionSpec } from '@codemirror/state'
import { flashRange, runGenerateStepDef } from './cm-generate-step.js'

// Minimal headless EditorLike backed by an EditorState (no DOM).
function editor(doc: string, selection?: { anchor: number; head: number }) {
  let state = EditorState.create({ doc, selection })
  return {
    get state() {
      return state
    },
    dispatch(tr: TransactionSpec) {
      state = state.update(tr).state
    },
    focus() {},
  }
}

describe('runGenerateStepDef', () => {
  const generate = (text: string) =>
    Promise.resolve({ fullCode: `step('${text}', (ctx) => {\n})\n`, expression: text })

  it('returns null and does not touch the steps view when the selection is empty', async () => {
    const spec = editor('I greet world', { anchor: 3, head: 3 })
    const steps = editor("step('a', (ctx) => {\n})\n")
    const before = steps.state.doc.toString()
    const result = await runGenerateStepDef({ specView: spec, stepsView: steps, generate })
    expect(result).toBeNull()
    expect(steps.state.doc.toString()).toBe(before)
  })

  it('appends the generated snippet and selects the inserted block', async () => {
    const spec = editor('I greet world', { anchor: 2, head: 7 }) // selects "greet"
    const steps = editor("step('a', (ctx) => {\n})\n")
    const result = await runGenerateStepDef({ specView: spec, stepsView: steps, generate })
    expect(result).not.toBeNull()
    const doc = steps.state.doc.toString()
    expect(doc).toContain("step('greet', (ctx) => {")
    expect(doc.slice(result!.from, result!.to)).toBe("step('greet', (ctx) => {\n})")
    const sel = steps.state.selection.main
    expect([sel.from, sel.to]).toEqual([result!.from, result!.to])
    expect(result!.expression).toBe('greet')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test cm-generate-step`
Expected: FAIL — `runGenerateStepDef`/`flashRange` are not exported.

- [ ] **Step 3: Write minimal implementation**

Edit `packages/website/src/lib/cm-generate-step.ts` — change the import line and append the new exports:

```ts
import { EditorSelection, StateEffect, type ChangeSpec, type EditorState, type TransactionSpec } from '@codemirror/state'
```

```ts
// A subset of EditorView this module needs — so the orchestration can be
// driven headlessly (an EditorState plus a capturing dispatch) in node tests.
export type EditorLike = {
  state: EditorState
  dispatch: (tr: TransactionSpec) => void
  focus?: () => void
}

export type GenerateSnippet = (text: string) => Promise<{ fullCode: string; expression: string }>

// Carries the range to flash after an insert (null clears it).
export const flashRange = StateEffect.define<{ from: number; to: number } | null>()

export async function runGenerateStepDef(opts: {
  specView: EditorLike
  stepsView: EditorLike
  generate: GenerateSnippet
}): Promise<{ from: number; to: number; expression: string } | null> {
  const sel = opts.specView.state.selection.main
  if (sel.empty) return null
  const text = opts.specView.state.sliceDoc(sel.from, sel.to)
  const { fullCode, expression } = await opts.generate(text)
  const { changes, from, to } = appendStepDef(opts.stepsView.state.doc.toString(), fullCode)
  opts.stepsView.dispatch({
    changes,
    selection: EditorSelection.range(from, to),
    effects: flashRange.of({ from, to }),
    scrollIntoView: true,
  })
  opts.stepsView.focus?.()
  return { from, to, expression }
}
```

(Remove the now-redundant standalone `import type { ChangeSpec }` line — `ChangeSpec` is imported in the combined line above.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test cm-generate-step`
Expected: PASS (6 tests total).

- [ ] **Step 5: Lint**

Run: `pnpm lint`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add packages/website/src/lib/cm-generate-step.ts packages/website/src/lib/cm-generate-step.test.ts
git commit -m "feat(website): runGenerateStepDef orchestration + flashRange effect"
```

---

### Task 3: Flash decoration field, clear plugin, theme

**Files:**
- Modify: `packages/website/src/lib/cm-generate-step.ts`
- Test: `packages/website/src/lib/cm-generate-step.test.ts`

**Interfaces:**
- Consumes: `flashRange` (Task 2).
- Produces: `flashExtension(): Extension` — a bundle of `[flashField, flashClearPlugin, flashTheme]`. `flashField: StateField<DecorationSet>` adds a `.cm-stepgen-flash` mark over the flashed range and clears it on `flashRange.of(null)`; the plugin auto-clears after 600 ms. The field is exported for testing.

- [ ] **Step 1: Write the failing test**

Append to `packages/website/src/lib/cm-generate-step.test.ts`:

```ts
import { flashField } from './cm-generate-step.js'

describe('flashField', () => {
  it('adds one decoration on flashRange set and clears it on null', () => {
    let state = EditorState.create({ doc: 'abcdef', extensions: [flashField] })
    state = state.update({ effects: flashRange.of({ from: 1, to: 4 }) }).state
    expect(state.field(flashField).size).toBe(1)
    state = state.update({ effects: flashRange.of(null) }).state
    expect(state.field(flashField).size).toBe(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test cm-generate-step`
Expected: FAIL — `flashField` is not exported.

- [ ] **Step 3: Write minimal implementation**

Add to the imports at the top of `cm-generate-step.ts`:

```ts
import { StateField, type Extension } from '@codemirror/state'
import { Decoration, EditorView, ViewPlugin, type DecorationSet, type ViewUpdate } from '@codemirror/view'
```

(Merge `StateField`/`Extension` into the existing `@codemirror/state` import line rather than duplicating the module specifier — biome's import organizer will flag duplicates.)

Append:

```ts
const flashMark = Decoration.mark({ class: 'cm-stepgen-flash' })

export const flashField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    deco = deco.map(tr.changes)
    for (const e of tr.effects) {
      if (e.is(flashRange)) {
        deco = e.value ? Decoration.set([flashMark.range(e.value.from, e.value.to)]) : Decoration.none
      }
    }
    return deco
  },
  provide: (f) => EditorView.decorations.from(f),
})

// Clears the flash ~600ms after it is set (view-layer; uses window timers).
const flashClearPlugin = ViewPlugin.fromClass(
  class {
    timer: ReturnType<typeof setTimeout> | undefined
    constructor(readonly view: EditorView) {}
    update(u: ViewUpdate): void {
      for (const tr of u.transactions) {
        for (const e of tr.effects) {
          if (e.is(flashRange) && e.value) {
            clearTimeout(this.timer)
            this.timer = setTimeout(() => this.view.dispatch({ effects: flashRange.of(null) }), 600)
          }
        }
      }
    }
    destroy(): void {
      clearTimeout(this.timer)
    }
  },
)

const flashTheme = EditorView.baseTheme({
  '.cm-stepgen-flash': {
    backgroundColor: 'rgba(255, 46, 136, 0.28)',
    transition: 'background-color 0.4s ease',
  },
})

export function flashExtension(): Extension {
  return [flashField, flashClearPlugin, flashTheme]
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test cm-generate-step`
Expected: PASS (7 tests total).

- [ ] **Step 5: Lint and build**

Run: `pnpm lint`
Expected: no errors.
Run: `pnpm --filter @oselvar/website build`
Expected: build succeeds (module bundles).

- [ ] **Step 6: Commit**

```bash
git add packages/website/src/lib/cm-generate-step.ts packages/website/src/lib/cm-generate-step.test.ts
git commit -m "feat(website): flash decoration for the inserted step definition"
```

---

### Task 4: On-selection affordance (field + tooltip + debounce + keymap)

**Files:**
- Modify: `packages/website/src/lib/cm-generate-step.ts`
- Test: `packages/website/src/lib/cm-generate-step.test.ts`

**Interfaces:**
- Consumes: `runGenerateStepDef`, `flashExtension` (Tasks 2–3).
- Produces:
  - `setAffordance: StateEffect<{ from: number; to: number } | null>` and `affordanceField: StateField<{ from: number; to: number } | null>` (exported for testing) — `affordanceField` holds the active selection range; it is set by `setAffordance` and cleared by any selection-changing transaction that does not itself carry a `setAffordance` effect.
  - `stepGenAffordance(deps: { generate: GenerateSnippet; stepsView: () => EditorView | null }): Extension` — the full bundle wiring the tooltip, debounce, keymap (`Enter` confirm / `Escape` dismiss, both `Prec.highest`), and `flashExtension()`.

- [ ] **Step 1: Write the failing test (field logic only — headless)**

Append to `packages/website/src/lib/cm-generate-step.test.ts`:

```ts
import { affordanceField, setAffordance } from './cm-generate-step.js'

describe('affordanceField', () => {
  it('shows on setAffordance and hides when the selection later changes', () => {
    let state = EditorState.create({ doc: 'I greet world', extensions: [affordanceField] })
    state = state.update({ effects: setAffordance.of({ from: 2, to: 7 }) }).state
    expect(state.field(affordanceField)).toEqual({ from: 2, to: 7 })
    // A subsequent selection move (without a setAffordance effect) hides it.
    state = state.update({ selection: { anchor: 0 } }).state
    expect(state.field(affordanceField)).toBeNull()
  })

  it('hides on explicit setAffordance(null)', () => {
    let state = EditorState.create({ doc: 'abc', extensions: [affordanceField] })
    state = state.update({ effects: setAffordance.of({ from: 0, to: 3 }) }).state
    state = state.update({ effects: setAffordance.of(null) }).state
    expect(state.field(affordanceField)).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test cm-generate-step`
Expected: FAIL — `affordanceField`/`setAffordance` not exported.

- [ ] **Step 3: Write the field (make the test pass)**

Add `Prec` to the `@codemirror/state` import and `keymap`, `showTooltip`, `Tooltip` to the `@codemirror/view` import. Then append:

```ts
export const setAffordance = StateEffect.define<{ from: number; to: number } | null>()

export const affordanceField = StateField.define<{ from: number; to: number } | null>({
  create: () => null,
  update(value, tr) {
    for (const e of tr.effects) if (e.is(setAffordance)) return e.value
    // A selection change that didn't explicitly set the affordance dismisses it.
    if (tr.selection) return null
    return value
  },
})
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test cm-generate-step`
Expected: PASS (9 tests total).

- [ ] **Step 5: Add the view layer (tooltip + debounce + keymap + assembly)**

Append to `cm-generate-step.ts`:

```ts
async function confirmAffordance(
  view: EditorView,
  deps: { generate: GenerateSnippet; stepsView: () => EditorView | null },
): Promise<void> {
  const stepsView = deps.stepsView()
  view.dispatch({ effects: setAffordance.of(null) })
  if (!stepsView) return
  await runGenerateStepDef({ specView: view, stepsView, generate: deps.generate })
}

const affordanceTheme = EditorView.baseTheme({
  '.cm-stepgen-tooltip': { border: 'none', background: 'transparent' },
  '.cm-stepgen-btn': {
    font: 'inherit',
    fontSize: '13px',
    fontWeight: '600',
    padding: '4px 10px',
    cursor: 'pointer',
    color: 'var(--ink)',
    background: 'var(--yellow)',
    border: '2px solid var(--ink)',
    borderRadius: 'var(--radius-5, 6px)',
    boxShadow: '3px 3px 0 0 var(--ink)',
  },
})

export function stepGenAffordance(deps: {
  generate: GenerateSnippet
  stepsView: () => EditorView | null
}): Extension {
  // The tooltip's button needs the spec EditorView to run the command. Resolve
  // it via the tooltip create() argument (CodeMirror passes the view).
  const tooltipFromField = showTooltip.compute([affordanceField], (state): Tooltip | null => {
    const range = state.field(affordanceField)
    if (!range) return null
    return {
      pos: range.to,
      above: true,
      strictSide: false,
      create(view) {
        const dom = document.createElement('div')
        dom.className = 'cm-stepgen-tooltip'
        const btn = document.createElement('button')
        btn.type = 'button'
        btn.className = 'cm-stepgen-btn'
        btn.textContent = '✨ Create step definition'
        btn.addEventListener('mousedown', (e) => e.preventDefault())
        btn.addEventListener('click', () => void confirmAffordance(view, deps))
        dom.appendChild(btn)
        return { dom }
      },
    }
  })

  // Show the affordance only once a non-empty selection settles (debounced),
  // and hide it immediately when the selection clears.
  const debouncePlugin = ViewPlugin.fromClass(
    class {
      timer: ReturnType<typeof setTimeout> | undefined
      constructor(readonly view: EditorView) {}
      update(u: ViewUpdate): void {
        if (!u.selectionSet && !u.docChanged) return
        const sel = u.state.selection.main
        clearTimeout(this.timer)
        if (sel.empty) {
          if (this.view.state.field(affordanceField)) {
            this.view.dispatch({ effects: setAffordance.of(null) })
          }
          return
        }
        const { from, to } = sel
        this.timer = setTimeout(() => this.view.dispatch({ effects: setAffordance.of({ from, to }) }), 200)
      }
      destroy(): void {
        clearTimeout(this.timer)
      }
    },
  )

  const confirmKeymap = Prec.highest(
    keymap.of([
      {
        key: 'Enter',
        run: (view) => {
          if (!view.state.field(affordanceField)) return false
          void confirmAffordance(view, deps)
          return true
        },
      },
      {
        key: 'Escape',
        run: (view) => {
          if (!view.state.field(affordanceField)) return false
          view.dispatch({ effects: setAffordance.of(null) })
          return true
        },
      },
    ]),
  )

  return [affordanceField, tooltipFromField, debouncePlugin, confirmKeymap, affordanceTheme, flashExtension()]
}
```

The tooltip is defined once, inline inside `showTooltip.compute`, so its button's `click` handler can capture the spec `view` that CodeMirror passes to `create(view)`.

- [ ] **Step 6: Lint and build**

Run: `pnpm lint`
Expected: no errors.
Run: `pnpm --filter @oselvar/website build`
Expected: build succeeds.

- [ ] **Step 7: Commit**

```bash
git add packages/website/src/lib/cm-generate-step.ts packages/website/src/lib/cm-generate-step.test.ts
git commit -m "feat(website): on-selection affordance for generating a step definition"
```

---

### Task 5: Wire the affordance into the markdown editor

**Files:**
- Modify: `packages/website/src/scripts/editor-mount.ts`

**Interfaces:**
- Consumes: `stepGenAffordance` (Task 4), the existing module-level `views: Map<string, EditorView>`, and `lspClient()`.
- Produces: nothing new — wiring only.

- [ ] **Step 1: Add the import**

At the top of `packages/website/src/scripts/editor-mount.ts`, add to the existing local imports:

```ts
import { type GenerateSnippet, stepGenAffordance } from '../lib/cm-generate-step.ts'
```

(Existing local imports in this file use the `.ts` extension, e.g. `'../lib/cm-run.ts'` — match that.)

- [ ] **Step 2: Wire it into the markdown branch of `mountEditor`**

In `mountEditor`, replace this block:

```ts
  const client = lspClient()
  const ext = [basicSetup, language, varTokenTheme, client.plugin(uri), autoRun]
  if (lang === 'markdown') ext.push(varRunExtension())
  const view = new EditorView({ doc, extensions: ext, parent: el })
```

with:

```ts
  const client = lspClient()
  const ext = [basicSetup, language, varTokenTheme, client.plugin(uri), autoRun]
  if (lang === 'markdown') {
    ext.push(varRunExtension())
    const generate: GenerateSnippet = (text) =>
      client.request('var/generateSnippet', { text }) as Promise<{ fullCode: string; expression: string }>
    const stepsView = () => [...views.entries()].find(([u]) => u.endsWith('.steps.ts'))?.[1] ?? null
    ext.push(stepGenAffordance({ generate, stepsView }))
  }
  const view = new EditorView({ doc, extensions: ext, parent: el })
```

- [ ] **Step 3: Lint and build**

Run: `pnpm lint`
Expected: no errors.
Run: `pnpm --filter @oselvar/website build`
Expected: build succeeds.

- [ ] **Step 4: Manual browser verification**

Run: `pnpm --filter @oselvar/website dev`
Then in the browser at the playground page:
1. In the **spec** editor, select the phrase `greet "world"` (or any phrase). After ~200 ms a "✨ Create step definition" button appears above the selection.
2. Click it (or press **Enter** while it shows). The **steps** editor gains focus, a new `step('...', (ctx, ...) => { ... })` block is appended at the end, selected, briefly flashed pink, and scrolled into view.
3. Within ~300 ms the spec re-runs; the previously-unmatched line's status updates (auto-run).
4. Make a stray selection and click elsewhere / press **Escape**: the affordance disappears and **nothing** is written.

Expected: all four behaviors hold.

- [ ] **Step 5: Commit**

```bash
git add packages/website/src/scripts/editor-mount.ts
git commit -m "feat(website): wire generate-step-def affordance into the playground"
```

---

## Self-Review

**Spec coverage:**
- Affordance on settled selection (debounced) → Task 4 (debounce plugin, 200 ms) + Task 5 wiring. ✓
- Confirm via click or Enter; Escape dismisses → Task 4 keymap + tooltip button. ✓
- Append to `.steps.ts`, blank-line separated, trailing newline → Task 1 `appendStepDef`. ✓
- Select inserted block + flash + scrollIntoView + focus → Task 2 `runGenerateStepDef` + Task 3 flash. ✓
- Emergent re-run turning the spec line green → existing `autoRun` in `editor-mount.ts`, exercised in Task 5 manual step 3. ✓
- Reuse `var/generateSnippet`, no core/LSP/worker changes → Task 5 `generate` via `client.request`. ✓
- Scripting uses raw CM API; `runGenerateStepDef` directly callable → Task 2 export, headless tests demonstrate it. ✓
- Empty selection no-op → Task 2 test + Task 4 debounce hides on empty. ✓
- Pure logic unit-tested in node; view layer manual → Tasks 1–4 tests + Tasks 3–5 build/manual gates. ✓

**Placeholder scan:** No TBD/TODO, no dead code. The tooltip ships as a single inline definition inside `showTooltip.compute`. All code blocks are complete.

**Type consistency:** `appendStepDef → { changes, from, to }` consumed identically in Task 2. `EditorLike`, `GenerateSnippet`, `flashRange`, `runGenerateStepDef`, `flashField`, `flashExtension`, `affordanceField`, `setAffordance`, `stepGenAffordance` names are used consistently across tasks and in the Task 5 wiring. `generate` returns `{ fullCode, expression }` everywhere.
