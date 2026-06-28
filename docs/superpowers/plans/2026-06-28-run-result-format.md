# Run-result Format + Pure Hash + Vitest Reporter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Promote the website's in-memory run-result shape into a shared, serializable core format, add a pure source hash for staleness, and write it to `.var/<spec>.json` from a custom vitest reporter.

**Architecture:** The core (`@oselvar/var`) gains pure data types (`SpecResults`/`ExampleResult`/`CellFailure`), a dependency-free `hashSource`, and a shared `toFailure` error→failure helper, plus one optional `TestSink.example` param carrying each example's source lines. The `var-vitest` adapter builds a full `ExampleResult` in the worker (where the plan is live) and ships it over `task.meta`; a registry-free reporter groups by spec, hashes the source, and writes the file. The website refactors onto the shared type as the first consumer.

**Tech Stack:** TypeScript (ESM, `node:` imports, Node ≥ 22), pnpm workspace, vitest 4, biome.

## Global Constraints

- Core (`packages/var/src/*`) stays pure: **no `node:*` imports**, no I/O, no `Date`/`Math.random`/process/globals-as-state. (`Math.imul` is a pure built-in and is allowed.)
- Immutable types only: every field `readonly`, arrays `ReadonlyArray<T>`.
- ESM with **explicit `.js` import specifiers** in source.
- Format `version` is the literal `1`. Hash prefix is `fnv1a:`, algorithm FNV-1a 32-bit, **no `node:crypto`**.
- `specPath` is stored **POSIX-normalized** (`/` separators), relative to cwd.
- `.var/` is **git-ignored**.
- Core tests live in `packages/var/tests/*.test.ts` and import from `../src/<module>.js`.
- **Build gate:** run `pnpm -r build` (exit 0) after any task that changes a shared type, a port, or a package's public exports. vitest does NOT type-check.

---

### Task 1: Core — `hashSource` (FNV-1a)

**Files:**
- Create: `packages/var/src/hash.ts`
- Test: `packages/var/tests/hash.test.ts`
- Modify: `packages/var/src/index.ts` (add export)

**Interfaces:**
- Produces: `hashSource(source: string): string` — returns `"fnv1a:"` + 8 lowercase hex chars.

- [ ] **Step 1: Write the failing test**

Create `packages/var/tests/hash.test.ts`:

```ts
import { expect, test } from 'vitest'
import { hashSource } from '../src/hash.js'

test('hashSource is deterministic for the same input', () => {
  expect(hashSource('abc')).toBe(hashSource('abc'))
})

test('hashSource changes for a one-character difference', () => {
  expect(hashSource('abc')).not.toBe(hashSource('abd'))
})

test('hashSource is namespaced with the algorithm prefix', () => {
  expect(hashSource('abc').startsWith('fnv1a:')).toBe(true)
})

test('hashSource matches a stable known vector (pins the algorithm)', () => {
  expect(hashSource('hello')).toBe('fnv1a:4f9f2cab')
  expect(hashSource('abc')).toBe('fnv1a:1a47e90b')
  expect(hashSource('# Title\n')).toBe('fnv1a:4eace75e')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/var && npx vitest run tests/hash.test.ts`
Expected: FAIL — cannot resolve `../src/hash.js`.

- [ ] **Step 3: Write minimal implementation**

Create `packages/var/src/hash.ts`:

```ts
// FNV-1a (32-bit) change-detector over UTF-16 code units. Not a security hash:
// tiny, dependency-free (no node:crypto), and trivially re-implementable in
// another language. The `fnv1a:` prefix namespaces the algorithm so a future
// format version can swap it unambiguously. `Math.imul` does the 32-bit FNV
// prime multiply with wraparound.
export function hashSource(source: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < source.length; i++) {
    h ^= source.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  const hex = (h >>> 0).toString(16).padStart(8, '0')
  return `fnv1a:${hex}`
}
```

- [ ] **Step 4: Add the export**

In `packages/var/src/index.ts`, add (alphabetical-ish, near the other value exports):

