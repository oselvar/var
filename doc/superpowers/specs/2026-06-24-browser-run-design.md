# Run a Vár spec in the browser

**Date:** 2026-06-24
**Status:** Approved (design), pending implementation plan

## Context

The browser playground can already edit a `.var.md` spec + its `.steps.ts` step
definitions and highlight matches via the in-browser LSP. This adds **execution**:
actually running the spec's examples against the step definitions, in the
browser, and showing pass/fail inline in the spec editor.

Execution is already runtime-agnostic in the core: `executePlan(plan, { sink,
reporter, createContext })` runs the real step handlers; `@oselvar/var-runtime`
provides the authoring API (`step`/`defineContext`) and `buildRegistry()` (a
`Registry` with live handlers) + `contextFactory()`. Both depend only on
`@oselvar/var` and are browser-safe. So running needs **no vitest and no new
runtime deps**.

VSCode Run ▶ (a button per example in the extension) is a later, separate
effort that will reuse the same core runner; out of scope here.

## Decisions

- **Assertions are `if (…) throw new Error(…)`** — no `expect`/assertion library.
  `executePlan` catches the throw and augments the error with the `.var.md`
  `line:col` location.
- **Dedicated run worker**, separate from the LSP worker, spawned lazily. It
  runs *user code* (which may loop/throw), so the main thread enforces a timeout
  and `terminate()`s it on a hang without affecting the LSP/highlighting worker.
- **Results render inline** in the spec (markdown) editor: example line
  backgrounds (green/pink), error gutter markers (click → stack trace), Run
  controls. The `.steps.ts` editor has no run UI.
- **Two phases:** Phase 1 = "Run all" (top panel) + results rendering. Phase 2 =
  per-example ▶ in the gutter to run one example.

## Architecture

```
main thread (markdown editor)                 run worker (dedicated, lazy)
┌────────────────────────────────┐            ┌──────────────────────────────────┐
│ Run ▶ (top panel) / gutter ▶    │  postMessage│ _resetBuilder()                  │
│  → gather { varSource,          │───────────►│ for each stepFile: transpile(TS)  │
│     stepFiles:[{path,source}],  │            │   + eval with require-shim →      │
│     exampleIndex? }             │            │   registers step()s in var-runtime │
│                                 │            │ buildRegistry()                    │
│ render results:                 │◄───────────│ parse(varSource)+plan(varDoc,reg) │
│  line bg (green/pink),          │  results   │ executePlan(plan|filtered,{sink}) │
│  gutter error markers (→stack)  │            │ collect per-example pass/fail+err │
└────────────────────────────────┘            └──────────────────────────────────┘
   timeout → worker.terminate() (respawn next run)
```

## Components

### Run worker — `packages/website/src/lib/run-worker.ts` (new)

- Receives `{ varSource: string; stepFiles: ReadonlyArray<{ path: string; source: string }>; exampleIndex?: number }`.
- `_resetBuilder()` (from `@oselvar/var-runtime`) to clear prior registrations.
- For each step file: `ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } })`, then evaluate via `new Function('require', 'exports', 'module', js)` with a `require` shim resolving `@oselvar/var-runtime` (and aliasing `@oselvar/var-vitest` → it) and `@oselvar/var` to the real bundled modules; unknown specifiers throw a clear `Error`.
- `const registry = buildRegistry()`, `const varDoc = parse('/spec.var.md', varSource, [])`, `const plan = plan(varDoc, registry)`.
- Run via `executePlan(exampleIndex == null ? plan : { ...plan, examples: [plan.examples[exampleIndex]] }, { sink, reporter, createContext: contextFactory() })` with a **collecting sink** (below).
- Posts back `RunResults`.

### Collecting sink → result shape (shared type)

```ts
type ExampleResult = {
  readonly name: string
  readonly status: 'passed' | 'failed'
  readonly lines: ReadonlyArray<number>          // 1-based source lines of this example's steps (to color)
  readonly failure?: { readonly line: number; readonly message: string; readonly stack: string }
}
type RunResults = { readonly examples: ReadonlyArray<ExampleResult> }
```
- `lines` come from each `PlannedExample`'s step `matchSpan.startLine`.
- The sink wraps each example's `run()`: on success → `passed`; on throw → `failed`, with `message`/`stack` from the (augmented) error and `line` parsed from the injected `.var.md:line:col` stack frame (the failing step).
- `executePlan` calls `sink.example(name, run)` where `run` is async; the sink pushes each `run()` promise and the worker `await`s them all before posting results.

