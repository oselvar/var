# Sensors, Actions & Contexts — role-based API with return-based assertion

**Date:** 2026-06-28
**Status:** Approved (design)

## Summary

Replace the single `step()` authoring function with three role functions that mirror
the vocabulary in `concepts/sensors-and-actuators.md`:

- **`context(expression, handler)`** — the *quiescent state* the software rests in.
- **`action(expression, handler)`** — the *actuator*: the single stimulus.
- **`sensor(expression, handler)`** — the *read-only assertion*: observes and compares.

The headline capability: a `sensor` may **return its actual value(s)** and the pure core
compares them against what the Markdown says, failing with span-anchored diffs — exactly
as tables and doc strings already work, but now extended to **inline parameters**
(`{int}`, `{word}`, custom types). This removes the need for assertion libraries to fail
an example: *just return the actual value(s); Vár does the comparison.*

`step()` and `defineContext()` are **removed entirely** — no deprecation period. All
step-definition files and tooling are refactored to the new roles in this change.

## Motivation

Today an author fails an example by calling an assertion function inside a `step()`
handler, or by returning a table/doc string for the core to compare. The return-based
path is the one we want everywhere, because the diffs are anchored to source spans and
feed the shared run-result format consumed by the CLI, the editor, the LSP, and future
HTML overlays.

Extending return-based comparison to inline parameters hardens the contract:

```ts
// "I should have 3 cukes in my big belly"
sensor('I should have {int} cukes in my {word} belly', (ctx, count: number, name: string) => {
  return [4, name]   // failure: cell under `{int}` — expected 3, actual 4. `name` matches.
})
```

The returned tuple **is** the set of actuals; each element is compared against the value
captured from the document at that parameter's source span.

## The contract

### Roles and who may return

| Role        | Concept             | Handler return type            | On stray return                         |
|-------------|---------------------|--------------------------------|-----------------------------------------|
| `context()` | quiescent state     | `void \| Promise<void>`        | compile error **and** `ReturnShapeError` at runtime |
| `action()`  | actuator/stimulus   | `void \| Promise<void>`        | compile error **and** `ReturnShapeError` at runtime |
| `sensor()`  | read-only assertion | tuple of post-`ctx` args, *or* `void` | —                                |

Only `sensor()` participates in comparison. A `sensor` that returns `undefined` makes no
return-based assertion (it may have used assertion functions, or asserted nothing).

### What a sensor returns

**A sensor's return type is exactly the tuple of the handler's arguments after `ctx`, in
order** — the inline captured parameters first, then a trailing data table (`string[][]`)
and/or doc string (`string`) if the step has one.

```ts
sensor('the {country} cities should be:', (ctx, country: Country, table: readonly string[][]) => {
  return [country, table]   // ✓ compiles and runs
  // return [table]         // ✗ compile error AND runtime error: wrong length/types
})
```

The returned tuple is the **actual**; element *i* is compared against the **expected** —
the argument the handler received (captured from the document), anchored to that
argument's source span.

### Per-element comparison

| Element kind        | Comparison                                   | Span anchor                  |
|---------------------|----------------------------------------------|------------------------------|
| inline parameter    | `deepEqual(returned[i], capturedArg[i])`     | `PlannedStep.paramSpans[i]`  |
| trailing data table | existing `compareTable`                      | table cell spans             |
| trailing doc string | existing `compareDocString`                  | doc-string body span         |

For an inline parameter, the produced `CellDiff` carries `expected` = the matched source
text at the param span, `actual` = the stringified returned value, `ok` = the deep-equal
result. Deep equality is used (not `===`) so that echoed arguments pass and recomputed
custom-type objects compare by structure across references.

### Header-bound row tables

Header-bound tables (a paragraph step whose every column name appears in the paragraph,
iterating the table row by row) **live on `sensor()`**. Their return shape is unchanged
from today: an object keyed by column name, of which only the present columns are checked
via the existing `rowChecks` / `compareRow` path. The executor selects this mode when the
planned example is header-bound; otherwise it uses the inline-tuple contract above.

### Length / shape errors

- A `sensor` return whose length ≠ the number of post-`ctx` arguments → `ReturnShapeError`
  at runtime (and, where params are annotated, a compile error first).
- Type/shape problems within a returned table reuse the existing `ReturnShapeError` paths
  in `compareTable`.

## Architecture & changes

### Core — `packages/var`