```ts
export { hashSource } from './hash.js'
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd packages/var && npx vitest run tests/hash.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Build gate + commit**

```bash
pnpm -r build
git add packages/var/src/hash.ts packages/var/tests/hash.test.ts packages/var/src/index.ts
git commit -m "feat(var): add pure FNV-1a hashSource for run-result staleness"
```

---

### Task 2: Core — result types + `toFailure`

**Files:**
- Create: `packages/var/src/result.ts`
- Create: `packages/var/src/failure.ts`
- Test: `packages/var/tests/failure.test.ts`
- Modify: `packages/var/src/index.ts` (add exports)

**Interfaces:**
- Consumes: `isCellMismatchError`, `CellMismatchError.cells` (`CellDiff` with `span.startOffset`/`span.endOffset`, `actual`, `ok`), `isDocStringMismatchError`, `DocStringMismatchError.diff` (`span`, `actual`), `spanFromOffsets` (test only).
- Produces:
  - `type CellFailure = { readonly from: number; readonly to: number; readonly actual: string }`
  - `type ExampleResult` (see below)
  - `type SpecResults = { readonly version: 1; readonly specPath: string; readonly sourceHash: string; readonly examples: ReadonlyArray<ExampleResult> }`
  - `toFailure(error: unknown, specPath: string, fallbackLine: number): NonNullable<ExampleResult['failure']>`

- [ ] **Step 1: Create the result types**

Create `packages/var/src/result.ts`:

```ts
// A doc-string / cell mismatch as a source-offset range plus the runtime value.
// `from`/`to` are absolute source offsets (== CodeMirror positions); `to` is
// exclusive.
export type CellFailure = {
  readonly from: number
  readonly to: number
  readonly actual: string
}

export type ExampleResult = {
  readonly name: string
  readonly status: 'passed' | 'failed'
  // 1-based source lines of this example's steps (the line-wash anchors).
  readonly lines: ReadonlyArray<number>
  readonly failure?: {
    readonly line: number
    readonly message: string
    readonly stack: string
    readonly cells?: ReadonlyArray<CellFailure> // table / header-bound row mismatches
    readonly doc?: CellFailure // doc-string body mismatch (single span)
  }
}

// The persisted run result for one spec file. The `.var/<spec>.json` file IS a
// serialized SpecResults.
export type SpecResults = {
  readonly version: 1
  readonly specPath: string // POSIX separators, relative to cwd
  readonly sourceHash: string // hashSource(spec source) at run time
  readonly examples: ReadonlyArray<ExampleResult>
}
```

- [ ] **Step 2: Write the failing test for `toFailure`**

Create `packages/var/tests/failure.test.ts`:

```ts
import { expect, test } from 'vitest'
import { CellMismatchError, ReturnShapeError } from '../src/cell-diff.js'
import { DocStringMismatchError } from '../src/doc-string-diff.js'
import { toFailure } from '../src/failure.js'
import { spanFromOffsets } from '../src/span.js'

test('toFailure extracts cells from a CellMismatchError', () => {
  const source = 'a | 5 |'
  const err = new CellMismatchError([
    { column: 'n', span: spanFromOffsets(source, 4, 5), expected: '5', actual: '4', ok: false },
  ])
  const f = toFailure(err, 'spec.var.md', 3)
  expect(f.cells).toEqual([{ from: 4, to: 5, actual: '4' }])
  expect(f.doc).toBeUndefined()
  expect(typeof f.message).toBe('string')
  expect(typeof f.stack).toBe('string')
})

test('toFailure extracts doc from a DocStringMismatchError', () => {
  const source = 'Hello!\n'
  const err = new DocStringMismatchError({
    span: spanFromOffsets(source, 0, 7),
    expected: 'Hello!\n',
    actual: 'Goodbye!\n',
  })
  const f = toFailure(err, 'spec.var.md', 3)
  expect(f.doc).toEqual({ from: 0, to: 7, actual: 'Goodbye!\n' })
  expect(f.cells).toBeUndefined()
})

test('toFailure leaves cells/doc undefined for a plain error or ReturnShapeError', () => {
  expect(toFailure(new Error('nope'), 'spec.var.md', 3).cells).toBeUndefined()
  expect(toFailure(new Error('nope'), 'spec.var.md', 3).doc).toBeUndefined()
  expect(toFailure(new ReturnShapeError('bad'), 'spec.var.md', 3).cells).toBeUndefined()
})

test('toFailure reads the failing line from an injected stack frame, else falls back', () => {
  const err = new Error('boom')
  err.stack = 'Error: boom\n    at handler (steps.ts:1:1)\n    at step (docs/a.var.md:12:3)'
  expect(toFailure(err, 'docs/a.var.md', 99).line).toBe(12)

  const noFrame = new Error('boom')
  noFrame.stack = 'Error: boom\n    at handler (steps.ts:1:1)'
  expect(toFailure(noFrame, 'docs/a.var.md', 99).line).toBe(99)
})