### Markdown-editor run UI — `packages/website/src/lib/cm-run.ts` (new)

A CodeMirror extension added **only to markdown editors**:
- **Top panel** (`showPanel`): a "Run all" button.
- **Results state**: a `StateField<RunResults | null>` set via a `StateEffect` when results arrive; cleared on `docChanged` (results go stale).
- **Line backgrounds**: a `StateField<DecorationSet>` derived from results — `Decoration.line({ class: 'cm-run-pass' })` / `'cm-run-fail'` on each example's `lines`; mapped through edits / cleared with results.
- **Error gutter**: a `gutter` with a `GutterMarker` on each `failure.line`; the marker DOM is clickable → opens a tooltip/popover showing `failure.stack`.
- **Phase 2** — **per-example run gutter**: a second gutter (or shared) showing a ▶ `GutterMarker` on each example's first line; clicking runs only that example (`exampleIndex`). Examples and their first lines come from `parse`/`plan` on the current doc (computed on the main thread or requested from the worker).
- **Theme**: `.cm-run-pass` translucent green; `.cm-run-fail` translucent accent-pink; markers in the palette.

The extension calls a small **run client** that owns the lazy worker + timeout and returns `RunResults`.

### Run client — `packages/website/src/lib/run-client.ts` (new)

`runSpec(input): Promise<RunResults>` — lazily spawns the run worker (`new Worker(new URL('./run-worker.ts', import.meta.url), { type: 'module' })`), posts the input, resolves on the result message, rejects + `terminate()`s (and nulls) the worker on a timeout (e.g. 5 s). Next call respawns.

### Seed — `packages/website/src/lib/seed-files.ts` (modified)

`SEED_FILES['/01-hello.steps.ts']` rewritten to import from `@oselvar/var-runtime` and use `if/throw`, e.g.:
```ts
import { defineContext } from '@oselvar/var-runtime'
const { step } = defineContext(() => ({ greeting: '' }))
step('I greet {string}', (ctx, name) => { ctx.greeting = `Hello, ${name}!` })
step('the greeting should be {string}', (ctx, expected) => {
  if (ctx.greeting !== expected) throw new Error(`expected "${expected}" but was "${ctx.greeting}"`)
})
```
(LSP highlighting is unaffected — `discoverStepDefs` parses `step()` calls regardless of import source.)

## Testing

- **Node unit test** of the pure run pipeline (no browser, no transpile): build a
  registry directly via `@oselvar/var-runtime` `step()`s, `parse` a small spec,
  `plan`, run through the **collecting sink**, and assert: an all-passing spec →
  every example `passed`; a handler that throws → that example `failed` with the
  message and the correct 1-based `.var.md` line; `lines` cover the example's
  steps. (This is the logic that matters; it lives in a small shared module the
  worker also calls so it is testable without a worker.)
- **Manual browser checks**: Run all colors examples green/pink; a failing step
  shows a clickable gutter marker → stack trace; editing clears results;
  (Phase 2) per-example ▶ runs one example.

## Build order (outside-in, small steps)

1. **Run-all button + stubbed results** — markdown-editor top panel with "Run
   all"; on click, render a hardcoded `RunResults` as line backgrounds + an error
   gutter marker + stack tooltip. Proves the in-editor rendering path. (Visible.)
2. **Pure run pipeline + node unit test** — the collecting sink + result mapping
   (registry → plan → executePlan → `RunResults`) as a shared, tested module.
3. **Run worker + run client** — transpile/eval the step files, run the pipeline,
   timeout-guarded client; wire "Run all" to real results.
4. **Seed rewrite** to `@oselvar/var-runtime` + `if/throw` (so the demo runs).
5. **Phase 2: per-example gutter ▶** — run a single example by index.

## Out of scope

- VSCode Run ▶ (later; reuses the same runner).
- Persisting/clearing results across reloads.
- A lighter transpiler (sucrase/tsgo) — `typescript` reused for now.
- Editing/persistence changes; `<FileEditor>`/`step-highlight` untouched.
