# Header-bound Cell Diffs — Phase 1 (core) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the pure core (`@oselvar/var`) own header-bound table comparison: a row step returns its computed columns, the core diffs them against the table cells and emits structured `CellDiff`s via a typed `CellMismatchError`.

**Architecture:** Add per-cell source spans to the table AST, a pure `compareRow` + `CellDiff` + `CellMismatchError` module, planner attachment of per-row checks, and execution-time comparison. No adapter changes — a mismatch still throws, so existing pass/fail behaviour (and the dogfood vitest test) is preserved. The live `~~9~~6` renderer (Phase 2) consumes `CellDiff` later.

**Tech Stack:** TypeScript (ESM, `node:`-style `.js` import specifiers), vitest, biome.

## Global Constraints

- Immutable types only — every new field/type is `readonly`; use `ReadonlyArray<T>`.
- The core (`packages/var/src/*`) is pure: no `node:fs`, no `vitest`, no `Date.now()`, no diff library. Side effects live in adapters.
- ESM with explicit `.js` import specifiers (e.g. `import { Span } from './span.js'`).
- Tests live in `packages/var/tests/*.test.ts` and run with `pnpm --filter @oselvar/var test` (i.e. `vitest run`).
- Match existing code style; run `npx biome check --write <files>` before each commit.

---

### Task 1: Per-cell source spans in the table parser

**Files:**
- Modify: `packages/var/src/ast.ts` (the `Row` type, ~line 38)
- Modify: `packages/var/src/scanner.ts` (`tryTable` ~line 325, `parseCells` ~line 364)
- Test: `packages/var/tests/scanner.test.ts` (create)

**Interfaces:**
- Produces: `Row` now has `readonly cellSpans: ReadonlyArray<Span>` — one span per cell, covering that cell's trimmed text in the source.

- [ ] **Step 1: Write the failing test**

Create `packages/var/tests/scanner.test.ts`:

```ts
import { expect, test } from 'vitest'
import type { Table } from '../src/ast.js'
import { parse } from '../src/parse.js'

test('table rows expose a source span per cell that slices back to the trimmed cell text', () => {
  const source = `# T

these rows:

| a | bb  |
| - | --- |
| 1 | 222 |`
  const doc = parse('t.var.md', source)
  const table = doc.examples[0]?.body.find((b) => b.kind === 'table') as Table | undefined
  if (!table) throw new Error('no table parsed')
  const row = table.rows[0]
  if (!row) throw new Error('no row')
  expect(row.cellSpans).toHaveLength(2)
  const slice = (i: number) =>
    source.slice(row.cellSpans[i]!.startOffset, row.cellSpans[i]!.endOffset)
  expect(slice(0)).toBe('1')
  expect(slice(1)).toBe('222')
  // The header row carries cell spans too.
  expect(source.slice(table.header.cellSpans[1]!.startOffset, table.header.cellSpans[1]!.endOffset)).toBe('bb')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/var && npx vitest run tests/scanner.test.ts`
Expected: FAIL — `cellSpans` is `undefined` (property does not exist yet).

- [ ] **Step 3: Add `cellSpans` to the `Row` type**

In `packages/var/src/ast.ts`, change the `Row` type:

```ts
export type Row = {
  readonly cells: ReadonlyArray<string>
  readonly cellSpans: ReadonlyArray<Span>
  readonly span: Span
}
```

- [ ] **Step 4: Compute cell spans in the scanner**

In `packages/var/src/scanner.ts`, replace `parseCells` with a span-aware version and use it for both header and rows.

Replace the `parseCells` function (~line 364):

