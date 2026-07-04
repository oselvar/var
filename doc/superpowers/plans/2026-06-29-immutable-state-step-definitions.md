# Immutable, return-based state for step definitions — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make step state immutable and the update contract functional — `context`/`action` steps *return* a partial state that the runtime shallow-merges and threads forward, the first handler parameter is renamed `ctx` → `state` and typed deeply-readonly + deep-frozen, and `sensor` steps stay pure observers.

**Architecture:** A pure `deepFreeze` helper plus a change to the core runtime loop (`packages/var/src/execute.ts`) that threads frozen state per stepfile and merges `context`/`action` object returns. The author-facing types in `packages/var-runtime` change the handler signatures (`state: DeepReadonly<C>`, return `Partial<C> | void`). Everything downstream — dogfood steps, the website's in-browser ambient, tests, and reference docs — migrates to the new contract in one pass. Hard break: the old mutation model is removed.

**Tech Stack:** TypeScript (ESM, `node:` imports, Node ≥ 22), pnpm workspace, biome, vitest, knip, jscpd. The repo's own tests are `*.test.ts`; dogfood specs are `*.var.md` + `*.steps.ts` run via `NODE_OPTIONS="--import tsx" npx vitest run`.

## Global Constraints

- **Immutable types.** All data `readonly`; updates produce new values. (CLAUDE.md)
- **Functional core / hexagonal.** `packages/var/src/*` is pure over immutable data; no `node:fs`/runtime imports leak into the core. Side effects live in adapter packages. (CLAUDE.md)
- **Build gate is separate from tests.** vitest (esbuild/tsx) does not type-check. Run `pnpm -r build` (exit 0) and `pnpm check` (which runs `pnpm typecheck`) before calling the change done. (CLAUDE.md, MEMORY.md)
- **No `Given/When/Then`; one role API** (`context`/`action`/`sensor` via `defineState`). Keywords are author narration only. (CLAUDE.md)
- **Commit trailer** on every commit: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- **Parallel-agent boundary:** do not touch or commit unrelated files under `packages/var/**` that you did not modify for this plan; commit only the files each task lists.
- **Ordering note:** this is a hard-break migration, so the *whole-repo* `pnpm check` (which includes the dogfood specs) is only expected green after **Task 4**. Each earlier task verifies its own package's scoped tests, listed in its steps. The final full gate runs in Task 6.

---

### Task 1: `deepFreeze` helper in the core

**Files:**
- Create: `packages/var/src/deep-freeze.ts`
- Test: `packages/var/tests/deep-freeze.test.ts`

**Interfaces:**
- Produces: `deepFreeze<T>(value: T): T` — recursively `Object.freeze`s own enumerable properties of objects/arrays and returns the same reference; returns primitives and already-frozen values unchanged. Imported by `packages/var/src/execute.ts` (Task 2) and the test.

- [ ] **Step 1: Write the failing test**

Create `packages/var/tests/deep-freeze.test.ts`:

```ts
import { expect, test } from 'vitest'
import { deepFreeze } from '../src/deep-freeze.js'

test('deepFreeze freezes nested objects and arrays', () => {
  const o = deepFreeze({ a: { b: 1 }, list: [{ c: 2 }] })
  expect(Object.isFrozen(o)).toBe(true)
  expect(Object.isFrozen(o.a)).toBe(true)
  expect(Object.isFrozen(o.list)).toBe(true)
  expect(Object.isFrozen(o.list[0])).toBe(true)
})

test('deepFreeze returns primitives and null unchanged', () => {
  expect(deepFreeze(5)).toBe(5)
  expect(deepFreeze('x')).toBe('x')
  expect(deepFreeze(null)).toBe(null)
})

test('deepFreeze returns the same reference (idempotent on frozen input)', () => {
  const f = Object.freeze({ a: 1 })
  expect(deepFreeze(f)).toBe(f)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/aslakhellesoy/git/oselvar/bdd && NODE_OPTIONS="--import tsx" npx vitest run packages/var/tests/deep-freeze.test.ts`
Expected: FAIL — `Failed to resolve import "../src/deep-freeze.js"` / "deepFreeze is not a function".

- [ ] **Step 3: Write minimal implementation**

Create `packages/var/src/deep-freeze.ts`:

```ts
// Recursively freezes an object's own enumerable properties (descending into
// nested objects and arrays) and returns the same reference. Primitives, null,
// and already-frozen values pass through untouched. Pure except for the
// in-place `Object.freeze` on the value it is handed — used by the runtime to
// make step state immutable at runtime. Assumes acyclic input (test state is).
export function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) {
    return value
  }
  for (const key of Object.keys(value as object)) {
    deepFreeze((value as Record<string, unknown>)[key])
  }
  return Object.freeze(value)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/aslakhellesoy/git/oselvar/bdd && NODE_OPTIONS="--import tsx" npx vitest run packages/var/tests/deep-freeze.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Build + lint the new file**

Run: `cd /Users/aslakhellesoy/git/oselvar/bdd && pnpm --filter @oselvar/var build && npx biome check packages/var/src/deep-freeze.ts packages/var/tests/deep-freeze.test.ts`
Expected: build exit 0; biome "No fixes applied".

- [ ] **Step 6: Commit**

```bash
cd /Users/aslakhellesoy/git/oselvar/bdd
git add packages/var/src/deep-freeze.ts packages/var/tests/deep-freeze.test.ts
git commit -m "feat(var): add deepFreeze helper

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Functional state threading in `execute.ts`

