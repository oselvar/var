# Conformance Infrastructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a language-agnostic conformance suite — real `.var.md` bundles plus an instrumented runner "trace mode" that serializes each pipeline stage as canonical JSON — so every future Vár implementation can be verified byte-for-byte against committed TypeScript-reference goldens.

**Architecture:** Add a pure `conformance.ts` module to `@oselvar/var` that projects the existing immutable stage outputs (`VarDoc`, `Registry`, `ExecutionPlan`, execution trace) into canonical JSON artifacts. Extend `executePlan` with an optional per-step observer and expected-failure semantics. A harness in `@oselvar/var-runtime` loads each bundle's native step-defs, runs the driver, and diffs the four artifacts against committed goldens.

**Tech Stack:** TypeScript (ESM-only, `node:` imports), pnpm workspace, vitest, biome. Reuses `@cucumber/cucumber-expressions` and the existing `CellMismatchError`/`DocStringMismatchError` comparison machinery.

## Global Constraints

- **Immutable types.** All data `readonly`; `ReadonlyArray`/`ReadonlyMap`. Updates produce new values.
- **Pure functional core.** `packages/var/src/*` does no I/O (no `node:fs`, no globals, no time). All fs/glob lives in the harness (the shell).
- **ESM + `node:` imports.** Node ≥ 22 LTS. Test files: `*.test.ts` (vitest).
- **No keyword heuristics.** Never sniff Given/When/Then for codegen or diagnostics.
- **Corpus step-defs must be deterministic** — no time, randomness, or I/O — so traces are reproducible across languages.
- **Conformance covers the *runner*** (parse → match → plan → execute). `registry.json` is built from *executed* step-defs (runtime self-registration), never static source parsing.

Spec: [`doc/superpowers/specs/2026-06-28-conformance-infrastructure-design.md`](../specs/2026-06-28-conformance-infrastructure-design.md).

---

## File Structure

**Modified:**
- `packages/var/src/plan.ts` — `PlannedExample` gains `expectedOutcome`/`expectedErrorMessage`; `plan()` recognises the `error` fence.
- `packages/var/src/execute.ts` — per-step observer + expected-failure semantics + `UnexpectedPassError`.
- `packages/var/src/index.ts` — export the new conformance API + `UnexpectedPassError`/`StepObservation`/`ExecutionObserver`.

**Created:**
- `packages/var/src/conformance.ts` — pure: artifact types, `canonicalStringify`, `toFailureArtifact`, `toVarDocArtifact`, `toRegistryArtifact`, `toPlanArtifact`, `runConformance`.
- `packages/var/tests/conformance.test.ts` — unit tests for the pure projections.
- `packages/var-runtime/tests/conformance.test.ts` — the bundle harness (fs + diff).
- `packages/var-runtime/bundles/<NN-name>/{example.var.md, *.steps.ts, golden/*.json}` — the corpus.

---

## Task 1: Recognise the `error` fence in the planner

**Files:**
- Modify: `packages/var/src/plan.ts` (the `PlannedExample` type; the `plan()` non-header-bound path)
- Test: `packages/var/tests/plan.test.ts`

**Interfaces:**
- Produces: `PlannedExample.expectedOutcome?: 'fail'` and `PlannedExample.expectedErrorMessage?: string`. A fence whose `info === 'error'` in an example body sets `expectedOutcome = 'fail'`; a non-empty trimmed fence body becomes `expectedErrorMessage`. Such a fence is **not** attached as a `docString`.

- [ ] **Step 1: Write the failing test**

Add to `packages/var/tests/plan.test.ts` (tilde-fenced because the test strings contain triple-backtick `error` fences):

~~~ts
import { parse } from '../src/parse.js'
import { plan } from '../src/plan.js'
import { addStep, createRegistry } from '../src/registry.js'

test('an `error` fence marks the example expectedOutcome=fail with a message substring', () => {
  const r = addStep(createRegistry(), {
    expression: 'I divide {int} by {int}',
    expressionSourceFile: 's.ts',
    expressionSourceLine: 1,
    handler: () => {},
  })
  const src = '# Division\n\nI divide 1 by 0.\n\n```error\ndivision by zero\n```\n'
  const ex = plan(parse('e.var.md', src), r).examples[0]
  expect(ex?.expectedOutcome).toBe('fail')
  expect(ex?.expectedErrorMessage).toBe('division by zero')
  // The error fence must NOT become a docString attachment on the step.
  expect(ex?.steps[0]?.docString).toBeUndefined()
})

test('no `error` fence leaves expectedOutcome undefined', () => {
  const r = addStep(createRegistry(), {
    expression: 'I divide {int} by {int}',
    expressionSourceFile: 's.ts',
    expressionSourceLine: 1,
    handler: () => {},
  })
  const ex = plan(parse('e.var.md', '# Division\n\nI divide 1 by 1.'), r).examples[0]
  expect(ex?.expectedOutcome).toBeUndefined()
})
~~~

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @oselvar/var exec vitest run tests/plan.test.ts -t "error\` fence"`
Expected: FAIL — `expectedOutcome` is `undefined` (property does not exist yet).

- [ ] **Step 3: Add the fields to `PlannedExample`**

In `packages/var/src/plan.ts`, extend the `PlannedExample` type (add after `rowChecks?`):

```ts
  // Set when the example carries an ``` ```error ``` ``` fence: the example is
  // expected to fail. The executor inverts the outcome (a pass becomes a
  // failure). An optional message substring the actual failure must contain.
  readonly expectedOutcome?: 'fail'
  readonly expectedErrorMessage?: string
```

- [ ] **Step 4: Recognise the fence and skip it as an attachment**

In `packages/var/src/plan.ts`, inside `plan()`, in the non-header-bound path. First, just before "Pass 2", compute the error fence:

```ts
    // An ```error fence anywhere in this example marks it expected-to-fail and
    // is consumed here (never attached to a step as a doc string).
    // `Fence` is already imported at the top of plan.ts.
    const errorFence = ex.body.find(
      (b): b is Fence => b.kind === 'fence' && b.info === 'error',
    )