```ts
function parseCells(line: string): ReadonlyArray<string> {
  return parseCellsWithSpans(line, 0, '').cells
}

// Split a `| a | b |` row into trimmed cells AND the source span of each
// cell's trimmed text. `lineStart` is the row's start offset in `source`.
function parseCellsWithSpans(
  line: string,
  lineStart: number,
  source: string,
): { cells: ReadonlyArray<string>; cellSpans: ReadonlyArray<ReturnType<typeof spanFromOffsets>> } {
  const m = ROW_RE.exec(line)
  if (!m) return { cells: [], cellSpans: [] }
  const inner = m[1] ?? ''
  const innerStart = 1 // ROW_RE anchors `^\|`, so inner text begins at column 1
  const cells: string[] = []
  const cellSpans: ReturnType<typeof spanFromOffsets>[] = []
  let cursor = 0
  for (const seg of inner.split('|')) {
    const trimmed = seg.trim()
    const leading = seg.length - seg.trimStart().length
    const absStart = lineStart + innerStart + cursor + leading
    cells.push(trimmed)
    cellSpans.push(spanFromOffsets(source, absStart, absStart + trimmed.length))
    cursor += seg.length + 1 // +1 for the `|` delimiter
  }
  return { cells, cellSpans }
}
```

Then in `tryTable`, build header and rows with spans. Change the `header` literal (~line 335):

```ts
  const headerParsed = parseCellsWithSpans(headerLine.text, headerLine.startOffset, source)
  const header = {
    cells: headerParsed.cells,
    cellSpans: headerParsed.cellSpans,
    span: spanFromOffsets(source, headerLine.startOffset, headerLine.endOffset),
  }
```

Change the `rows` accumulator type and push (~lines 339-349):

```ts
  const rows: {
    cells: ReadonlyArray<string>
    cellSpans: ReadonlyArray<ReturnType<typeof spanFromOffsets>>
    span: ReturnType<typeof spanFromOffsets>
  }[] = []
  let i = startIdx + 2
  while (i < lines.length) {
    const ln = lines[i]
    if (!ln) break
    if (!ROW_RE.test(ln.text)) break
    const parsed = parseCellsWithSpans(ln.text, ln.startOffset, source)
    rows.push({
      cells: parsed.cells,
      cellSpans: parsed.cellSpans,
      span: spanFromOffsets(source, ln.startOffset, ln.endOffset),
    })
    i++
  }
```

- [ ] **Step 5: Run test to verify it passes, and run the full core suite**