**Files:**
- Modify: `packages/var/src/execute.ts` (the per-step loop: freeze initial state; merge `context`/`action` object returns)
- Test: `packages/var/tests/execute-state.test.ts` (new)

**Interfaces:**
- Consumes: `deepFreeze` from `./deep-freeze.js` (Task 1); existing `ExecutePorts`, `executePlan`, `parse`, `plan`, `addStep`, `createRegistry`, `ReturnShapeError`.
- Produces: runtime behavior — a `context`/`action` handler return of `undefined` is a no-op; a non-null object is shallow-merged onto current state and deep-frozen; any other return throws `ReturnShapeError('a context/action step must return a partial state object or nothing')`. State passed to handlers is deep-frozen. Sensors are unchanged.

- [ ] **Step 1: Write the failing tests**

Create `packages/var/tests/execute-state.test.ts`:

```ts
import { expect, test } from 'vitest'
import { type ExecutePorts, executePlan } from '../src/execute.js'
import { parse } from '../src/parse.js'
import { plan } from '../src/plan.js'
import { addStep, createRegistry } from '../src/registry.js'

// Runs one example. `createContext` seeds the initial state; step handlers may
// capture what they receive via closures. Returns a getter for the caught error.
function run(
  source: string,
  register: (r: ReturnType<typeof createRegistry>) => ReturnType<typeof createRegistry>,
  createContext: (stepFile: string) => unknown,
) {
  const registry = register(createRegistry())
  const doc = parse('x.var.md', source)
  const p = plan(doc, registry)
  let caught: unknown
  const ports: ExecutePorts = {
    reporter: { diagnostic: () => {} },
    createContext,
    sink: {
      example: (_name, fn) => {
        void (fn() as Promise<void>).catch((e) => {
          caught = e
        })
      },
    },
  }
  executePlan(p, ports)
  return () => caught
}

const FILE = 's.steps.ts'

test('a context/action object return merges into state and threads forward', async () => {
  let seen: unknown
  const getErr = run(
    '# X\n\nI greet\nobserve\n',
    (r) => {
      r = addStep(r, {
        expression: 'I greet',
        expressionSourceFile: FILE,
        expressionSourceLine: 1,
        kind: 'action',
        handler: () => ({ greeting: 'hi', count: 1 }),
      })
      return addStep(r, {
        expression: 'observe',
        expressionSourceFile: FILE,
        expressionSourceLine: 2,
        kind: 'sensor',
        handler: (state) => {
          seen = state
        },
      })
    },
    () => ({}),
  )
  await new Promise((res) => setTimeout(res, 0))
  expect(getErr()).toBeUndefined()
  expect(seen).toEqual({ greeting: 'hi', count: 1 })
})

test('shallow merge replaces a top-level key and preserves the rest', async () => {
  let seen: unknown
  const getErr = run(
    '# X\n\nstep one\nstep two\nobserve\n',
    (r) => {
      r = addStep(r, {
        expression: 'step one',
        expressionSourceFile: FILE,
        expressionSourceLine: 1,
        kind: 'action',
        handler: () => ({ a: 1, b: 2 }),
      })
      r = addStep(r, {
        expression: 'step two',
        expressionSourceFile: FILE,
        expressionSourceLine: 2,
        kind: 'action',
        handler: () => ({ b: 3 }),
      })
      return addStep(r, {
        expression: 'observe',
        expressionSourceFile: FILE,
        expressionSourceLine: 3,
        kind: 'sensor',
        handler: (state) => {
          seen = state
        },
      })
    },
    () => ({}),
  )
  await new Promise((res) => setTimeout(res, 0))
  expect(getErr()).toBeUndefined()
  expect(seen).toEqual({ a: 1, b: 3 })
})

test('an undefined (void) return from a context/action is a no-op', async () => {
  let seen: unknown
  const getErr = run(
    '# X\n\nnoop\nobserve\n',
    (r) => {
      r = addStep(r, {
        expression: 'noop',
        expressionSourceFile: FILE,
        expressionSourceLine: 1,
        kind: 'action',
        handler: () => undefined,
      })
      return addStep(r, {
        expression: 'observe',
        expressionSourceFile: FILE,
        expressionSourceLine: 2,
        kind: 'sensor',
        handler: (state) => {
          seen = state
        },
      })
    },
    () => ({ a: 1 }),
  )
  await new Promise((res) => setTimeout(res, 0))
  expect(getErr()).toBeUndefined()
  expect(seen).toEqual({ a: 1 })
})

test('mutating the frozen state throws at runtime', async () => {
  const getErr = run(
    '# X\n\nmutate\n',
    (r) =>
      addStep(r, {
        expression: 'mutate',
        expressionSourceFile: FILE,
        expressionSourceLine: 1,
        kind: 'action',
        handler: (state) => {
          ;(state as { a: number }).a = 2
        },
      }),
    () => ({ a: 1 }),
  )
  await new Promise((res) => setTimeout(res, 0))
  expect(getErr()).toBeInstanceOf(TypeError)
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/aslakhellesoy/git/oselvar/bdd && NODE_OPTIONS="--import tsx" npx vitest run packages/var/tests/execute-state.test.ts`
Expected: FAIL — the merge/freeze tests fail (today a context/action object return throws `ReturnShapeError`, and state is not frozen so the mutate test does not throw a `TypeError`).