test('toFailure regex-escapes the spec path (a dot is literal)', () => {
  const err = new Error('boom')
  err.stack = 'Error: boom\n    at step (aXvar.md:7:1)'
  // specPath "a.var.md" must NOT match "aXvar.md"
  expect(toFailure(err, 'a.var.md', 42).line).toBe(42)
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd packages/var && npx vitest run tests/failure.test.ts`
Expected: FAIL — cannot resolve `../src/failure.js`.

- [ ] **Step 4: Implement `toFailure`**

Create `packages/var/src/failure.ts`:

```ts
import { isCellMismatchError } from './cell-diff.js'
import { isDocStringMismatchError } from './doc-string-diff.js'
import type { CellFailure, ExampleResult } from './result.js'

// Recover the 1-based failing line from the `<specPath>:line:col` frame
// executePlan injects (see execute.ts augmentStack). Internal — not exported
// from the package index.
function failingLine(stack: string, specPath: string): number | undefined {
  const escaped = specPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const m = new RegExp(`${escaped}:(\\d+):\\d+`).exec(stack)
  return m ? Number(m[1]) : undefined
}

// A thrown step error → the ExampleResult.failure payload. Shared by every
// producer (the vitest worker wrapper and the browser runner) so failures are
// byte-identical. Called only on the failure path, so it always returns a
// payload.
export function toFailure(
  error: unknown,
  specPath: string,
  fallbackLine: number,
): NonNullable<ExampleResult['failure']> {
  const e = error as { message?: unknown; stack?: unknown }
  const stack = typeof e?.stack === 'string' ? e.stack : String(error)
  const message = e?.message != null ? String(e.message) : String(error)

  const cells: ReadonlyArray<CellFailure> | undefined = isCellMismatchError(error)
    ? error.cells
        .filter((c) => !c.ok)
        .map((c) => ({ from: c.span.startOffset, to: c.span.endOffset, actual: c.actual }))
    : undefined

  const doc: CellFailure | undefined = isDocStringMismatchError(error)
    ? { from: error.diff.span.startOffset, to: error.diff.span.endOffset, actual: error.diff.actual }
    : undefined

  return {
    line: failingLine(stack, specPath) ?? fallbackLine,
    message,
    stack,
    ...(cells && cells.length > 0 ? { cells } : {}),
    ...(doc ? { doc } : {}),
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd packages/var && npx vitest run tests/failure.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Add the exports**

In `packages/var/src/index.ts`, add:

```ts
export type { CellFailure, ExampleResult, SpecResults } from './result.js'
export { toFailure } from './failure.js'
```

- [ ] **Step 7: Build gate + commit**

```bash
pnpm -r build
git add packages/var/src/result.ts packages/var/src/failure.ts packages/var/tests/failure.test.ts packages/var/src/index.ts
git commit -m "feat(var): add SpecResults format types and shared toFailure helper"
```

---

### Task 3: Core — `TestSink.example` learns the example's lines

**Files:**
- Modify: `packages/var/src/ports.ts`
- Modify: `packages/var/src/execute.ts:21`
- Test: `packages/var/tests/execute.test.ts` (add one test)

**Interfaces:**
- Produces: `TestSink.example(name, run, info?: { readonly lines: ReadonlyArray<number> })` — `info` optional, backward-compatible. The executor fills `info.lines` with the deduped 1-based step lines of the example.

- [ ] **Step 1: Write the failing test**

Append to `packages/var/tests/execute.test.ts` (keep existing imports; add what's missing — `parse`, `plan`, `addStep`, `createRegistry`, `executePlan` from `../src/index.js` if not already imported):

```ts
test('executePlan passes each example its deduped 1-based step lines via info', async () => {
  let r = createRegistry()
  r = addStep(r, { expression: 'I have {int} cukes', expressionSourceFile: 'inline', expressionSourceLine: 1, handler: () => {} })
  r = addStep(r, { expression: 'I eat {int} cukes', expressionSourceFile: 'inline', expressionSourceLine: 2, handler: () => {} })
  const source = '# T\n\nGiven I have 5 cukes.\n\nThen I eat 2 cukes.\n'
  const p = plan(parse('t.var.md', source), r)

  const seen: Array<{ name: string; lines: ReadonlyArray<number> | undefined }> = []
  const sink = { example: (name: string, _run: () => void | Promise<void>, info?: { readonly lines: ReadonlyArray<number> }) => { seen.push({ name, lines: info?.lines }) } }
  executePlan(p, { sink, reporter: { diagnostic() {} } })

  expect(seen).toHaveLength(1)
  expect(seen[0]?.lines).toEqual([3, 5])
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/var && npx vitest run tests/execute.test.ts`
Expected: FAIL — `info` is `undefined` (third arg not passed), so `seen[0].lines` is `undefined`, not `[3, 5]`.

- [ ] **Step 3: Widen the port**

In `packages/var/src/ports.ts`, replace the `TestSink` interface:

```ts
export interface TestSink {
  example(
    name: string,
    run: () => void | Promise<void>,
    info?: { readonly lines: ReadonlyArray<number> }, // 1-based source lines of the example's steps
  ): void
}
```

- [ ] **Step 4: Pass the lines from the executor**

In `packages/var/src/execute.ts`, change the `ports.sink.example(...)` call (currently `execute.ts:21`, the call wrapping the `async () => { ... }` body) to pass the third argument. The body of the async function is unchanged — only add the trailing `info` argument:

```ts
    ports.sink.example(
      ex.name,
      async () => {
        // ... existing body unchanged ...
      },
      { lines: [...new Set(ex.steps.map((s) => s.matchSpan.startLine))] },
    )
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd packages/var && npx vitest run tests/execute.test.ts`
Expected: PASS (existing execute tests + the new one).

- [ ] **Step 6: Build gate + commit**

```bash
pnpm -r build
git add packages/var/src/ports.ts packages/var/src/execute.ts packages/var/tests/execute.test.ts
git commit -m "feat(var): TestSink.example receives the example's source lines"
```

---

### Task 4: var-vitest — boundary wrapper attaches `ExampleResult` to `task.meta`

**Files:**
- Modify: `packages/var-vitest/src/plugin.ts` (`generateVirtualModule` template)
- Test: `packages/var-vitest/tests/plugin.test.ts` (update assertions)

**Interfaces:**
- Consumes: `toFailure` from `@oselvar/var`; the widened `TestSink.example(name, run, info)`.
- Produces: a generated module whose `sink.example` writes a full `ExampleResult` to `ctx.task.meta.varResult` (passed or failed) and re-throws on failure.

- [ ] **Step 1: Update the test to assert the new generated shape**

In `packages/var-vitest/tests/plugin.test.ts`, replace the first test's body assertions and keep the others. The first test becomes:

```ts
test('produces TS that imports runtime + toFailure, step files, and wires the meta-attaching sink', () => {
  const out = generateVirtualModule({
    varPath: '/abs/foo.var.md',
    stepImports: ['/abs/account.steps.ts'],
  })
  expect(out).toContain("import { test as vitestTest } from 'vitest'")
  expect(out).toContain("import { runVarSource } from '@oselvar/var-vitest/runtime'")
  expect(out).toContain("import { toFailure } from '@oselvar/var'")
  expect(out).toContain('import "/abs/account.steps.ts"')
  expect(out).toContain('const PATH = "/abs/foo.var.md"')
  expect(out).toContain('runVarSource(SOURCE, PATH,')
  expect(out).toContain('ctx.task.meta.varResult')
  expect(out).toContain('toFailure(error, PATH, lines[0] ?? 0)')
  expect(out).toContain('scannerPlugins: varConfig?.scannerPlugins ?? []')
})
```

(The `configPath` and `const varConfig = {}` tests are unchanged.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/var-vitest && npx vitest run tests/plugin.test.ts`
Expected: FAIL — `import { toFailure }`, `const PATH`, and `ctx.task.meta.varResult` are not in the current output.

- [ ] **Step 3: Rewrite the generated module template**

In `packages/var-vitest/src/plugin.ts`, replace the `return \`...\`` template inside `generateVirtualModule` with:

```ts
  return `import { test as vitestTest } from 'vitest'
import { runVarSource } from '@oselvar/var-vitest/runtime'
import { toFailure } from '@oselvar/var'
${configImport}
${stepImports}

const SOURCE = ${sourceJson}
const PATH = ${pathJson}

runVarSource(SOURCE, PATH, {
  sink: {
    example: (name, run, info) =>
      vitestTest(name, async (ctx) => {
        const lines = info?.lines ?? []
        try {
          await run()
          ctx.task.meta.varResult = { name, status: 'passed', lines }
        } catch (error) {
          ctx.task.meta.varResult = {
            name,
            status: 'failed',
            lines,
            failure: toFailure(error, PATH, lines[0] ?? 0),
          }
          throw error
        }
      }),
  },
  reporter: { diagnostic: (d) => vitestTest(\`var:diagnostic:\${d.code}\`, () => { throw new Error(d.message) }) },
  scannerPlugins: varConfig?.scannerPlugins ?? [],
})
`
```

(`sourceJson`, `pathJson`, `configImport`, `stepImports` are the existing locals — unchanged.)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/var-vitest && npx vitest run tests/plugin.test.ts`
Expected: PASS.

- [ ] **Step 5: Build gate + commit**

```bash
pnpm -r build
git add packages/var-vitest/src/plugin.ts packages/var-vitest/tests/plugin.test.ts
git commit -m "feat(var-vitest): attach ExampleResult to task.meta in the generated module"
```

---

### Task 5: var-vitest — registry-free reporter

**Files:**
- Create: `packages/var-vitest/src/reporter.ts`
- Test: `packages/var-vitest/tests/reporter.test.ts`
- Modify: `packages/var-vitest/package.json` (add `./reporter` export, dev + publish)

**Interfaces:**
- Consumes: `hashSource`, `SpecResults`, `ExampleResult` from `@oselvar/var`; the vitest task-tree shape (`File { filepath, tasks }`, nested `Test { type:'test', name, meta }`).
- Produces (all pure except the `VarResultsReporter` shell):
  - `buildSpecResults(specPath, source, examples): SpecResults`
  - `collectFromTasks(files): Map<string, ExampleResult[]>`
  - `toSpecPath(filepath, cwd): string` (POSIX, relative)
  - `resultFilePath(specPath, cwd): string`
  - `class VarResultsReporter` with `onFinished(files)`.

- [ ] **Step 1: Write the failing test (pure helpers)**

Create `packages/var-vitest/tests/reporter.test.ts`:

```ts
import { join } from 'node:path'
import { hashSource } from '@oselvar/var'
import { describe, expect, test } from 'vitest'
import {
  buildSpecResults,
  collectFromTasks,
  resultFilePath,
  toSpecPath,
} from '../src/reporter.js'

const passed = { name: 'A', status: 'passed' as const, lines: [3] }
const failed = {
  name: 'B',
  status: 'failed' as const,
  lines: [5],
  failure: { line: 5, message: 'm', stack: 's', cells: [{ from: 1, to: 2, actual: '4' }] },
}

describe('buildSpecResults', () => {
  test('wraps examples with version, path, and source hash', () => {
    const r = buildSpecResults('docs/a.var.md', 'src', [passed, failed])
    expect(r).toEqual({
      version: 1,
      specPath: 'docs/a.var.md',
      sourceHash: hashSource('src'),
      examples: [passed, failed],
    })
  })
})

describe('collectFromTasks', () => {
  test('groups examples by spec file, walks nested suites, skips meta-less tasks', () => {
    const files = [
      {
        filepath: '/cwd/docs/a.var.md',
        tasks: [
          { type: 'test', name: 'A', meta: { varResult: passed } },
          { type: 'suite', name: 'g', tasks: [{ type: 'test', name: 'B', meta: { varResult: failed } }] },
          { type: 'test', name: 'var:diagnostic:x', meta: {} },
        ],
      },
      { filepath: '/cwd/docs/empty.var.md', tasks: [{ type: 'test', name: 'n', meta: {} }] },
    ]
    const byFile = collectFromTasks(files)
    expect([...byFile.keys()]).toEqual(['/cwd/docs/a.var.md'])
    expect(byFile.get('/cwd/docs/a.var.md')).toEqual([passed, failed])
  })
})

describe('path helpers', () => {
  test('toSpecPath returns a POSIX path relative to cwd', () => {
    const abs = join('/cwd', 'docs', 'a.var.md')
    expect(toSpecPath(abs, '/cwd')).toBe('docs/a.var.md')
  })
  test('resultFilePath mirrors the spec path under .var/', () => {
    expect(resultFilePath('docs/a.var.md', '/cwd')).toBe(join('/cwd', '.var', 'docs/a.var.md.json'))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/var-vitest && npx vitest run tests/reporter.test.ts`
Expected: FAIL — cannot resolve `../src/reporter.js`.

- [ ] **Step 3: Implement the reporter**

Create `packages/var-vitest/src/reporter.ts`:

```ts
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, sep } from 'node:path'
import { type ExampleResult, hashSource, type SpecResults } from '@oselvar/var'

// Minimal structural view of the vitest task tree we walk (File/Suite/Test).
type TaskNode = {
  readonly name?: string
  readonly meta?: { readonly varResult?: ExampleResult }
  readonly tasks?: ReadonlyArray<TaskNode>
}
type FileNode = { readonly filepath: string; readonly tasks?: ReadonlyArray<TaskNode> }

function collectExamples(tasks: ReadonlyArray<TaskNode> | undefined): ExampleResult[] {
  const out: ExampleResult[] = []
  for (const t of tasks ?? []) {
    if (t.meta?.varResult) out.push(t.meta.varResult)
    if (t.tasks) out.push(...collectExamples(t.tasks))
  }
  return out
}

// Group every test's meta.varResult by its owning spec file, in declaration
// order. Files that produced no var results (e.g. only var:diagnostic tasks)
// are skipped.
export function collectFromTasks(files: ReadonlyArray<FileNode>): Map<string, ExampleResult[]> {
  const byFile = new Map<string, ExampleResult[]>()
  for (const f of files) {
    const examples = collectExamples(f.tasks)
    if (examples.length > 0) byFile.set(f.filepath, examples)
  }
  return byFile
}

// Absolute filepath → POSIX spec path relative to cwd.
export function toSpecPath(filepath: string, cwd: string): string {
  const rel = isAbsolute(filepath) ? relative(cwd, filepath) : filepath
  return rel.split(sep).join('/')
}

// Spec path → its result file under .var/.
export function resultFilePath(specPath: string, cwd: string): string {
  return join(cwd, '.var', `${specPath}.json`)
}

export function buildSpecResults(
  specPath: string,
  source: string,
  examples: ReadonlyArray<ExampleResult>,
): SpecResults {
  return { version: 1, specPath, sourceHash: hashSource(source), examples }
}

export type VarResultsReporterOptions = { readonly cwd?: string }

// Vitest reporter (the only side-effecting piece). Reads each spec's source,
// hashes it, and writes .var/<spec>.json. Registry-free: every ExampleResult
// arrives prebuilt on task.meta from the worker.
export class VarResultsReporter {
  private readonly cwd: string
  constructor(options: VarResultsReporterOptions = {}) {
    this.cwd = options.cwd ?? process.cwd()
  }

  // Legacy task-tree hook, still supported in vitest 4. `files` carries each
  // spec's filepath + task tree with the serialized meta.
  onFinished(files: ReadonlyArray<FileNode> = []): void {
    for (const [filepath, examples] of collectFromTasks(files)) {
      const specPath = toSpecPath(filepath, this.cwd)
      const source = readFileSync(filepath, 'utf8')
      const results = buildSpecResults(specPath, source, examples)
      const out = resultFilePath(specPath, this.cwd)
      mkdirSync(dirname(out), { recursive: true })
      writeFileSync(out, `${JSON.stringify(results, null, 2)}\n`)
    }
  }
}
```

> Implementer note: confirm against the installed vitest (4.1.8) that a custom
> reporter's `onFinished(files)` receives `File` nodes with `.filepath` and
> `.tasks`, and that `ctx.task.meta` set in the worker is serialized through to
> them. If vitest's types require the reporter to `implements Reporter`, the
> structural `FileNode`/`TaskNode` shape is a compatible subset — keep it; do
> not import vitest runtime types into this file (it stays unit-testable with
> plain objects). The Task 7 dogfood proves the wiring end to end.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/var-vitest && npx vitest run tests/reporter.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the package export**

In `packages/var-vitest/package.json`, add a `./reporter` entry to `exports` (dev) and to `publishConfig.exports`:

Dev `exports`:
```json
    "./reporter": {
      "types": "./src/reporter.ts",
      "import": "./src/reporter.ts"
    }
```

`publishConfig.exports`:
```json
    "./reporter": {
      "types": "./dist/reporter.d.ts",
      "import": "./dist/reporter.js"
    }
```

- [ ] **Step 6: Build gate + commit**

```bash
pnpm -r build
git add packages/var-vitest/src/reporter.ts packages/var-vitest/tests/reporter.test.ts packages/var-vitest/package.json
git commit -m "feat(var-vitest): registry-free reporter writing .var/<spec>.json"
```

---

### Task 6: Website — refactor onto the shared type + helper

**Files:**
- Delete: `packages/website/src/lib/run-types.ts`
- Modify: `packages/website/src/lib/run-spec.ts`
- Modify: `packages/website/src/lib/cm-run.ts`
- Modify: `packages/website/src/lib/cm-run.test.ts` (fixtures)
- Modify: any other `run-types` importer found by grep

**Interfaces:**
- Consumes: `SpecResults`, `ExampleResult`, `toFailure`, `hashSource` from `@oselvar/var`.
- Produces: `runRegisteredSpec(...): Promise<SpecResults>` (was `RunResults`).

- [ ] **Step 1: Find every importer**

Run: `grep -rl "run-types" packages/website/src`
Expected: at least `run-spec.ts`, `cm-run.ts`, `cm-run.test.ts` (and possibly the playground Astro component / `run-spec.test.ts`). Note them all.

- [ ] **Step 2: Replace `run-spec.ts` wholesale**

Overwrite `packages/website/src/lib/run-spec.ts` with:

```ts
import {
  type ExampleResult,
  executePlan,
  hashSource,
  parse,
  plan,
  type SpecResults,
  type TestSink,
  toFailure,
} from '@oselvar/var'
import { buildRegistry, contextFactory } from '@oselvar/var-runtime'

export async function runRegisteredSpec(
  varPath: string,
  varSource: string,
  exampleIndex?: number,
): Promise<SpecResults> {
  const registry = buildRegistry()
  const varDoc = parse(varPath, varSource, [])
  const full = plan(varDoc, registry)
  const examples =
    exampleIndex == null ? full.examples : full.examples.filter((_, i) => i === exampleIndex)
  const toRun = { ...full, examples }

  const out: ExampleResult[] = new Array(examples.length)
  const pending: Promise<void>[] = []
  let i = 0
  const createContext = contextFactory()
  const sink: TestSink = {
    example(name, run) {
      const idx = i++
      // biome-ignore lint/style/noNonNullAssertion: example() is invoked once per examples entry, so idx is in range
      const ex = examples[idx]!
      const lines = [...new Set(ex.steps.map((s) => s.matchSpan.startLine))]
      pending.push(
        (async () => {
          try {
            await run()
            out[idx] = { name, status: 'passed', lines }
          } catch (err) {
            out[idx] = { name, status: 'failed', lines, failure: toFailure(err, varPath, lines[0] ?? 0) }
          }
        })(),
      )
    },
  }

  executePlan(toRun, { sink, reporter: { diagnostic() {} }, createContext })
  await Promise.all(pending)
  return { version: 1, specPath: varPath, sourceHash: hashSource(varSource), examples: out }
}
```

- [ ] **Step 3: Repoint `cm-run.ts` at the shared type**

In `packages/website/src/lib/cm-run.ts`, change the import:

```ts
import type { SpecResults } from '@oselvar/var'
```

Then replace every `RunResults` with `SpecResults` in that file (the `setRunResults` effect type, and the `cellFailRanges` / `actualAt` / field signatures). These functions read only `.examples`, so no logic changes.

- [ ] **Step 4: Delete the local types**

```bash
git rm packages/website/src/lib/run-types.ts
```

Update any remaining importer from Step 1 (e.g. the playground component) to import `SpecResults` (and `ExampleResult` if used) from `@oselvar/var` instead of `./run-types`.

- [ ] **Step 5: Fix the `cm-run.test.ts` fixtures**

`SpecResults` requires `version`/`specPath`/`sourceHash`. In `packages/website/src/lib/cm-run.test.ts`, for **every** object literal that was a `RunResults` (the values passed to `setRunResults`, `cellFailRanges`, `actualAt` — they currently look like `{ examples: [...] }`), add the three wrapper fields:

```ts
{ version: 1, specPath: 'spec.var.md', sourceHash: 'fnv1a:00000000', examples: [ /* unchanged */ ] }
```

(Update the import in that file too: `import type { SpecResults } from '@oselvar/var'` if it referenced the type.)

- [ ] **Step 6: Run the website lib suite + type-check**

Run: `cd packages/website && npx vitest run src/lib/run-spec.test.ts src/lib/cm-run.test.ts`
Expected: PASS (the existing `run-spec` assertions read `results.examples[...]`, which still hold; cm-run reads `.examples`).

Run: `pnpm --filter @oselvar/website build`
Expected: exit 0 (no `run-types` references, all literals satisfy `SpecResults`).

- [ ] **Step 7: Build gate + commit**

```bash
pnpm -r build
git add packages/website/src/lib
git commit -m "refactor(website): adopt core SpecResults format + toFailure helper"
```

---

### Task 7: Wire the reporter into the dogfood + git-ignore `.var/`

**Files:**
- Modify: `.gitignore`
- Modify: `docs/tutorial/vitest.config.ts`

**Interfaces:**
- Consumes: `VarResultsReporter` from `@oselvar/var-vitest/reporter`.

- [ ] **Step 1: Git-ignore the output**

Append `.var/` to `.gitignore` (one line, after `.superpowers`).

- [ ] **Step 2: Wire the reporter into the tutorial config**

Overwrite `docs/tutorial/vitest.config.ts` with:

```ts
import varPlugin from '@oselvar/var-vitest'
import { VarResultsReporter } from '@oselvar/var-vitest/reporter'
import { defineConfig } from 'vitest/config'

const root = new URL('../..', import.meta.url).pathname

export default defineConfig({
  plugins: [varPlugin({ cwd: root })],
  test: {
    include: ['**/*.var.md'],
    reporters: ['default', new VarResultsReporter({ cwd: root })],
    // Inline workspace packages so the plugin and runtime are transformed by vite.
    server: { deps: { inline: [/^@oselvar\//] } },
  },
})
```

- [ ] **Step 3: Run the dogfood and verify the output file**

Run (from repo root): `NODE_OPTIONS="--import tsx" npx vitest run`
Expected: the tutorial specs pass, and the reporter writes result files.

Verify the passing baseline:
```bash
cat .var/docs/tutorial/04-yahtzee.var.md.json
```
Expected: a `SpecResults` with `"version": 1`, `"specPath": "docs/tutorial/04-yahtzee.var.md"`, a `"sourceHash": "fnv1a:..."`, and every example `"status": "passed"`.

- [ ] **Step 4: Prove the failure path (then revert)**

Temporarily edit one expected cell in `docs/tutorial/04-yahtzee.var.md` (e.g. change a score number to a wrong value). Re-run:
```bash
NODE_OPTIONS="--import tsx" npx vitest run
cat .var/docs/tutorial/04-yahtzee.var.md.json
```
Expected: the affected example shows `"status": "failed"` with a `"failure"` carrying `"cells"` (`{ from, to, actual }`) where `actual` is the computed value. Then **revert** the edit:
```bash
git checkout docs/tutorial/04-yahtzee.var.md
```

- [ ] **Step 5: Commit the wiring**

```bash
git add .gitignore docs/tutorial/vitest.config.ts
git commit -m "chore(dogfood): write .var/ results via VarResultsReporter; ignore .var/"
```

---

## Self-Review

**Spec coverage:**
- Format types (`SpecResults`/`ExampleResult`/`CellFailure`) → Task 2 ✓
- `hashSource` FNV-1a, `fnv1a:` prefix, no `node:crypto` → Task 1 ✓
- `toFailure` (shared, cells/doc/line/message/stack) → Task 2 ✓
- `TestSink.example` optional `info` + executor passes lines → Task 3 ✓
- Boundary wrapper attaches `ExampleResult` to `task.meta` → Task 4 ✓
- Registry-free reporter, one file per spec, POSIX path, mirrored `.var/` path → Task 5 ✓
- Website refactor onto shared type + helper, delete `run-types.ts` → Task 6 ✓
- `.gitignore` `.var/`, dogfood end-to-end with pass + deliberate-break → Task 7 ✓
- Staleness contract (sourceHash in the file) → satisfied by Task 5's `buildSpecResults` ✓
- Build gate after type/port/export changes → every core/adapter task ✓

**Placeholder scan:** Known hash vectors are real values (computed). All code blocks complete. Task 6 Step 5 describes a mechanical fixture edit with exact fields (the unseen test file is read by the implementer first in Step 1) — acceptable for a refactor; no logic placeholders.

**Type consistency:** `SpecResults`/`ExampleResult`/`CellFailure` field names match across Tasks 2, 5, 6. `toFailure(error, specPath, fallbackLine)` signature identical in Tasks 2, 4, 6. `info: { lines }` identical in Tasks 3, 4. `hashSource` returns `fnv1a:`-prefixed in Tasks 1, 5. `version: 1` literal everywhere.

## Out of scope (deferred sub-projects)

LSP/VSCode red+hover (#2), `var.js` HTML overlay (#3), and example-drift detection (#4) are **not** in this plan. See the spec's "Consumers / future direction" and "Out of scope" sections.