Run: `cd packages/var && npx vitest run tests/scanner.test.ts && npx vitest run`
Expected: new test PASS; all existing tests still PASS (the added field doesn't break the whole-table path).

- [ ] **Step 6: Commit**

```bash
npx biome check --write packages/var/src/ast.ts packages/var/src/scanner.ts packages/var/tests/scanner.test.ts
git add packages/var/src/ast.ts packages/var/src/scanner.ts packages/var/tests/scanner.test.ts
git commit -m "feat(var): per-cell source spans on table rows"
```

---

### Task 2: `compareRow` + `CellDiff` + `CellMismatchError`

**Files:**
- Create: `packages/var/src/cell-diff.ts`
- Modify: `packages/var/src/index.ts` (public exports)
- Test: `packages/var/tests/cell-diff.test.ts` (create)

**Interfaces:**
- Produces:
  - `type CellDiff = { readonly column: string; readonly span: Span; readonly expected: string; readonly actual: string; readonly ok: boolean }`
  - `type RowCheck = { readonly column: string; readonly value: string; readonly span: Span }`
  - `function compareRow(returned: unknown, checks: ReadonlyArray<RowCheck>): ReadonlyArray<CellDiff>`
  - `class CellMismatchError extends Error { readonly cells: ReadonlyArray<CellDiff> }`
  - `function isCellMismatchError(e: unknown): e is CellMismatchError`

- [ ] **Step 1: Write the failing test**

Create `packages/var/tests/cell-diff.test.ts`:

```ts
import { expect, test } from 'vitest'
import { compareRow, isCellMismatchError, CellMismatchError, type RowCheck } from '../src/cell-diff.js'

const span = { startLine: 1, startCol: 1, endLine: 1, endCol: 2, startOffset: 0, endOffset: 1 }
const checks: ReadonlyArray<RowCheck> = [
  { column: 'dice', value: '3, 3, 3, 4, 4', span },
  { column: 'score', value: '9', span },
]

test('a returned column that matches its cell is ok', () => {
  const diffs = compareRow({ score: 9 }, checks)
  expect(diffs).toEqual([{ column: 'score', span, expected: '9', actual: '9', ok: true }])
})

test('a returned column that differs is not ok, with expected and actual', () => {
  const diffs = compareRow({ score: 6 }, checks)
  expect(diffs).toEqual([{ column: 'score', span, expected: '9', actual: '6', ok: false }])
})

test('columns that are not returned are inputs — not checked', () => {
  // `dice` is never returned, so it never appears in the diffs.
  expect(compareRow({ score: 9 }, checks).map((d) => d.column)).toEqual(['score'])
})

test('a returned key that is not a column is ignored', () => {
  expect(compareRow({ nope: 1 }, checks)).toEqual([])
})

test('undefined / non-object return checks nothing', () => {
  expect(compareRow(undefined, checks)).toEqual([])
  expect(compareRow(42, checks)).toEqual([])
})

test('CellMismatchError carries the cells and is detectable', () => {
  const err = new CellMismatchError([{ column: 'score', span, expected: '9', actual: '6', ok: false }])
  expect(isCellMismatchError(err)).toBe(true)
  expect(isCellMismatchError(new Error('x'))).toBe(false)
  expect(err.cells[0]?.actual).toBe('6')
  expect(err.message).toContain('score')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/var && npx vitest run tests/cell-diff.test.ts`
Expected: FAIL — cannot find module `../src/cell-diff.js`.

- [ ] **Step 3: Write the module**

Create `packages/var/src/cell-diff.ts`:

```ts
import type { Span } from './span.js'

// One checked column of one header-bound row: the input the comparison needs.
export type RowCheck = {
  readonly column: string
  readonly value: string // the cell text, e.g. "9"
  readonly span: Span // the cell text's source range in the .var.md
}

// The verdict for one checked column after comparing against the table.
export type CellDiff = {
  readonly column: string
  readonly span: Span
  readonly expected: string
  readonly actual: string
  readonly ok: boolean
}

// Compare a row step's returned object against the row's cells. Only columns
// present on `returned` are checked; the rest are inputs. A non-object return
// (including undefined) checks nothing.
export function compareRow(
  returned: unknown,
  checks: ReadonlyArray<RowCheck>,
): ReadonlyArray<CellDiff> {
  if (returned === null || typeof returned !== 'object') return []
  const obj = returned as Record<string, unknown>
  const diffs: CellDiff[] = []
  for (const check of checks) {
    if (!(check.column in obj)) continue
    const actual = String(obj[check.column])
    diffs.push({
      column: check.column,
      span: check.span,
      expected: check.value,
      actual,
      ok: actual === check.value,
    })
  }
  return diffs
}

// Thrown by the executor when a header-bound row's returned columns don't all
// match. Carries the mismatched cells so adapters render/record them.
export class CellMismatchError extends Error {
  readonly cells: ReadonlyArray<CellDiff>
  constructor(cells: ReadonlyArray<CellDiff>) {
    super(cells.map((c) => `${c.column}: expected ${c.expected} but was ${c.actual}`).join('; '))
    this.name = 'CellMismatchError'
    this.cells = cells
  }
}

export function isCellMismatchError(e: unknown): e is CellMismatchError {
  return e instanceof CellMismatchError
}
```

- [ ] **Step 4: Export from the package entrypoint**

In `packages/var/src/index.ts`, add (next to the other re-exports, e.g. after the `./diagnostics.js` exports):

```ts
export type { CellDiff, RowCheck } from './cell-diff.js'
export { compareRow, isCellMismatchError, CellMismatchError } from './cell-diff.js'
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd packages/var && npx vitest run tests/cell-diff.test.ts`
Expected: PASS (all 6).

- [ ] **Step 6: Commit**

```bash
npx biome check --write packages/var/src/cell-diff.ts packages/var/src/index.ts packages/var/tests/cell-diff.test.ts
git add packages/var/src/cell-diff.ts packages/var/src/index.ts packages/var/tests/cell-diff.test.ts
git commit -m "feat(var): compareRow + CellDiff + CellMismatchError"
```

---

### Task 3: Planner attaches per-row checks to header-bound examples

**Files:**
- Modify: `packages/var/src/plan.ts` (the `PlannedExample` type ~line 13; the header-bound branch ~lines 89-116)
- Test: `packages/var/tests/plan.test.ts` (append)

**Interfaces:**
- Consumes: `RowCheck` (Task 2); `Row.cellSpans` (Task 1).
- Produces: `PlannedExample` gains `readonly rowChecks?: ReadonlyArray<RowCheck>`. Each header-bound row example carries one `RowCheck` per column (`column` = header cell, `value` = row cell, `span` = row cell span).

- [ ] **Step 1: Write the failing test**

Append to `packages/var/tests/plan.test.ts`:

```ts
test('a header-bound row example carries rowChecks (column, value, cell span)', () => {
  let r = createRegistry()
  r = addStep(r, {
    expression: 'each row lists the dice, the category and the score',
    expressionSourceFile: 's.ts',
    expressionSourceLine: 1,
    handler: () => {},
  })
  const source = `# Yahtzee

each row lists the dice, the category and the score:

| dice          | category   | score |
| ------------- | ---------- | ----- |
| 3, 3, 3, 4, 4 | full house | 17    |`
  const result = plan(parse('y.var.md', source), r)
  const checks = result.examples[0]?.rowChecks
  if (!checks) throw new Error('no rowChecks')
  expect(checks.map((c) => c.column)).toEqual(['dice', 'category', 'score'])
  expect(checks.map((c) => c.value)).toEqual(['3, 3, 3, 4, 4', 'full house', '17'])
  // The score cell span slices back to "17" in the source.
  const scoreCheck = checks[2]!
  expect(source.slice(scoreCheck.span.startOffset, scoreCheck.span.endOffset)).toBe('17')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/var && npx vitest run tests/plan.test.ts -t "rowChecks"`
Expected: FAIL — `result.examples[0].rowChecks` is `undefined`.

- [ ] **Step 3: Add the field and import**

In `packages/var/src/plan.ts`, add the import near the top (with the other imports):

```ts
import type { RowCheck } from './cell-diff.js'
```

Add to the `PlannedExample` type (after `headerBinding?: HeaderBinding`):

```ts
  // Present on each row of a header-bound table: one check per column, used by
  // the executor to compare the step's returned columns against the cells.
  readonly rowChecks?: ReadonlyArray<RowCheck>
```

- [ ] **Step 4: Build `rowChecks` in the header-bound branch**

In the header-bound `if (bound) { ... }` block, inside the `for (const row of bound.table.rows)` loop, build the checks and attach them to the pushed example. Replace the `examples.push({ ... })` call with:

```ts
        const rowChecks: RowCheck[] = bound.table.header.cells.map((column, i) => ({
          column,
          value: row.cells[i] ?? '',
          span: row.cellSpans[i] ?? row.span,
        }))
        examples.push({
          name: row.cells.join(' / '),
          scopeStack: [...ex.scopeStack, bound.step.text],
          span: row.span,
          steps: [rowStep],
          headerBinding,
          rowChecks,
        })
```

- [ ] **Step 5: Run test to verify it passes, and the full plan suite**

Run: `cd packages/var && npx vitest run tests/plan.test.ts`
Expected: new test PASS; all existing plan tests still PASS.

- [ ] **Step 6: Commit**

```bash
npx biome check --write packages/var/src/plan.ts packages/var/tests/plan.test.ts
git add packages/var/src/plan.ts packages/var/tests/plan.test.ts
git commit -m "feat(var): planner attaches rowChecks to header-bound rows"
```

---

### Task 4: Executor compares the returned columns

**Files:**
- Modify: `packages/var/src/execute.ts` (the per-example `run()` body)
- Test: `packages/var/tests/execute.test.ts` (append)

**Interfaces:**
- Consumes: `compareRow`, `CellMismatchError` (Task 2); `PlannedExample.rowChecks` (Task 3).
- Behaviour: after running a header-bound row example's step, the executor compares the handler's return against `rowChecks` and throws `CellMismatchError` (with the mismatched `CellDiff`s) if any column differs. The synthetic stack frame points at the row line.

- [ ] **Step 1: Write the failing test**

Append to `packages/var/tests/execute.test.ts`:

```ts
test('a returning header-bound row that mismatches throws CellMismatchError with the cell span', async () => {
  let r = createRegistry()
  r = addStep(r, {
    expression: 'each row lists the dice, the category and the score',
    expressionSourceFile: 's.ts',
    expressionSourceLine: 1,
    handler: (_ctx, row: { score: string }) => ({ score: row.score === '50' ? 999 : Number(row.score) }),
  })
  const source = `# Yahtzee

each row lists the dice, the category and the score:

| dice          | category   | score |
| ------------- | ---------- | ----- |
| 3, 3, 3, 4, 4 | full house | 17    |
| 3, 3, 3, 3, 3 | Yahtzee    | 50    |`
  const p = plan(parse('y.var.md', source), r)
  const runs: Array<() => unknown | Promise<unknown>> = []
  executePlan(p, {
    sink: { example: (_n, run) => runs.push(run) },
    reporter: { diagnostic: () => {} },
  })
  await runs[0]?.() // 17 matches -> passes
  let caught: unknown
  try {
    await runs[1]?.() // returns 999, cell says 50 -> mismatch
  } catch (err) {
    caught = err
  }
  expect(isCellMismatchError(caught)).toBe(true)
  const cells = (caught as CellMismatchError).cells
  expect(cells).toHaveLength(1)
  expect(cells[0]?.column).toBe('score')
  expect(cells[0]?.expected).toBe('50')
  expect(cells[0]?.actual).toBe('999')
  expect(source.slice(cells[0]!.span.startOffset, cells[0]!.span.endOffset)).toBe('50')
})

test('a returning header-bound row that matches passes', async () => {
  let r = createRegistry()
  r = addStep(r, {
    expression: 'each row lists the dice, the category and the score',
    expressionSourceFile: 's.ts',
    expressionSourceLine: 1,
    handler: (_ctx, row: { score: string }) => ({ score: Number(row.score) }),
  })
  const source = `# Yahtzee

each row lists the dice, the category and the score:

| dice          | category   | score |
| ------------- | ---------- | ----- |
| 3, 3, 3, 4, 4 | full house | 17    |`
  const p = plan(parse('y.var.md', source), r)
  const runs: Array<() => unknown | Promise<unknown>> = []
  executePlan(p, {
    sink: { example: (_n, run) => runs.push(run) },
    reporter: { diagnostic: () => {} },
  })
  await expect(runs[0]?.()).resolves.toBeUndefined()
})
```

Add the import at the top of `packages/var/tests/execute.test.ts` (with the existing imports):

```ts
import { isCellMismatchError, type CellMismatchError } from '../src/cell-diff.js'
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/var && npx vitest run tests/execute.test.ts -t "CellMismatchError"`
Expected: FAIL — no error thrown (the executor ignores the return value), so `isCellMismatchError(caught)` is `false`.

- [ ] **Step 3: Capture the return value and compare**

In `packages/var/src/execute.ts`, add the import:

```ts
import { compareRow, CellMismatchError } from './cell-diff.js'
```

In the `ports.sink.example(ex.name, async () => { ... })` body, capture each handler's return and compare after the step loop. Change the handler call to capture its result:

```ts
        let returned: unknown
        try {
          returned = await step.stepDef.handler(ctx, ...step.args, ...extra)
        } catch (err) {
          throw augmentStack(err, step, path)
        }
        lastReturn = returned
```

Declare `let lastReturn: unknown` just before the `for (const step of ex.steps)` loop, and after the loop add the comparison:

```ts
      if (ex.rowChecks && ex.rowChecks.length > 0) {
        const bad = compareRow(lastReturn, ex.rowChecks).filter((d) => !d.ok)
        if (bad.length > 0) {
          const lastStep = ex.steps[ex.steps.length - 1]
          // biome-ignore lint/style/noNonNullAssertion: a header-bound row example always has its row step
          throw augmentStack(new CellMismatchError(bad), lastStep!, path)
        }
      }
```

- [ ] **Step 4: Run test to verify it passes, and the full execute suite**

Run: `cd packages/var && npx vitest run tests/execute.test.ts`
Expected: both new tests PASS; existing execute tests still PASS.

- [ ] **Step 5: Commit**

```bash
npx biome check --write packages/var/src/execute.ts packages/var/tests/execute.test.ts
git add packages/var/src/execute.ts packages/var/tests/execute.test.ts
git commit -m "feat(var): executor compares returned columns, throws CellMismatchError"
```

---

### Task 5: Switch the Yahtzee dogfood step to return-based, sync the docs

**Files:**
- Modify: `docs/tutorial/steps/04-yahtzee.steps.ts`
- Modify: `packages/website/src/content/docs/reference/tables.mdx` (the `step(...)` snippet)

**Interfaces:**
- Consumes: the executor comparison (Task 4). The step now returns `{ score: number }` instead of throwing.

- [ ] **Step 1: Switch the step to return its computed column**

In `docs/tutorial/steps/04-yahtzee.steps.ts`, replace the `step(...)` body so it returns the computed score instead of throwing. Keep the `score()` function unchanged. The step becomes:

```ts
step(
  'Examples of dice, category and score',
  (_ctx, row: { dice: string; category: string; score: string }) => {
    const dice = row.dice.split(',').map((d) => Number(d.trim()))
    return { score: score(dice, row.category) }
  },
)
```

(Remove the `actual`/`expected`/`throw new Error(...)` lines — the framework now does the comparison. If the `defineContext`/`step` import line is the only remaining use of anything, leave it as-is.)

- [ ] **Step 2: Run the dogfood spec to verify it still passes**

Run: `cd /Users/aslakhellesoy/git/oselvar/bdd && NODE_OPTIONS="--import tsx" npx vitest run 04-yahtzee`
Expected: PASS — 12 row tests green (every returned score matches its cell, so no `CellMismatchError`).

- [ ] **Step 3: Verify a deliberate break turns exactly one row red**

Temporarily edit one cell in `docs/tutorial/04-yahtzee.var.md` (e.g. change the `threes` row's `9` to `6`), then:

Run: `cd /Users/aslakhellesoy/git/oselvar/bdd && NODE_OPTIONS="--import tsx" npx vitest run 04-yahtzee`
Expected: exactly the `… / threes / 6` test FAILS with `score: expected 6 but was 9`. Then revert the cell and re-run to confirm green again.

- [ ] **Step 4: Sync the reference doc snippet**

In `packages/website/src/content/docs/reference/tables.mdx`, change the illustrative `step(...)` code block (the one with `expect(score(...)).toBe(...)`) to the return form:

```ts
step('Examples of dice, category and score', (ctx, row) => {
  // row === { dice: '3, 3, 3, 4, 4', category: 'full house', score: '17' }
  const dice = row.dice.split(',').map((d) => Number(d.trim()))
  return { score: score(dice, row.category) } // the framework checks it against the cell
})
```

- [ ] **Step 5: Run the full repo suite + website build**

```bash
cd /Users/aslakhellesoy/git/oselvar/bdd
NODE_OPTIONS="--import tsx" npx vitest run
pnpm --filter @oselvar/website build
```
Expected: all tests PASS; website builds (the browser runner now exercises the same return-based comparison).

- [ ] **Step 6: Commit**

```bash
cd /Users/aslakhellesoy/git/oselvar/bdd
npx biome check --write docs/tutorial/steps/04-yahtzee.steps.ts packages/website/src/content/docs/reference/tables.mdx
git add docs/tutorial/steps/04-yahtzee.steps.ts packages/website/src/content/docs/reference/tables.mdx
git commit -m "feat: Yahtzee step returns its computed column (framework-owned comparison)"
```

---

## Done when

- `compareRow`, `CellDiff`, `RowCheck`, `CellMismatchError`, `isCellMismatchError` are exported from `@oselvar/var`.
- A header-bound row whose returned column differs from its cell fails with a `CellMismatchError` carrying a `CellDiff` whose `span` points at the cell.
- The Yahtzee dogfood is green using `return { score }` (no `throw`, no `expect`).
- Full repo suite green; website builds.
- Phase 2 (live `~~9~~6` rendering in `cm-run`) is a separate plan that consumes `CellDiff`.