- [ ] **Step 3: Add the import to `execute.ts`**

In `packages/var/src/execute.ts`, add this import alongside the existing imports at the top of the file:

```ts
import { deepFreeze } from './deep-freeze.js'
```

- [ ] **Step 4: Freeze the initial state**

In `packages/var/src/execute.ts`, find:

```ts
          let ctx = ctxByFile.get(file)
          if (!ctxByFile.has(file)) {
            ctx = await createContext(file)
            ctxByFile.set(file, ctx)
          }
```

Replace with:

```ts
          let ctx = ctxByFile.get(file)
          if (!ctxByFile.has(file)) {
            ctx = deepFreeze(await createContext(file))
            ctxByFile.set(file, ctx)
          }
```

- [ ] **Step 5: Merge context/action returns instead of rejecting them**

In `packages/var/src/execute.ts`, find:

```ts
            const kind = step.stepDef.kind
            if (kind === 'context' || kind === 'action') {
              if (returned !== undefined) {
                throw new ReturnShapeError(
                  'a context/action step must not return a value; only sensor() returns for comparison',
                )
              }
            } else if (kind === 'sensor') {
```

Replace with:

```ts
            const kind = step.stepDef.kind
            if (kind === 'context' || kind === 'action') {
              // A context/action step EVOLVES state: returning a partial state
              // object shallow-merges onto the current state (re-frozen, then
              // threaded to later steps in this stepfile). Returning nothing is
              // a no-op. Any non-object return is a contract violation.
              if (returned !== undefined) {
                if (typeof returned !== 'object' || returned === null) {
                  throw new ReturnShapeError(
                    'a context/action step must return a partial state object or nothing',
                  )
                }
                ctx = deepFreeze({ ...(ctx as object), ...(returned as object) })
                ctxByFile.set(file, ctx)
              }
            } else if (kind === 'sensor') {
```

- [ ] **Step 6: Run the new tests + the existing role tests**

Run: `cd /Users/aslakhellesoy/git/oselvar/bdd && NODE_OPTIONS="--import tsx" npx vitest run packages/var/tests/execute-state.test.ts packages/var/tests/execute-roles.test.ts`
Expected: PASS. (The existing `execute-roles.test.ts` tests "an action that returns a value throws ReturnShapeError" and "a context step that returns a value throws ReturnShapeError" still pass because those handlers return the string `'oops'`, which the new contract still rejects.)

- [ ] **Step 7: Build + run the whole `var` package test suite**

Run: `cd /Users/aslakhellesoy/git/oselvar/bdd && pnpm --filter @oselvar/var build && NODE_OPTIONS="--import tsx" npx vitest run packages/var/tests`
Expected: build exit 0; all `var` tests pass.

- [ ] **Step 8: Commit**

