# TS var-runner extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the run orchestration that `var-vitest` and `var-cli` currently duplicate into a new shared `@oselvar/var-runner` package (mirroring the Python `var-runner`), refactor both adapters to use it, and apply the TS-side canonical naming fixes — keeping the TypeScript reference fully green.

**Architecture:** New `@oselvar/var-runner` (depends on `@oselvar/var-core` + `@oselvar/var`) holds the shared shell: `planSpec` (parse+plan), `loadSteps` (dynamic-import step files + buildRegistry), `examplesWithRuns` (collectExamples + pair), `renderFailure`, `RecordingReporter`, plus canonical re-exports `readVarConfig`/`findSpecs` of the config/discovery that physically stays in `var-core/node`. `var-cli` and `var-vitest` are refactored onto it; `runVarSource` param order is fixed to `(path, source)` and the `StepHandler` type's first param `ctx` → `state`.

**Tech Stack:** TypeScript (ESM, `node:` imports), pnpm workspace at `typescript/`, vitest, biome, knip, jscpd.

## Global Constraints

- **Conformance stays green, byte-for-byte** — the shared `conformance/bundles/*/golden/*.json` are unchanged; the TS conformance harness must pass. No golden or `steps.ts` fixture edits.
- **Author/runtime behaviour unchanged** — `defineState` author API untouched; the dogfood `*.md` specs and `var-cli`/`var-vitest` outputs are unchanged.
- **Canonical naming (this sub-project's TS-side fixes), per the consistency design:** `planSpec(path, source, registry)` — `(path, source)` order; `runVarSource(path, source, ports)` (was `(source, path)`); the `StepHandler` type's first parameter is `state` (was `ctx`); `renderFailure(error, source, path)`. `var-runner`'s config/discovery re-exports are `readVarConfig` / `findSpecs` (canonical names for `loadVarConfig` / `findFiles`, which physically stay in `var-core/node`).
- **Config/discovery placement:** `loadVarConfig`/`findFiles` STAY in `var-core/node` (used by `var-lsp` too — do not move them; do not make `var-lsp` depend on `var-runner`). `var-runner` re-exports them under the canonical names.
- **The whole TS gate stays green each task:** from `typescript/`, `pnpm -r build` (exit 0), `pnpm check` (lint + typecheck + test + knip + jscpd), and `pnpm --filter @oselvar/website build`. Commit per task; each commit self-contained (`git add -A`; confirm `git status` clean after committing).
- The duplication being removed lives in `var-vitest/src/runtime.ts` (`runVarSource`) and `var-cli/src/run.ts` (`runRun`): both do `parse → buildRegistry → plan → executePlan/collectExamples`.

---

## File Structure

`typescript/packages/var-runner/` (new, npm `@oselvar/var-runner`):
- `package.json` (deps `@oselvar/var-core`, `@oselvar/var`), `tsconfig.json`, `vitest.config.ts`
- `src/index.ts` — public entry: re-exports the below
- `src/config.ts` — `readVarConfig`, `findSpecs` (re-export/rename of `loadVarConfig`/`findFiles` from `@oselvar/var-core/node`); `VarConfig` re-export
- `src/run.ts` — `planSpec`, `examplesWithRuns`, `RecordingReporter`
- `src/steps.ts` — `loadSteps`, `LoadedSteps`
- `src/render.ts` — `renderFailure`
- `tests/*.test.ts`

Modified: `var-cli/src/{run,lint,stepdef}.ts`, `var-vitest/src/{plugin,runtime,index}.ts`, `var-core/src/registry.ts` (StepHandler param), workspace `knip.json` (new package entry).

---

## Task 1: Scaffold `@oselvar/var-runner` + config/discovery re-exports, planSpec, renderFailure, RecordingReporter

**Files:**
- Create: `typescript/packages/var-runner/{package.json,tsconfig.json,vitest.config.ts,src/index.ts,src/config.ts,src/run.ts,src/render.ts,tests/config.test.ts,tests/run.test.ts,tests/render.test.ts}`
- Modify: `typescript/knip.json` (add the `packages/var-runner` workspace block)

**Interfaces (Produces):**
- `readVarConfig(cwd: string): Promise<VarConfig>` (= `loadVarConfig`), `findSpecs(cwd: string, include: ReadonlyArray<string>, exclude?: ReadonlyArray<string>): string[]` (= `findFiles`), `VarConfig` (re-export).
- `planSpec(path: string, source: string, registry: Registry, scannerPlugins?: ReadonlyArray<ScannerPlugin>): ExecutionPlan` (= `plan(parse(path, source, scannerPlugins ?? []), registry)`).
- `class RecordingReporter implements Reporter { readonly diagnostics: Diagnostic[]; diagnostic(d): void }`.
- `renderFailure(error: unknown, source: string, path: string): string` — markdown-anchored failure text (port of `var-cli/run.ts`'s `formatError`, generalised; align with Python's `renderFailure`).

- [ ] **Step 1: Scaffold the package.** Create `package.json` modelled on `typescript/packages/var-cli/package.json` (same `type: module`, `scripts.build`, biome/tsconfig wiring) with `name: "@oselvar/var-runner"`, `exports` `"."` → `src/index.ts`, and `dependencies: { "@oselvar/var-core": "workspace:*", "@oselvar/var": "workspace:*" }`. Create `tsconfig.json` extending the repo base (copy `var-cli/tsconfig.json`). Create `vitest.config.ts` (copy `var-cli/vitest.config.ts` or the minimal `{ test: { include: ['{src,tests}/**/*.test.ts'] } }`). Run `cd typescript && pnpm install`.

- [ ] **Step 2: Write failing tests** for `readVarConfig`/`findSpecs` (a tmp dir with a `var.config.ts` + spec/step files → asserts the globs resolve; mirror any existing `var-core` config/find-files test), `planSpec` (a source + a registry built via `createRegistry`/`addStep` → returns an `ExecutionPlan` with the expected example/step), `RecordingReporter` (records `.diagnostic`), and `renderFailure` (a `CellMismatchError` → string containing expected/actual + the `.md` line; an arbitrary `Error` → its message). Read `var-core/src/cell-diff.ts` and `failure.ts` for the exact error shapes. Run → FAIL.

- [ ] **Step 3: Implement** `config.ts`:
```ts
export { loadVarConfig as readVarConfig, findFiles as findSpecs } from '@oselvar/var-core/node'
export type { VarConfig } from '@oselvar/var-core'
```
`run.ts`:
```ts
import { type Diagnostic, type ExecutionPlan, parse, plan, type Registry, type Reporter, type ScannerPlugin } from '@oselvar/var-core'

export function planSpec(path: string, source: string, registry: Registry, scannerPlugins?: ReadonlyArray<ScannerPlugin>): ExecutionPlan {
  return plan(parse(path, source, scannerPlugins ?? []), registry)
}

export class RecordingReporter implements Reporter {
  readonly diagnostics: Diagnostic[] = []
  diagnostic(d: Diagnostic): void { this.diagnostics.push(d) }
}
```
`render.ts`: implement `renderFailure(error, source, path)` reusing the structured diff errors (`isCellMismatchError`/`CellMismatchError`, `DocStringMismatchError`, `ReturnShapeError` from `@oselvar/var-core`) to produce expected/actual + `.md` line; fall back to `error.stack`/`String(error)` for opaque throws (port `formatError` from `var-cli/src/run.ts`). `examplesWithRuns` is added in Task 2 — leave it out here. `index.ts` re-exports config + run + render symbols. Run → PASS.

- [ ] **Step 4: Add the knip workspace block** for `packages/var-runner` in `typescript/knip.json` (mirror the `packages/var-cli` block: `project: ["src/**/*.ts", "tests/**/*.ts"]`).

- [ ] **Step 5: Gate.** `cd /Users/aslakhellesoy/git/oselvar/bdd/typescript && pnpm -r build && pnpm check`. All green (var-runner builds, lints, type-checks; knip clean; existing suites + conformance unaffected). Confirm `git status` clean after commit.

- [ ] **Step 6: Commit.** `git add -A && git commit -m "feat(ts): scaffold @oselvar/var-runner (config re-exports, planSpec, renderFailure)" + trailer`.

---

## Task 2: `loadSteps` + `examplesWithRuns` in var-runner

**Files:** Create `typescript/packages/var-runner/src/steps.ts`, extend `src/run.ts` + `src/index.ts`; add `tests/steps.test.ts`, extend `tests/run.test.ts`.

**Interfaces (Produces):**
- `loadSteps(stepGlobs: ReadonlyArray<string>, cwd: string): Promise<LoadedSteps>` where `type LoadedSteps = { registry: Registry; createContext: (stepFile: string) => unknown | Promise<unknown> }`. It dynamic-`import()`s each file matching `stepGlobs` under `cwd` (via `findSpecs` + `pathToFileURL`), then `buildRegistry()` + `contextFactory()` from `@oselvar/var/registry`. (This is the cli step-loading mechanism; vitest keeps its own virtual-module loading.)
- `examplesWithRuns(plan: ExecutionPlan, createContext, reporter: Reporter): ReadonlyArray<{ example: PlannedExample; run: () => void | Promise<void> }>` — calls `collectExamples(plan, { reporter, createContext })` and zips each `QueuedExample` with the matching `PlannedExample` (same order), mirroring Python's `examplesWithRuns`.

- [ ] **Step 1: Failing tests.** `loadSteps`: a tmp dir with a `*.steps.ts` calling `defineState` + a registered step → `loadSteps(['**/*.steps.ts'], dir)` returns a `LoadedSteps` whose `registry.steps` contains the expression and whose `createContext(file)` yields the factory state; importing fresh (call `_resetBuilder` first inside the test, or rely on loadSteps resetting). `examplesWithRuns`: a planned spec → pairs `(example, run)`, a passing `run()` resolves, a failing one rejects. Run → FAIL.

- [ ] **Step 2: Implement** `steps.ts`:
```ts
import { pathToFileURL } from 'node:url'
import { buildRegistry, contextFactory, _resetBuilder } from '@oselvar/var/registry'
import type { Registry } from '@oselvar/var-core'
import { findSpecs } from './config.js'

export type LoadedSteps = { registry: Registry; createContext: (stepFile: string) => unknown | Promise<unknown> }

export async function loadSteps(stepGlobs: ReadonlyArray<string>, cwd: string): Promise<LoadedSteps> {
  _resetBuilder()
  for (const path of findSpecs(cwd, stepGlobs)) {
    await import(pathToFileURL(path).href)
  }
  return { registry: buildRegistry(), createContext: contextFactory() }
}
```
(Confirm `_resetBuilder` is exported from `@oselvar/var/registry` — it is; the cli currently relies on a fresh process, but resetting makes `loadSteps` self-contained and matches Python. Verify no existing caller depends on NOT resetting.)
Add `examplesWithRuns` to `run.ts` (collectExamples + zip with `plan.examples`). Extend `index.ts`. Run → PASS.

- [ ] **Step 3: Gate + commit.** `pnpm -r build && pnpm check` green; `git status` clean. Commit `feat(ts): var-runner loadSteps + examplesWithRuns`.

---

## Task 3: Refactor `var-cli` onto var-runner

**Files:** Modify `typescript/packages/var-cli/src/run.ts` (and `lint.ts`, `stepdef.ts` for the config/discovery re-export names); keep all `var-cli` tests green.

**Interfaces (Consumes):** `readVarConfig`, `findSpecs`, `loadSteps`, `planSpec`, `examplesWithRuns`, `renderFailure` from `@oselvar/var-runner`.

- [ ] **Step 1: Refactor `run.ts`.** Replace the inline sequence with var-runner calls, preserving the EXACT stdout/stderr output and exit-code logic (the cli tests pin this):
  - `const cfg = await readVarConfig(opts.cwd)` (was `loadVarConfig`).
  - spec globs unchanged; `const varFiles = findSpecs(opts.cwd, varGlobs.include, varGlobs.exclude)`.
  - `const { registry, createContext } = await loadSteps(cfg.steps, opts.cwd)` (replaces the manual import loop + `buildRegistry()` + `contextFactory()`).
  - per spec: `const execution = planSpec(path, source, registry, cfg.scannerPlugins)`; collect via `examplesWithRuns(execution, createContext, reporter)` (the existing inline reporter that writes stderr stays — or use it directly); iterate `{ example, run }`, printing `example.name` exactly as before. Use `renderFailure(err, source, path)` in place of `formatError(err)` ONLY IF it produces identical output for the cli's cases; if the cli's `formatError` (raw stack) differs from `renderFailure`'s structured text, KEEP `formatError` in the cli (do not change observable output) and note it — output parity beats sharing here.
  - `lint.ts`/`stepdef.ts`: switch their `loadVarConfig`/`findFiles` imports to `readVarConfig`/`findSpecs` from `@oselvar/var-runner` (behaviour identical — they're re-exports). Add `@oselvar/var-runner` to `var-cli/package.json` deps; `pnpm install`.

- [ ] **Step 2: Gate.** `cd typescript && pnpm check` — the `var-cli` suites (`run.test.ts`, `lint.test.ts`, `stepdef.test.ts`, `e2e.test.ts`) pass with byte-identical CLI output; jscpd shows the duplication removed; `pnpm -r build` green. `git status` clean.

- [ ] **Step 3: Commit.** `refactor(ts): var-cli uses @oselvar/var-runner`.

---

## Task 4: Refactor `var-vitest` onto var-runner + fix `runVarSource(path, source)`

**Files:** Modify `typescript/packages/var-vitest/src/runtime.ts`, `plugin.ts`, `index.ts`; update `var-vitest/tests/runtime.test.ts` + `plugin.test.ts`; add `@oselvar/var-runner` dep.

- [ ] **Step 1: `runtime.ts`.** Change `runVarSource(source, path, ports)` → `runVarSource(path, source, ports)` (canonical `(path, source)` order) and use `planSpec`:
```ts
import { planSpec } from '@oselvar/var-runner'
import { buildRegistry, contextFactory } from '@oselvar/var/registry'
import { executePlan, type Reporter, type ScannerPlugin, type TestSink, toFailure } from '@oselvar/var-core'
export { toFailure }
export type RunPorts = { readonly sink: TestSink; readonly reporter: Reporter; readonly scannerPlugins?: ReadonlyArray<ScannerPlugin> }
export function runVarSource(path: string, source: string, ports: RunPorts): void {
  const registry = buildRegistry()
  const p = planSpec(path, source, registry, ports.scannerPlugins)
  executePlan(p, { ...ports, createContext: contextFactory() })
}
```
(vitest KEEPS `buildRegistry()`/`contextFactory()` — its steps are imported by the generated virtual module, not by `loadSteps`.)

- [ ] **Step 2: Fix the call sites of `runVarSource`.** `plugin.ts`'s `generateVirtualModule` emits a `runVarSource(...)` call into each virtual test module — update the GENERATED argument order to `(varPath, source, ...)`. Update `runtime.test.ts` (and any `plugin.test.ts` snapshot of the generated module) to the new order. Switch `plugin.ts`'s `loadVarConfig`/`findFiles` imports to `readVarConfig`/`findSpecs` from `@oselvar/var-runner` (re-exports — identical behaviour). Add `@oselvar/var-runner` to `var-vitest/package.json` deps; `pnpm install`.

- [ ] **Step 3: Gate.** `cd typescript && pnpm check` (var-vitest suites + the dogfood `*.md` specs that run under vitest pass; the generated-module order change is reflected in tests); `pnpm -r build`; **`pnpm --filter @oselvar/website build`** (the website uses the editor/runtime path — confirm it still builds); the **conformance** suite green. `git status` clean.

- [ ] **Step 4: Commit.** `refactor(ts): var-vitest uses var-runner; runVarSource(path, source)`.

---

## Task 5: `StepHandler` first parameter `ctx` → `state`

**Files:** Modify `typescript/packages/var-core/src/registry.ts` (the `StepHandler` type), and any place whose signature echoes it for documentation consistency.

- [ ] **Step 1: Rename the type parameter.** In `var-core/src/registry.ts`, change `export type StepHandler = (ctx: unknown, ...args: ReadonlyArray<unknown>) => unknown | Promise<unknown>` to use `state` instead of `ctx`. (Parameter names in a TS function-type are documentation only — no runtime/behaviour change — but this aligns the reference with the author-facing `state` naming and Python.) Grep `var-core`/`var` for other `ctx` parameter names in handler-shaped signatures and align them to `state` where they describe the immutable step state (do NOT rename unrelated `ctx`/context variables).

- [ ] **Step 2: Gate.** `cd typescript && pnpm check` + `pnpm -r build` green (type-name-only change; conformance unaffected). `git status` clean.

- [ ] **Step 3: Commit.** `refactor(ts): StepHandler state param (align with author API + Python)`.

---

## Self-Review

**Spec coverage (against the consistency design):**
- TS gains `@oselvar/var-runner` with the shared run orchestration → Tasks 1–2. ✓
- `var-vitest` + `var-cli` refactored onto it (de-dup) → Tasks 3–4. ✓
- Config/discovery stays in `var-core/node`, re-exported as `readVarConfig`/`findSpecs` (per the user's decision) → Task 1. ✓ (`var-lsp` untouched.)
- `planSpec(path, source, registry)` → Task 1; `runVarSource(path, source, ports)` → Task 4; `StepHandler` `state` → Task 5; `renderFailure(error, source, path)` → Task 1. ✓
- Conformance + website + the full TS gate green each task → gates in every task. ✓
- No new features; behaviour/output unchanged (esp. cli output parity) → Task 3 Step 1 guards output parity. ✓

**Placeholder scan:** the var-runner module contents are given as real code; the refactor tasks cite the exact files + the output-parity guard. The one judgement call (cli `formatError` vs shared `renderFailure`) is explicitly resolved in favour of output parity. No "TBD".

**Type/name consistency:** `readVarConfig`/`findSpecs`/`planSpec`/`loadSteps`/`LoadedSteps`/`examplesWithRuns`/`RecordingReporter`/`renderFailure` are defined in Tasks 1–2 and consumed identically in Tasks 3–4; `runVarSource(path, source, ports)` defined in Task 4 with its generated call site updated in the same task; these match the Python `var-runner` names (`plan_spec`/`load_steps`/`examples_with_runs`/`render_failure`) modulo case.

**Known risks:** (1) updating the `generateVirtualModule` output + its test snapshots for the `runVarSource` arg-order flip (Task 4) — a missed call site silently swaps path/source; the dogfood specs + conformance are the backstop. (2) `loadSteps` adding `_resetBuilder()` — confirm no cli flow relied on cross-invocation accumulation (it doesn't; each `runRun` is a fresh process). (3) jscpd/knip on the new package — Task 1 adds the knip block; jscpd should improve (less duplication).
