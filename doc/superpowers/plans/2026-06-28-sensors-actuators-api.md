# Sensors, Actions & Contexts API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `step()` with `context()` / `action()` / `sensor()` roles, where a `sensor` asserts by returning the tuple of its post-`ctx` arguments and the pure core compares each element against the document with span-anchored diffs.

**Architecture:** The pure core (`@oselvar/var`) gains a `StepKind`, a structural `deepEqual`, a `compareParams` comparator, and `executePlan` dispatch on kind. The runtime shell (`@oselvar/var-runtime`, re-exported by `@oselvar/var-vitest`) exposes the three roles plus a renamed `defineState` factory. All step-definition files and tooling migrate. `step()` is removed only in the final task so trunk stays green throughout.

**Tech Stack:** pnpm workspace · TypeScript (ESM-only, Node ≥ 22) · vitest · biome · `@cucumber/cucumber-expressions`.

## Global Constraints

- **Immutable types only** — `readonly`, `ReadonlyArray<T>`, `ReadonlyMap<K,V>`; updates produce new values.
- **Pure functional core** — `packages/var/src/*` does no I/O, no globals, no time; side effects live only in adapter packages.
- **Core never imports runtime APIs** — no `node:fs`, `vitest`, etc. in `packages/var/src`.
- **Type-check is a separate gate** — vitest does not type-check. Run `pnpm -r build` (exit 0) before calling any change done. Website Astro build: `pnpm --filter @oselvar/website build`.
- **Trunk stays green** — every task ends building + testing clean.
- **No keyword heuristics** — never sniff Given/When/Then for codegen or diagnostics. Role inference is structural (position + neighbour roles) only.
- **Test files:** `*.test.ts` (vitest). **BDD examples:** `*.var.md`. **Step defs:** `*.steps.ts`.
- **Dogfood run:** `NODE_OPTIONS="--import tsx" npx vitest run`.

---

## File Structure

**Created:**
- `packages/var/src/deep-equal.ts` — pure structural equality.
- `packages/var/src/param-diff.ts` — `compareParams` over inline parameters.
- `packages/var/src/step-role.ts` — `StepKind` type + pure `inferStepRole`.
- `packages/var/tests/deep-equal.test.ts`, `packages/var/tests/param-diff.test.ts`, `packages/var/tests/step-role.test.ts`.
- `docs/tutorial/<n>-return-sensor.var.md` + `docs/tutorial/steps/<n>-return-sensor.steps.ts` — dogfood of a failing inline sensor.

**Modified (core):** `registry.ts`, `execute.ts`, `snippet-template.ts`, `snippet.ts`, `index.ts`.
**Modified (runtime/adapters):** `var-runtime/src/index.ts`, `var-vitest/src/api.ts`, `var-vitest/src/index.ts`, `var-cli/src/init.ts`, `var-cli/src/stepdef.ts`, `var-language/src/step-defs.ts`, `var-lsp/src/handlers.ts`, `var-vscode/src/extension.ts`, `website/src/lib/ts-diagnostics.ts`, `website/src/lib/var-worker.ts`.
**Modified (stepfiles):** `docs/tutorial/steps/01..06`, `packages/cucumber/steps/library.steps.ts`, `packages/var-cli/tests/fixtures/run-basic/hello.steps.ts`.
**Modified (tests):** the suites listed per task.

---

## Phase 1 — Core contract

### Task 1: `deepEqual` pure helper

**Files:**
- Create: `packages/var/src/deep-equal.ts`
- Test: `packages/var/tests/deep-equal.test.ts`

**Interfaces:**
- Produces: `export function deepEqual(a: unknown, b: unknown): boolean`

- [ ] **Step 1: Write the failing test**

```ts
// packages/var/tests/deep-equal.test.ts
import { expect, test } from 'vitest'
import { deepEqual } from '../src/deep-equal.js'

test('primitives compare by value', () => {
  expect(deepEqual(3, 3)).toBe(true)
  expect(deepEqual(3, 4)).toBe(false)
  expect(deepEqual('a', 'a')).toBe(true)
  expect(deepEqual(Number.NaN, Number.NaN)).toBe(true)
  expect(deepEqual(null, undefined)).toBe(false)
})

test('arrays compare element-wise', () => {
  expect(deepEqual([1, 2, 3], [1, 2, 3])).toBe(true)
  expect(deepEqual([1, 2], [1, 2, 3])).toBe(false)
})

test('plain objects compare by keys and values across references', () => {
  expect(deepEqual({ a: 1, b: { c: 2 } }, { a: 1, b: { c: 2 } })).toBe(true)
  expect(deepEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false)
})

test('Dates compare by time', () => {
  expect(deepEqual(new Date('2026-01-01'), new Date('2026-01-01'))).toBe(true)
  expect(deepEqual(new Date('2026-01-01'), new Date('2026-01-02'))).toBe(false)
})

test('Maps compare by entries', () => {
  expect(deepEqual(new Map([['a', 1]]), new Map([['a', 1]]))).toBe(true)
  expect(deepEqual(new Map([['a', 1]]), new Map([['a', 2]]))).toBe(false)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @oselvar/var test deep-equal`
Expected: FAIL — cannot find module `../src/deep-equal.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/var/src/deep-equal.ts

// Pure structural equality used to compare a sensor's returned actuals against
// the values captured from the document. Echoed arguments (returned unchanged)
// pass; recomputed custom-type objects compare by structure across references.
export function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false

  if (a instanceof Date || b instanceof Date) {
    return a instanceof Date && b instanceof Date && a.getTime() === b.getTime()
  }

  if (a instanceof Map || b instanceof Map) {
    if (!(a instanceof Map) || !(b instanceof Map) || a.size !== b.size) return false
    for (const [k, v] of a) {
      if (!b.has(k) || !deepEqual(v, b.get(k))) return false
    }
    return true
  }

  if (a instanceof Set || b instanceof Set) {
    if (!(a instanceof Set) || !(b instanceof Set) || a.size !== b.size) return false
    for (const v of a) if (!b.has(v)) return false
    return true
  }

  const aArr = Array.isArray(a)
  const bArr = Array.isArray(b)
  if (aArr || bArr) {
    if (!aArr || !bArr || a.length !== b.length) return false
    return a.every((v, i) => deepEqual(v, b[i]))
  }

  const aKeys = Object.keys(a as Record<string, unknown>)
  const bKeys = Object.keys(b as Record<string, unknown>)
  if (aKeys.length !== bKeys.length) return false
  return aKeys.every(
    (k) =>
      Object.hasOwn(b as Record<string, unknown>, k) &&
      deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]),
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @oselvar/var test deep-equal`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/var/src/deep-equal.ts packages/var/tests/deep-equal.test.ts
git commit -m "feat(var): deepEqual structural equality helper"
```

---

### Task 2: Thread `StepKind` through the registry

**Files:**
- Create: `packages/var/src/step-role.ts`
- Modify: `packages/var/src/registry.ts`
- Modify: `packages/var/src/index.ts`
- Test: `packages/var/tests/registry.test.ts` (create if absent)

**Interfaces:**
- Produces: `export type StepKind = 'context' | 'action' | 'sensor'`
- Produces: `StepHandler`, `StepRegistration`, `StepInput` all gain `readonly kind?: StepKind` (optional during migration; a missing kind means the legacy `step()` path).

- [ ] **Step 1: Write the failing test**

```ts
// packages/var/tests/registry.test.ts
import { expect, test } from 'vitest'
import { addStep, createRegistry } from '../src/registry.js'