```bash
cd /Users/aslakhellesoy/git/oselvar/bdd
git add packages/var/src/execute.ts packages/var/tests/execute-state.test.ts
git commit -m "feat(var): thread immutable state; context/action returns merge

Initial state is deep-frozen; a context/action object return is
shallow-merged onto the current state and re-frozen for later steps.
A non-object return still throws ReturnShapeError. Sensors unchanged.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Author-facing types — `state: DeepReadonly<C>` + `Partial<C>` return

**Files:**
- Modify: `packages/var-runtime/src/index.ts` (add `DeepReadonly`; change `RoleFn`/`SensorFn` handler signatures; update the two doc comments)
- Test: `packages/var-runtime/tests/api.test.ts` (rewrite the one mutating test; add a type-level contract test)

**Interfaces:**
- Consumes: existing `HandlerArgs<E, Custom>`, `RoleFn`, `SensorFn`, `defineState`, `buildRegistry`.
- Produces:
  - `RoleFn<C, Custom>` handler is now `(state: DeepReadonly<C>, ...args: HandlerArgs<E, Custom>) => Partial<C> | void | Promise<Partial<C> | void>`.
  - `SensorFn<C, Custom>` handler is now `(state: DeepReadonly<C>, ...args: HandlerArgs<E, Custom>) => R | Promise<R>`.
  - A new internal `DeepReadonly<T>` type. These are validated by `pnpm typecheck` (the repo-root `tsconfig.tests.json`), not by vitest.

- [ ] **Step 1: Write the failing type-level test + fix the mutating test**

In `packages/var-runtime/tests/api.test.ts`, replace the existing test:

```ts
test('defineState returns role functions typed against the state', () => {
  const { context: ctxStep, sensor: sense } = defineState(() => ({ greeting: '' }))
  ctxStep('I greet {string}', (ctx, name: string) => {
    ctx.greeting = `Hello, ${name}!`
  })
  sense('the greeting should be {string}', (ctx) => [ctx.greeting])
  const r = buildRegistry()
  expect(r.steps).toHaveLength(2)
  expect(r.steps.map((s) => s.kind)).toEqual(['context', 'sensor'])
})
```

with:

```ts
test('defineState returns role functions typed against the state', () => {
  const { context: ctxStep, sensor: sense } = defineState(() => ({ greeting: '' }))
  // context/action EVOLVE state by RETURNING a partial — never by mutating.
  ctxStep('I greet {string}', (_state, name: string) => ({ greeting: `Hello, ${name}!` }))
  sense('the greeting should be {string}', (state) => [state.greeting])
  const r = buildRegistry()
  expect(r.steps).toHaveLength(2)
  expect(r.steps.map((s) => s.kind)).toEqual(['context', 'sensor'])
})

test('state is deeply readonly and context/action returns are partial-state (type-level)', () => {
  // TYPE-LEVEL assertions (fire via tsconfig.tests.json under `pnpm typecheck`).
  type S = { greeting: string; nested: { n: number } }
  const { action: act } = defineState((): S => ({ greeting: '', nested: { n: 0 } }))
  // returning a partial is fine
  act('a', () => ({ greeting: 'hi' }))
  // returning nothing is fine
  act('b', () => {})
  // @ts-expect-error - state is deeply readonly; top-level mutation is forbidden
  act('c', (state) => {
    state.greeting = 'x'
  })
  // @ts-expect-error - nested mutation is forbidden too
  act('d', (state) => {
    state.nested.n = 1
  })
  // @ts-expect-error - an unknown/excess key is rejected
  act('e', () => ({ nope: 1 }))
  const r = buildRegistry()
  expect(r.steps).toHaveLength(5)
})
```

- [ ] **Step 2: Run the type check to verify it fails**

Run: `cd /Users/aslakhellesoy/git/oselvar/bdd && pnpm typecheck`
Expected: FAIL — the new test's `@ts-expect-error` lines report "Unused '@ts-expect-error' directive" (today `state` is mutable and returns are unconstrained), and the rewritten `defineState` test compiles but the contract isn't enforced yet.

- [ ] **Step 3: Add `DeepReadonly` and change the handler signatures**

In `packages/var-runtime/src/index.ts`, immediately before the `RoleFn` declaration (currently the comment block starting "A context/action handler runs for its side effects only"), insert:

```ts
// Deeply-readonly view of the state handed to every step: each nested property
// is `readonly`, so a handler can read state but never mutate it (mutation is a
// type error and — because the runtime deep-freezes — a runtime throw too).
// Functions pass through; arrays and objects recurse.
type DeepReadonly<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends ReadonlyArray<infer U>
    ? ReadonlyArray<DeepReadonly<U>>
    : T extends object
      ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
      : T
