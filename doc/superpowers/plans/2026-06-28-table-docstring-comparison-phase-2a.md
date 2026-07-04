# Table & Doc-string Return Comparison — Phase 2a (core) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the pure `@oselvar/var` core's return-based comparison from header-bound rows to **whole-table** steps (return a table → compared full against the input table) and **doc-string** steps (return a string → compared exact against the input doc string), failing with structured errors.

**Architecture:** Two pure comparison functions (`compareTable`, `compareDocString`) reusing Phase 1's `CellDiff`/`CellMismatchError` and the table `cellSpans`; a doc-string body span carried onto the plan; and a branch in `executePlan` after each step's handler runs. No adapter changes — a mismatch throws, so the dogfood stays green. Builds directly on Phase 1 (already shipped).

**Tech Stack:** TypeScript (ESM, `.js` import specifiers), vitest, biome.

## Global Constraints

- Immutable types only — every new field/type is `readonly`; use `ReadonlyArray<T>`.
- The core (`packages/var/src/*`) is pure: no `node:fs`, no `vitest`, no `Date.now()`, no diff library, no side effects.
- ESM with explicit `.js` import specifiers (e.g. `import type { Span } from './span.js'`).
- **Comparison is EXACT STRING.** Table cells: `String(returnedCell) === inputCellText`. Doc strings: `returned === content` (byte for byte; `fence.body` INCLUDES its trailing `\n`). No coercion, no normalization.
- **Whole table = full reproduction.** A returned table must contain every column of every data row; all cells checked. Partial / wrong-shape / wrong-type returns throw `ReturnShapeError`. `undefined` return = pass (asserted nothing).
- Error names are `CellMismatchError` (rows AND tables — already exists from Phase 1), `DocStringMismatchError`, `ReturnShapeError`.
- Core unit tests live in `packages/var/tests/*.test.ts`, run with `cd packages/var && npx vitest run` (plain TS, no loader).
- **Build gate:** before every commit, `pnpm -r build` (from repo root) MUST exit 0 — vitest's esbuild does NOT type-check.
- The dogfood specs in `docs/tutorial/**` run under vitest WITH the tsx loader: `NODE_OPTIONS="--import tsx" npx vitest run` (from repo root).
- Run `npx biome check --write <files>` before each commit. End commit messages with `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

## File structure

| File | Responsibility | Task |
|------|----------------|------|
| `packages/var/src/cell-diff.ts` | gains `compareTable` + `ReturnShapeError` (alongside Phase 1's `compareRow`/`CellDiff`/`CellMismatchError`) | 1 |
| `packages/var/src/doc-string-diff.ts` (new) | `DocStringDiff`, `compareDocString`, `DocStringMismatchError`, `isDocStringMismatchError` | 2 |
| `packages/var/src/plan.ts` | `PlannedStep.docString` gains `span` (from `fence.bodySpan`) | 3 |
| `packages/var/src/execute.ts` | branch: `step.dataTable` → `compareTable`, `step.docString` → `compareDocString` | 4 |
| `packages/var/src/index.ts` | export the new symbols | 1, 2 |
| `docs/tutorial/06-tables-and-docstrings.var.md` + `docs/tutorial/steps/06-tables-and-docstrings.steps.ts` (new) | dogfood: a whole-table return + a doc-string return, green | 5 |
| `packages/website/src/content/docs/reference/tables.mdx`, `.../reference/doc-strings.mdx` (new) | reference docs | 6 |

---

### Task 1: `compareTable` + `ReturnShapeError`

**Files:**
- Modify: `packages/var/src/cell-diff.ts`
- Modify: `packages/var/src/index.ts`
- Test: `packages/var/tests/cell-diff.test.ts` (append)

**Interfaces:**
- Consumes: `CellDiff` (existing in this file); `Table`, `Row` from `./ast.js` (each `Row` has `cells` + `cellSpans`).
- Produces:
  - `class ReturnShapeError extends Error` — wrong return type/shape (author mistake).
  - `function compareTable(returned: unknown, input: Table): ReadonlyArray<CellDiff>` — full-table cell diff; throws `ReturnShapeError` on type/shape mismatch; `undefined` → `[]`.

- [ ] **Step 1: Write the failing test**

First, ensure the imports at the TOP of `packages/var/tests/cell-diff.test.ts` include the new symbols. The file already imports from `../src/cell-diff.js` (Phase 1) — extend that line to add `compareTable` and `ReturnShapeError`, and add the two new import lines:

```ts
import { compareRow, compareTable, isCellMismatchError, CellMismatchError, ReturnShapeError, type RowCheck } from '../src/cell-diff.js'
import { parse } from '../src/parse.js'
import type { Table } from '../src/ast.js'
```
(Keep whatever Phase 1 already imported from `cell-diff.js`; just add `compareTable` and `ReturnShapeError` to that destructuring, and `biome check --write` will reorder. Only add `parse`/`Table` if not already imported.)

Then append the helper + tests at the BOTTOM of the file (no `import` lines down here):

```ts
// Build a real Table (with cellSpans) by parsing a markdown table.
function tableOf(source: string): { table: Table; source: string } {
  const doc = parse('t.var.md', source)
  const table = doc.examples[0]?.body.find((b) => b.kind === 'table') as Table | undefined
  if (!table) throw new Error('no table parsed')
  return { table, source }
}