test('addStep carries the step kind through to the registration', () => {
  const r = addStep(createRegistry(), {
    expression: 'I greet {string}',
    expressionSourceFile: 'a.steps.ts',
    expressionSourceLine: 1,
    handler: () => {},
    kind: 'sensor',
  })
  expect(r.steps[0]?.kind).toBe('sensor')
})

test('kind is optional (legacy step path)', () => {
  const r = addStep(createRegistry(), {
    expression: 'I greet {string}',
    expressionSourceFile: 'a.steps.ts',
    expressionSourceLine: 1,
    handler: () => {},
  })
  expect(r.steps[0]?.kind).toBeUndefined()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @oselvar/var test registry`
Expected: FAIL — `kind` not assignable / property missing on `StepInput`.

- [ ] **Step 3: Write minimal implementation**

Create `packages/var/src/step-role.ts`:

```ts
// packages/var/src/step-role.ts

// The role a step definition plays, mirroring concepts/sensors-and-actuators.md:
//   context — the quiescent state the software rests in
//   action  — the actuator: the single stimulus
//   sensor  — the read-only assertion (the only role that returns for comparison)
export type StepKind = 'context' | 'action' | 'sensor'
```

In `packages/var/src/registry.ts`, add the import and the field. Update `StepHandler` to allow returns (it already returns `void | Promise<void>`; widen to `unknown` so sensor returns type-check at the core boundary):

```ts
import {
  CucumberExpression,
  ParameterType,
  ParameterTypeRegistry,
} from '@cucumber/cucumber-expressions'
import type { StepKind } from './step-role.js'

export type StepHandler = (
  ctx: unknown,
  ...args: ReadonlyArray<unknown>
) => unknown | Promise<unknown>

export type StepRegistration = {
  readonly expression: string
  readonly expressionSourceFile: string
  readonly expressionSourceLine: number
  readonly handler: StepHandler
  readonly compiled: CucumberExpression
  readonly kind?: StepKind
}
```

`StepInput` is `Omit<StepRegistration, 'compiled'>`, so it inherits `kind` automatically. No change needed to `addStep`'s body — `{ ...input, compiled }` already carries `kind` through.

In `packages/var/src/index.ts` add the export (place near the other `registry` exports):

```ts
export type { StepKind } from './step-role.js'
```

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @oselvar/var test registry` then `pnpm --filter @oselvar/var build`
Expected: PASS; build exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/var/src/step-role.ts packages/var/src/registry.ts packages/var/src/index.ts packages/var/tests/registry.test.ts
git commit -m "feat(var): thread StepKind through the registry"
```

---

### Task 3: `compareParams` inline comparator

**Files:**
- Create: `packages/var/src/param-diff.ts`
- Modify: `packages/var/src/index.ts`
- Test: `packages/var/tests/param-diff.test.ts`

**Interfaces:**
- Consumes: `CellDiff` from `./cell-diff.js`, `Span` from `./span.js`, `deepEqual` from `./deep-equal.js`.
- Produces:
  ```ts
  export function compareParams(
    returned: ReadonlyArray<unknown>,
    expected: ReadonlyArray<unknown>,
    paramSpans: ReadonlyArray<Span>,
    sourceTexts: ReadonlyArray<string>,
  ): ReadonlyArray<CellDiff>
  ```
  Compares each inline element; `column` holds the positional label `arg ${i + 1}`. Callers guarantee the three arrays are the same length as `returned`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/var/tests/param-diff.test.ts
import { expect, test } from 'vitest'
import { compareParams } from '../src/param-diff.js'
import { spanFromOffsets } from '../src/span.js'

const span = (s: number, e: number) => spanFromOffsets('I should have 3 cukes in my big belly', s, e)

test('all elements equal → every cell ok', () => {
  const diffs = compareParams([3, 'big'], [3, 'big'], [span(14, 15), span(31, 34)], ['3', 'big'])
  expect(diffs.every((d) => d.ok)).toBe(true)
})

test('one mismatching element → that cell is not ok with expected/actual', () => {
  const diffs = compareParams([4, 'big'], [3, 'big'], [span(14, 15), span(31, 34)], ['3', 'big'])
  expect(diffs[0]).toMatchObject({ column: 'arg 1', expected: '3', actual: '4', ok: false })
  expect(diffs[1]).toMatchObject({ column: 'arg 2', ok: true })
})

test('object actuals compare structurally across references', () => {
  const diffs = compareParams([{ iso: 'NO' }], [{ iso: 'NO' }], [span(0, 2)], ['NO'])
  expect(diffs[0]?.ok).toBe(true)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @oselvar/var test param-diff`
Expected: FAIL — cannot find module `../src/param-diff.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/var/src/param-diff.ts
import type { CellDiff } from './cell-diff.js'
import { deepEqual } from './deep-equal.js'
import type { Span } from './span.js'

// Compare a sensor's returned inline actuals against the values captured from
// the document. `expected` is the captured arguments, `sourceTexts` the matched
// text at each parameter's span (used as the diff's `expected` display), and
// `paramSpans` anchors each cell to the .var.md source. The three arrays align
// 1:1 with `returned`; the caller validates length first.
export function compareParams(
  returned: ReadonlyArray<unknown>,
  expected: ReadonlyArray<unknown>,
  paramSpans: ReadonlyArray<Span>,
  sourceTexts: ReadonlyArray<string>,
): ReadonlyArray<CellDiff> {
  const diffs: CellDiff[] = []
  for (let i = 0; i < expected.length; i++) {
    const ok = deepEqual(returned[i], expected[i])
    diffs.push({
      column: `arg ${i + 1}`,
      span: paramSpans[i] as Span,
      expected: sourceTexts[i] ?? String(expected[i]),
      actual: String(returned[i]),
      ok,
    })
  }
  return diffs
}
```

In `packages/var/src/index.ts`, alongside the `cell-diff` exports:

```ts
export { compareParams } from './param-diff.js'
export { deepEqual } from './deep-equal.js'
```

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @oselvar/var test param-diff` then `pnpm --filter @oselvar/var build`
Expected: PASS (3 tests); build exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/var/src/param-diff.ts packages/var/src/index.ts packages/var/tests/param-diff.test.ts
git commit -m "feat(var): compareParams inline return comparator"
```

---

### Task 4: `executePlan` dispatch on `kind`

**Files:**
- Modify: `packages/var/src/execute.ts`
- Test: `packages/var/tests/execute-roles.test.ts` (create)

**Interfaces:**
- Consumes: `StepKind` (`registration.kind`), `compareParams`, `deepEqual`, existing `compareTable` / `compareDocString` / `compareRow`, `CellMismatchError`, `DocStringMismatchError`, `ReturnShapeError`.
- Behaviour by kind, evaluated per step inside the example body loop:
  - `'context' | 'action'`: run handler; if it returns a non-`undefined` value → throw `ReturnShapeError('a context/action step must not return a value; only sensor() returns for comparison')`.
  - `'sensor'`: run handler. If the example is header-bound (handled by the existing `ex.rowChecks` block after the loop — leave that untouched) the row-object path still applies. Otherwise: if `returned === undefined` assert nothing; else require `returned` is an array of length `step.args.length + extra.length`, then compare the inline slice via `compareParams` and each extra via `compareTable` / `compareDocString`.
  - `undefined` (legacy `step()`): the existing behaviour, unchanged.

> Note: header-bound rows go through `ex.rowChecks` after the per-step loop and do not depend on kind, so they keep working for `sensor` registrations automatically once the stepfiles migrate.

- [ ] **Step 1: Write the failing test**

```ts
// packages/var/tests/execute-roles.test.ts
import { expect, test } from 'vitest'
import { isCellMismatchError } from '../src/cell-diff.js'
import { executePlan, type ExecutePorts } from '../src/execute.js'
import { parse } from '../src/parse.js'
import { plan } from '../src/plan.js'
import { addStep, createRegistry } from '../src/registry.js'

// Minimal ports that run the example body and surface the thrown error.
function runOne(source: string, register: (r: ReturnType<typeof createRegistry>) => ReturnType<typeof createRegistry>) {
  let registry = createRegistry()
  registry = register(registry)
  const doc = parse(source, 'x.var.md')
  const p = plan(doc, registry)
  let caught: unknown
  const ports: ExecutePorts = {
    reporter: { diagnostic: () => {} },
    sink: {
      example: (_name, fn) => {
        // Execute synchronously for the test; fn returns a promise.
        return (fn() as Promise<void>).catch((e) => {
          caught = e
        })
      },
    },
  }
  executePlan(p, ports)
  return () => caught
}

test('a sensor returning a mismatching inline value throws CellMismatchError', async () => {
  const getErr = runOne(
    '# X\n\nI should have 3 cukes in my big belly\n',
    (r) =>
      addStep(r, {
        expression: 'I should have {int} cukes in my {word} belly',
        expressionSourceFile: 's.steps.ts',
        expressionSourceLine: 1,
        kind: 'sensor',
        handler: (_ctx, _count, name) => [4, name],
      }),
  )
  await new Promise((res) => setTimeout(res, 0))
  expect(isCellMismatchError(getErr())).toBe(true)
})

test('a sensor returning matching inline values passes', async () => {
  const getErr = runOne(
    '# X\n\nI should have 3 cukes in my big belly\n',
    (r) =>
      addStep(r, {
        expression: 'I should have {int} cukes in my {word} belly',
        expressionSourceFile: 's.steps.ts',
        expressionSourceLine: 1,
        kind: 'sensor',
        handler: (_ctx, count, name) => [count, name],
      }),
  )
  await new Promise((res) => setTimeout(res, 0))
  expect(getErr()).toBeUndefined()
})

test('a sensor returning the wrong tuple length throws ReturnShapeError', async () => {
  const getErr = runOne(
    '# X\n\nI should have 3 cukes in my big belly\n',
    (r) =>
      addStep(r, {
        expression: 'I should have {int} cukes in my {word} belly',
        expressionSourceFile: 's.steps.ts',
        expressionSourceLine: 1,
        kind: 'sensor',
        handler: () => [4],
      }),
  )
  await new Promise((res) => setTimeout(res, 0))
  expect((getErr() as Error).name).toBe('ReturnShapeError')
})

test('an action that returns a value throws ReturnShapeError', async () => {
  const getErr = runOne(
    '# X\n\nI fly to LHR\n',
    (r) =>
      addStep(r, {
        expression: 'I fly to {word}',
        expressionSourceFile: 's.steps.ts',
        expressionSourceLine: 1,
        kind: 'action',
        handler: () => 'oops',
      }),
  )
  await new Promise((res) => setTimeout(res, 0))
  expect((getErr() as Error).name).toBe('ReturnShapeError')
})
```

> If `parse`/`plan`/`ExecutePorts` shapes differ from the snippet, adjust the harness to match the real signatures (see `packages/var/src/ports.ts` and existing `packages/var/tests/*` for the canonical `TestSink`/`Reporter` shape). The assertions on thrown error types are the contract.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @oselvar/var test execute-roles`
Expected: FAIL — actions/sensors currently fall through the legacy path; no `ReturnShapeError` for the action case, and the inline-tuple comparison does not exist.

- [ ] **Step 3: Write minimal implementation**

In `packages/var/src/execute.ts`, add imports:

```ts
import { CellMismatchError, compareRow, compareTable, ReturnShapeError } from './cell-diff.js'
import { compareDocString, DocStringMismatchError } from './doc-string-diff.js'
import { compareParams } from './param-diff.js'
```

Replace the per-step comparison block (the `try { ... } catch` that currently runs `compareTable`/`compareDocString` after `lastReturn = returned`) with kind dispatch. Keep the `extra` building exactly as today. New block:

```ts
          lastReturn = returned
          const kind = step.stepDef.kind
          try {
            if (kind === 'context' || kind === 'action') {
              if (returned !== undefined) {
                throw new ReturnShapeError(
                  'a context/action step must not return a value; only sensor() returns for comparison',
                )
              }
            } else if (kind === 'sensor') {
              // Header-bound rows are compared after the loop via ex.rowChecks;
              // skip the tuple contract for them (they return a row object).
              if (!ex.rowChecks && returned !== undefined) {
                if (!Array.isArray(returned)) {
                  throw new ReturnShapeError(
                    `a sensor must return a tuple of its arguments after ctx, got ${typeof returned}`,
                  )
                }
                const expectedLen = step.args.length + extra.length
                if (returned.length !== expectedLen) {
                  throw new ReturnShapeError(
                    `sensor return must have ${expectedLen} element(s), got ${returned.length}`,
                  )
                }
                // Inline parameters: returned[0..args.length) vs captured args.
                const inlineReturned = returned.slice(0, step.args.length)
                const sourceTexts = step.paramSpans.map((s) =>
                  path === plan.varDoc.path ? plan.varDoc.source.slice(s.startOffset, s.endOffset) : '',
                )
                const paramDiffs = compareParams(
                  inlineReturned,
                  step.args,
                  step.paramSpans,
                  sourceTexts,
                ).filter((d) => !d.ok)
                if (paramDiffs.length > 0) throw new CellMismatchError(paramDiffs)
                // Trailing table / doc string: the extras, in order, are the
                // remaining tuple elements.
                let extraIdx = step.args.length
                if (step.dataTable) {
                  const bad = compareTable(returned[extraIdx], step.dataTable).filter((d) => !d.ok)
                  if (bad.length > 0) throw new CellMismatchError(bad)
                  extraIdx++
                } else if (step.docString) {
                  const diff = compareDocString(
                    returned[extraIdx],
                    step.docString.content,
                    step.docString.span,
                  )
                  if (diff) throw new DocStringMismatchError(diff)
                  extraIdx++
                }
              }
            } else {
              // Legacy step(): existing behaviour, unchanged.
              if (step.dataTable) {
                const bad = compareTable(returned, step.dataTable).filter((d) => !d.ok)
                if (bad.length > 0) throw new CellMismatchError(bad)
              } else if (step.docString) {
                const diff = compareDocString(returned, step.docString.content, step.docString.span)
                if (diff) throw new DocStringMismatchError(diff)
              }
            }
          } catch (err) {
            throw augmentStack(err, step, path)
          }
```

The `sourceTexts` map references `plan.varDoc.source`; `plan` is the function argument and `path` is already `plan.varDoc.path` from the top of `executePlan`, so `path === plan.varDoc.path` is always true here — simplify to `plan.varDoc.source.slice(...)` directly:

```ts
                const sourceTexts = step.paramSpans.map((s) =>
                  plan.varDoc.source.slice(s.startOffset, s.endOffset),
                )
```

Leave the post-loop `ex.rowChecks` block (header-bound rows) exactly as it is.

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @oselvar/var test` then `pnpm --filter @oselvar/var build`
Expected: PASS (new role tests + all existing core tests, which use legacy `kind: undefined`); build exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/var/src/execute.ts packages/var/tests/execute-roles.test.ts
git commit -m "feat(var): executePlan dispatch on step kind (sensor return contract)"
```

---

## Phase 2 — Runtime API + migration

### Task 5: Role functions + `defineState` in the runtime

**Files:**
- Modify: `packages/var-runtime/src/index.ts`
- Modify: `packages/var-vitest/src/api.ts`
- Modify: `packages/var-vitest/src/index.ts`
- Test: `packages/var-runtime/tests/api.test.ts`

**Interfaces:**
- Produces from `@oselvar/var-runtime` (and re-exported by `@oselvar/var-vitest`):
  ```ts
  export type RoleFn<C = unknown> = (
    expression: string,
    handler: (ctx: C, ...args: readonly unknown[]) => void | Promise<void>,
  ) => void
  export type SensorFn<C = unknown> = <Args extends readonly unknown[]>(
    expression: string,
    handler: (ctx: C, ...args: Args) =>
      | NoInfer<Args> | Promise<NoInfer<Args>> | void | Promise<void>,
  ) => void
  export const context: RoleFn
  export const action: RoleFn
  export const sensor: SensorFn
  export function defineState<C>(factory: () => C | Promise<C>): {
    readonly context: RoleFn<C>
    readonly action: RoleFn<C>
    readonly sensor: SensorFn<C>
  }
  ```
- `step` and `defineContext` remain exported for now (removed in Task 9). `step` registers with `kind` undefined (legacy).

- [ ] **Step 1: Write the failing test**

Add to `packages/var-runtime/tests/api.test.ts`:

```ts
import { action, context, defineState, sensor } from '../src/index.js'

test('context/action/sensor register with their kind', () => {
  context('a logged-in user', () => {})
  action('I click submit', () => {})
  sensor('the total is {int}', (_ctx, total: number) => [total])
  const r = buildRegistry()
  expect(r.steps.map((s) => s.kind)).toEqual(['context', 'action', 'sensor'])
})

test('defineState returns role functions typed against the state', () => {
  const { context: ctxStep, sensor: sense } = defineState(() => ({ greeting: '' }))
  ctxStep('I greet {string}', (ctx, name: string) => {
    ctx.greeting = `Hello, ${name}!`
  })
  sense('the greeting should be {string}', (ctx) => [ctx.greeting])
  const r = buildRegistry()
  expect(r.steps).toHaveLength(2)
})

test('a second defineState in the SAME file throws', () => {
  defineState(() => ({ balance: 0 }))
  expect(() => defineState(() => ({ other: 1 }))).toThrow(/called more than once/)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @oselvar/var-runtime test api`
Expected: FAIL — `context`/`action`/`sensor`/`defineState` not exported.

- [ ] **Step 3: Write minimal implementation**

In `packages/var-runtime/src/index.ts`:

- Add `kind` to the internal `Entry` type and to `registerStep`:

```ts
import {
  addStep,
  createRegistry,
  defineParameterType as defineParameterTypeCore,
  type Registry,
  type StepHandler,
  type StepKind,
} from '@oselvar/var'

type Entry = {
  readonly expression: string
  readonly sourceFile: string
  readonly sourceLine: number
  readonly handler: StepHandler
  readonly kind?: StepKind
}

function registerStep(expression: string, handler: StepHandler, kind?: StepKind): void {
  const { sourceFile, sourceLine } = callerLocation()
  steps.push({ expression, sourceFile, sourceLine, handler, kind })
}
```

- Add the role types and top-level role functions (keep `Step`/`step` as-is for now):

```ts
export type RoleFn<C = unknown> = (
  expression: string,
  handler: (ctx: C, ...args: readonly unknown[]) => void | Promise<void>,
) => void

export type SensorFn<C = unknown> = <Args extends readonly unknown[]>(
  expression: string,
  handler: (
    ctx: C,
    ...args: Args
  ) => NoInfer<Args> | Promise<NoInfer<Args>> | void | Promise<void>,
) => void

export const context: RoleFn = (expression, handler) =>
  registerStep(expression, handler as StepHandler, 'context')
export const action: RoleFn = (expression, handler) =>
  registerStep(expression, handler as StepHandler, 'action')
export const sensor: SensorFn = (expression, handler) =>
  registerStep(expression, handler as StepHandler, 'sensor')
```

- Add `defineState` next to `defineContext` (share the same factory map and guard; `defineContext` stays for now):

```ts
export function defineState<C>(factory: () => C | Promise<C>): {
  readonly context: RoleFn<C>
  readonly action: RoleFn<C>
  readonly sensor: SensorFn<C>
} {
  const { sourceFile } = callerLocation()
  if (contextFactoriesByFile.has(sourceFile)) {
    throw new Error(`defineState() called more than once in ${sourceFile}`)
  }
  contextFactoriesByFile.set(sourceFile, factory as () => unknown)
  return {
    context: (expression, handler) =>
      registerStep(expression, handler as StepHandler, 'context'),
    action: (expression, handler) =>
      registerStep(expression, handler as StepHandler, 'action'),
    sensor: (expression, handler) =>
      registerStep(expression, handler as StepHandler, 'sensor'),
  }
}
```

- In `buildRegistry`, pass `kind`:

```ts
    r = addStep(r, {
      expression: e.expression,
      expressionSourceFile: e.sourceFile,
      expressionSourceLine: e.sourceLine,
      handler: e.handler,
      kind: e.kind,
    })
```

In `packages/var-vitest/src/api.ts`, extend the re-export:

```ts
export type { RoleFn, SensorFn, Step } from '@oselvar/var-runtime'
export {
  _resetBuilder,
  action,
  buildRegistry,
  context,
  contextFactory,
  defineContext,
  defineParameterType,
  defineState,
  sensor,
  step,
} from '@oselvar/var-runtime'
```

In `packages/var-vitest/src/index.ts`, mirror the new names in its `export { ... } from './api.js'` and `export type { ... }` lines.

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @oselvar/var-runtime test` then `pnpm -r build`
Expected: PASS; build exit 0 (`step`/`defineContext` still present, so existing consumers compile).

- [ ] **Step 5: Commit**

```bash
git add packages/var-runtime/src/index.ts packages/var-vitest/src/api.ts packages/var-vitest/src/index.ts packages/var-runtime/tests/api.test.ts
git commit -m "feat(var-runtime): context/action/sensor roles + defineState"
```

---

### Task 6: Migrate step-definition files + dogfood a failing sensor

**Files:**
- Modify: `docs/tutorial/steps/01-hello.steps.ts` … `06-tables-and-docstrings.steps.ts`
- Modify: `packages/cucumber/steps/library.steps.ts`
- Modify: `packages/var-cli/tests/fixtures/run-basic/hello.steps.ts`
- Create: `docs/tutorial/13-return-sensor.var.md`, `docs/tutorial/steps/13-return-sensor.steps.ts`

**Interfaces:**
- Consumes: `context`/`action`/`sensor`/`defineState` from Task 5.
- Classification rule: returns a value to compare → `sensor`; the single stimulus → `action`; resting state setup → `context`.

- [ ] **Step 1: Rewrite the tutorial stepfiles**

`docs/tutorial/steps/01-hello.steps.ts`:

```ts
import { defineState } from '@oselvar/var-vitest'

const { action, sensor } = defineState(() => ({ greeting: '', result: 0 }))

action('I greet {string}', (ctx, name: string) => {
  ctx.greeting = `Hello, ${name}!`
})

sensor('the greeting should be {string}', (ctx, expected: string) => [ctx.greeting] as [string])

action('expression `{int}+{int}`', (ctx, op1: number, op2: number) => {
  ctx.result = op1 + op2
})

sensor('evaluate to `{int}`', (ctx, count: number) => [ctx.result] as [number])
```

> `[ctx.greeting] as [string]` makes the returned tuple match the single annotated param `expected: string`. The captured `expected` is the comparison target; `ctx.greeting` is the actual.

`docs/tutorial/steps/02-airport.steps.ts`:

```ts
import { defineParameterType, defineState } from '@oselvar/var-vitest'

defineParameterType({
  name: 'airport',
  regexp: /[A-Z]{3}/,
  transformer: (code: string) => code,
})

const { action, sensor } = defineState(() => ({ from: '', to: '' }))

action('I fly from {airport} to {airport}', (ctx, from: string, to: string) => {
  ctx.from = from
  ctx.to = to
})

sensor(
  'the route should be from {airport} to {airport}',
  (ctx, _from: string, _to: string) => [ctx.from, ctx.to] as [string, string],
)
```

`docs/tutorial/steps/03-library.steps.ts` — change the import to `defineState`, destructure `{ context, action, sensor }`, and map each step (bodies stay commented; sensors may return void):

```ts
import { defineParameterType, defineState } from '@oselvar/var-vitest'
// ... (MONTHS const and the three defineParameterType calls are UNCHANGED) ...

const { context, action, sensor } = defineState(() => ({
  // library: new Library(),
  member: 'maya',
}))

context('Maya has borrowed {string}, due back on {date}', (_ctx, _title: string, _due: Date) => {
  // ctx.library.checkOut(ctx.member, title, due)
})

action('she returns it on {date}', (_ctx, _returned: Date) => {
  // ctx.library.checkIn(ctx.member, returned)
})

sensor('charges her a {money} late fee', (_ctx, _fee: number) => {
  // expect(ctx.library.feesOwedBy(ctx.member)).toBe(fee)
})

sensor('{money} for each day overdue', (_ctx, _dailyRate: number) => {
  // ...
})

sensor('Her account shows the fee', (_ctx) => {
  // expect(ctx.library.accountOf(ctx.member).fees).toBeGreaterThan(0)
})

sensor("she can't borrow anything else", (_ctx) => {
  // expect(() => ctx.library.checkOut(...)).toThrow(/unpaid/i)
})
```

`docs/tutorial/steps/04-yahtzee.steps.ts` — header-bound table is now a `sensor` (return shape unchanged: a row object keyed by column):

```ts
import { defineState } from '@oselvar/var-vitest'

const { sensor } = defineState(() => ({}))

// Header-bound table: the paragraph names every header cell (dice, category,
// score), so the runner calls this sensor once per row with the row as an
// object of raw strings. Returning { score } compares only that column.
sensor(
  'Examples of dice, category and score',
  (_ctx, row: { dice: string; category: string; score: string }) => {
    const dice = row.dice.split(',').map((d) => Number(d.trim()))
    return { score: score(dice, row.category) }
  },
)

// ... the score() helper is UNCHANGED ...
```

> Header-bound rows use the `ex.rowChecks` path, so the returned object is fine — the sensor tuple contract is skipped for header-bound examples (see Task 4).

`docs/tutorial/steps/05-roman-numerals-steps.ts`:

```ts
import { defineState } from '@oselvar/var-vitest'

const { sensor } = defineState(() => ({}))

sensor('a decimal and a roman number', (_ctx) => {
  // Write code here that turns the phrase above into concrete actions
  throw new Error('not implemented')
})
```

`docs/tutorial/steps/06-tables-and-docstrings.steps.ts` — both are sensors; returns wrap in the tuple of post-`ctx` args:

```ts
import { defineState } from '@oselvar/var-vitest'

const { sensor } = defineState(() => ({}))

// Whole-table mode: the table arrives as string[][] (header row first). Return
// the tuple [reproducedTable] — Vár compares every cell against the spec.
sensor('Uppercase each one:', (_ctx, rows: ReadonlyArray<ReadonlyArray<string>>) => {
  const reproduced = rows.slice(1).map(([before]) => ({ before, after: (before ?? '').toUpperCase() }))
  return [reproduced] as const
})

// Doc-string mode: the post-ctx args are (name, body); return [name, text].
sensor('Greet {word}:', (_ctx, name: string, _body: string) => {
  return [name, `Hello, ${name}!\n`] as [string, string]
})
```

- [ ] **Step 2: Rewrite `packages/cucumber/steps/library.steps.ts`**

```ts
import { defineState } from '@oselvar/var-vitest'
import { expect } from 'vitest'
import { type Book, type BorrowError, Library, type Receipt } from '../src/library.js'

const { context, action, sensor } = defineState(() => ({
  library: new Library(new Date('2026-06-12T00:00:00Z')),
  lastReceipt: undefined as Receipt | BorrowError | undefined,
}))

context('the library has these books:', (ctx, rows: ReadonlyArray<ReadonlyArray<string>>) => {
  const [header, ...body] = rows
  if (!header) return
  const books = body.map((row) =>
    Object.fromEntries(header.map((h, i) => [h, row[i] ?? ''])),
  ) as Book[]
  ctx.library.addBooks(books)
})

action('the member borrows {string}', (ctx, title: string) => {
  ctx.lastReceipt = ctx.library.borrow(title)
})

sensor('the receipt is:', (ctx, _docString: string) => {
  // Assertion-style sensor (returns void): compares via expect, not by return.
  expect(ctx.lastReceipt).toEqual(JSON.parse(_docString))
})
```

- [ ] **Step 3: Rewrite `packages/var-cli/tests/fixtures/run-basic/hello.steps.ts`**

```ts
import { defineState } from '@oselvar/var-runtime'

const { action, sensor } = defineState(() => ({ greeting: '' }))

action('I greet {string}', (ctx, name: string) => {
  ctx.greeting = `Hello, ${name}!`
})

sensor('the greeting is {string}', (ctx, _expected: string) => [ctx.greeting] as [string])
```

- [ ] **Step 4: Create the dogfood failing-sensor spec**

`docs/tutorial/13-return-sensor.var.md`:

```markdown
# Return-based sensor

I should have 3 cukes in my big belly
```

`docs/tutorial/steps/13-return-sensor.steps.ts`:

```ts
import { defineState } from '@oselvar/var-vitest'

const { sensor } = defineState(() => ({}))

// Intentionally returns the captured values unchanged → the example passes.
// Flip 3 → 4 in the return to see the span-anchored CellMismatch on {int}.
sensor(
  'I should have {int} cukes in my {word} belly',
  (_ctx, count: number, name: string) => [count, name] as [number, string],
)
```

- [ ] **Step 5: Run the dogfood + affected suites**

Run: `NODE_OPTIONS="--import tsx" npx vitest run` (root) and `pnpm --filter @oselvar/cucumber test` and `pnpm --filter @oselvar/var-cli test`
Expected: PASS. Then temporarily edit `13-return-sensor.steps.ts` to `[4, name]`, re-run the root dogfood, confirm a failure anchored to `3`, then revert to `[count, name]`.

- [ ] **Step 6: Commit**

```bash
git add docs/tutorial packages/cucumber/steps/library.steps.ts packages/var-cli/tests/fixtures/run-basic/hello.steps.ts
git commit -m "refactor: migrate step definitions to context/action/sensor roles"
```

---

### Task 7: Migrate adapter & website test suites

**Files:**
- Modify: `packages/var-vitest/tests/runtime.test.ts`, `packages/var-vitest/tests/api.test.ts`
- Modify: `packages/var-cli/tests/e2e.test.ts`, `packages/var-cli/tests/stepdef.test.ts`
- Modify: `packages/var-lsp/tests/handlers.test.ts`, `packages/var-lsp/src/store.test.ts`
- Modify: `packages/var-language/tests/step-defs.test.ts`, `packages/var-language/tests/index-workspace.test.ts`, `packages/var-language/src/index-workspace.ts`
- Modify: `packages/website/src/lib/run-spec.test.ts`, `packages/website/src/lib/step-highlight.test.ts`, `packages/website/src/lib/cm-generate-step.test.ts`, `packages/website/src/lib/ts-diagnostics.test.ts`, `packages/website/src/lib/run-worker.ts`

**Interfaces:**
- Consumes: the role API from Task 5. `step`/`defineContext` still exist (removed in Task 9), so suites may migrate in any order.

- [ ] **Step 1: Mechanically migrate each suite**

Apply these rules to every file above:
- `defineContext(` → `defineState(`; destructure the roles actually used, e.g. `const { action, sensor } = defineState(...)`.
- A step that mutates `ctx` / performs a stimulus → `action(`; a step that sets up resting state → `context(`; a step that asserts (returns a value or calls `expect`) → `sensor(`.
- A sensor that previously returned a bare table/string/row-object: wrap inline params + extras into the post-`ctx` tuple as in Task 6 (header-bound row-objects stay as objects).
- `import { ... step ... }` → import the roles used.

Example — `packages/var-vitest/tests/runtime.test.ts` (typical inline-source fixture):

```ts
// before:
//   const { step } = defineContext(() => ({ greeting: '' }))
//   step('I greet {string}', (ctx, name: string) => { ctx.greeting = `Hi ${name}` })
//   step('the greeting is {string}', (ctx, expected: string) => { expect(ctx.greeting).toBe(expected) })
// after:
const { action, sensor } = defineState(() => ({ greeting: '' }))
action('I greet {string}', (ctx, name: string) => {
  ctx.greeting = `Hi ${name}`
})
sensor('the greeting is {string}', (ctx) => [ctx.greeting] as [string])
```

- [ ] **Step 2: Update `var-language` parser source if its tests assert kinds**

If `packages/var-language/src/index-workspace.ts` references `step` in fixtures, update those fixtures to roles. (The parser change itself lands in Task 8; here only test fixtures + sources that *call* the API change.)

- [ ] **Step 3: Update the website ambient + worker**

In `packages/website/src/lib/ts-diagnostics.ts`, extend the `AMBIENT` module string to declare the roles and `defineState` (keep `step`/`defineContext` until Task 9 if any test still needs them):

```ts
const AMBIENT = `declare module '@oselvar/var-runtime' {
  export type RoleFn<C = unknown> = (
    expression: string,
    handler: (ctx: C, ...args: readonly unknown[]) => void | Promise<void>,
  ) => void
  export type SensorFn<C = unknown> = <A extends readonly unknown[]>(
    expression: string,
    handler: (ctx: C, ...args: A) => A | Promise<A> | void | Promise<void>,
  ) => void
  export const context: RoleFn
  export const action: RoleFn
  export const sensor: SensorFn
  export function defineState<C>(factory: () => C | Promise<C>): {
    readonly context: RoleFn<C>; readonly action: RoleFn<C>; readonly sensor: SensorFn<C>
  }
  export function defineParameterType<T>(opts: {
    name: string; regexp: RegExp | readonly RegExp[]; transformer: (...captures: string[]) => T
  }): void
}`
```

> `NoInfer` is omitted in the ambient string for browser-side simplicity; `A | void` still gives useful checking in the editor.

- [ ] **Step 4: Run every suite + build**

Run: `pnpm -r test` then `pnpm -r build` then `pnpm --filter @oselvar/website build`
Expected: PASS; both builds exit 0. Fix each compile/test failure surfaced by the role migration (the build is the source of truth for remaining `step`/`defineContext` references in these suites).

- [ ] **Step 5: Commit**

```bash
git add packages/var-vitest packages/var-cli packages/var-lsp packages/var-language packages/website/src/lib
git commit -m "refactor: migrate adapter and website test suites to roles"
```

---

## Phase 3 — Codegen role inference

### Task 8: `inferStepRole` + role-aware snippet template + parser kinds

**Files:**
- Modify: `packages/var/src/step-role.ts`
- Modify: `packages/var/src/snippet-template.ts`
- Modify: `packages/var/src/snippet.ts`
- Modify: `packages/var/src/index.ts`
- Modify: `packages/var-language/src/step-defs.ts`
- Test: `packages/var/tests/step-role.test.ts`, `packages/var/tests/snippet.test.ts`, `packages/var-language/tests/step-defs.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export function inferStepRole(neighbours: {
    readonly before: ReadonlyArray<StepKind>
    readonly after: ReadonlyArray<StepKind>
  }): StepKind
  ```
- `generateSnippet(rawText, registry, options)` — `options` gains `role?: StepKind` (default `'action'`). The emitted code shows the chosen role active with the other two roles commented above.
- `StepDef` (var-language) gains `readonly kind: StepKind` (defaults to `'action'` when the call is none of the three — defensive); `isStepCall` matches `context` | `action` | `sensor`.

- [ ] **Step 1: Write the failing tests**

```ts
// packages/var/tests/step-role.test.ts
import { expect, test } from 'vitest'
import { inferStepRole } from '../src/step-role.js'

test('no step after the selection → sensor (expectation last)', () => {
  expect(inferStepRole({ before: ['action'], after: [] })).toBe('sensor')
})

test('a sensor follows and no action sits between → action', () => {
  expect(inferStepRole({ before: ['context'], after: ['sensor'] })).toBe('action')
})

test('nothing before and a step after → context', () => {
  expect(inferStepRole({ before: [], after: ['action'] })).toBe('context')
})

test('otherwise → action', () => {
  expect(inferStepRole({ before: ['action'], after: ['action'] })).toBe('action')
})
```

Add to `packages/var/tests/snippet.test.ts`:

```ts
test('snippet defaults to action and offers context/sensor as commented alternatives', () => {
  const s = generateSnippet('I have 5 cukes', createRegistry())
  expect(s.fullCode).toMatch(/^action\(/m)
  expect(s.fullCode).toMatch(/^\/\/ context\(/m)
  expect(s.fullCode).toMatch(/^\/\/ sensor\(/m)
})

test('snippet honours an explicit role', () => {
  const s = generateSnippet('the total is 5', createRegistry(), { role: 'sensor' })
  expect(s.fullCode).toMatch(/^sensor\(/m)
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @oselvar/var test step-role snippet`
Expected: FAIL — `inferStepRole` missing; snippet still emits `step(`.

- [ ] **Step 3: Implement `inferStepRole`**

Append to `packages/var/src/step-role.ts`:

```ts
// Guess a step's role from its neighbours, using the canonical document order
// context → action → sensor. Purely structural — never inspects sentence words
// (no Given/When/Then heuristics). The generated snippet always offers the other
// roles as commented alternatives, so a wrong guess is cheap to correct.
export function inferStepRole(neighbours: {
  readonly before: ReadonlyArray<StepKind>
  readonly after: ReadonlyArray<StepKind>
}): StepKind {
  const { before, after } = neighbours
  if (after.length === 0) return 'sensor'
  if (after.includes('sensor') && !before.includes('action') && !after.includes('action')) {
    return 'action'
  }
  if (before.length === 0) return 'context'
  return 'action'
}
```

- [ ] **Step 4: Make the snippet template role-aware**

Replace `packages/var/src/snippet-template.ts`:

```ts
// Role-aware TypeScript snippet. Variables:
//   {{role}}         — the active role: context | action | sensor
//   {{altA}},{{altB}}— the two non-active roles (for commented alternatives)
//   {{expression}}   — the cucumber expression
//   {{args}}         — formatted handler args, e.g. `ctx, count: number`
//   {{originalText}} — the raw input the user typed
export const DEFAULT_SNIPPET_TEMPLATE = `// {{altA}}('{{expression}}', ({{args}}) => {})
// {{altB}}('{{expression}}', ({{args}}) => {})
{{role}}('{{expression}}', ({{args}}) => {
  // Write code here that turns the phrase above into concrete actions
  throw new Error('not implemented')
})
`
```

In `packages/var/src/snippet.ts`, compute role + alternatives and pass them to `renderTemplate`:

```ts
import type { StepKind } from './step-role.js'
// ...
export function generateSnippet(
  rawText: string,
  registry: Registry,
  options: { readonly template?: string; readonly role?: StepKind } = {},
): Snippet {
  // ... unchanged expression/args computation ...
  const role: StepKind = options.role ?? 'action'
  const others = (['context', 'action', 'sensor'] as const).filter((k) => k !== role)
  const fullCode = renderTemplate(options.template ?? DEFAULT_SNIPPET_TEMPLATE, {
    role,
    altA: others[0] as string,
    altB: others[1] as string,
    expression,
    args,
    originalText,
  })
  return { expression, handlerSignature, fullCode }
}
```

> `renderTemplate` substitutes `{{name}}`; confirm it tolerates the extra keys (it iterates the provided record). If `config.ts` / `var-worker.ts` / `store.test.ts` assert the literal old template, update those expectations to the new `action(...)` shape.

In `packages/var/src/index.ts`:

```ts
export { inferStepRole } from './step-role.js'
```

- [ ] **Step 5: Make the `var-language` parser role-aware**

In `packages/var/src/step-defs.ts` (package `@oselvar/var-language`):

```ts
import type { StepKind } from '@oselvar/var'

const ROLE_NAMES: ReadonlyArray<string> = ['context', 'action', 'sensor']

function isStepCall(node: ts.CallExpression): boolean {
  return ts.isIdentifier(node.expression) && ROLE_NAMES.includes(node.expression.text)
}
```

Add `kind` to `StepDef` and set it in `visit` from the call identifier:

```ts
export type StepDef = {
  readonly file: string
  readonly expression: string
  readonly kind: StepKind
  readonly expressionRange: Range
  readonly callRange: Range
  readonly handlerParams?: HandlerParams | undefined
}
```

```ts
  if (ts.isCallExpression(node) && isStepCall(node) && node.arguments.length >= 1) {
    const arg0 = node.arguments[0]
    if (arg0 && ts.isStringLiteral(arg0)) {
      const kind = (node.expression as ts.Identifier).text as StepKind
      // ... existing handlerParams extraction ...
      out.push({ file, expression: arg0.text, kind, expressionRange: rangeOf(sf, arg0), callRange: rangeOf(sf, node), handlerParams })
    }
  }
```

Update `packages/var-language/tests/step-defs.test.ts`: change fixtures from `step('…', …)` to role calls and assert `discoverStepDefs(...)[0].kind` equals the expected role.

- [ ] **Step 6: Run tests + build**

Run: `pnpm --filter @oselvar/var test` and `pnpm --filter @oselvar/var-language test` then `pnpm -r build`
Expected: PASS; build exit 0.

- [ ] **Step 7: Commit**

```bash
git add packages/var/src/step-role.ts packages/var/src/snippet-template.ts packages/var/src/snippet.ts packages/var/src/index.ts packages/var-language/src/step-defs.ts packages/var/tests packages/var-language/tests
git commit -m "feat(var): structural inferStepRole + role-aware snippet template"
```

---

### Task 9: Wire role inference into the LSP; remove `step`/`defineContext`/legacy

**Files:**
- Modify: `packages/var-lsp/src/handlers.ts`
- Modify: `packages/var-cli/src/stepdef.ts`, `packages/var-cli/src/init.ts`
- Modify: `packages/var-runtime/src/index.ts`, `packages/var-vitest/src/api.ts`, `packages/var-vitest/src/index.ts`
- Modify: `packages/var/src/execute.ts`
- Modify: `packages/website/src/lib/ts-diagnostics.ts`, `packages/website/src/lib/cm-generate-step.ts` (if it references `step`)
- Test: `packages/var-lsp/tests/handlers.test.ts`, `packages/var-cli/tests/stepdef.test.ts`, `packages/var-runtime/tests/api.test.ts`

**Interfaces:**
- The LSP `generateSnippet(text)` resolves neighbour roles from the open document's plan and passes `role: inferStepRole(...)`.
- `step`, `defineContext`, and the `Step` type are removed from all packages; `executePlan`'s legacy (`kind === undefined`) branch is deleted.

- [ ] **Step 1: Wire `inferStepRole` into the LSP generate handler**

In `packages/var-lsp/src/handlers.ts`, when generating a snippet for selected text, look up the document containing the selection in `store`, plan it, find the matched steps before/after the selection offset, collect their `stepDef.kind`, and pass the inferred role:

```ts
import { generateSnippet, inferStepRole, type StepKind } from '@oselvar/var'
// ...
generateSnippet(text) {
  const { before, after } = neighbourRolesForSelection(store, text) // returns { before: StepKind[], after: StepKind[] }
  const role = inferStepRole({ before, after })
  const snippet = generateSnippet(text, store.index().registry, {
    template: store.config().snippet.template,
    role,
  })
  // ... unchanged return ...
}
```

Implement `neighbourRolesForSelection` from the store's planned examples (use the existing planning the store already performs for diagnostics). If neighbour resolution is not available for a given request, default `before`/`after` to `[]` so `inferStepRole` returns a stable `'context'`/`'sensor'` guess; the commented alternatives cover the rest.

> If the LSP request shape only carries `text` and wiring document context is larger than this task, ship the default-`action` path here (pass no `role`) and leave a `// TODO(role-inference): pass neighbour roles` — **but** only if neighbour data genuinely is not reachable from `store`. Prefer wiring it; the store already holds planned docs.

Update `packages/var-lsp/tests/handlers.test.ts` to assert the generated snippet uses a role (e.g. matches `/^(context|action|sensor)\(/m`) rather than `step(`.

- [ ] **Step 2: Update the CLI stepdef + init**

`packages/var-cli/src/stepdef.ts` — no role context at the CLI, so default applies:

```ts
const snippet = generateSnippet(opts.text, createRegistry(), {
  // role defaults to 'action'; commented alternatives let the author switch.
})
```

`packages/var-cli/src/init.ts` — update `EXAMPLE_STEPS`:

```ts
const EXAMPLE_STEPS = `import { defineState } from '@oselvar/var-vitest'

const { action, sensor } = defineState(() => ({ greeting: '' }))

action('I greet {string}', (ctx, name: string) => {
  ctx.greeting = \`Hello, \${name}!\`
})

sensor('the greeting is {string}', (ctx, _expected: string) => [ctx.greeting] as [string])
`
```

- [ ] **Step 3: Remove `step` / `defineContext` / `Step`**

In `packages/var-runtime/src/index.ts`: delete `export const step`, `export type Step`, and `export function defineContext`. Keep `contextFactoriesByFile`, `contextFactory`, `defineState`, the roles, `defineParameterType`, `buildRegistry`, `_resetBuilder`.

In `packages/var-vitest/src/api.ts` and `index.ts`: drop `step`, `defineContext`, and `Step` from the re-exports.

In `packages/website/src/lib/ts-diagnostics.ts`: remove `step`/`defineContext`/`Step` from the `AMBIENT` module string (leaving the roles + `defineState`).

Search for any stragglers and fix:

```bash
grep -rn "defineContext\|\bstep(\|export.*\bStep\b" packages docs --include='*.ts' | grep -vE "node_modules|/dist/|defineState|inferStepRole|StepKind|StepDef|StepHandler|StepRegistration|StepInput|PlannedStep|stepDef|stepsByBlock"
```

Resolve every remaining hit (rename to a role / `defineState`).

- [ ] **Step 4: Delete the legacy `executePlan` branch**

In `packages/var/src/execute.ts`, remove the `else { /* Legacy step() */ ... }` branch added in Task 4 (now that no registration has `kind === undefined`). Tighten the dispatch so an unknown/missing kind throws:

```ts
            } else {
              throw new ReturnShapeError(`unknown step kind: ${String(kind)}`)
            }
```

- [ ] **Step 5: Run everything + both builds**

Run: `pnpm -r test`, `pnpm -r build`, `pnpm --filter @oselvar/website build`, and `NODE_OPTIONS="--import tsx" npx vitest run`
Expected: all PASS; builds exit 0. The grep from Step 3 returns no authoring `step(`/`defineContext` hits.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: remove step()/defineContext; wire LSP role inference; drop legacy execute branch"
```

---

## Self-Review notes

- **Spec coverage:** roles + only-sensor-returns (Tasks 5, 4); tuple-of-post-ctx-args return (Task 4, 6); `NoInfer` pinning (Task 5); context/action stray return compile + runtime error (Task 5 typing, Task 4 throw); deep-equal inline comparison (Tasks 1, 3, 4); table/doc string reuse + header-bound on sensor (Task 4, 6); `StepKind` on registry (Task 2); `compareParams` reusing `CellDiff` (Task 3); `step`/`defineContext` removed, no deprecation (Task 9); factory renamed `defineState` (Task 5/9); structural codegen role inference with commented alternatives (Task 8); parser role-awareness (Task 8); migration of all stepfiles + tooling + tests (Tasks 6, 7, 9); build gate (every task).
- **Out-of-scope (spec):** cucumber-expression→TS inference (unannotated params stay `unknown`); structured combo return.
- **Type consistency:** `StepKind` defined once (`step-role.ts`), imported everywhere; `RoleFn`/`SensorFn` defined in `var-runtime` and mirrored in the website ambient; `inferStepRole({before, after})` signature identical in producer (Task 8) and consumer (Task 9); `generateSnippet` `role` option added in Task 8 and used in Tasks 8/9.