```

Then replace the `RoleFn` block:

```ts
// A context/action handler runs for its side effects only; its args are inferred
// from the expression `E` (built-in parameter types, plus any `Custom` types
// declared via `defineState`), so `(ctx, name) => …` types `name` without an
// annotation and without TS2345.
export type RoleFn<C = unknown, Custom = Record<never, never>> = <E extends string>(
  expression: E,
  handler: (ctx: C, ...args: HandlerArgs<E, Custom>) => void | Promise<void>,
) => void
```

with:

```ts
// A context/action handler receives the immutable `state` (deeply readonly) plus
// the args inferred from the expression `E` (built-in parameter types, plus any
// `Custom` types declared via `defineState`), so `(state, name) => …` types
// `name` without an annotation and without TS2345. It EVOLVES state by RETURNING
// a partial state object (shallow-merged by the runtime) — or nothing, for no
// change. It never mutates `state`.
export type RoleFn<C = unknown, Custom = Record<never, never>> = <E extends string>(
  expression: E,
  handler: (
    state: DeepReadonly<C>,
    ...args: HandlerArgs<E, Custom>
  ) => Partial<C> | void | Promise<Partial<C> | void>,
) => void
```

Then replace the `SensorFn` block:

```ts
// A sensor may RETURN a value for the pure core to compare against the Markdown.
// That return shape is independent of the captured args — it can be a by-index
// column tuple, a header-bound row object, a whole reproduced table, or a
// doc-string tuple — so `R` is inferred freely from the handler body.
export type SensorFn<C = unknown, Custom = Record<never, never>> = <E extends string, R>(
  expression: E,
  handler: (ctx: C, ...args: HandlerArgs<E, Custom>) => R | Promise<R>,
) => void
```

with:

```ts
// A sensor is a pure OBSERVER: it reads the immutable `state` (deeply readonly)
// and may RETURN a value for the pure core to compare against the Markdown. That
// return shape is independent of the captured args — a by-index column tuple, a
// header-bound row object, a whole reproduced table, or a doc-string tuple — so
// `R` is inferred freely from the handler body. A sensor never changes state.
export type SensorFn<C = unknown, Custom = Record<never, never>> = <E extends string, R>(
  expression: E,
  handler: (state: DeepReadonly<C>, ...args: HandlerArgs<E, Custom>) => R | Promise<R>,
) => void
```

- [ ] **Step 4: Run the type check to verify it passes**

Run: `cd /Users/aslakhellesoy/git/oselvar/bdd && pnpm typecheck`
Expected: PASS (exit 0). Every `@ts-expect-error` in the new test is now satisfied by a real error.

- [ ] **Step 5: Build var-runtime + run its test suite + lint**

Run: `cd /Users/aslakhellesoy/git/oselvar/bdd && pnpm --filter @oselvar/var-runtime build && NODE_OPTIONS="--import tsx" npx vitest run --project '@oselvar/var-runtime' && npx biome check packages/var-runtime/src/index.ts packages/var-runtime/tests/api.test.ts`
Expected: build exit 0; var-runtime tests pass; biome "No fixes applied".

- [ ] **Step 6: Commit**

```bash
cd /Users/aslakhellesoy/git/oselvar/bdd
git add packages/var-runtime/src/index.ts packages/var-runtime/tests/api.test.ts
git commit -m "feat(var-runtime): state is DeepReadonly; context/action return Partial<C>

Rename the first handler param ctx -> state and type it DeepReadonly<C>;
context/action handlers now return Partial<C> | void (merged by the
runtime). Mutation of state is a compile error. Sensors stay observers.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Migrate the dogfood step definitions

**Files:**
- Modify: `docs/tutorial/steps/01-hello.steps.ts` (convert two mutating actions to returns; rename ctx→state)
- Modify: `docs/tutorial/steps/02-airport.steps.ts` (convert one mutating action to a return; rename ctx→state)
- Modify: `docs/tutorial/steps/03-library.steps.ts` (rename `_ctx`→`_state`; bodies already empty)
- Modify: `docs/tutorial/steps/04-yahtzee.steps.ts` (rename `_ctx`→`_state`)
- Modify: `docs/tutorial/steps/05-roman-numerals.steps.ts` (rename `_ctx`→`_state`)
- Modify: `docs/tutorial/steps/06-tables-and-docstrings.steps.ts` (rename `_ctx`→`_state`)
- Modify: `docs/tutorial/steps/13-return-sensor.steps.ts` (rename `_ctx`→`_state`)

**Interfaces:**
- Consumes: the new `RoleFn`/`SensorFn` contract from Task 3 (via `@oselvar/var-vitest`, which re-exports `defineState`) and the runtime threading from Task 2.
- Produces: dogfood steps that type-check (tutorial tsconfig) and pass under the runner.

- [ ] **Step 1: Rewrite `01-hello.steps.ts`**

Replace the whole file `docs/tutorial/steps/01-hello.steps.ts` with:

```ts
import { defineState } from '@oselvar/var-vitest'

const { action, sensor } = defineState(() => ({ greeting: '', result: 0 }))

action('I greet {string}', (_state, name) => ({ greeting: `Hello, ${name}!` }))

sensor('the greeting should be {string}', (state, _expected) => [state.greeting])

action('expression `{int}+{int}`', (_state, op1, op2) => ({ result: op1 + op2 }))

sensor('evaluate to `{int}`', (state, _count) => [state.result])
```

- [ ] **Step 2: Rewrite `02-airport.steps.ts`**

Replace the two mutating lines + sensor in `docs/tutorial/steps/02-airport.steps.ts`. The file becomes:

```ts
import { defineState } from '@oselvar/var-vitest'

// Declaring the custom `{airport}` parameter type here (rather than via a
// separate defineParameterType call) lets Vár infer the captured args: the
// transformer returns string, so `from`/`to` are typed string with no annotation.
const { action, sensor } = defineState(() => ({ from: '', to: '' }), {
  airport: { regexp: /[A-Z]{3}/, transformer: (code: string) => code },
})

action('I fly from {airport} to {airport}', (_state, from, to) => ({ from, to }))

sensor('the route should be from {airport} to {airport}', (state, _from, _to) => [
  state.from,
  state.to,
])
```