const TABLE_SRC = `# T

these:

| before | after |
| ------ | ----- |
| var    | VAR   |
| bdd    | BDD   |`

test('compareTable: array-of-arrays full match → all ok', () => {
  const { table } = tableOf(TABLE_SRC)
  const diffs = compareTable(
    [
      ['var', 'VAR'],
      ['bdd', 'BDD'],
    ],
    table,
  )
  expect(diffs).toHaveLength(4)
  expect(diffs.every((d) => d.ok)).toBe(true)
})

test('compareTable: array-of-records full match → all ok', () => {
  const { table } = tableOf(TABLE_SRC)
  const diffs = compareTable(
    [
      { before: 'var', after: 'VAR' },
      { before: 'bdd', after: 'BDD' },
    ],
    table,
  )
  expect(diffs.every((d) => d.ok)).toBe(true)
})

test('compareTable: one wrong cell → that CellDiff is not ok, with expected/actual/span', () => {
  const { table, source } = tableOf(TABLE_SRC)
  const diffs = compareTable(
    [
      ['var', 'WRONG'],
      ['bdd', 'BDD'],
    ],
    table,
  )
  const bad = diffs.filter((d) => !d.ok)
  expect(bad).toHaveLength(1)
  expect(bad[0]?.column).toBe('after')
  expect(bad[0]?.expected).toBe('VAR')
  expect(bad[0]?.actual).toBe('WRONG')
  expect(source.slice(bad[0]!.span.startOffset, bad[0]!.span.endOffset)).toBe('VAR')
})

test('compareTable: numbers are stringified before compare', () => {
  const { table: t } = tableOf(`# T

these:

| n |
| - |
| 7 |`)
  expect(compareTable([[7]], t).every((d) => d.ok)).toBe(true)
})

test('compareTable: undefined return checks nothing', () => {
  const { table } = tableOf(TABLE_SRC)
  expect(compareTable(undefined, table)).toEqual([])
})

test('compareTable: shape/type errors throw ReturnShapeError', () => {
  const { table } = tableOf(TABLE_SRC)
  expect(() => compareTable('nope', table)).toThrow(ReturnShapeError) // not an array
  expect(() => compareTable([['var', 'VAR']], table)).toThrow(ReturnShapeError) // wrong row count
  expect(() => compareTable([['var'], ['bdd']], table)).toThrow(ReturnShapeError) // wrong width
  expect(() => compareTable([{ before: 'var' }, { before: 'bdd' }], table)).toThrow(ReturnShapeError) // missing key
  expect(() => compareTable([['var', 'VAR'], { before: 'bdd', after: 'BDD' }], table)).toThrow(
    ReturnShapeError,
  ) // mixed forms
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/var && npx vitest run tests/cell-diff.test.ts`
Expected: FAIL — `compareTable`/`ReturnShapeError` are not exported from `./cell-diff.js`.

- [ ] **Step 3: Implement `compareTable` + `ReturnShapeError`**

In `packages/var/src/cell-diff.ts`, add the import at the top (after the existing `Span` import):

```ts
import type { Table } from './ast.js'
```

Append to the file:

```ts
// The step returned the wrong TYPE (a non-array where a table was input, a
// string where a doc string was input) or wrong SHAPE (row/column count,
// missing record key, mixed row forms). An author mistake, not a value diff.
export class ReturnShapeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ReturnShapeError'
  }
}