**`registry.ts`**
- `StepHandler` and `StepRegistration`/`StepInput` gain `kind: StepKind` where
  `type StepKind = 'context' | 'action' | 'sensor'`.
- `addStep` carries `kind` through to the compiled registration.

**`plan.ts`**
- `PlannedStep` already carries `paramSpans` (1:1 with `args`) and `stepDef`. No structural
  change beyond `stepDef.kind` flowing through. The matched source text per inline param is
  derived from `paramSpans[i]` against `varDoc.source`.

**New `param-diff.ts`** (pure)
- `compareParams(returned, expected, paramSpans, sourceTexts): ReadonlyArray<CellDiff>` —
  length-checks, then per-element deep-equals, emitting a `CellDiff` per inline parameter
  (`column` holds a positional label such as `arg 1`). Reuses `CellDiff` / `CellMismatchError`
  so the run-result format stays uniform.
- `deepEqual(a, b): boolean` — a small pure structural equality (primitives via `Object.is`,
  arrays and plain objects recursively; `ReadonlyArray`/`ReadonlyMap` aware). Lives here or in
  a tiny `deep-equal.ts`.

**`execute.ts`** — `executePlan` dispatches on `step.stepDef.kind`:
- `context` / `action`: run the handler; if it returns a non-`undefined` value, throw
  `ReturnShapeError` (augmented with the step's stack frame).
- `sensor`:
  - if the example is header-bound (`ex.rowChecks` present): existing `compareRow` path.
  - else run the handler; if the return is `undefined`, assert nothing; otherwise build the
    expected list `[...step.args, ...extra]` (extra = the attached table/doc string), require
    `returned.length === expected.length`, then compare each element: inline → `compareParams`,
    table → `compareTable`, doc string → `compareDocString`. Throw `CellMismatchError` /
    `DocStringMismatchError` on failures.

**`index.ts`** — export `StepKind`, `compareParams`, `deepEqual`. Remove nothing here that
isn't `step`-specific (the core never exported `step`).

### Runtime API — `packages/var-runtime`

**`index.ts`**
- Remove `step` and `defineContext`.
- Add three role functions and the renamed factory:

```ts
type RoleFn<C = unknown> = (
  expression: string,
  handler: (ctx: C, ...args: readonly unknown[]) => void | Promise<void>,
) => void

type SensorFn<C = unknown> = <Args extends readonly unknown[]>(
  expression: string,
  handler: (ctx: C, ...args: Args) => NoInfer<Args> | Promise<NoInfer<Args>> | void | Promise<void>,
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

- `NoInfer` pins `Args` to the *annotated* parameters so the return is checked against them
  rather than becoming an inference site. Unannotated parameters are `unknown` → the return
  is only length-checked at runtime (accepted limitation; no cucumber-expression type
  parsing in this iteration).
- The internal `Entry` record gains `kind`; each role calls a shared `registerStep(expr,
  handler, kind)`. `buildRegistry` passes `kind` into `addStep`.
- The factory still owns the per-stepfile context object; it is renamed `defineState` purely
  to remove the conceptual collision with the `context()` role step (which registers a
  quiescent-state step, not the state object). The "called more than once" guard and
  `contextFactory()` wiring are unchanged.

### Codegen role inference — `var-language`, `var`, `var-cli`, website

Step-def generation must now emit a role instead of `step()`. Per project policy it must
**not** sniff Given/When/Then keywords; the guess is **structural**, from the canonical
document order *context → action → sensor* and the roles of neighboring matched steps.

**New pure `inferStepRole({ before, after }): StepKind`** (in `packages/var`)
- `before` / `after` = the role kinds of the matched steps immediately before/after the
  selection within the same example (or empty).
- Rules (tunable; the commented alternatives keep a wrong guess low-stakes):
  - no step after the selection → `sensor` (expectations come last);
  - a `sensor` exists after and no `action` yet sits between → `action`;
  - no step before the selection and a step exists after → `context`;
  - otherwise → `action`.

**`snippet-template.ts` / `snippet.ts`**
- The template becomes role-aware: it emits the chosen role active, with the other two roles
  commented out directly above (ready to uncomment), e.g.:

  ```ts
  // context('the {int} cukes', (ctx, count: number) => { /* quiescent state */ })
  action('the {int} cukes', (ctx, count: number) => {
    // Write code here that turns the phrase above into concrete actions
    throw new Error('not implemented')
  })
  // sensor('the {int} cukes', (ctx, count: number) => { return [count] })
  ```

- `generateSnippet` gains a `role?: StepKind` option (default `action` when callers can't
  supply context). Callers that have document context (`cm-generate-step`, the LSP
  generate-stepdef handler, `var-cli`) resolve neighbor roles from the plan and pass the
  `inferStepRole` result.

**`var-language/src/step-defs.ts`**
- `isStepCall` becomes a role-aware check matching `context` / `action` / `sensor` bare
  identifiers (replacing the `step` match). `StepDef` gains `kind: StepKind` so signature
  sync and tooling know which role each definition is. The `defineParameterType` discovery
  is unchanged.

**`var-cli/src/init.ts`** — scaffold emits the role-aware template (default `action`).

### Editor / website

- `var-vscode/src/extension.ts`, `website/src/lib/run-worker.ts`,
  `website/src/lib/ts-diagnostics.ts` (the ambient `step` declaration → three role
  declarations + `defineState`), and `website/src/lib/cm-generate-step.ts` migrate to the
  role API and the new snippet shape.

### Migration of step definitions

Refactor every `step()` call to the correct role, classifying by intent:
- returns a value for comparison (tables / doc strings / inline) → `sensor`;
- performs the single stimulus → `action`;
- establishes resting state → `context`.

Call sites: `docs/tutorial/steps/*.steps.ts` (6 files), `packages/cucumber/steps/*.steps.ts`,
`var-cli` test fixtures, and all adapter/core test suites that register steps
(`var-runtime`, `var-vitest`, `var-cli`, `var-lsp`, `var-language`, `website` libs).

## Testing

- **Core unit tests** (vitest):
  - `deepEqual` — primitives, nested arrays/objects, reference vs structural equality.
  - `compareParams` — pass (echoed args), single-cell failure, length mismatch.
  - `inferStepRole` — each branch of the heuristic.
  - `executePlan` kind-dispatch — `context`/`action` stray-return throws `ReturnShapeError`;
    `sensor` inline pass/fail; `sensor` length mismatch; `sensor` with table and with doc
    string; header-bound sensor still uses `compareRow`.
- **Snippet tests** — role-aware template renders chosen role + commented alternatives;
  `generateSnippet` honors `role`.
- **Dogfood** — a `.var.md` + `.steps.ts` exercising a *failing* inline sensor end-to-end,
  asserting the span-anchored diff.
- **Type gate** — `pnpm -r build` must pass; add a type-level fixture (or rely on a stepfile)
  proving `return [table]` for `(ctx, country, table)` is rejected and `return [country, table]`
  compiles. Website Astro build: `pnpm --filter @oselvar/website build`.

## Implementation phases

1. **Core contract** — `StepKind`, `compareParams`, `deepEqual`, `executePlan` dispatch,
   exports, core tests. `kind` is threaded through `addStep`/`StepRegistration`. Because the
   runtime API (`step` → roles) migrates in phase 2, phases 1 and 2 land together as one green
   increment if needed — the core's `executePlan` dispatch and the runtime's role registration
   are two halves of the same contract and the test suite only goes green once both exist.
2. **Runtime API + migration** — add `context`/`action`/`sensor` + `defineState`, remove
   `step`/`defineContext`, refactor all stepfiles and adapter tests, update editor/website.
3. **Codegen role inference** — `inferStepRole`, role-aware snippet template, `generateSnippet`
   role option, `step-defs.ts` role-aware parsing, `var-cli init`, callers.

## Out of scope

- Cucumber-expression → TypeScript type inference (typing unannotated `{int}`/`{word}` params
  from the expression string). Unannotated params stay `unknown`; only runtime length-checking
  applies to them.
- Returning a structured combo object to assert inline params *and* a table simultaneously —
  the tuple contract already covers "assert all post-`ctx` args."

## Decisions (resolved during brainstorming)

- Vocabulary: `context` / `action` / `sensor`; only `sensor` returns.
- Return type = tuple of post-`ctx` args (inline + table/doc string).
- Compile-time enforcement: pin return to *annotated* params via `NoInfer` (no expression
  parsing).
- Stray `context`/`action` return: compile error **and** runtime `ReturnShapeError`.
- Inline equality: deep-equal vs the captured argument.
- `step()` removed entirely (no deprecation); all stepdefs refactored.
- Header-bound row tables → `sensor()`.
- Codegen role: structural inference (position + neighbor roles), commented alternatives.
- Factory renamed `defineContext` → `defineState`.