- [ ] **Step 3: Rename the unused param in the five sensor-only / empty-body files**

In each of these files, rename the first handler parameter `_ctx` → `_state` (no other change). Use this command, then visually confirm the diff is parameter-only:

```bash
cd /Users/aslakhellesoy/git/oselvar/bdd
for f in 03-library 04-yahtzee 05-roman-numerals 06-tables-and-docstrings 13-return-sensor; do
  sed -i '' 's/(_ctx/(_state/g' "docs/tutorial/steps/$f.steps.ts"
done
git diff --stat docs/tutorial/steps/
```

Expected resulting handler signatures (for reference — confirm these after the sed):
- `03-library.steps.ts`: `context('Maya has borrowed {string}, due back on {date}', (_state, _title, _due) => {…})`, `action('she returns it on {date}', (_state, _returned) => {…})`, and the sensors `(_state, _fee)`, `(_state, _dailyRate)`, `(_state)`, `(_state)`.
- `04-yahtzee.steps.ts`: `(_state, row: { dice: string; category: string; score: string }) => {…}`.
- `05-roman-numerals.steps.ts`: `sensor('a decimal and a roman number', (_state) => {…})`.
- `06-tables-and-docstrings.steps.ts`: `(_state, rows: ReadonlyArray<ReadonlyArray<string>>) => {…}` and `(_state, name, _body: string) => {…}`.
- `13-return-sensor.steps.ts`: `sensor('I should have {int} cukes in my {word} belly', (_state, count, name) => [count, name])`.

- [ ] **Step 4: Type-check the tutorial**

Run: `cd /Users/aslakhellesoy/git/oselvar/bdd && npx tsc -p docs/tutorial/tsconfig.json --noEmit`
Expected: exit 0. (If `docs/tutorial/tsconfig.json` does not exist, run `pnpm typecheck` instead, which covers the tutorial via the repo-root tests tsconfig.)

- [ ] **Step 5: Run the dogfood specs**

Run: `cd /Users/aslakhellesoy/git/oselvar/bdd && NODE_OPTIONS="--import tsx" npx vitest run`
Expected: all dogfood `*.var.md` examples pass (the same count as before the change — the 01-hello and 02-airport examples now thread state via returns).

- [ ] **Step 6: Lint the changed files**

Run: `cd /Users/aslakhellesoy/git/oselvar/bdd && npx biome check docs/tutorial/steps/*.steps.ts`
Expected: "No fixes applied".

- [ ] **Step 7: Commit**

```bash
cd /Users/aslakhellesoy/git/oselvar/bdd
git add docs/tutorial/steps/*.steps.ts
git commit -m "refactor(dogfood): migrate steps to immutable return-based state

ctx -> state everywhere; 01-hello and 02-airport now return partial
state instead of mutating. Sensor-only files get the param rename.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Website in-browser ambient + diagnostics tests

**Files:**
- Modify: `packages/website/src/lib/ts-diagnostics.ts` (the `AMBIENT` template string: add `DeepReadonly`, change `RoleFn`/`SensorFn` handler signatures)
- Test: `packages/website/src/lib/ts-diagnostics.test.ts` (update the mutating example step; add an immutability assertion)

**Interfaces:**
- Consumes: the same contract as Task 3, mirrored into the browser ambient `declare module '@oselvar/var-runtime'`.
- Produces: the playground's in-browser type-checker treats `state` as deeply readonly and constrains context/action returns to `Partial<C>`.

- [ ] **Step 1: Update the mutating example + add an immutability test**

In `packages/website/src/lib/ts-diagnostics.test.ts`, replace the step source in the test "resolves @oselvar/var-runtime via the ambient decl":

```ts
      `import { defineState } from '@oselvar/var-runtime'\nconst { action } = defineState(() => ({ greeting: '' }))\naction('I greet {string}', (ctx, name) => { ctx.greeting = name })\n`,
```

with:

```ts
      `import { defineState } from '@oselvar/var-runtime'\nconst { action } = defineState(() => ({ greeting: '' }))\naction('I greet {string}', (_state, name) => ({ greeting: name }))\n`,
```

Then add this test inside the `describe('ts-diagnostics', …)` block (next to the other inference tests):

```ts
  it('flags mutation of the readonly state', () => {
    const ts = createTsDiagnostics()
    ts.updateDoc(
      'f.steps.ts',
      `import { defineState } from '@oselvar/var-runtime'\n` +
        `const { action } = defineState(() => ({ greeting: '' }))\n` +
        // assigning to the deeply-readonly state must produce a diagnostic.
        `action('I greet {string}', (state, name) => { state.greeting = name })\n`,
    )
    const d = ts.diagnostics('f.steps.ts')
    expect(d.some((x) => /read-only|readonly|Cannot assign/.test(x.message))).toBe(true)
  })