// Compare a whole-table step's returned table against the input table, full
// reproduction: every column of every data row is checked (the header row is
// labels, never compared). `returned` may be an array-of-arrays (data rows,
// positional) or an array-of-records (keyed by header cell). Cells compare as
// exact strings (`String(value) === cellText`). `undefined` → no checks.
// Type/shape problems throw `ReturnShapeError`.
export function compareTable(returned: unknown, input: Table): ReadonlyArray<CellDiff> {
  if (returned === undefined) return []
  if (!Array.isArray(returned)) {
    throw new ReturnShapeError(`expected a table (array of rows), got ${typeof returned}`)
  }
  const columns = input.header.cells
  const dataRows = input.rows
  if (returned.length !== dataRows.length) {
    throw new ReturnShapeError(`expected ${dataRows.length} row(s), got ${returned.length}`)
  }
  const isRecord = (r: unknown): r is Record<string, unknown> =>
    r !== null && typeof r === 'object' && !Array.isArray(r)
  const allArrays = returned.every((r) => Array.isArray(r))
  const allRecords = returned.every(isRecord)
  if (!allArrays && !allRecords) {
    throw new ReturnShapeError('table rows must be all arrays or all objects')
  }
  const diffs: CellDiff[] = []
  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i] as Row
    const ret = returned[i]
    for (let j = 0; j < columns.length; j++) {
      const column = columns[j] as string
      let actualValue: unknown
      if (allArrays) {
        const cells = ret as ReadonlyArray<unknown>
        if (cells.length !== columns.length) {
          throw new ReturnShapeError(
            `row ${i}: expected ${columns.length} column(s), got ${cells.length}`,
          )
        }
        actualValue = cells[j]
      } else {
        const rec = ret as Record<string, unknown>
        if (!(column in rec)) {
          throw new ReturnShapeError(`row ${i}: missing column "${column}"`)
        }
        actualValue = rec[column]
      }
      const expected = row.cells[j] ?? ''
      const actual = String(actualValue)
      diffs.push({
        column,
        span: row.cellSpans[j] ?? row.span,
        expected,
        actual,
        ok: actual === expected,
      })
    }
  }
  return diffs
}
```

Add `import type { Row } from './ast.js'` to the same `ast.js` import (so it reads `import type { Row, Table } from './ast.js'`).

- [ ] **Step 4: Export from the entrypoint**

In `packages/var/src/index.ts`, extend the existing `cell-diff.js` exports. Change:

```ts
export { CellMismatchError, compareRow, isCellMismatchError } from './cell-diff.js'
```
to:
```ts
export { CellMismatchError, compareRow, compareTable, isCellMismatchError, ReturnShapeError } from './cell-diff.js'
```

- [ ] **Step 5: Run tests + build**

Run: `cd packages/var && npx vitest run tests/cell-diff.test.ts && cd /Users/aslakhellesoy/git/oselvar/bdd && pnpm -r build`
Expected: all cell-diff tests PASS; `pnpm -r build` exits 0.

- [ ] **Step 6: Commit**

```bash
npx biome check --write packages/var/src/cell-diff.ts packages/var/src/index.ts packages/var/tests/cell-diff.test.ts
git add packages/var/src/cell-diff.ts packages/var/src/index.ts packages/var/tests/cell-diff.test.ts
git commit -m "feat(var): compareTable + ReturnShapeError (whole-table return comparison)"
```

---

### Task 2: `compareDocString` + `DocStringMismatchError`

**Files:**
- Create: `packages/var/src/doc-string-diff.ts`
- Modify: `packages/var/src/index.ts`
- Test: `packages/var/tests/doc-string-diff.test.ts` (create)

**Interfaces:**
- Consumes: `Span` from `./span.js`; `ReturnShapeError` from `./cell-diff.js` (Task 1).
- Produces:
  - `type DocStringDiff = { readonly span: Span; readonly expected: string; readonly actual: string }`
  - `function compareDocString(returned: unknown, content: string, span: Span): DocStringDiff | null`
  - `class DocStringMismatchError extends Error { readonly diff: DocStringDiff }`
  - `function isDocStringMismatchError(e: unknown): e is DocStringMismatchError`

- [ ] **Step 1: Write the failing test**

Create `packages/var/tests/doc-string-diff.test.ts`:

```ts
import { expect, test } from 'vitest'
import { ReturnShapeError } from '../src/cell-diff.js'
import {
  compareDocString,
  DocStringMismatchError,
  isDocStringMismatchError,
} from '../src/doc-string-diff.js'

const span = { startLine: 1, startCol: 1, endLine: 1, endCol: 6, startOffset: 0, endOffset: 6 }

