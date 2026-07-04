# Phase 2b — Editor red cells + hover-actual Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In the website's live CodeMirror editor, render each failing cell's source text **red** and show the **actual runtime value** on hover, by surfacing the core's `CellDiff`/`DocStringDiff` through the run pipeline.

**Architecture:** Adapter-only (no core changes). `run-spec.ts` pulls the structured diffs off the caught `CellMismatchError`/`DocStringMismatchError` and attaches `{from,to,actual}` ranges to `ExampleResult.failure`. `cm-run.ts` gains two pure helpers (`cellFailRanges`, `actualAt`) that drive a mark-decoration `StateField` (red cell text) and a `hoverTooltip` (`actual: <value>`), layered additively on top of the existing line wash + gutter + stack dialog.

**Tech Stack:** TypeScript (ESM), CodeMirror 6 (`@codemirror/state`, `@codemirror/view`), Astro, vitest, biome.

## Global Constraints

- This is the **adapter** layer (`packages/website`) — side effects/DOM are allowed here (unlike the pure core). Do NOT modify `packages/var` or any other core/adapter package.
- The editor document IS the parsed `.var.md` source, so core source offsets (`span.startOffset`/`endOffset`) map directly to CodeMirror positions.
- **Additive**: the existing line wash (`.cm-run-pass`/`.cm-run-fail`), gutter `✗`/`✓`, and stack dialog stay exactly as they are. The red cell + hover layer on top.
- Hover text is exactly `actual: <value>`.
- Failures with no cell info (plain thrown `Error`, `ReturnShapeError`) attach no `cells`/`doc` → render only the existing wash + `✗` + stack.
- Red marks + tooltips ride the existing `setRunResults` `StateEffect` and clear on edit (results go stale), same as the washes.
- The guards `isCellMismatchError` and `isDocStringMismatchError` are already exported from `@oselvar/var` (Phase 1/2a) — no new dependency.
- Test the website package with `cd packages/website && npx vitest run <file>`. Build gates: `pnpm --filter @oselvar/website build` (Astro) and `pnpm -r build` (tsc) — both must pass before each commit.
- Run `npx biome check --write <files>` before each commit. End commit messages with `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

## File structure

| File | Responsibility | Task |
|------|----------------|------|
| `packages/website/src/lib/run-types.ts` | `ExampleResult.failure` gains `cells?`/`doc?` (a `CellFailure` shape) | 1 |
| `packages/website/src/lib/run-spec.ts` | extract `cells`/`doc` from the caught error | 1 |
| `packages/website/src/lib/cm-run.ts` | pure `cellFailRanges`/`actualAt`; mark `StateField`; `hoverTooltip`; theme; wire into `varRunExtension()` | 2 |
| `packages/website/src/lib/cm-run.test.ts` (new) | unit-test the two pure helpers | 2 |

---

### Task 1: Surface cell/doc-string diffs through the run result

**Files:**
- Modify: `packages/website/src/lib/run-types.ts`
- Modify: `packages/website/src/lib/run-spec.ts`
- Test: `packages/website/src/lib/run-spec.test.ts` (append)

**Interfaces:**
- Consumes: `isCellMismatchError`, `isDocStringMismatchError` from `@oselvar/var`; `CellMismatchError.cells` (`{ span, expected, actual, ok, column }[]`); `DocStringMismatchError.diff` (`{ span, expected, actual }`).
- Produces:
  - `type CellFailure = { readonly from: number; readonly to: number; readonly actual: string }`
  - `ExampleResult.failure` gains `readonly cells?: ReadonlyArray<CellFailure>` and `readonly doc?: CellFailure`.

- [ ] **Step 1: Write the failing test**

Append to `packages/website/src/lib/run-spec.test.ts` (inside the existing `describe('runRegisteredSpec', ...)` block, or as new `it`s in it):

```ts
  it('attaches cells (source span + actual) for a header-bound row mismatch', async () => {
    _resetBuilder()
    const { step } = defineContext(() => ({}))
    step('Each row lists the n and the double', (_ctx, row: { n: string; double: string }) => ({
      double: Number(row.n) * 2,
    }))
    const spec = `# Doubling

Each row lists the n and the double:

| n | double |
| - | ------ |
| 2 | 5 |
`
    const results = await runRegisteredSpec('/d.var.md', spec)
    const failed = results.examples.find((e) => e.status === 'failed')
    const cells = failed?.failure?.cells
    if (!cells) throw new Error('no cells on the failure')
    expect(cells).toHaveLength(1)
    // The span covers the EXPECTED cell text (the source), and `actual` is the runtime value.
    expect(spec.slice(cells[0]!.from, cells[0]!.to)).toBe('5')
    expect(cells[0]!.actual).toBe('4')
  })

  it('attaches doc (body span + actual) for a doc-string mismatch', async () => {
    _resetBuilder()
    const { step } = defineContext(() => ({}))
    step('the greeting is', () => 'Goodbye!\n')
    const spec = '# G\n\nthe greeting is:\n\n```text\nHello!\n```\n'
    const results = await runRegisteredSpec('/g.var.md', spec)
    const doc = results.examples[0]?.failure?.doc
    if (!doc) throw new Error('no doc on the failure')
    expect(spec.slice(doc.from, doc.to)).toBe('Hello!\n')
    expect(doc.actual).toBe('Goodbye!\n')
  })

  it('leaves cells/doc undefined for a plain thrown error', async () => {
    _resetBuilder()
    const { step } = defineContext(() => ({ greeting: '' }))
    step('I greet {string}', (ctx: { greeting: string }, name: string) => {
      ctx.greeting = `Hi ${name}`
    })
    step('the greeting should be {string}', (ctx: { greeting: string }, expected: string) => {
      if (ctx.greeting !== expected) throw new Error('nope')
    })
    const results = await runRegisteredSpec('/spec.var.md', SPEC)
    expect(results.examples[0]?.failure?.cells).toBeUndefined()
    expect(results.examples[0]?.failure?.doc).toBeUndefined()
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/website && npx vitest run src/lib/run-spec.test.ts`
Expected: FAIL — `failure.cells` / `failure.doc` are `undefined` (run-spec doesn't extract them yet).

- [ ] **Step 3: Add the types**

In `packages/website/src/lib/run-types.ts`, add the `CellFailure` type and the two optional fields:

```ts
export type CellFailure = {
  readonly from: number // source offset of the EXPECTED cell text (== CodeMirror position)
  readonly to: number
  readonly actual: string // the runtime value the step produced
}
export type ExampleResult = {
  readonly name: string
  readonly status: 'passed' | 'failed'
  readonly lines: ReadonlyArray<number> // 1-based source lines of this example's steps
  readonly failure?: {
    readonly line: number
    readonly message: string
    readonly stack: string
    readonly cells?: ReadonlyArray<CellFailure> // table / header-bound row cell mismatches
    readonly doc?: CellFailure // doc-string body mismatch (single span)
  }
}
export type RunResults = { readonly examples: ReadonlyArray<ExampleResult> }
```

- [ ] **Step 4: Extract the diffs in run-spec**

In `packages/website/src/lib/run-spec.ts`, add the guards to the import from `@oselvar/var`:

```ts
import {
  executePlan,
  isCellMismatchError,
  isDocStringMismatchError,
  parse,
  plan,
  type TestSink,
} from '@oselvar/var'
```

Then, in the `catch (err)` block, replace the `out[idx] = { ... }` failure assignment with one that also extracts `cells`/`doc`:

```ts
          } catch (err) {
            const e = err as Error
            const stack = e?.stack ?? String(err)
            const cells = isCellMismatchError(err)
              ? err.cells
                  .filter((c) => !c.ok)
                  .map((c) => ({ from: c.span.startOffset, to: c.span.endOffset, actual: c.actual }))
              : undefined
            const doc = isDocStringMismatchError(err)
              ? {
                  from: err.diff.span.startOffset,
                  to: err.diff.span.endOffset,
                  actual: err.diff.actual,
                }
              : undefined
            out[idx] = {
              name,
              status: 'failed',
              lines,
              failure: {
                line: failingLine(stack, varPath) ?? lines[0] ?? 0,
                message: e?.message ?? String(err),
                stack,
                ...(cells && { cells }),
                ...(doc && { doc }),
              },
            }
          }
```

- [ ] **Step 5: Run tests + builds**

Run: `cd packages/website && npx vitest run src/lib/run-spec.test.ts && cd /Users/aslakhellesoy/git/oselvar/bdd && pnpm -r build`
Expected: all run-spec tests PASS (the 3 new + existing); `pnpm -r build` exits 0.

- [ ] **Step 6: Commit**

```bash
npx biome check --write packages/website/src/lib/run-types.ts packages/website/src/lib/run-spec.ts packages/website/src/lib/run-spec.test.ts
git add packages/website/src/lib/run-types.ts packages/website/src/lib/run-spec.ts packages/website/src/lib/run-spec.test.ts
git commit -m "feat(website): surface cell & doc-string diffs through the run result"
```

---

### Task 2: Red cell decorations + hover-actual in cm-run

**Files:**
- Modify: `packages/website/src/lib/cm-run.ts`
- Test: `packages/website/src/lib/cm-run.test.ts` (create)

**Interfaces:**
- Consumes: `CellFailure`, `RunResults` (Task 1); the existing `resultsField`/`setRunResults` in `cm-run.ts`.
- Produces (exported, pure):
  - `function cellFailRanges(results: RunResults): ReadonlyArray<{ from: number; to: number }>`
  - `function actualAt(results: RunResults, pos: number): string | null`
  - `varRunExtension()` now also reddens failing cells and shows `actual: <value>` on hover.

- [ ] **Step 1: Write the failing test**

Create `packages/website/src/lib/cm-run.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { actualAt, cellFailRanges } from './cm-run.js'
import type { RunResults } from './run-types.js'

const results: RunResults = {
  examples: [
    {
      name: 'row',
      status: 'failed',
      lines: [5],
      failure: {
        line: 5,
        message: 'm',
        stack: 's',
        cells: [
          { from: 10, to: 11, actual: '4' },
          { from: 20, to: 22, actual: '17' },
        ],
      },
    },
    {
      name: 'docstring',
      status: 'failed',
      lines: [9],
      failure: { line: 9, message: 'm', stack: 's', doc: { from: 30, to: 39, actual: 'Goodbye!\n' } },
    },
    { name: 'ok', status: 'passed', lines: [3] },
  ],
}

describe('cellFailRanges', () => {
  it('collects every failing cell range and the doc range, sorted by from', () => {
    expect(cellFailRanges(results)).toEqual([
      { from: 10, to: 11 },
      { from: 20, to: 22 },
      { from: 30, to: 39 },
    ])
  })

  it('is empty when nothing failed with cell info', () => {
    expect(cellFailRanges({ examples: [{ name: 'ok', status: 'passed', lines: [1] }] })).toEqual([])
  })
})

describe('actualAt', () => {
  it('returns the actual value for a position inside a failing cell or doc span', () => {
    expect(actualAt(results, 10)).toBe('4')
    expect(actualAt(results, 21)).toBe('17')
    expect(actualAt(results, 35)).toBe('Goodbye!\n')
  })

  it('returns null outside any failing range', () => {
    expect(actualAt(results, 0)).toBeNull()
    expect(actualAt(results, 15)).toBeNull()
    expect(actualAt(results, 100)).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/website && npx vitest run src/lib/cm-run.test.ts`
Expected: FAIL — `cellFailRanges`/`actualAt` are not exported from `./cm-run.js`.

- [ ] **Step 3: Add the pure helpers**

In `packages/website/src/lib/cm-run.ts`, add the import for the `hoverTooltip` and any types, and define the two pure helpers near the top (after the imports). Update the `@codemirror/view` import to include `hoverTooltip`:

```ts
import {
  Decoration,
  type DecorationSet,
  EditorView,
  GutterMarker,
  gutter,
  hoverTooltip,
} from '@codemirror/view'
```

Add the helpers (place them after the `setRunResults`/`resultsField` definitions so `RunResults` is in scope):

```ts
// Every failing-cell range plus the doc-string range across the results, sorted
// by start offset (offsets are source positions == CodeMirror positions).
export function cellFailRanges(results: RunResults): ReadonlyArray<{ from: number; to: number }> {
  const out: { from: number; to: number }[] = []
  for (const ex of results.examples) {
    const f = ex.failure
    if (!f) continue
    if (f.cells) for (const c of f.cells) out.push({ from: c.from, to: c.to })
    if (f.doc) out.push({ from: f.doc.from, to: f.doc.to })
  }
  return out.sort((a, b) => a.from - b.from)
}

// The actual runtime value of the failing cell/doc covering `pos`, or null.
export function actualAt(results: RunResults, pos: number): string | null {
  for (const ex of results.examples) {
    const f = ex.failure
    if (!f) continue
    const spans = [...(f.cells ?? []), ...(f.doc ? [f.doc] : [])]
    for (const s of spans) if (pos >= s.from && pos <= s.to) return s.actual
  }
  return null
}
```

- [ ] **Step 4: Run test to verify the helpers pass**

Run: `cd packages/website && npx vitest run src/lib/cm-run.test.ts`
Expected: PASS (all 4).

- [ ] **Step 5: Add the mark decorations, hover, theme, and wiring**

Still in `packages/website/src/lib/cm-run.ts`:

(a) After the existing `decoField` definition, add a second decoration field for the red cell marks:

```ts
// Mark decorations that redden each failing cell's source text. Separate from
// the line-wash field so we don't mix line + range decorations in one set.
const cellMarkField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    const results = tr.state.field(resultsField)
    if (!tr.docChanged && !tr.effects.some((e) => e.is(setRunResults))) return deco.map(tr.changes)
    if (!results) return Decoration.none
    const builder = new RangeSetBuilder<Decoration>()
    const docLen = tr.state.doc.length
    for (const r of cellFailRanges(results)) {
      const from = Math.max(0, Math.min(r.from, docLen))
      const to = Math.max(from, Math.min(r.to, docLen))
      if (to > from) builder.add(from, to, Decoration.mark({ class: 'cm-run-cell-fail' }))
    }
    return builder.finish()
  },
  provide: (f) => EditorView.decorations.from(f),
})
```

(b) Add the hover tooltip (place after `cellMarkField`):

```ts
// Hovering a failing cell shows the actual runtime value (`actual: 9`).
const cellHover = hoverTooltip((view, pos) => {
  const results = view.state.field(resultsField)
  if (!results) return null
  const actual = actualAt(results, pos)
  if (actual == null) return null
  return {
    pos,
    create: () => {
      const dom = document.createElement('div')
      dom.className = 'cm-run-cell-tip'
      dom.textContent = `actual: ${actual}`
      return { dom }
    },
  }
})
```

(c) In the `runTheme` `EditorView.baseTheme({...})` object, add the cell-fail and tooltip styles (alongside the existing `.cm-run-*` rules):

```ts
  // Red failing-cell text. Bold so it stays legible on the fail wash.
  '.cm-run-cell-fail': { color: 'var(--ed-fail-mark)', fontWeight: '700' },
  '.cm-run-cell-tip': {
    padding: '2px 6px',
    background: 'var(--ink)',
    color: 'var(--cream)',
    borderRadius: '4px',
    fontFamily: 'monospace',
    fontSize: '13px',
  },
```

(d) Add the new field + hover to the returned extension array in `varRunExtension()`:

```ts
export function varRunExtension(): Extension {
  return [resultsField, decoField, cellMarkField, errorGutter, cellHover, runTheme]
}
```

- [ ] **Step 6: Run tests + builds**

```bash
cd packages/website && npx vitest run src/lib/cm-run.test.ts
cd /Users/aslakhellesoy/git/oselvar/bdd && pnpm -r build && pnpm --filter @oselvar/website build
```
Expected: cm-run tests PASS; `pnpm -r build` exits 0; the website builds (the `hoverTooltip` import resolves, no type errors).

- [ ] **Step 7: Manual browser check**

Run the dev server (`pnpm --filter @oselvar/website dev`) and open the playground:
- Break a Yahtzee score cell → that cell's text turns **red**; hovering it shows `actual: <n>`; the row wash + `✗` + stack dialog still work.
- In the `06` whole-table example, break an `after` cell → the cell reddens with `actual: …`. Break the doc-string body → the body span reddens with `actual: …`.
- Edit anything → red marks and washes clear until the next run.

(This step is a visual confirmation; it has no automated assertion. Note any contrast issue with the red on the fail wash — if the red is hard to read, adjust the `.cm-run-cell-fail` color/weight and re-check both light and dark themes.)

- [ ] **Step 8: Commit**

```bash
cd /Users/aslakhellesoy/git/oselvar/bdd
npx biome check --write packages/website/src/lib/cm-run.ts packages/website/src/lib/cm-run.test.ts
git add packages/website/src/lib/cm-run.ts packages/website/src/lib/cm-run.test.ts
git commit -m "feat(website): redden failing cells with actual-value hover in the editor"
```

---

## Done when

- A header-bound row / whole-table / doc-string mismatch reddens the failing source span(s) in the editor and shows `actual: <value>` on hover, layered on top of the unchanged line wash + gutter + stack dialog.
- `run-spec` attaches `failure.cells` / `failure.doc` (`{from,to,actual}`) for cell/doc mismatches and nothing for plain throws / `ReturnShapeError`.
- `cellFailRanges` and `actualAt` are pure, exported, and unit-tested; the website builds and `pnpm -r build` is clean.
- VSCode red+hover (needs a run-results channel) remains a separate future effort.