```

- [ ] **Step 2: Run the test to verify the new one fails**

Run: `cd /Users/aslakhellesoy/git/oselvar/bdd && NODE_OPTIONS="--import tsx" npx vitest run packages/website/src/lib/ts-diagnostics.test.ts`
Expected: FAIL — "flags mutation of the readonly state" fails (today the ambient `ctx` is mutable, so no read-only diagnostic).

- [ ] **Step 3: Add `DeepReadonly` to the ambient and change the signatures**

In `packages/website/src/lib/ts-diagnostics.ts`, inside the `AMBIENT` template literal, find the line `  type HandlerArgs<E extends string, Custom> = [...MapArgs<ParameterNames<E>, Custom>, ...AnyArg[]]` and insert immediately AFTER it:

```ts
  type DeepReadonly<T> = T extends (...args: never[]) => unknown
    ? T
    : T extends ReadonlyArray<infer U>
      ? ReadonlyArray<DeepReadonly<U>>
      : T extends object
        ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
        : T
```

Then find this block in the ambient:

```ts
  export type RoleFn<C = unknown, Custom = Record<never, never>> = <E extends string>(
    expression: E,
    handler: (ctx: C, ...args: HandlerArgs<E, Custom>) => void | Promise<void>,
  ) => void
  export type SensorFn<C = unknown, Custom = Record<never, never>> = <E extends string, R>(
    expression: E,
    handler: (ctx: C, ...args: HandlerArgs<E, Custom>) => R | Promise<R>,
  ) => void
```

and replace it with:

```ts
  export type RoleFn<C = unknown, Custom = Record<never, never>> = <E extends string>(
    expression: E,
    handler: (
      state: DeepReadonly<C>,
      ...args: HandlerArgs<E, Custom>
    ) => Partial<C> | void | Promise<Partial<C> | void>,
  ) => void
  export type SensorFn<C = unknown, Custom = Record<never, never>> = <E extends string, R>(
    expression: E,
    handler: (state: DeepReadonly<C>, ...args: HandlerArgs<E, Custom>) => R | Promise<R>,
  ) => void
```

- [ ] **Step 4: Run the website diagnostics tests**

Run: `cd /Users/aslakhellesoy/git/oselvar/bdd && NODE_OPTIONS="--import tsx" npx vitest run packages/website/src/lib/ts-diagnostics.test.ts`
Expected: PASS (all tests, including the new "flags mutation of the readonly state" and the still-passing built-in/custom inference tests).

- [ ] **Step 5: Lint the changed files**

Run: `cd /Users/aslakhellesoy/git/oselvar/bdd && npx biome check packages/website/src/lib/ts-diagnostics.ts packages/website/src/lib/ts-diagnostics.test.ts`
Expected: "No fixes applied".

- [ ] **Step 6: Commit**

```bash
cd /Users/aslakhellesoy/git/oselvar/bdd
git add packages/website/src/lib/ts-diagnostics.ts packages/website/src/lib/ts-diagnostics.test.ts
git commit -m "feat(website): mirror immutable state contract in the playground ambient

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Reference docs + full gate

**Files:**
- Modify: `packages/website/src/content/docs/reference/step-arguments.mdx` (rewrite the intro + the mutation example to the state contract; rename ctx→state)
- Modify: `packages/website/src/content/docs/reference/tables.mdx` (rename `ctx`→`state` in the three sensor examples)
- Modify: `packages/website/src/content/docs/reference/doc-strings.mdx` (rename ctx→state; convert the action example to a return)
- Create: `packages/website/src/content/docs/reference/state.mdx`

**Interfaces:**
- Consumes: nothing in code — documentation only. Must agree with the contract from Tasks 2–3.

- [ ] **Step 1: Fix `step-arguments.mdx` intro + mutation example**

In `packages/website/src/content/docs/reference/step-arguments.mdx`:

Replace the intro line (line ~13):

```mdx
A step handler is `(ctx, ...args) => …`. The first parameter, `ctx`, is your
```

with:

```mdx
A step handler is `(state, ...args) => …`. The first parameter, `state`, is your
```

Replace the mutation example (lines ~22–24):

```mdx
action('I greet {string}', (ctx, name) => {
  ctx.greeting = `Hello, ${name}!`
})
```

with:

```mdx
action('I greet {string}', (state, name) => {
  // context/action steps EVOLVE state by RETURNING a partial — never by
  // mutating. The returned object is shallow-merged onto the current state.
  return { greeting: `Hello, ${name}!` }
})
```

Then rename the remaining `ctx`/`(ctx,` occurrences in this file (lines ~38, ~53, ~69, ~93) to `state`/`(state,` and `_ctx`→`_state`. Verify with `grep -n "ctx" packages/website/src/content/docs/reference/step-arguments.mdx` returning no matches.

- [ ] **Step 2: Rename in `tables.mdx` and `doc-strings.mdx`**

In `packages/website/src/content/docs/reference/tables.mdx`, rename the three sensor first-params `(ctx, rows)` / `(ctx, row)` to `(state, rows)` / `(state, row)` (sensors only read, so no body change), and any `ctx.` reads to `state.`.