test('compareDocString: equal content → null', () => {
  expect(compareDocString('hello\n', 'hello\n', span)).toBeNull()
})

test('compareDocString: undefined return → null (asserted nothing)', () => {
  expect(compareDocString(undefined, 'hello\n', span)).toBeNull()
})

test('compareDocString: different content → diff with span, expected, actual', () => {
  expect(compareDocString('bye\n', 'hello\n', span)).toEqual({
    span,
    expected: 'hello\n',
    actual: 'bye\n',
  })
})

test('compareDocString: a non-string return throws ReturnShapeError', () => {
  expect(() => compareDocString(42, 'hello\n', span)).toThrow(ReturnShapeError)
})

test('DocStringMismatchError carries the diff and is detectable', () => {
  const err = new DocStringMismatchError({ span, expected: 'hello\n', actual: 'bye\n' })
  expect(isDocStringMismatchError(err)).toBe(true)
  expect(isDocStringMismatchError(new Error('x'))).toBe(false)
  expect(err.diff.actual).toBe('bye\n')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/var && npx vitest run tests/doc-string-diff.test.ts`
Expected: FAIL — cannot find module `../src/doc-string-diff.js`.

- [ ] **Step 3: Write the module**

Create `packages/var/src/doc-string-diff.ts`:

```ts
import { ReturnShapeError } from './cell-diff.js'
import type { Span } from './span.js'

// A doc-string content difference: the fence body's source range plus the
// expected (authored) and actual (returned) strings.
export type DocStringDiff = {
  readonly span: Span
  readonly expected: string
  readonly actual: string
}

// Compare a doc-string step's returned string against the fence body content.
// Exact equality (the body includes its trailing newline). `undefined` → no
// check (null). A non-string return is an author mistake → ReturnShapeError.
export function compareDocString(
  returned: unknown,
  content: string,
  span: Span,
): DocStringDiff | null {
  if (returned === undefined) return null
  if (typeof returned !== 'string') {
    throw new ReturnShapeError(`expected a doc string (string), got ${typeof returned}`)
  }
  if (returned === content) return null
  return { span, expected: content, actual: returned }
}

// Thrown by the executor when a doc-string step's returned string differs.
export class DocStringMismatchError extends Error {
  readonly diff: DocStringDiff
  constructor(diff: DocStringDiff) {
    super(`doc string: expected ${JSON.stringify(diff.expected)} but was ${JSON.stringify(diff.actual)}`)
    this.name = 'DocStringMismatchError'
    this.diff = diff
  }
}

export function isDocStringMismatchError(e: unknown): e is DocStringMismatchError {
  return e instanceof DocStringMismatchError
}
```

- [ ] **Step 4: Export from the entrypoint**

In `packages/var/src/index.ts`, add (next to the `cell-diff.js` exports):

```ts
export type { DocStringDiff } from './doc-string-diff.js'
export { compareDocString, DocStringMismatchError, isDocStringMismatchError } from './doc-string-diff.js'
```

- [ ] **Step 5: Run tests + build**

Run: `cd packages/var && npx vitest run tests/doc-string-diff.test.ts && cd /Users/aslakhellesoy/git/oselvar/bdd && pnpm -r build`
Expected: all pass; `pnpm -r build` exits 0.

- [ ] **Step 6: Commit**

```bash
npx biome check --write packages/var/src/doc-string-diff.ts packages/var/src/index.ts packages/var/tests/doc-string-diff.test.ts
git add packages/var/src/doc-string-diff.ts packages/var/src/index.ts packages/var/tests/doc-string-diff.test.ts
git commit -m "feat(var): compareDocString + DocStringMismatchError"
```

---

### Task 3: Doc-string body span on the plan

**Files:**
- Modify: `packages/var/src/plan.ts` (the `PlannedStep.docString` type ~line 47; the attachments map ~line 131; the fence attachment ~line 142)
- Test: `packages/var/tests/plan.test.ts` (append)

**Interfaces:**
- Consumes: `Fence.bodySpan` (already on the AST).
- Produces: `PlannedStep.docString` gains `readonly span: Span` — the fence body's content range, so the executor can pass it to `compareDocString`.

- [ ] **Step 1: Write the failing test**

Append to `packages/var/tests/plan.test.ts`:

```ts
test('a doc-string step carries the fence body span on its plan', () => {
  const r = addStep(createRegistry(), {
    expression: 'the payload is',
    expressionSourceFile: 's.ts',
    expressionSourceLine: 1,
    handler: () => {},
  })
  const source = `# T

the payload is:

\`\`\`json
{ "ok": true }
\`\`\``
  const result = plan(parse('d.var.md', source), r)
  const ds = result.examples[0]?.steps[0]?.docString
  if (!ds) throw new Error('no docString')
  expect(ds.content).toBe('{ "ok": true }\n')
  // The span slices back to the exact body content (trailing newline included).
  expect(source.slice(ds.span.startOffset, ds.span.endOffset)).toBe('{ "ok": true }\n')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/var && npx vitest run tests/plan.test.ts -t "fence body span"`
Expected: FAIL — `ds.span` is `undefined` (property does not exist).

- [ ] **Step 3: Add `span` to the docString attachment**

In `packages/var/src/plan.ts`:

Change the `PlannedStep.docString` field (~line 47) from:
```ts
  readonly docString?: { content: string; contentType: string }
```
to:
```ts
  readonly docString?: { content: string; contentType: string; span: Span }
```

Change the attachments map type (~line 131) from:
```ts
      { dataTable?: Table; docString?: { content: string; contentType: string } }
```
to:
```ts
      { dataTable?: Table; docString?: { content: string; contentType: string; span: Span } }
```

Change the fence attachment construction (~line 142) from:
```ts
          docString: { content: fence.body, contentType: fence.info },
```
to:
```ts
          docString: { content: fence.body, contentType: fence.info, span: fence.bodySpan },
```

(`Span` is already imported in `plan.ts`.)

- [ ] **Step 4: Run tests + build**

Run: `cd packages/var && npx vitest run tests/plan.test.ts && cd /Users/aslakhellesoy/git/oselvar/bdd && pnpm -r build`
Expected: new test PASS; existing plan tests still PASS; `pnpm -r build` exits 0.

- [ ] **Step 5: Commit**

```bash
npx biome check --write packages/var/src/plan.ts packages/var/tests/plan.test.ts
git add packages/var/src/plan.ts packages/var/tests/plan.test.ts
git commit -m "feat(var): carry doc-string body span onto the plan"
```

---

### Task 4: Executor branches on table / doc-string returns

**Files:**
- Modify: `packages/var/src/execute.ts` (imports; the per-step body, just after `lastReturn = returned`)
- Test: `packages/var/tests/execute.test.ts` (append)

**Interfaces:**
- Consumes: `compareTable`, `CellMismatchError` (`./cell-diff.js`); `compareDocString`, `DocStringMismatchError` (`./doc-string-diff.js`); `PlannedStep.dataTable` (a `Table`), `PlannedStep.docString` (`{ content, contentType, span }`).
- Behaviour: after a step's handler returns, if the step has a `dataTable` → `compareTable(returned, dataTable)` and throw `CellMismatchError` on any bad cell; else if it has a `docString` → `compareDocString(returned, content, span)` and throw `DocStringMismatchError` on a diff. `ReturnShapeError` from either propagates. All three errors get the synthetic stack frame. `undefined` return passes. Examples without `dataTable`/`docString`/`rowChecks` are unchanged.

- [ ] **Step 1: Write the failing test**

First, add/extend imports at the TOP of `packages/var/tests/execute.test.ts`. Phase 1 already added `import { isCellMismatchError, type CellMismatchError } from '../src/cell-diff.js'` — extend it to also import `ReturnShapeError`, and add the doc-string import line:

```ts
import { isCellMismatchError, type CellMismatchError, ReturnShapeError } from '../src/cell-diff.js'
import { isDocStringMismatchError, type DocStringMismatchError } from '../src/doc-string-diff.js'
```

Then append the helper + tests at the BOTTOM of the file (no `import` lines down here):

```ts
function runsFor(source: string, reg: ReturnType<typeof createRegistry>) {
  const p = plan(parse('w.var.md', source), reg)
  const runs: Array<() => unknown | Promise<unknown>> = []
  executePlan(p, { sink: { example: (_n, run) => runs.push(run) }, reporter: { diagnostic: () => {} } })
  return runs
}

const TABLE_DOC = `# T

uppercase each one:

| before | after |
| ------ | ----- |
| var    | VAR   |
| bdd    | BDD   |`

test('a whole-table step returning a mismatched table throws CellMismatchError at the cell span', async () => {
  const r = addStep(createRegistry(), {
    expression: 'uppercase each one',
    expressionSourceFile: 's.ts',
    expressionSourceLine: 1,
    handler: () => [
      ['var', 'WRONG'],
      ['bdd', 'BDD'],
    ],
  })
  const source = TABLE_DOC
  const runs = runsFor(source, r)
  let caught: unknown
  try {
    await runs[0]?.()
  } catch (e) {
    caught = e
  }
  expect(isCellMismatchError(caught)).toBe(true)
  const cells = (caught as CellMismatchError).cells
  expect(cells).toHaveLength(1)
  expect(cells[0]?.expected).toBe('VAR')
  expect(cells[0]?.actual).toBe('WRONG')
  expect(source.slice(cells[0]!.span.startOffset, cells[0]!.span.endOffset)).toBe('VAR')
})

test('a whole-table step returning a matching table passes', async () => {
  const r = addStep(createRegistry(), {
    expression: 'uppercase each one',
    expressionSourceFile: 's.ts',
    expressionSourceLine: 1,
    handler: () => [
      { before: 'var', after: 'VAR' },
      { before: 'bdd', after: 'BDD' },
    ],
  })
  await expect(runsFor(TABLE_DOC, r)[0]?.()).resolves.toBeUndefined()
})

test('a whole-table step returning the wrong type throws ReturnShapeError', async () => {
  const r = addStep(createRegistry(), {
    expression: 'uppercase each one',
    expressionSourceFile: 's.ts',
    expressionSourceLine: 1,
    handler: () => 'not a table',
  })
  await expect(runsFor(TABLE_DOC, r)[0]?.()).rejects.toBeInstanceOf(ReturnShapeError)
})

const DOCSTRING_DOC = `# T

the greeting is:

\`\`\`text
Hello, world!
\`\`\``

test('a doc-string step returning a different string throws DocStringMismatchError at the body span', async () => {
  const r = addStep(createRegistry(), {
    expression: 'the greeting is',
    expressionSourceFile: 's.ts',
    expressionSourceLine: 1,
    handler: () => 'Goodbye!\n',
  })
  const source = DOCSTRING_DOC
  let caught: unknown
  try {
    await runsFor(source, r)[0]?.()
  } catch (e) {
    caught = e
  }
  expect(isDocStringMismatchError(caught)).toBe(true)
  const diff = (caught as DocStringMismatchError).diff
  expect(diff.expected).toBe('Hello, world!\n')
  expect(diff.actual).toBe('Goodbye!\n')
  expect(source.slice(diff.span.startOffset, diff.span.endOffset)).toBe('Hello, world!\n')
})

test('a doc-string step returning the exact body passes', async () => {
  const r = addStep(createRegistry(), {
    expression: 'the greeting is',
    expressionSourceFile: 's.ts',
    expressionSourceLine: 1,
    handler: (_ctx, body: string) => body, // echo the exact content
  })
  await expect(runsFor(DOCSTRING_DOC, r)[0]?.()).resolves.toBeUndefined()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/var && npx vitest run tests/execute.test.ts -t "whole-table"`
Expected: FAIL — no error thrown (the executor ignores table/doc-string returns), so `isCellMismatchError(caught)` is `false`.

- [ ] **Step 3: Add the branch**

In `packages/var/src/execute.ts`, update the imports. Change:
```ts
import { CellMismatchError, compareRow } from './cell-diff.js'
```
to:
```ts
import { CellMismatchError, compareRow, compareTable } from './cell-diff.js'
import { compareDocString, DocStringMismatchError } from './doc-string-diff.js'
```

Then, inside the `for (const step of ex.steps)` loop, immediately after the `lastReturn = returned` line, add:

```ts
        try {
          if (step.dataTable) {
            const bad = compareTable(returned, step.dataTable).filter((d) => !d.ok)
            if (bad.length > 0) throw new CellMismatchError(bad)
          } else if (step.docString) {
            const diff = compareDocString(returned, step.docString.content, step.docString.span)
            if (diff) throw new DocStringMismatchError(diff)
          }
        } catch (err) {
          throw augmentStack(err, step, path)
        }
```

(This sits beside the handler's own try/catch; it augments `CellMismatchError`, `DocStringMismatchError`, and any `ReturnShapeError` with the step's `.var.md` frame. The existing `ex.rowChecks` block after the loop is unchanged — header-bound row steps never carry `dataTable`/`docString`, so the paths don't overlap.)

- [ ] **Step 4: Run tests + build**

Run: `cd packages/var && npx vitest run tests/execute.test.ts && cd /Users/aslakhellesoy/git/oselvar/bdd && pnpm -r build`
Expected: all new + existing execute tests PASS; `pnpm -r build` exits 0.

- [ ] **Step 5: Commit**

```bash
npx biome check --write packages/var/src/execute.ts packages/var/tests/execute.test.ts
git add packages/var/src/execute.ts packages/var/tests/execute.test.ts
git commit -m "feat(var): executor compares whole-table and doc-string returns"
```

---

### Task 5: Dogfood — a whole-table return and a doc-string return

**Files:**
- Create: `docs/tutorial/06-tables-and-docstrings.var.md`
- Create: `docs/tutorial/steps/06-tables-and-docstrings.steps.ts`

**Interfaces:**
- Consumes: the executor comparison (Task 4). A whole-table step returns the computed table; a doc-string step returns the exact text.

- [ ] **Step 1: Write the dogfood spec**

Create `docs/tutorial/06-tables-and-docstrings.var.md`:

```markdown
# Tables and doc strings

A whole table is handed to a step all at once — the step returns the computed
table, and Vár checks every cell.

Uppercase each one:

| before | after |
| ------ | ----- |
| vár    | VÁR   |
| bdd    | BDD   |

A doc string is handed to a step as text — the step returns the text it should
produce, and Vár checks it exactly.

Greet Bob:

\`\`\`text
Hello, Bob!
\`\`\`
```

(Note: the paragraph "Uppercase each one:" deliberately does NOT name the
headers `before`/`after`, so the table stays in whole-table mode rather than
header-bound row mode.)

- [ ] **Step 2: Write the step definitions**

Create `docs/tutorial/steps/06-tables-and-docstrings.steps.ts`:

```ts
import { defineContext } from '@oselvar/var-vitest'

const { step } = defineContext(() => ({}))

// Whole-table mode: the table arrives as string[][] (header row first). Return
// the full computed table — Vár compares every cell against the spec.
step('Uppercase each one:', (_ctx, rows: ReadonlyArray<ReadonlyArray<string>>) => {
  return rows.slice(1).map(([before]) => ({ before, after: (before ?? '').toUpperCase() }))
})

// Doc-string mode: return the exact text the fence should contain. Fence bodies
// include their trailing newline, so the returned string ends in "\n" too.
step('Greet {word}:', (_ctx, name: string, _body: string) => `Hello, ${name}!\n`)
```

- [ ] **Step 3: Run the dogfood to verify it passes**

Run: `cd /Users/aslakhellesoy/git/oselvar/bdd && NODE_OPTIONS="--import tsx" npx vitest run 06-tables-and-docstrings`
Expected: PASS — the whole-table example and the doc-string example are both green (`vár`→`VÁR`, `bdd`→`BDD`; `Hello, Bob!\n` matches the fence body).

- [ ] **Step 4: Verify a deliberate break fails the right example**

(a) Change the `after` cell `VÁR` to `WRONG` in the table, re-run:
Run: `cd /Users/aslakhellesoy/git/oselvar/bdd && NODE_OPTIONS="--import tsx" npx vitest run 06-tables-and-docstrings`
Expected: the "Uppercase each one" example FAILS with `CellMismatchError` mentioning `after: expected WRONG but was VÁR`. Revert the cell.

(b) Change the fence body `Hello, Bob!` to `Hello, Bobby!`, re-run:
Expected: the "Greet Bob" example FAILS with `DocStringMismatchError`. Revert the body.

Re-run once more after reverting both: all green again. (Do NOT commit the temporary breaks.)

- [ ] **Step 5: Run the full repo suite + build**

```bash
cd /Users/aslakhellesoy/git/oselvar/bdd
NODE_OPTIONS="--import tsx" npx vitest run
pnpm -r build
```
Expected: all tests PASS; `pnpm -r build` exits 0. Confirm `git status` shows only the two new files (the deliberate breaks reverted).

- [ ] **Step 6: Commit**

```bash
cd /Users/aslakhellesoy/git/oselvar/bdd
npx biome check --write docs/tutorial/06-tables-and-docstrings.var.md docs/tutorial/steps/06-tables-and-docstrings.steps.ts
git add docs/tutorial/06-tables-and-docstrings.var.md docs/tutorial/steps/06-tables-and-docstrings.steps.ts
git commit -m "test(dogfood): whole-table and doc-string return comparison examples"
```

---

### Task 6: Reference docs — Tables note + a Doc strings page

**Files:**
- Modify: `packages/website/src/content/docs/reference/tables.mdx`
- Create: `packages/website/src/content/docs/reference/doc-strings.mdx`

**Interfaces:**
- Consumes: nothing in code; documents the Task 1–5 behavior. Prose only — the user may reword later.

- [ ] **Step 1: Add the "return is load-bearing" note + whole-table return to Tables**

In `packages/website/src/content/docs/reference/tables.mdx`, in the **Whole-table mode** section (after the existing `step('These users exist:', (ctx, rows) => { ... })` block), add this paragraph and code block:

````mdx
The return is **load-bearing**: if a whole-table step returns a table, Vár
compares it against the input table cell by cell and fails on any difference.
Return the full table (every column of every row) — as an array of rows
(`string[][]`, data rows only) or an array of objects keyed by header. A step
that returns nothing asserts nothing.

```ts
step('These users exist:', (ctx, rows) => {
  // rows === [['name', 'age'], ['Bob', '30'], ['Eve', '25']]
  return rows.slice(1).map(([name, age]) => ({ name, age })) // checked against the table
})
```
````

And in the **Header-bound mode** section, after the "Because each row is its own example…" paragraph, add one sentence:

```mdx
The return is load-bearing here too: a header-bound row whose handler returns
nothing asserts nothing and passes — return the columns you compute.
```

- [ ] **Step 2: Create the Doc strings reference page**

Create `packages/website/src/content/docs/reference/doc-strings.mdx` with the
content below. **Note on nested fences:** the page shows a Markdown example that
itself contains a ```` ```text ```` fence — to nest a fence inside a fenced
block, the OUTER fence must use MORE backticks than the inner one. So wrap the
Markdown example in a FOUR-backtick fence (` ```` `) containing the normal
three-backtick ```` ```text ```` block. (Check `tables.mdx`, which already uses
a ```` ```markdown ```` block, for the established style; match its frontmatter
shape.)

The file's frontmatter and prose:

- frontmatter: `title: Doc strings`; `description: How a fenced code block attaches to a step in a Vár spec — passed in as text, and checked against the step's returned string.`; `area: reference`; `order: 2`
- `# Doc strings`
- Paragraph: "A fenced code block immediately **below** a step's paragraph attaches to that step. Its content (everything between the fences, including the trailing newline) is handed to your step as the **last argument**, after whatever the expression captured."
- A four-backtick-fenced Markdown example containing:
  ```
  The rendered greeting is:

  ```text
  Hello, world!
  ```
  ```
- A `ts` code block:
  ```ts
  step('The rendered greeting is:', (ctx, body) => {
    // body === 'Hello, world!\n'
  })
  ```
- `## Returning a doc string`
- Paragraph: "If the step **returns a string**, Vár compares it against the doc-string content — **exactly**, byte for byte. This turns the fenced block into an assertion: the prose shows the expected output, and the step produces it."
- A `ts` code block:
  ```ts
  step('Greet {word}:', (ctx, name, body) => {
    return `Hello, ${name}!\n` // checked against the fence content, exactly
  })
  ```
- Closing paragraph: "Because the comparison is exact, the trailing newline matters: fence content ends with a newline, so the returned string must too. A step that returns nothing asserts nothing."

- [ ] **Step 3: Build the website**

Run: `cd /Users/aslakhellesoy/git/oselvar/bdd && pnpm --filter @oselvar/website build`
Expected: build succeeds; the new `doc-strings` page is emitted and appears under the reference area (the docs nav picks up `area: reference`).

- [ ] **Step 4: Commit**

```bash
cd /Users/aslakhellesoy/git/oselvar/bdd
git add packages/website/src/content/docs/reference/tables.mdx packages/website/src/content/docs/reference/doc-strings.mdx
git commit -m "docs(website): document table & doc-string return comparison"
```

---

## Done when

- `compareTable`, `compareDocString`, `ReturnShapeError`, `DocStringMismatchError`, `isDocStringMismatchError`, `DocStringDiff` are exported from `@oselvar/var`.
- A whole-table step whose returned table differs fails with `CellMismatchError` carrying `CellDiff`s at the exact cells; a doc-string step whose returned string differs fails with `DocStringMismatchError` carrying the body span; wrong return type/shape throws `ReturnShapeError`; `undefined` passes.
- The dogfood `06-tables-and-docstrings` is green via `return`, and a deliberate break fails the right example.
- Full repo suite green; `pnpm -r build` exits 0; website builds.
- Phase 2b (CodeMirror red cell + hover-actual rendering) is a separate plan that consumes `CellDiff`/`DocStringDiff`.
```