```

In "Pass 2", change the fence-attachment guard so an `error` fence is ignored:

```ts
      } else if (here.kind === 'fence' && here.info !== 'error' && stepsByBlock.has(idx - 1)) {
```

Then, in the final `examples.push({...})` for the non-header-bound path, add the expected-outcome fields:

```ts
    examples.push({
      name: deriveExampleName(ex.body),
      scopeStack: ex.scopeStack,
      span: ex.span,
      steps: hadAmbiguous ? [] : finalSteps,
      ...(errorFence
        ? {
            expectedOutcome: 'fail' as const,
            ...(errorFence.body.trim().length > 0
              ? { expectedErrorMessage: errorFence.body.trim() }
              : {}),
          }
        : {}),
    })
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm --filter @oselvar/var exec vitest run tests/plan.test.ts`
Expected: PASS (all plan tests, including the two new ones).

- [ ] **Step 6: Commit**

```bash
git add packages/var/src/plan.ts packages/var/tests/plan.test.ts
git commit -m "feat(var): planner recognises the \`error\` fence as expected-failure"
```

---

## Task 2: Per-step observer + expected-failure execution semantics

**Files:**
- Modify: `packages/var/src/execute.ts`
- Modify: `packages/var/src/index.ts` (exports)
- Test: `packages/var/tests/execute.test.ts`

**Interfaces:**
- Produces:
  - `class UnexpectedPassError extends Error` + `isUnexpectedPassError(e): e is UnexpectedPassError`.
  - `interface ExecutionObserver { step(o: StepObservation): void }`.
  - `type StepObservation = { exampleName: string; ordinal: number; stepFile: string; outcome: 'pass'|'fail'; error?: unknown }` (ordinal is 1-based).
  - `ExecutePorts` gains `observer?: ExecutionObserver`.
  - Expected-failure inversion: when `ex.expectedOutcome === 'fail'`, the run resolves if a step threw (and the message substring matched, if given), and throws `UnexpectedPassError` if nothing threw.

- [ ] **Step 1: Write the failing tests**

Add to `packages/var/tests/execute.test.ts` (tilde-fenced — the test strings contain triple-backtick `error` fences):

~~~ts
import { executePlan, isUnexpectedPassError, type StepObservation } from '../src/execute.js'

async function runOnly(p: ReturnType<typeof plan>, observer?: { step(o: StepObservation): void }) {
  let run: (() => void | Promise<void>) | undefined
  executePlan(p, {
    sink: { example: (_n, r) => { run = r } },
    reporter: { diagnostic: () => {} },
    ...(observer ? { observer } : {}),
  })
  return run
}

test('expected-failure example: a thrown step makes the run resolve (pass)', async () => {
  const r = addStep(createRegistry(), {
    expression: 'I divide {int} by {int}',
    expressionSourceFile: 's.ts',
    expressionSourceLine: 1,
    handler: (_c, _a, b) => { if (b === 0) throw new Error('division by zero') },
  })
  const src = '# D\n\nI divide 1 by 0.\n\n```error\ndivision by zero\n```\n'
  const run = await runOnly(plan(parse('e.var.md', src), r))
  await expect(run?.()).resolves.toBeUndefined()
})

test('expected-failure example: no throw makes the run reject with UnexpectedPassError', async () => {
  const r = addStep(createRegistry(), {
    expression: 'I divide {int} by {int}',
    expressionSourceFile: 's.ts',
    expressionSourceLine: 1,
    handler: () => {},
  })
  const src = '# D\n\nI divide 1 by 1.\n\n```error\n```\n'
  const run = await runOnly(plan(parse('e.var.md', src), r))
  await expect(run?.()).rejects.toSatisfy(isUnexpectedPassError)
})

test('expected-failure with message substring: mismatch rejects with the real error', async () => {
  const r = addStep(createRegistry(), {
    expression: 'I divide {int} by {int}',
    expressionSourceFile: 's.ts',
    expressionSourceLine: 1,
    handler: () => { throw new Error('boom') },
  })
  const src = '# D\n\nI divide 1 by 0.\n\n```error\ndivision by zero\n```\n'
  const run = await runOnly(plan(parse('e.var.md', src), r))
  await expect(run?.()).rejects.toThrow('boom')
})

test('observer receives a pass observation per executed step', async () => {
  const r = addStep(createRegistry(), {
    expression: 'I add {int}',
    expressionSourceFile: 's.ts',
    expressionSourceLine: 1,
    handler: () => {},
  })
  const obs: StepObservation[] = []
  const run = await runOnly(plan(parse('e.var.md', '# A\n\nI add 5.'), r), {
    step: (o) => obs.push(o),
  })
  await run?.()
  expect(obs).toEqual([
    { exampleName: 'I add 5', ordinal: 1, stepFile: 's.ts', outcome: 'pass' },
  ])
})
~~~

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @oselvar/var exec vitest run tests/execute.test.ts -t "expected-failure"`
Expected: FAIL — `isUnexpectedPassError`/`observer` not exported; semantics absent.

- [ ] **Step 3: Add the error class and port types**

In `packages/var/src/execute.ts`, add near the top (after imports):

```ts
export class UnexpectedPassError extends Error {
  constructor(message = 'expected the example to fail, but it passed') {
    super(message)
    this.name = 'UnexpectedPassError'
  }
}
export function isUnexpectedPassError(e: unknown): e is UnexpectedPassError {
  return e instanceof UnexpectedPassError
}

export type StepObservation = {
  readonly exampleName: string
  readonly ordinal: number // 1-based index within the example
  readonly stepFile: string // step.stepDef.expressionSourceFile (raw)
  readonly outcome: 'pass' | 'fail'
  readonly error?: unknown // the augmented error on failure
}
export interface ExecutionObserver {
  step(o: StepObservation): void
}
```

Add `observer` to `ExecutePorts`:

```ts
export type ExecutePorts = {
  readonly sink: TestSink
  readonly reporter: Reporter
  readonly createContext?: (stepFile: string) => unknown | Promise<unknown>
  // Optional per-step observer for instrumentation (conformance trace mode).
  // Called once per executed step; steps after a failure are not observed.
  readonly observer?: ExecutionObserver
}
```

- [ ] **Step 4: Rewrite the run closure**

Replace the body of `executePlan`'s `ports.sink.example(ex.name, async () => { ... })` closure with:

```ts
      async () => {
        const ctxByFile = new Map<string, unknown>()
        let lastReturn: unknown
        let thrown: unknown
        for (let i = 0; i < ex.steps.length; i++) {
          const step = ex.steps[i] as PlannedStep
          const file = step.stepDef.expressionSourceFile
          let ctx = ctxByFile.get(file)
          if (!ctxByFile.has(file)) {
            ctx = await createContext(file)
            ctxByFile.set(file, ctx)
          }
          const extra: unknown[] = []
          if (step.dataTable) {
            extra.push([
              step.dataTable.header.cells,
              ...step.dataTable.rows.map((r) => r.cells),
            ] as ReadonlyArray<ReadonlyArray<string>>)
          } else if (step.docString) {
            extra.push(step.docString.content)
          }
          try {
            const returned = await step.stepDef.handler(ctx, ...step.args, ...extra)
            lastReturn = returned
            if (step.dataTable) {
              const bad = compareTable(returned, step.dataTable).filter((d) => !d.ok)
              if (bad.length > 0) throw new CellMismatchError(bad)
            } else if (step.docString) {
              const diff = compareDocString(returned, step.docString.content, step.docString.span)
              if (diff) throw new DocStringMismatchError(diff)
            }
            ports.observer?.step({ exampleName: ex.name, ordinal: i + 1, stepFile: file, outcome: 'pass' })
          } catch (err) {
            const augmented = augmentStack(err, step, path)
            ports.observer?.step({
              exampleName: ex.name,
              ordinal: i + 1,
              stepFile: file,
              outcome: 'fail',
              error: augmented,
            })
            thrown = augmented
            break
          }
        }
        if (thrown === undefined && ex.rowChecks && ex.rowChecks.length > 0) {
          const bad = compareRow(lastReturn, ex.rowChecks).filter((d) => !d.ok)
          if (bad.length > 0) {
            const lastStep = ex.steps[ex.steps.length - 1] as PlannedStep
            const augmented = augmentStack(new CellMismatchError(bad), lastStep, path)
            ports.observer?.step({
              exampleName: ex.name,
              ordinal: ex.steps.length,
              stepFile: lastStep.stepDef.expressionSourceFile,
              outcome: 'fail',
              error: augmented,
            })
            thrown = augmented
          }
        }
        if (ex.expectedOutcome === 'fail') {
          if (thrown === undefined) {
            const lastStep = ex.steps[ex.steps.length - 1]
            const e = new UnexpectedPassError()
            throw lastStep ? augmentStack(e, lastStep, path) : e
          }
          if (ex.expectedErrorMessage) {
            const msg = thrown instanceof Error ? thrown.message : String(thrown)
            if (!msg.includes(ex.expectedErrorMessage)) throw thrown
          }
          return
        }
        if (thrown !== undefined) throw thrown
      },
```

- [ ] **Step 5: Export from the package index**

In `packages/var/src/index.ts`, replace the execute export line with:

```ts
export type { ExecutePorts, ExecutionObserver, StepObservation } from './execute.js'
export { executePlan, isUnexpectedPassError, UnexpectedPassError } from './execute.js'
```

- [ ] **Step 6: Run the full execute suite**

Run: `pnpm --filter @oselvar/var exec vitest run tests/execute.test.ts`
Expected: PASS — the four new tests **and** all pre-existing execute tests (the augmented-stack-frame behaviour is preserved).

- [ ] **Step 7: Commit**

```bash
git add packages/var/src/execute.ts packages/var/src/index.ts packages/var/tests/execute.test.ts
git commit -m "feat(var): executePlan per-step observer + expected-failure semantics"
```

---

## Task 3: `conformance.ts` — artifact types + `canonicalStringify`

**Files:**
- Create: `packages/var/src/conformance.ts`
- Create: `packages/var/tests/conformance.test.ts`
- Modify: `packages/var/src/index.ts` (exports)

**Interfaces:**
- Produces: `canonicalStringify(value: unknown): string` — recursively key-sorted JSON, 2-space indent, LF, trailing newline. Plus the artifact `type`s consumed by later tasks: `VarDocArtifact`, `RegistryArtifact`, `PlanArtifact`, `TraceArtifact`, `FailureArtifact`, `BundleArtifacts`.

- [ ] **Step 1: Write the failing test**

Create `packages/var/tests/conformance.test.ts`:

```ts
import { expect, test } from 'vitest'
import { canonicalStringify } from '../src/conformance.js'

test('canonicalStringify sorts keys recursively and ends with a newline', () => {
  const out = canonicalStringify({ b: 1, a: { d: 2, c: 3 } })
  expect(out).toBe('{\n  "a": {\n    "c": 3,\n    "d": 2\n  },\n  "b": 1\n}\n')
})

test('canonicalStringify preserves array order', () => {
  expect(canonicalStringify([3, 1, 2])).toBe('[\n  3,\n  1,\n  2\n]\n')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @oselvar/var exec vitest run tests/conformance.test.ts`
Expected: FAIL — cannot find module `../src/conformance.js`.

- [ ] **Step 3: Create the module with types and `canonicalStringify`**

Create `packages/var/src/conformance.ts`:

```ts
import type { Fence, Table, VarDoc } from './ast.js'
import type { Diagnostic } from './diagnostics.js'
import type { Span } from './span.js'

// NOTE: only import what THIS task uses — biome `noUnusedImports` is a hard
// lint gate (recommended preset), so every commit must be import-clean.
// Later tasks add their own imports: Task 5 adds `ExecutionPlan` (./plan.js)
// and `Registry` (./registry.js); Task 6 adds `plan` + `StepObservation`.

// ---- Artifact types (the serialized contract) -----------------------------

export type VarDocArtifact = {
  readonly path: string
  readonly examples: VarDoc['examples']
  readonly orphanAttachments: ReadonlyArray<Table | Fence>
}

export type RegistryArtifact = {
  readonly steps: ReadonlyArray<{
    readonly expression: string
    readonly parameterTypeNames: ReadonlyArray<string>
  }>
  // Custom parameter types (name + source regexp). Empty until a bundle uses
  // defineParameterType — see the plan's deferred list.
  readonly parameterTypes: ReadonlyArray<{ readonly name: string; readonly regexp: string }>
}

export type PlanArtifact = {
  readonly examples: ReadonlyArray<{
    readonly name: string
    readonly scopeStack: ReadonlyArray<string>
    readonly span: Span
    readonly expectedOutcome: 'pass' | 'fail'
    readonly steps: ReadonlyArray<{
      readonly text: string
      readonly matchSpan: Span
      readonly paramSpans: ReadonlyArray<Span>
      readonly matchedExpression: string
      readonly args: ReadonlyArray<{ readonly value: string; readonly parameterType: string | null }>
      readonly dataTable?: Table
      readonly docString?: { readonly content: string; readonly contentType: string; readonly span: Span }
    }>
  }>
  readonly diagnostics: ReadonlyArray<Diagnostic>
}

export type FailureArtifact =
  | {
      readonly kind: 'cell-mismatch'
      readonly line: number
      readonly cells: ReadonlyArray<{
        readonly column: string
        readonly expected: string
        readonly actual: string
        readonly span: Span
      }>
    }
  | {
      readonly kind: 'doc-string-mismatch'
      readonly line: number
      readonly diff: { readonly expected: string; readonly actual: string; readonly span: Span }
    }
  | { readonly kind: 'return-shape'; readonly line: number }
  | { readonly kind: 'thrown'; readonly line: number }
  | { readonly kind: 'unexpected-pass'; readonly line: number }

export type StepTrace = {
  readonly exampleName: string
  readonly ordinal: number
  readonly stepText: string
  readonly matchedExpression: string
  readonly contextKey: { readonly exampleName: string; readonly stepFile: string }
  readonly outcome: 'pass' | 'fail' | 'skipped'
  readonly failure?: FailureArtifact
}

export type TraceArtifact = {
  readonly examples: ReadonlyArray<{
    readonly name: string
    readonly outcome: 'pass' | 'fail'
    readonly steps: ReadonlyArray<StepTrace>
  }>
}

export type BundleArtifacts = {
  readonly varDoc: VarDocArtifact
  readonly registry: RegistryArtifact
  readonly plan: PlanArtifact
  readonly trace: TraceArtifact
}

// ---- Canonical serialization ----------------------------------------------

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys)
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = sortKeys((value as Record<string, unknown>)[key])
    }
    return out
  }
  return value
}

// Deterministic JSON: recursively key-sorted, 2-space indent, LF endings,
// trailing newline. The wire format every implementation must reproduce.
export function canonicalStringify(value: unknown): string {
  return `${JSON.stringify(sortKeys(value), null, 2)}\n`
}

// `path/to/foo.steps.ts` -> `foo.steps` ; `s.ts` -> `s`. Normalizes step-def
// file references so TS and Python fixtures serialize identically. Internal
// (not exported) — used only within this module.
function fileStem(path: string): string {
  const base = path.split(/[\\/]/).pop() ?? path
  return base.replace(/\.[^.]+$/, '')
}

// `I have {int} cukes` -> ['int']. Internal — used only within this module.
function parameterTypeNames(expression: string): ReadonlyArray<string> {
  return [...expression.matchAll(/\{([^}]*)\}/g)].map((m) => m[1] ?? '')
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @oselvar/var exec vitest run tests/conformance.test.ts`
Expected: PASS.

- [ ] **Step 5: Export from the package index**

In `packages/var/src/index.ts`, add:

```ts
export type {
  BundleArtifacts,
  FailureArtifact,
  PlanArtifact,
  RegistryArtifact,
  StepTrace,
  TraceArtifact,
  VarDocArtifact,
} from './conformance.js'
export { canonicalStringify } from './conformance.js'
```

- [ ] **Step 6: Commit**

```bash
git add packages/var/src/conformance.ts packages/var/src/index.ts packages/var/tests/conformance.test.ts
git commit -m "feat(var): conformance artifact types + canonicalStringify"
```

---

## Task 4: `toFailureArtifact` — language-agnostic error projection

**Files:**
- Modify: `packages/var/src/conformance.ts`
- Test: `packages/var/tests/conformance.test.ts`

**Interfaces:**
- Consumes: `isCellMismatchError`/`isDocStringMismatchError`/`ReturnShapeError` (`cell-diff.ts`, `doc-string-diff.ts`), `isUnexpectedPassError` (`execute.ts`).
- Produces: `toFailureArtifact(error: unknown, specPath: string, fallbackLine: number): FailureArtifact`. The error **message is intentionally excluded** (language-specific); only `kind`, `line`, and structured diffs are projected.

- [ ] **Step 1: Write the failing test**

Add to `packages/var/tests/conformance.test.ts`:

```ts
import { CellMismatchError } from '../src/cell-diff.js'
import { DocStringMismatchError } from '../src/doc-string-diff.js'
import { UnexpectedPassError } from '../src/execute.js'
import { toFailureArtifact } from '../src/conformance.js'

const span = { startOffset: 0, endOffset: 1, startLine: 7, startCol: 1, endLine: 7, endCol: 2 }

test('toFailureArtifact projects a CellMismatchError to cell-mismatch', () => {
  const err = new CellMismatchError([{ column: 'score', span, expected: '9', actual: '6', ok: false }])
  expect(toFailureArtifact(err, 'e.var.md', 7)).toEqual({
    kind: 'cell-mismatch',
    line: 7,
    cells: [{ column: 'score', expected: '9', actual: '6', span }],
  })
})

test('toFailureArtifact projects a DocStringMismatchError to doc-string-mismatch', () => {
  const err = new DocStringMismatchError({ span, expected: 'a', actual: 'b' })
  expect(toFailureArtifact(err, 'e.var.md', 7)).toEqual({
    kind: 'doc-string-mismatch',
    line: 7,
    diff: { expected: 'a', actual: 'b', span },
  })
})

test('toFailureArtifact maps UnexpectedPassError and opaque throws', () => {
  expect(toFailureArtifact(new UnexpectedPassError(), 'e.var.md', 4).kind).toBe('unexpected-pass')
  expect(toFailureArtifact(new Error('boom'), 'e.var.md', 4)).toEqual({ kind: 'thrown', line: 4 })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @oselvar/var exec vitest run tests/conformance.test.ts -t toFailureArtifact`
Expected: FAIL — `toFailureArtifact` not exported.

- [ ] **Step 3: Implement `toFailureArtifact`**

Add to `packages/var/src/conformance.ts` (imports at top, function below the helpers):

```ts
import { isCellMismatchError, ReturnShapeError } from './cell-diff.js'
import { isDocStringMismatchError } from './doc-string-diff.js'
import { isUnexpectedPassError } from './execute.js'
```

```ts
// Recover the 1-based failing line from the `<specPath>:line:col` frame that
// executePlan injects (augmentStack). Falls back to the step's own line.
function failingLine(error: unknown, specPath: string, fallbackLine: number): number {
  const stack = error instanceof Error && typeof error.stack === 'string' ? error.stack : ''
  const escaped = specPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const m = new RegExp(`${escaped}:(\\d+):\\d+`).exec(stack)
  return m ? Number(m[1]) : fallbackLine
}

export function toFailureArtifact(
  error: unknown,
  specPath: string,
  fallbackLine: number,
): FailureArtifact {
  const line = failingLine(error, specPath, fallbackLine)
  if (isCellMismatchError(error)) {
    return {
      kind: 'cell-mismatch',
      line,
      cells: error.cells
        .filter((c) => !c.ok)
        .map((c) => ({ column: c.column, expected: c.expected, actual: c.actual, span: c.span })),
    }
  }
  if (isDocStringMismatchError(error)) {
    return {
      kind: 'doc-string-mismatch',
      line,
      diff: { expected: error.diff.expected, actual: error.diff.actual, span: error.diff.span },
    }
  }
  if (error instanceof ReturnShapeError) return { kind: 'return-shape', line }
  if (isUnexpectedPassError(error)) return { kind: 'unexpected-pass', line }
  return { kind: 'thrown', line }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @oselvar/var exec vitest run tests/conformance.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/var/src/conformance.ts packages/var/tests/conformance.test.ts
git commit -m "feat(var): toFailureArtifact — language-agnostic error projection"
```

---

## Task 5: Stage projections — `toVarDocArtifact`, `toRegistryArtifact`, `toPlanArtifact`

**Files:**
- Modify: `packages/var/src/conformance.ts`
- Test: `packages/var/tests/conformance.test.ts`

**Interfaces:**
- Produces:
  - `toVarDocArtifact(doc: VarDoc): VarDocArtifact`
  - `toRegistryArtifact(registry: Registry, parameterTypes?: ReadonlyArray<{name:string;regexp:string}>): RegistryArtifact`
  - `toPlanArtifact(plan: ExecutionPlan): PlanArtifact`

- [ ] **Step 1: Write the failing test**

Add to `packages/var/tests/conformance.test.ts`:

```ts
import { plan } from '../src/plan.js'
import { parse } from '../src/parse.js'
import { addStep, createRegistry } from '../src/registry.js'
import { toPlanArtifact, toRegistryArtifact, toVarDocArtifact } from '../src/conformance.js'

test('toRegistryArtifact lists expressions and parsed parameter-type names', () => {
  const r = addStep(createRegistry(), {
    expression: 'I have {int} cukes',
    expressionSourceFile: 's.ts',
    expressionSourceLine: 1,
    handler: () => {},
  })
  expect(toRegistryArtifact(r)).toEqual({
    steps: [{ expression: 'I have {int} cukes', parameterTypeNames: ['int'] }],
    parameterTypes: [],
  })
})

test('toPlanArtifact projects examples, expectedOutcome and stringified args', () => {
  const r = addStep(createRegistry(), {
    expression: 'I have {int} cukes',
    expressionSourceFile: 's.ts',
    expressionSourceLine: 1,
    handler: () => {},
  })
  const art = toPlanArtifact(plan(parse('e.var.md', '# A\n\nI have 5 cukes.'), r))
  expect(art.examples[0]?.expectedOutcome).toBe('pass')
  expect(art.examples[0]?.steps[0]?.matchedExpression).toBe('I have {int} cukes')
  expect(art.examples[0]?.steps[0]?.args).toEqual([{ value: '5', parameterType: 'int' }])
})

test('toVarDocArtifact keeps path, examples and orphanAttachments', () => {
  const art = toVarDocArtifact(parse('e.var.md', '# A\n\nI have 5 cukes.'))
  expect(art.path).toBe('e.var.md')
  expect(Array.isArray(art.examples)).toBe(true)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @oselvar/var exec vitest run tests/conformance.test.ts -t "toRegistryArtifact"`
Expected: FAIL — functions not exported.

- [ ] **Step 3: Implement the three projections**

First add the two imports these functions need (Task 3 deliberately did not import them, to stay lint-clean) at the top of `packages/var/src/conformance.ts`, beside the existing type imports:

```ts
import type { ExecutionPlan } from './plan.js'
import type { Registry } from './registry.js'
```

Then add the functions to `packages/var/src/conformance.ts`:

```ts
export function toVarDocArtifact(doc: VarDoc): VarDocArtifact {
  return { path: doc.path, examples: doc.examples, orphanAttachments: doc.orphanAttachments }
}

export function toRegistryArtifact(
  registry: Registry,
  parameterTypes: ReadonlyArray<{ name: string; regexp: string }> = [],
): RegistryArtifact {
  return {
    steps: registry.steps.map((s) => ({
      expression: s.expression,
      parameterTypeNames: parameterTypeNames(s.expression),
    })),
    parameterTypes: parameterTypes.map((p) => ({ name: p.name, regexp: p.regexp })),
  }
}

export function toPlanArtifact(plan: ExecutionPlan): PlanArtifact {
  return {
    examples: plan.examples.map((ex) => ({
      name: ex.name,
      scopeStack: ex.scopeStack,
      span: ex.span,
      expectedOutcome: ex.expectedOutcome ?? 'pass',
      steps: ex.steps.map((step) => {
        const stepNames = parameterTypeNames(step.stepDef.expression)
        return {
          text: step.text,
          matchSpan: step.matchSpan,
          paramSpans: step.paramSpans,
          matchedExpression: step.stepDef.expression,
          args: step.args.map((a, i) => ({ value: String(a), parameterType: stepNames[i] ?? null })),
          ...(step.dataTable ? { dataTable: step.dataTable } : {}),
          ...(step.docString ? { docString: step.docString } : {}),
        }
      }),
    })),
    diagnostics: plan.diagnostics,
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @oselvar/var exec vitest run tests/conformance.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/var/src/conformance.ts packages/var/tests/conformance.test.ts
git commit -m "feat(var): var-doc/registry/plan artifact projections"
```

---

## Task 6: `runConformance` — the trace driver

**Files:**
- Modify: `packages/var/src/conformance.ts`
- Modify: `packages/var/src/index.ts` (exports)
- Test: `packages/var/tests/conformance.test.ts`

**Interfaces:**
- Consumes: `plan`, `executePlan`, `StepObservation`, all projections above.
- Produces: `runConformance(varDoc, registry, createContext, parameterTypes?): Promise<BundleArtifacts>` — plans, runs the pipeline with an observer + recording sink, and assembles all four artifacts. Steps not observed (after a failure) are `outcome: 'skipped'`. Example `outcome` is `'fail'` iff the run closure threw, else `'pass'` (so an expected-failure example reads `pass` while its failing step still carries the `FailureArtifact`).

- [ ] **Step 1: Write the failing test**

Add to `packages/var/tests/conformance.test.ts` (tilde-fenced — the test strings contain triple-backtick `error` fences):

~~~ts
import { runConformance } from '../src/conformance.js'

test('runConformance: passing example yields pass steps with structural contextKey', async () => {
  const r = addStep(createRegistry(), {
    expression: 'I have {int} cukes',
    expressionSourceFile: '/abs/s.ts',
    expressionSourceLine: 1,
    handler: () => {},
  })
  const out = await runConformance(parse('e.var.md', '# A\n\nI have 5 cukes.'), r, () => ({}))
  expect(out.trace.examples[0]).toEqual({
    name: 'I have 5 cukes',
    outcome: 'pass',
    steps: [
      {
        exampleName: 'I have 5 cukes',
        ordinal: 1,
        stepText: 'I have 5 cukes',
        matchedExpression: 'I have {int} cukes',
        contextKey: { exampleName: 'I have 5 cukes', stepFile: 's' },
        outcome: 'pass',
      },
    ],
  })
})

test('runConformance: expected-failure example reads pass but the step carries the failure', async () => {
  const r = addStep(createRegistry(), {
    expression: 'I divide {int} by {int}',
    expressionSourceFile: '/abs/s.ts',
    expressionSourceLine: 1,
    handler: (_c, _a, b) => { if (b === 0) throw new Error('division by zero') },
  })
  const src = '# D\n\nI divide 1 by 0.\n\n```error\ndivision by zero\n```\n'
  const out = await runConformance(parse('e.var.md', src), r, () => ({}))
  const ex = out.trace.examples[0]
  expect(ex?.outcome).toBe('pass')
  expect(ex?.steps[0]?.outcome).toBe('fail')
  expect(ex?.steps[0]?.failure?.kind).toBe('thrown')
})
~~~

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @oselvar/var exec vitest run tests/conformance.test.ts -t runConformance`
Expected: FAIL — `runConformance` not exported.

- [ ] **Step 3: Implement `runConformance`**

Add to `packages/var/src/conformance.ts`. Task 5 already added `import type { ExecutionPlan } from './plan.js'` — **replace that line** with a combined import so there is a single `./plan.js` import, and add the execute import:

```ts
import { plan as buildPlan, type ExecutionPlan } from './plan.js'
import { executePlan, type StepObservation } from './execute.js'
```

```ts
export async function runConformance(
  varDoc: VarDoc,
  registry: Registry,
  createContext: (stepFile: string) => unknown | Promise<unknown>,
  parameterTypes: ReadonlyArray<{ name: string; regexp: string }> = [],
): Promise<BundleArtifacts> {
  const execution = buildPlan(varDoc, registry)

  const observed = new Map<string, StepObservation[]>()
  const queue: { name: string; run: () => void | Promise<void> }[] = []
  executePlan(execution, {
    sink: { example: (name, run) => queue.push({ name, run }) },
    reporter: { diagnostic: () => {} }, // diagnostics are captured in the plan artifact
    createContext,
    observer: {
      step: (o) => {
        const list = observed.get(o.exampleName) ?? []
        list.push(o)
        observed.set(o.exampleName, list)
      },
    },
  })

  const traceExamples = []
  for (const { name, run } of queue) {
    let outcome: 'pass' | 'fail' = 'pass'
    try {
      await run()
    } catch {
      outcome = 'fail'
    }
    const planned = execution.examples.find((e) => e.name === name)
    const obs = observed.get(name) ?? []
    const steps: StepTrace[] = (planned?.steps ?? []).map((step, i) => {
      const o = obs.find((x) => x.ordinal === i + 1)
      const stepOutcome = o ? o.outcome : 'skipped'
      return {
        exampleName: name,
        ordinal: i + 1,
        stepText: step.text,
        matchedExpression: step.stepDef.expression,
        contextKey: { exampleName: name, stepFile: fileStem(step.stepDef.expressionSourceFile) },
        outcome: stepOutcome,
        ...(stepOutcome === 'fail'
          ? { failure: toFailureArtifact(o?.error, varDoc.path, step.matchSpan.startLine) }
          : {}),
      }
    })
    traceExamples.push({ name, outcome, steps })
  }

  return {
    varDoc: toVarDocArtifact(varDoc),
    registry: toRegistryArtifact(registry, parameterTypes),
    plan: toPlanArtifact(execution),
    trace: { examples: traceExamples },
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @oselvar/var exec vitest run tests/conformance.test.ts`
Expected: PASS.

- [ ] **Step 5: Export and run the whole core suite**

In `packages/var/src/index.ts`, add to the conformance exports:

```ts
export {
  canonicalStringify,
  runConformance,
  toFailureArtifact,
  toPlanArtifact,
  toRegistryArtifact,
  toVarDocArtifact,
} from './conformance.js'
```

Run: `pnpm --filter @oselvar/var test`
Expected: PASS (entire `@oselvar/var` suite).

- [ ] **Step 6: Commit**

```bash
git add packages/var/src/conformance.ts packages/var/src/index.ts packages/var/tests/conformance.test.ts
git commit -m "feat(var): runConformance trace driver assembling all four artifacts"
```

---

## Task 7: The bundle harness + first bundle (`01-roman-numerals`) + goldens

**Files:**
- Create: `packages/var-runtime/bundles/01-roman-numerals/example.var.md`
- Create: `packages/var-runtime/bundles/01-roman-numerals/numerals.steps.ts`
- Create: `packages/var-runtime/tests/conformance.test.ts`
- Generated: `packages/var-runtime/bundles/01-roman-numerals/golden/{var-doc,registry,plan,trace}.json`

**Interfaces:**
- Consumes: `parse`, `runConformance`, `canonicalStringify` from `@oselvar/var`; `buildRegistry`, `contextFactory`, `_resetBuilder` from `../src/index.js`.
- The corpus lives in `packages/var-runtime/bundles/` (not repo-root): bundle step-defs `import` `@oselvar/var-runtime` and must resolve it, and `var-runtime` already owns registration. Extracting the corpus to a shared/cross-repo location is the deferred cross-repo concern in the spec.

- [ ] **Step 1: Create the first bundle's `.var.md`**

Create `packages/var-runtime/bundles/01-roman-numerals/example.var.md`:

```markdown
# Roman numerals

## Converting 1

I convert 1 to roman numerals. The result is I.
```

- [ ] **Step 2: Create the first bundle's step-defs**

Create `packages/var-runtime/bundles/01-roman-numerals/numerals.steps.ts`:

```ts
import { defineContext } from '@oselvar/var-runtime'

const { step } = defineContext<{ result?: string }>(() => ({}))

const ROMAN: Record<number, string> = { 1: 'I', 4: 'IV', 9: 'IX', 40: 'XL' }

step('I convert {int} to roman numerals', (ctx, n: number) => {
  ctx.result = ROMAN[n]
})

step('The result is {word}', (ctx, expected: string) => {
  if (ctx.result !== expected) throw new Error(`expected ${expected} but got ${ctx.result}`)
})
```

- [ ] **Step 3: Write the harness (compare-by-default, env-gated update)**

Create `packages/var-runtime/tests/conformance.test.ts`:

```ts
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { canonicalStringify, parse, runConformance } from '@oselvar/var'
import { describe, expect, test } from 'vitest'
import { _resetBuilder, buildRegistry, contextFactory } from '../src/index.js'

const BUNDLES = resolve(import.meta.dirname, '../bundles')
const UPDATE = process.env.VAR_UPDATE_GOLDENS === '1'

// 'var-doc' <-> BundleArtifacts['varDoc']; others map name->key directly.
const ARTIFACTS = [
  ['var-doc', 'varDoc'],
  ['registry', 'registry'],
  ['plan', 'plan'],
  ['trace', 'trace'],
] as const

// NOTE: these tests share @oselvar/var-runtime module-scope state, so they must
// run sequentially within this file. Do NOT mark them `test.concurrent`.
for (const name of readdirSync(BUNDLES, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name)
  .sort()) {
  const dir = resolve(BUNDLES, name)
  describe(`conformance: ${name}`, () => {
    test('artifacts match goldens', async () => {
      _resetBuilder()
      for (const f of readdirSync(dir).filter((f) => f.endsWith('.steps.ts')).sort()) {
        await import(pathToFileURL(resolve(dir, f)).href)
      }
      const registry = buildRegistry()
      const createContext = contextFactory()
      const source = readFileSync(resolve(dir, 'example.var.md'), 'utf8')
      const varDoc = parse('example.var.md', source)
      const artifacts = await runConformance(varDoc, registry, createContext)

      const goldenDir = resolve(dir, 'golden')
      if (UPDATE && !existsSync(goldenDir)) mkdirSync(goldenDir, { recursive: true })
      for (const [fileName, key] of ARTIFACTS) {
        const json = canonicalStringify(artifacts[key])
        const file = resolve(goldenDir, `${fileName}.json`)
        if (UPDATE) {
          writeFileSync(file, json)
        } else {
          expect(json, `${name}/${fileName}.json`).toBe(readFileSync(file, 'utf8'))
        }
      }
    })
  })
}
```

- [ ] **Step 4: Generate the goldens from the TypeScript reference**

Run: `VAR_UPDATE_GOLDENS=1 pnpm --filter @oselvar/var-runtime exec vitest run tests/conformance.test.ts`
Expected: PASS, and `packages/var-runtime/bundles/01-roman-numerals/golden/` now contains four `.json` files.

- [ ] **Step 5: Inspect the goldens, then verify compare mode passes**

Manually skim the four JSON files — confirm `trace.json` shows one example `outcome: "pass"` with two `pass` steps sharing `contextKey.stepFile: "numerals.steps"`, and `plan.json` shows `expectedOutcome: "pass"`.

Run: `pnpm --filter @oselvar/var-runtime exec vitest run tests/conformance.test.ts`
Expected: PASS (compare mode, no env var).

- [ ] **Step 6: Commit**

```bash
git add packages/var-runtime/bundles/01-roman-numerals packages/var-runtime/tests/conformance.test.ts
git commit -m "feat(var-runtime): conformance harness + 01-roman-numerals bundle"
```

---

## Task 8: Remaining seed bundles (02–05) + goldens

**Files (create per bundle, then generate `golden/`):**
- `packages/var-runtime/bundles/02-context-isolation/{example.var.md, counter.steps.ts}`
- `packages/var-runtime/bundles/03-expected-failure/{example.var.md, division.steps.ts}`
- `packages/var-runtime/bundles/04-tables-and-docstrings/{example.var.md, echo.steps.ts}`
- `packages/var-runtime/bundles/05-ambiguous-match/{example.var.md, cukes.steps.ts}`

**Interfaces:** none new — these exercise the harness from Task 7. Each bundle is deterministic per the Global Constraints.

> **Note on "real-world examples":** the spec prefers curating bundles from the real `docs/tutorial/*.var.md` suites. These five seed bundles are intentionally minimal, deterministic exemplars chosen to pin *specific* runner semantics (context sharing, isolation, expected-failure, return comparison, ambiguity). A fast follow-up should add bundles that wrap the actual tutorial suites once their step-defs are confirmed deterministic and self-contained; that is corpus growth, not new infrastructure, so it does not block this plan.

- [ ] **Step 1: `02-context-isolation` — proves examples never share context**

Create `packages/var-runtime/bundles/02-context-isolation/example.var.md`:

```markdown
# Counter

## First example starts fresh

I increment. The count is 1.

## Second example starts fresh

I increment. The count is 1.
```

Create `packages/var-runtime/bundles/02-context-isolation/counter.steps.ts`:

```ts
import { defineContext } from '@oselvar/var-runtime'

const { step } = defineContext<{ count: number }>(() => ({ count: 0 }))

step('I increment', (ctx) => {
  ctx.count += 1
})

step('The count is {int}', (ctx, n: number) => {
  if (ctx.count !== n) throw new Error(`expected ${n} but got ${ctx.count}`)
})
```

(If context leaked across examples, the second example would see `count === 2` and fail — so a passing bundle proves isolation.)

- [ ] **Step 2: `03-expected-failure` — an `error` fence, thrown failure**

Create `packages/var-runtime/bundles/03-expected-failure/example.var.md` (the outer fence below is `~~~~` so the inner ```` ```error ```` survives copy-paste; in the real file use triple backticks for the `error` fence):

~~~~markdown
# Division

## Dividing by zero is rejected

I divide 1 by 0.

```error
division by zero
```
~~~~

Create `packages/var-runtime/bundles/03-expected-failure/division.steps.ts`:

```ts
import { step } from '@oselvar/var-runtime'

step('I divide {int} by {int}', (_ctx, _a: number, b: number) => {
  if (b === 0) throw new Error('division by zero')
})
```

- [ ] **Step 3: `04-tables-and-docstrings` — doc-string return comparison (pass)**

Create `packages/var-runtime/bundles/04-tables-and-docstrings/example.var.md` (again, the real file uses triple backticks for the inner fence):

~~~~markdown
# Echo

## It echoes the doc string

I echo the following:

```
hello
```
~~~~

Create `packages/var-runtime/bundles/04-tables-and-docstrings/echo.steps.ts`:

```ts
import { step } from '@oselvar/var-runtime'

// Returning the doc string makes the core compare it against the input
// (compareDocString); equal content passes.
step('I echo the following:', (_ctx, doc: string) => doc)
```

- [ ] **Step 4: `05-ambiguous-match` — a diagnostic, no executed steps**

Create `packages/var-runtime/bundles/05-ambiguous-match/example.var.md`:

```markdown
# Cukes

I have 5 cukes.
```

Create `packages/var-runtime/bundles/05-ambiguous-match/cukes.steps.ts`:

```ts
import { step } from '@oselvar/var-runtime'

// Both expressions match "I have 5 cukes" → ambiguous-match diagnostic.
step('I have {int} cukes', () => {})
step('I have 5 cukes', () => {})
```

- [ ] **Step 5: Generate goldens for the new bundles**

Run: `VAR_UPDATE_GOLDENS=1 pnpm --filter @oselvar/var-runtime exec vitest run tests/conformance.test.ts`
Expected: PASS; each new bundle gains a `golden/` with four files.

- [ ] **Step 6: Inspect the interesting goldens**

Confirm:
- `02-context-isolation/golden/trace.json` — two examples, both `outcome: "pass"`, distinct `contextKey.exampleName`.
- `03-expected-failure/golden/trace.json` — example `outcome: "pass"`; step `outcome: "fail"` with `failure.kind: "thrown"`. And `plan.json` shows `expectedOutcome: "fail"` with `expectedErrorMessage` reflected in the example.
- `05-ambiguous-match/golden/plan.json` — a `diagnostics` entry with `code: "ambiguous-match"`; the example has no steps.

- [ ] **Step 7: Verify compare mode is green and run the whole suite**

Run: `pnpm --filter @oselvar/var-runtime exec vitest run tests/conformance.test.ts`
Expected: PASS.

Run: `pnpm test`
Expected: PASS (entire workspace).

- [ ] **Step 8: Commit**

```bash
git add packages/var-runtime/bundles/02-context-isolation packages/var-runtime/bundles/03-expected-failure packages/var-runtime/bundles/04-tables-and-docstrings packages/var-runtime/bundles/05-ambiguous-match
git commit -m "feat(var-runtime): seed conformance bundles 02-05 + goldens"
```

---

## Task 9 (OPTIONAL): `var conformance` CLI affordance

Deferrable — the harness already covers CI. Implement only if a cross-language/debug entry point is wanted now.

**Files:**
- Modify: `packages/var-cli/src/index.ts` (route a `conformance` subcommand)
- Create: `packages/var-cli/src/conformance.ts`
- Test: `packages/var-cli/tests/conformance.test.ts`

**Interfaces:**
- Consumes: `parse`, `runConformance`, `canonicalStringify` (`@oselvar/var`); `buildRegistry`, `contextFactory`, `_resetBuilder` (`@oselvar/var-runtime`).
- Produces: `runConformanceCli({ cwd, bundleDir, update, writeStdout })` — same load → run → compare/update logic as the harness, for one bundle directory.

- [ ] **Step 1: Write a failing test** that runs the CLI against `01-roman-numerals` in compare mode and asserts exit code 0. Mirror the harness logic. (Reuse the Task 7 load/run code; assert `canonicalStringify(artifacts.trace)` equals the committed golden.)
- [ ] **Step 2–5:** implement, wire the subcommand, run, commit:

```bash
git add packages/var-cli/src/conformance.ts packages/var-cli/src/index.ts packages/var-cli/tests/conformance.test.ts
git commit -m "feat(var-cli): var conformance subcommand"
```

---

## Final verification

- [ ] **Run the full check suite**

Run: `pnpm check`
Expected: PASS — `biome` (lint), `vitest` (all tests incl. conformance), `knip` (no unused exports — the conformance API is consumed by the harness), `jscpd` (no copy-paste regressions).

- [ ] **Confirm the deliverable**

`packages/var-runtime/bundles/` holds five real bundles, each with committed `golden/{var-doc,registry,plan,trace}.json`. Any future change to parse/plan/execute now surfaces as a reviewable golden diff, and a Python port targets these exact goldens.