In `packages/website/src/content/docs/reference/doc-strings.mdx`, rename `ctx`→`state` throughout, and convert the `action('The rendered greeting is:', (ctx, body) => { … })` example so that instead of mutating it `return { … }` a partial state. (Read the file first; the action's body assigns to a state field — turn that assignment into the returned partial.)

Verify both files: `grep -n "ctx" packages/website/src/content/docs/reference/tables.mdx packages/website/src/content/docs/reference/doc-strings.mdx` returns no matches.

- [ ] **Step 3: Create the `state.mdx` reference page**

Create `packages/website/src/content/docs/reference/state.mdx`:

```mdx
---
title: State
description: How step definitions share and evolve immutable state.
---

Every stepfile that calls `defineState` owns a slice of **state** — a value
created fresh for each example and threaded through its steps. State is
**immutable**: handlers receive it deeply `readonly` (it is also deep-frozen at
runtime, so a stray assignment throws), and steps evolve it by **returning a new
(partial) value**, never by mutating.

## The factory

`defineState` takes a factory that produces the initial state for each example:

```ts
const { context, action, sensor } = defineState(() => ({ greeting: '', count: 0 }))
```

## context / action: return a partial to evolve state

A `context` or `action` handler returns a partial state object. The runtime
shallow-merges it onto the current state and threads the result to the next
step. Returning nothing leaves state unchanged.

```ts
action('I greet {string}', (state, name) => ({ greeting: `Hello, ${name}!` }))
action('I add {int}', (state, n) => ({ count: state.count + n }))
```

Handlers may still perform side effects (call the system under test); only the
*state value* is immutable.

## sensor: observe, never change

A `sensor` reads state and returns values for Vár to compare against the
Markdown. A sensor never changes state.

```ts
sensor('the greeting should be {string}', (state) => [state.greeting])
```

## Shallow merge

The merge is a **shallow** spread (`{ ...prev, ...returned }`). A returned key
*replaces* the previous top-level value wholesale — nested objects are not
deep-merged:

```ts
// state: { user: { name: 'a', age: 30 } }
action('rename', (state) => ({ user: { name: 'b' } }))
// result: { user: { name: 'b' } } — `age` is gone.
```

Keep state shallow, or return the full nested object when you update part of it.
```

- [ ] **Step 4: Build the website (Astro) to validate the docs**

Run: `cd /Users/aslakhellesoy/git/oselvar/bdd && pnpm --filter @oselvar/website build`
Expected: exit 0 (the new page is picked up; no MDX/build errors).

- [ ] **Step 5: Run the FULL gate**

Run: `cd /Users/aslakhellesoy/git/oselvar/bdd && pnpm -r build && pnpm check`
Expected: build exit 0; `pnpm check` exit 0 (lint + `pnpm typecheck` + the whole vitest suite incl. dogfood + knip + jscpd all green).

- [ ] **Step 6: Commit**

```bash
cd /Users/aslakhellesoy/git/oselvar/bdd
git add packages/website/src/content/docs/reference/
git commit -m "docs(reference): immutable return-based state; add State page

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- Contract (state arg, Partial return, void no-op, shallow merge, sensors observe) → Tasks 2 (runtime) + 3 (types). ✓
- `DeepReadonly` util + readonly state → Task 3 (var-runtime) + Task 5 (website ambient). ✓
- `deepFreeze` + runtime freeze + non-object→ReturnShapeError → Tasks 1 + 2. ✓
- ctx→state rename → Tasks 3 (types/comments), 4 (dogfood), 5 (ambient), 6 (docs). ✓
- Migration (dogfood, website, tests, docs) all at once → Tasks 4, 5, 6. ✓
- Accepted shallow-merge limitation documented → Task 6 `state.mdx` + the `tables`/example guidance. ✓
- Testing (runtime + type-level) → Task 2 (runtime tests), Task 3 (type-level), Task 5 (in-browser). ✓
- Out of scope (deep-merge, sensor-writes, arg-inference changes, lifecycle hooks) → not implemented; arg inference left untouched in Task 3. ✓

**Placeholder scan:** No TBD/TODO/"handle edge cases". Every code step shows full code; the one "read the file first" instruction (Task 6 doc-strings) is because the action body content wasn't captured here — the exact transformation (assignment → returned partial) is specified.

**Type consistency:** `DeepReadonly<C>`, `Partial<C> | void | Promise<Partial<C> | void>` (RoleFn), and `R | Promise<R>` with `state: DeepReadonly<C>` (SensorFn) match between Task 3 (var-runtime) and Task 5 (website ambient). `deepFreeze` signature (`<T>(value: T): T`) is consistent between Task 1 (definition) and Task 2 (import in execute.ts). Error message string `'a context/action step must return a partial state object or nothing'` matches between the runtime change (Task 2 Step 5) and the spec.
