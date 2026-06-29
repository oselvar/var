# Immutable, return-based state for step definitions

Date: 2026-06-29
Status: Approved (design)

## Problem / motivation

Step definitions currently receive a single **mutable** context object (`ctx`)
that is created once per stepfile per example and shared across steps; steps
evolve state by mutating it in place (`ctx.greeting = …`). `context`/`action`
handlers are *forbidden* to return a value (the runtime throws a
`ReturnShapeError` if they do); only `sensor` handlers return — for the
return-based comparison against the Markdown.

This conflicts with the project's stated architecture (CLAUDE.md): *immutable
types, pure functions, functional core*. The BDD layer is the one place that
relies on shared mutation.

This change makes step state **immutable** and the update contract
**functional**: `context`/`action` steps *return* the new (partial) state, which
the runtime merges and threads to the next step. Because their return is
currently a forbidden/empty slot, repurposing it collides with nothing; the
`sensor` comparison contract is untouched.

## The contract

`defineState(() => initialState, paramTypes?)` is unchanged — the factory still
supplies the initial state (and Tier-2 custom parameter types).

The first handler parameter is renamed **`ctx` → `state`** and typed
**`DeepReadonly<State>`**. State is deep-frozen at runtime.

| Role | Handler shape | Return means |
|------|---------------|--------------|
| `context` | `(state, ...args) => Partial<State> \| void` | shallow-merged onto current state |
| `action`  | `(state, ...args) => Partial<State> \| void` | shallow-merged onto current state |
| `sensor`  | `(state, ...args) => <assertion value> \| void` | compared against the Markdown (unchanged) |

- The returned partial is shallow-merged: `state = Object.freeze({ ...prev, ...returned })`. The merged result is threaded to the next step.
- Returning `undefined`/`void` from `context`/`action` = no state change.
- Handlers may still perform side effects (e.g. call the system under test);
  only the *state value* is immutable and threaded.
- Sensors are **pure observers**: they read the readonly state and return
  assertion values; they never alter state.
- State threads linearly through an example's steps, per stepfile (today's
  `ctxByFile` cache becomes "current state per stepfile").

## Types (`packages/var-runtime/src/index.ts`)

- Add a `DeepReadonly<T>` utility (recursively `readonly`, descends into objects,
  arrays, maps; leaves functions/primitives alone).
- `RoleFn<C, Custom>` handler becomes
  `(state: DeepReadonly<C>, ...args: HandlerArgs<E, Custom>) => Partial<C> | void | Promise<Partial<C> | void>`.
  - Excess-property checks catch typo'd or extra keys in a returned object
    literal; a key with the wrong type errors.
  - Returning the full state also type-checks (full state ⊆ `Partial<C>`).
- `SensorFn<C, Custom>` handler becomes
  `(state: DeepReadonly<C>, ...args) => R | Promise<R>` — `R` still inferred
  freely from the body.
- The parameter name in the type signatures changes to `state`, so editor hovers
  and completions read `state`.

Net effect: a stray `state.x = …` is both a **compile error** (deeply readonly)
and a **runtime throw** (deep-frozen).

The argument-type inference from Tier 1/Tier 2 (`HandlerArgs`, `ParameterNames`,
custom registry) is unaffected — that governs the *args after* `state`.

## Runtime (`packages/var/src/execute.ts`)

- Add a pure `deepFreeze<T>(value: T): T` helper in the core (no dependencies).
  **It freezes plain objects and arrays only — it does NOT freeze or recurse
  into class instances** (any value whose prototype is not `Object.prototype`,
  `null`, or `Array`). Rationale: real step suites keep a stateful collaborator
  in state — a `Library`, a page object, a DB client, the system under test —
  and those rely on internal mutation through their methods. Freezing them would
  break every such suite. The immutability guarantee covers the test's *plain
  data* state; the *reference* to an embedded instance is still immutable (you
  cannot reassign `state.library`), but the instance's own internals stay live.
  (`Date`, `Map`, `Set`, etc. are likewise left live.)
- Initial state from `createContext(file)` is deep-frozen before first use.
- In the per-step loop, replace the current "context/action must not return"
  branch with:
  - If `returned === undefined` → no change.
  - Else if `returned` is a non-null object → `state = deepFreeze({ ...prev, ...returned })`, and write it back into `ctxByFile` so subsequent steps in that stepfile see it.
  - Else (string, number, etc.) → `ReturnShapeError('a context/action step must return a partial state object or nothing')`.
- The `sensor` branch is unchanged except that it reads the frozen state and
  never writes back.
- State remains per-(example, stepfile); each example starts from a fresh frozen
  initial state.

## Migration (all at once, hard break)

The old mutation model is removed; there is no transitional period where both
contracts work.

- **Dogfood steps** (`docs/tutorial/steps/01..06,13`): `ctx` → `state`; rewrite
  every in-place mutation to a returned partial. Example:
  `action('I greet {string}', (state, name) => ({ greeting: \`Hello, ${name}!\` }))`.
  Sensor steps only get the parameter rename.
- **Website**: the in-browser ambient in `packages/website/src/lib/ts-diagnostics.ts`
  and any playground step source.
- **Tests**: `packages/var-runtime/tests/api.test.ts`, the core
  `packages/var/tests/execute*.test.ts` handler fixtures (context/action fixtures
  that mutated now return partials), and the website diagnostics tests.
- **Docs**: fix every mutating example in the existing reference pages
  (`reference/*.mdx`), and add a new `reference/state.mdx` explaining the
  factory → readonly `state` → return-a-partial-to-evolve contract, including the
  shallow-merge sharp edge below.

## Accepted limitation: shallow merge

The merge is a shallow spread. If `state` is `{ user: { name, age } }` and a step
returns `{ user: { name: 'x' } }`, the whole `user` object is replaced and `age`
is lost. This is the cost of "spread." Guidance (documented): keep state shallow,
or return the full nested object. No deep-merge in v1.

## Testing

Runtime (vitest):
- A `context`/`action` partial return merges and threads to the next step.
- Mutating the frozen `state` throws at runtime.
- Shallow merge replaces top-level keys; unrelated keys persist.
- A `sensor` return never changes state.
- `void`/`undefined` return from `context`/`action` is a no-op.
- A non-object return from `context`/`action` throws `ReturnShapeError`.

Type-level (`pnpm typecheck`, via `expectTypeOf` / assignment assertions):
- `state` is deeply readonly — mutation (including nested) is a type error.
- `context`/`action` returns are constrained to `Partial<State>`; excess keys and
  wrong-typed keys error.
- `sensor` return contract is unchanged.

## Out of scope

- Deep-merge of returned partials (shallow only).
- Allowing sensors to update state.
- Any change to the cucumber-expression argument inference (Tier 1/Tier 2).
- Lifecycle hooks (still the adapter's native `beforeEach`/`afterEach`).

## Rejected alternatives

- **Immer-style mutable draft** (`(state) => { state.x = … }`): contradicts the
  return-the-new-state contract and hides the immutability.
- **Updater-function return** (`(state, …args) => (prev) => next`): more verbose
  with no advantage over returning a partial.
