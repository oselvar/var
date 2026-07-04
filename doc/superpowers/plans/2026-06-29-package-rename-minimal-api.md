# Package rename + minimal public API — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename `var-runtime`→`@oselvar/var` (registration shell, author API) and `var`→`@oselvar/var-core` (pure core), shrink the public surface to `defineState` alone, remove standalone `defineParameterType`, and kill the `var-vitest` re-export — so step authors get one intuitive import and we keep maximum freedom to refactor internals.

**Architecture:** Two packages. `@oselvar/var` is the stateful registration shell (module-scope step registry + `defineState`); its adapter-only glue moves to a `./registry` subpath. `@oselvar/var-core` is the pure functional core, imported by adapters only. Custom parameter types are declared via `defineState`'s `paramTypes` argument; the `var-language` scanner is re-targeted to discover them there.

**Tech Stack:** pnpm workspace · TypeScript (ESM, `verbatimModuleSyntax`, `bundler` resolution) · vitest · biome · knip · jscpd.

## Global Constraints

- Node ≥ 22, ESM-only, `node:` imports.
- Immutable types; pure functional core (`@oselvar/var-core` must contain **no** module-scope mutable state, globals, or side effects).
- `verbatimModuleSyntax` is on — type-only imports/exports must use `import type` / `export type`.
- Build gate: `pnpm -r build` type-checks each package's `src/`; `pnpm typecheck` (root `tsconfig.tests.json`) type-checks every non-website package's `tests/`. A green vitest run does **not** mean `tsc` passes — run both.
- Full gate: `pnpm check` = `pnpm lint && pnpm typecheck && pnpm test && pnpm knip && pnpm jscpd`.
- Tests run with `NODE_OPTIONS="--import tsx" vitest run` from repo root (the `test` script already sets this).
- Trunk-based: every task ends on a green, self-contained commit.
- **Import-specifier rename safety:** `@oselvar/var` is a string prefix of `@oselvar/var-runtime`, `@oselvar/var-core`, `@oselvar/var-language`, etc. Only ever rewrite `@oselvar/var` when the next char is `'`, `"`, or `/` (regex group `(['"/])`). Never use a bare `s|@oselvar/var|...|`.

---

### Task 1: Re-target custom-parameter-type discovery in `var-language` to `defineState`'s `paramTypes`

Re-point the scanner so it discovers custom parameter types from `defineState(factory, { name: { regexp, transformer } })` instead of bare `defineParameterType({ name, regexp })`. The `ParameterTypeDef` return shape and `buildWorkspaceIndex` are unchanged. This task leaves the standalone `defineParameterType` function in place (removed in Task 2) and keeps all package names unchanged — so the tree stays green.

**Files:**
- Modify: `packages/var-language/src/step-defs.ts`
- Modify: `packages/var-language/tests/step-defs.test.ts`
- Modify: `packages/var-lsp/tests/handlers.test.ts` (4 fixtures)
- Modify: `docs/tutorial/steps/02-airport.steps.ts` (comment only)

**Interfaces:**
- Produces (unchanged signature): `discoverParameterTypes(file: string, source: string): ReadonlyArray<ParameterTypeDef>` where `ParameterTypeDef = { file: string; name: string; regexp: string; callRange: Range }`. Behavior change only: it now reads `defineState`'s second argument.

- [ ] **Step 1: Rewrite the scanner tests to the `defineState` form (failing)**

In `packages/var-language/tests/step-defs.test.ts`, replace the three `defineParameterType` tests (lines 53–77) with these, which assert discovery from `defineState`'s `paramTypes`:

```ts
test('discovers a paramType from defineState with a regexp literal', () => {
  const source = `import { defineState } from '@oselvar/var'
const { action } = defineState(() => ({}), {
  airport: { regexp: /[A-Z]{3}/, transformer: (r) => r },
})
`
  const defs = discoverParameterTypes('p.ts', source)
  expect(defs).toHaveLength(1)
  expect(defs[0]?.name).toBe('airport')
  expect(defs[0]?.regexp).toBe('[A-Z]{3}')
})

test('discovers a paramType from defineState with a string-literal regexp', () => {
  const source = `const { action } = defineState(() => ({}), {
  airport: { regexp: '[A-Z]{3}' },
})
`
  const defs = discoverParameterTypes('p.ts', source)
  expect(defs).toHaveLength(1)
  expect(defs[0]?.name).toBe('airport')
  expect(defs[0]?.regexp).toBe('[A-Z]{3}')
})

test('discovers multiple paramTypes from one defineState call', () => {
  const source = `const x = defineState(() => ({}), {
  airport: { regexp: /[A-Z]{3}/ },
  digit: { regexp: '[0-9]' },
})
`
  const names = discoverParameterTypes('p.ts', source).map((d) => d.name)
  expect(names).toEqual(['airport', 'digit'])
})

test('skips paramType entries with a non-literal regexp', () => {
  const source = `const x = defineState(() => ({}), {
  airport: { regexp: someRe },
})
`
  expect(discoverParameterTypes('p.ts', source)).toHaveLength(0)
})

test('returns empty when defineState has no paramTypes argument', () => {
  const source = `const { action } = defineState(() => ({ n: 0 }))
`
  expect(discoverParameterTypes('p.ts', source)).toEqual([])
})
```

- [ ] **Step 2: Run the scanner tests to verify they fail**

Run: `NODE_OPTIONS="--import tsx" npx vitest run packages/var-language/tests/step-defs.test.ts`
Expected: the new tests FAIL (old scanner still looks for `defineParameterType`, returns `[]` for `defineState`).

- [ ] **Step 3: Re-target the scanner implementation**

In `packages/var-language/src/step-defs.ts`, replace `visitForParameterTypes` and `isDefineParameterTypeCall` (lines 58–87) with a `defineState`-aware walker. Keep `readStringProperty` / `readRegexpProperty` (reused), and keep the `discoverParameterTypes` entry point (lines 48–56) as-is:

```ts
function visitForParameterTypes(
  sf: ts.SourceFile,
  node: ts.Node,
  out: ParameterTypeDef[],
  file: string,
): void {
  if (ts.isCallExpression(node) && isDefineStateCall(node) && node.arguments.length >= 2) {
    const arg1 = node.arguments[1]
    if (arg1 && ts.isObjectLiteralExpression(arg1)) {
      for (const prop of arg1.properties) {
        if (!ts.isPropertyAssignment(prop)) continue
        const name = ts.isIdentifier(prop.name)
          ? prop.name.text
          : ts.isStringLiteral(prop.name)
            ? prop.name.text
            : undefined
        if (name === undefined) continue
        const def = prop.initializer
        if (!ts.isObjectLiteralExpression(def)) continue
        const regexp = readRegexpProperty(def, 'regexp')
        if (regexp !== undefined) {
          out.push({ file, name, regexp, callRange: rangeOf(sf, node) })
        }
      }
    }
  }
  ts.forEachChild(node, (child) => visitForParameterTypes(sf, child, out, file))
}

function isDefineStateCall(node: ts.CallExpression): boolean {
  // Match a bare `defineState(...)` call, regardless of import shape. Shadowed
  // locals are an accepted false-positive risk, same as the role-call matcher.
  return ts.isIdentifier(node.expression) && node.expression.text === 'defineState'
}
```

- [ ] **Step 4: Run the scanner tests to verify they pass**

Run: `NODE_OPTIONS="--import tsx" npx vitest run packages/var-language/tests/step-defs.test.ts`
Expected: PASS.

- [ ] **Step 5: Update the `var-lsp` fixtures to the `defineState` form**

In `packages/var-lsp/tests/handlers.test.ts`, the four fixtures (around lines 265, 355, 384, 522) write a step file beginning with:

```
defineParameterType({ name: 'airport', regexp: /[A-Z]{3}/ })
```

Replace each such line with:

```
const { action } = defineState(() => ({}), { airport: { regexp: /[A-Z]{3}/ } })
```

(Leave the rest of each fixture — the `action(...)` / `var.md` content — unchanged.)

- [ ] **Step 6: Update the tutorial comment**

In `docs/tutorial/steps/02-airport.steps.ts`, the comment on lines 3–5 references "a separate defineParameterType call". Reword so it no longer implies that call exists:

```ts
// The custom `{airport}` parameter type is declared in defineState's second
// argument, so Vár can infer the captured args: the transformer returns string,
// so `from`/`to` are typed string with no annotation.
```

- [ ] **Step 7: Run the full gate**

Run: `pnpm -r build && pnpm typecheck && pnpm test`
Expected: all green.

- [ ] **Step 8: Commit**

```bash
git add packages/var-language/src/step-defs.ts packages/var-language/tests/step-defs.test.ts packages/var-lsp/tests/handlers.test.ts docs/tutorial/steps/02-airport.steps.ts
git commit -m "feat(var-language): discover custom param types from defineState paramTypes

Re-target the scanner from bare defineParameterType() calls to
defineState's paramTypes argument, ahead of removing the standalone
defineParameterType authoring API.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Remove the standalone `defineParameterType` authoring API

Now that nothing discovers or relies on the bare call, delete the function and every reference to it as an author-facing export. The pure-core `defineParameterType(registry, …)` transform in `var-core/src/registry.ts` (used by `buildRegistry`) **stays** — do not touch it.

**Files:**
- Modify: `packages/var-runtime/src/index.ts` (remove `export function defineParameterType`)
- Modify: `packages/var-vitest/src/api.ts` (drop from re-export list)
- Modify: `packages/var-vitest/src/index.ts` (drop from re-export list)
- Modify: `packages/website/src/lib/ts-diagnostics.ts` (drop ambient `defineParameterType`)
- Modify: `packages/var-runtime/tests/api.test.ts` and `packages/var-vitest/tests/api.test.ts` (remove the `defineParameterType` test)

- [ ] **Step 1: Remove the function from the registration shell**

In `packages/var-runtime/src/index.ts`, delete the entire `export function defineParameterType<T>(opts: {...}): void { customTypes.push(opts as CustomTypeDef) }` block. Custom types are still collected from `defineState`'s `paramTypes` loop, so `customTypes` and `buildRegistry` are unaffected. Leave the aliased core import `defineParameterType as defineParameterTypeCore` and its use in `buildRegistry` untouched.

- [ ] **Step 2: Drop it from the `var-vitest` re-exports**

In `packages/var-vitest/src/api.ts`, remove `defineParameterType,` from the `export { … } from '@oselvar/var-runtime'` list.
In `packages/var-vitest/src/index.ts`, remove `defineParameterType` from `export { action, context, defineParameterType, defineState, sensor } from './api.js'` (leaving `export { action, context, defineState, sensor } from './api.js'`).

- [ ] **Step 3: Drop it from the website ambient**

In `packages/website/src/lib/ts-diagnostics.ts`, delete the `export function defineParameterType<T>(opts: {...}): void` block inside the `AMBIENT` template string (lines 63–67), so the ambient module no longer declares it.

- [ ] **Step 4: Remove the now-dead tests**

In `packages/var-runtime/tests/api.test.ts`, delete the `test('defineParameterType() registers a custom type for snippet inference', …)` test and remove `defineParameterType` from the import list at the top.
Do the same in `packages/var-vitest/tests/api.test.ts`.

- [ ] **Step 5: Verify no references remain**

Run: `grep -rn "\bdefineParameterType\b" packages docs --include='*.ts' | grep -v node_modules | grep -v '/dist/'`
Expected: only matches inside `@oselvar/var-core` (`packages/var/src/registry.ts`, `packages/var/src/index.ts`, `packages/var/tests/*`) and `packages/var-language/src/index-workspace.ts:68` (the core transform call) — i.e. the pure-core `defineParameterType(registry, …)`. No author-facing/standalone references.

- [ ] **Step 6: Run the gate**

Run: `pnpm -r build && pnpm typecheck && pnpm test`
Expected: green.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor: remove standalone defineParameterType authoring API

Custom parameter types are declared via defineState's paramTypes argument
only. The pure-core defineParameterType(registry, …) transform is unchanged.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Rename the core `@oselvar/var` → `@oselvar/var-core`

Pure mechanical rename of the core package: directory, package name, the `./node` subpath stays, and every importer/config that references it. The registration shell keeps its `@oselvar/var-runtime` name and now imports `@oselvar/var-core` — a coherent green intermediate state.

**Files:**
- Rename: `packages/var` → `packages/var-core` (`git mv`)
- Modify: `packages/var-core/package.json` (`name`)
- Modify: every `package.json` with a `"@oselvar/var"` dependency: `var-runtime`, `var-vitest`, `var-cli`, `var-lsp`, `var-language`, `cucumber`, `website`
- Modify: all `*.ts` importers of `@oselvar/var` and `@oselvar/var/node` (see import map below)
- Modify: `tsconfig.tests.json` (`packages/var/tests` → `packages/var-core/tests`)
- Modify: `knip.json` (`packages/var` workspace key → `packages/var-core`)

- [ ] **Step 1: Move the directory**

```bash
git mv packages/var packages/var-core
```

- [ ] **Step 2: Rename the package**

In `packages/var-core/package.json`, change `"name": "@oselvar/var"` to `"name": "@oselvar/var-core"`. Leave `exports` (`.` and `./node`), `publishConfig`, and everything else unchanged.

- [ ] **Step 3: Rewrite every import specifier (prefix-safe)**

Run from repo root (BSD sed — macOS). This rewrites `@oselvar/var` only when followed by `'`, `"`, or `/`, so `@oselvar/var-runtime`/`@oselvar/var-language` are untouched. It covers `@oselvar/var'`, `@oselvar/var"`, and `@oselvar/var/node`:

```bash
grep -rlE "@oselvar/var(['\"/])" packages docs --include='*.ts' --include='package.json' \
  | grep -v node_modules | grep -v '/dist/' \
  | xargs sed -i '' -E "s|@oselvar/var(['\"/])|@oselvar/var-core\1|g"
```

- [ ] **Step 4: Fix the website browser-runner shim's `@oselvar/var` case**

The sed in Step 3 also rewrote the runtime-resolution string in `packages/website/src/lib/run-worker.ts`. Confirm line 21 now reads `if (spec === '@oselvar/var-core') return varCore` and line 1 reads `import * as varCore from '@oselvar/var-core'`. (The `@oselvar/var-runtime` cases on lines 3/20/23 are untouched and handled in Task 5.)

- [ ] **Step 5: Update `tsconfig.tests.json`**

Change the include entry `"packages/var/tests"` to `"packages/var-core/tests"`.

- [ ] **Step 6: Update `knip.json`**

Change the workspace key `"packages/var"` to `"packages/var-core"` (keep its `{ "project": ["src/**/*.ts", "tests/**/*.ts"] }` value).

- [ ] **Step 7: Reinstall to relink the workspace**

Run: `pnpm install`
Expected: lockfile updates the `@oselvar/var-core` link; no errors.

- [ ] **Step 8: Verify and run the gate**

Run: `grep -rnE "@oselvar/var(['\"/])" packages docs --include='*.ts' --include='package.json' | grep -v node_modules | grep -v '/dist/'`
Expected: **no matches** (every core reference is now `@oselvar/var-core`).

Run: `pnpm -r build && pnpm typecheck && pnpm test && pnpm knip`
Expected: green.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "refactor: rename @oselvar/var (core) to @oselvar/var-core

Pure mechanical rename; the registration shell stays @oselvar/var-runtime
and now imports @oselvar/var-core.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Split the registration shell's adapter glue onto a `./registry` subpath

Inside the (still-named) `@oselvar/var-runtime`, move `buildRegistry`, `contextFactory`, `_resetBuilder` out of `index.ts` into a new `registry.ts`, expose them via a `./registry` export, and re-point glue consumers. After this, `index.ts` exports only the authoring API. Doing this before the rename keeps the rename (Task 5) a pure specifier swap.

**Files:**
- Create: `packages/var-runtime/src/registry.ts`
- Modify: `packages/var-runtime/src/index.ts`
- Modify: `packages/var-runtime/package.json` (add `./registry` to `exports` + `publishConfig.exports`)
- Modify: glue consumers: `packages/var-cli/src/run.ts`, `packages/var-vitest/src/runtime.ts`, `packages/website/src/lib/run-spec.ts`, `packages/website/src/lib/run-spec.test.ts`, `packages/website/src/lib/run-worker.ts`
- Modify: `packages/var-runtime/tests/api.test.ts`, `packages/var-runtime/tests/conformance.test.ts`

**Interfaces:**
- Produces: `@oselvar/var-runtime/registry` exporting `buildRegistry(): Registry`, `contextFactory(): (stepFile: string) => unknown | Promise<unknown>`, `_resetBuilder(): void`.
- Produces: `@oselvar/var-runtime` (`.`) exporting `defineState` plus the (still-present, removed in Task 5) standalone `context`/`action`/`sensor` and types `RoleFn`/`SensorFn`.

- [ ] **Step 1: Split the module**

The registry shell's module-scope state (`steps`, `contextFactoriesByFile`, `customTypes`) and the functions that touch it (`registerStep`, `defineState`, `contextFactory`, `buildRegistry`, `_resetBuilder`, `callerLocation`) all live in one file today and **must stay in one module** — the glue reads the same globals `defineState` writes. So do **not** physically separate the state. Instead, keep all implementation in `index.ts` and make `registry.ts` a thin re-export of the three glue symbols:

Create `packages/var-runtime/src/registry.ts`:

```ts
// Adapter-only glue: build the immutable Registry from the module-scope
// registrations, supply per-stepfile context factories, and reset between runs.
// Kept on a separate entry point so step authors importing the package root see
// only the authoring API.
export { _resetBuilder, buildRegistry, contextFactory } from './index.js'
```

Leave `index.ts`'s implementations in place for now (Task 5 trims its *public* surface). This keeps the single-module invariant while giving adapters a dedicated import path.

- [ ] **Step 2: Add the `./registry` export**

In `packages/var-runtime/package.json`, add to `exports` (dev) and `publishConfig.exports` (published) a `./registry` entry mirroring the `.` shape:

```jsonc
// in "exports":
"./registry": { "types": "./src/registry.ts", "import": "./src/registry.ts" }
// in "publishConfig.exports":
"./registry": { "types": "./dist/registry.d.ts", "import": "./dist/registry.js" }
```

- [ ] **Step 3: Re-point glue consumers**

Change the glue imports from `@oselvar/var-runtime` to `@oselvar/var-runtime/registry` in:
- `packages/var-cli/src/run.ts:6` — `import { buildRegistry, contextFactory } from '@oselvar/var-runtime/registry'`
- `packages/var-vitest/src/runtime.ts:10` — `import { buildRegistry, contextFactory } from '@oselvar/var-runtime/registry'`
- `packages/website/src/lib/run-spec.ts:11` — `import { buildRegistry, contextFactory } from '@oselvar/var-runtime/registry'`
- `packages/website/src/lib/run-spec.test.ts:1` — split: keep `import { defineState } from '@oselvar/var-runtime'` and add `import { _resetBuilder } from '@oselvar/var-runtime/registry'`

In `packages/var-runtime/tests/api.test.ts` and `tests/conformance.test.ts`, change the glue imports from `'../src/index.js'` to `'../src/registry.js'` (keep `defineState`/`action`/etc. importing from `'../src/index.js'`).

- [ ] **Step 4: Re-point the website worker's `_resetBuilder`**

In `packages/website/src/lib/run-worker.ts`, the worker calls `varRuntime._resetBuilder()` (line 39) via `import * as varRuntime from '@oselvar/var-runtime'`. Add a dedicated glue import and use it:

```ts
import { _resetBuilder } from '@oselvar/var-runtime/registry'
```

and change line 39 from `varRuntime._resetBuilder()` to `_resetBuilder()`. Leave the `import * as varRuntime` and the `require` shim (which hands stepfiles `defineState`) in place.

- [ ] **Step 5: Run the gate**

Run: `pnpm -r build && pnpm typecheck && pnpm test && pnpm knip`
Expected: green. (`knip` must still pass — `./registry` is a real entry consumed by adapters.)

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor(var-runtime): expose adapter glue on a ./registry subpath

buildRegistry/contextFactory/_resetBuilder move behind @oselvar/var-runtime/registry
so the package root is authoring-API only.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Rename `@oselvar/var-runtime` → `@oselvar/var`, trim its public surface, and remove the `var-vitest` re-export

The headline change. Rename the registration shell to `@oselvar/var`; route author imports there; delete `var-vitest/src/api.ts` and stop re-exporting the authoring API; trim the package root to `defineState` only.

**Files:**
- Rename: `packages/var-runtime` → `packages/var` (`git mv`)
- Modify: `packages/var/package.json` (`name`)
- Delete: `packages/var-vitest/src/api.ts`, `packages/var-vitest/tests/api.test.ts`
- Modify: `packages/var-vitest/src/index.ts`, `packages/var-vitest/src/runtime.ts`, `packages/var-vitest/package.json`, `packages/var-vitest/tests/runtime.test.ts`
- Modify: all `@oselvar/var-runtime` importers (authoring → `@oselvar/var`, glue → `@oselvar/var/registry`) and all `@oselvar/var-vitest` author-import sites (→ `@oselvar/var`)
- Modify: `packages/var/src/index.ts` (trim public exports)
- Modify: `packages/website/src/lib/ts-diagnostics.ts` (ambient module name), `packages/website/src/lib/run-worker.ts` (shim specifiers + message)
- Modify: `tsconfig.tests.json`, `knip.json` (path keys)
- Modify: `packages/var-cli/src/init.ts` (scaffold template)

- [ ] **Step 1: Move the directory**

```bash
git mv packages/var-runtime packages/var
```

- [ ] **Step 2: Rename the package**

In `packages/var/package.json`, change `"name": "@oselvar/var-runtime"` to `"name": "@oselvar/var"`. Keep the `.` and `./registry` exports and `publishConfig`.

- [ ] **Step 3: Delete the `var-vitest` re-export module and its test**

```bash
git rm packages/var-vitest/src/api.ts packages/var-vitest/tests/api.test.ts
```

- [ ] **Step 4: Rewrite `@oselvar/var-runtime` specifiers (prefix-safe)**

`@oselvar/var-runtime/registry` must become `@oselvar/var/registry`, and bare `@oselvar/var-runtime` must become `@oselvar/var`. Order matters — do the `/registry` form first:

```bash
grep -rl "@oselvar/var-runtime/registry" packages docs --include='*.ts' \
  | grep -v node_modules | grep -v '/dist/' \
  | xargs sed -i '' "s|@oselvar/var-runtime/registry|@oselvar/var/registry|g"

grep -rlE "@oselvar/var-runtime(['\"])" packages docs --include='*.ts' --include='package.json' \
  | grep -v node_modules | grep -v '/dist/' \
  | xargs sed -i '' -E "s|@oselvar/var-runtime(['\"])|@oselvar/var\1|g"
```

This updates `var-cli/src/run.ts`, `var-vitest/src/runtime.ts`, `website/run-spec.ts`/`run-spec.test.ts`/`run-worker.ts`, the `var/bundles/**/*.steps.ts`, `var-cli/tests/fixtures/run-basic/hello.steps.ts`, and the `package.json` deps of `var-vitest`, `var-cli`, `website`.

- [ ] **Step 5: Point step authors at `@oselvar/var`**

Author imports that currently read `from '@oselvar/var-vitest'` for the authoring API must become `from '@oselvar/var'`. Rewrite these `.ts` files (the plugin/reporter config imports stay on `@oselvar/var-vitest` — do **not** touch `import varPlugin from '@oselvar/var-vitest'` or `'@oselvar/var-vitest/reporter'`):

- `docs/tutorial/steps/01-hello.steps.ts`, `02-airport.steps.ts`, `03-library.steps.ts`, `04-yahtzee.steps.ts`, `05-roman-numerals.steps.ts`, `06-tables-and-docstrings.steps.ts`, `13-return-sensor.steps.ts`
- `packages/cucumber/steps/library.steps.ts`

Command (only rewrites the `{ … } from '@oselvar/var-vitest'` named-import form, leaving the default-import plugin form alone):

```bash
grep -rl "} from '@oselvar/var-vitest'" docs packages --include='*.ts' \
  | grep -v node_modules | grep -v '/dist/' \
  | xargs sed -i '' "s|} from '@oselvar/var-vitest'|} from '@oselvar/var'|g"
```

Then add `@oselvar/var` as a dependency where authors now import it: `packages/cucumber/package.json` (add `"@oselvar/var": "workspace:*"`). `docs/tutorial` has no package.json of its own (it's globbed by the workspace); it resolves `@oselvar/var` through the workspace, so no dep edit needed there.

- [ ] **Step 6: Fix the `var-language` scanner-test fixture strings**

The fixture source strings in `packages/var-language/tests/step-defs.test.ts` (e.g. `import { action } from '@oselvar/var-vitest'`) are inert text fed to the scanner, but should read correctly. Update the import lines in those template literals from `'@oselvar/var-vitest'` to `'@oselvar/var'`. (The scanner matches call identifiers regardless of import shape, so behavior is unchanged.)

- [ ] **Step 7: Trim the `var-vitest` index and runtime**

In `packages/var-vitest/src/index.ts`:
- Remove `export type { RoleFn, SensorFn } from './api.js'` and `export { action, context, defineState, sensor } from './api.js'`.
- Remove `export type { VarConfig, VarDoc } from '@oselvar/var-core'` and `export { loadVarConfig } from '@oselvar/var-core/node'` **only if** knip later flags them unused; keep otherwise (they are the adapter's config surface). Verify with knip in Step 12.
- Keep the plugin default export, `./runtime`, `./reporter` re-exports, and `VERSION`.

In `packages/var-vitest/src/runtime.ts`, the glue import was already rewritten to `@oselvar/var/registry` by Step 4 — confirm line 10 reads `import { buildRegistry, contextFactory } from '@oselvar/var/registry'`.

In `packages/var-vitest/package.json`, the dep was rewritten to `"@oselvar/var": "workspace:*"` by Step 4. Remove the now-duplicate/old `"@oselvar/var-runtime"` line if one remains, and ensure `"@oselvar/var-core": "workspace:*"` is present (it was renamed in Task 3).

In `packages/var-vitest/tests/runtime.test.ts:2`, change `import { _resetBuilder, action } from '../src/api.js'` to import from the package: `import { action } from '@oselvar/var'` and `import { _resetBuilder } from '@oselvar/var/registry'`.

- [ ] **Step 8: Trim the public surface of `@oselvar/var` to `defineState`**

In `packages/var/src/index.ts`, the module still implements `context`, `action`, `sensor`, `defineState`, the glue, and the `RoleFn`/`SensorFn` types. Restrict the **public exports** to `defineState` only, while keeping the others as internal (non-`export`) bindings that `defineState` and `registry.ts` rely on:
- Keep `export function defineState(...)`.
- Keep `buildRegistry`/`contextFactory`/`_resetBuilder` `export`ed (they are the `./registry` surface, re-exported by `registry.ts`).
- Change `export const context`/`action`/`sensor` to non-exported `const` (drop the `export` keyword) — `defineState`'s returned closures already call `registerStep` directly and do not reference these top-level consts, so they become unused. If `noUnusedLocals` then flags them, delete the three `const context/action/sensor` declarations entirely (the registration logic lives in `defineState` and `registerStep`).
- Change `export type RoleFn`/`SensorFn` to non-exported `type` (drop `export`) — `defineState`'s signature references them internally; without the `export` they remain usable in-file. If unused after removing the standalone roles, keep them (they type `defineState`'s return).

Net public surface of `@oselvar/var` (`.`): `defineState` (+ `VERSION` if present). `./registry`: `buildRegistry`, `contextFactory`, `_resetBuilder`.

- [ ] **Step 9: Update the website ambient + worker shim**

In `packages/website/src/lib/ts-diagnostics.ts`:
- Change `const AMBIENT_FILE = 'var-runtime.d.ts'` to `'var.d.ts'`.
- Change `declare module '@oselvar/var-runtime' {` to `declare module '@oselvar/var' {`.
- Remove `export const context: RoleFn`, `export const action: RoleFn`, `export const sensor: SensorFn` (lines 52–54) — the public surface is `defineState` only. (Keep the `RoleFn`/`SensorFn` type declarations; `defineState`'s declared return type uses them.)

In `packages/website/src/lib/run-worker.ts`:
- Line 3 `import * as varRuntime from '@oselvar/var-runtime'` was rewritten to `'@oselvar/var'` by Step 4 — confirm.
- In the `require` shim (lines 19–24), the accepted specifier for the authoring module should be `@oselvar/var` (it currently lists `'@oselvar/var-runtime'`, rewritten to `'@oselvar/var'` by Step 4). Since Step 4 turned `'@oselvar/var-runtime'` into `'@oselvar/var'`, the line now reads `if (spec === '@oselvar/var' || spec === '@oselvar/var-vitest') return varRuntime`. Confirm the `@oselvar/var-core` branch (Task 3) still returns `varCore`. Update the error message string to: ``Cannot import "${spec}" in the browser runner — import defineState() from "@oselvar/var".``

- [ ] **Step 10: Update the CLI scaffold template**

In `packages/var-cli/src/init.ts`, change `EXAMPLE_STEPS`'s first line from `import { defineState } from '@oselvar/var-vitest'` to `import { defineState } from '@oselvar/var'`.

- [ ] **Step 11: Update path-based configs**

- `tsconfig.tests.json`: change `"packages/var-runtime/tests"` to `"packages/var/tests"`. (The `packages/var/tests` entry from before now refers to the renamed core — wait: it was already changed to `packages/var-core/tests` in Task 3, so the include list should now contain `packages/var-core/tests` **and** `packages/var/tests`. Ensure both are present and there is no stale `packages/var-runtime/tests`.)
- `knip.json`: rename the `"packages/var-runtime"` workspace key to `"packages/var"`, preserving its `entry`/`project` globs (the `bundles/**` entries). Ensure the Task-3 `"packages/var-core"` key is also present. No `"packages/var-runtime"` key should remain.

- [ ] **Step 12: Reinstall, verify, run the full gate**

```bash
pnpm install
grep -rn "@oselvar/var-runtime" packages docs --include='*.ts' --include='*.json' | grep -v node_modules | grep -v '/dist/'
```
Expected: the grep returns **nothing** (no `@oselvar/var-runtime` references anywhere).

Run: `pnpm -r build && pnpm check`
Expected: lint + typecheck + test + knip + jscpd all green. If knip flags `VarConfig`/`VarDoc`/`loadVarConfig` re-exports in `var-vitest/src/index.ts` as unused, remove those lines and re-run.

- [ ] **Step 13: Commit**

```bash
git add -A
git commit -m "refactor: rename @oselvar/var-runtime to @oselvar/var; minimal public API

Step authors now import { defineState } from '@oselvar/var'. Adapter glue is on
@oselvar/var/registry. var-vitest no longer re-exports the authoring API
(src/api.ts deleted). Public surface of @oselvar/var is defineState only.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Add a README to every package

One short README (1–2 paragraphs) per `packages/*`, stating what it is, who imports it, and what not to import.

**Files:**
- Create: `packages/var/README.md`, `packages/var-core/README.md`, `packages/var-vitest/README.md`, `packages/var-cli/README.md`, `packages/var-lsp/README.md`, `packages/var-language/README.md`, `packages/var-vscode/README.md`
- Modify/replace: `packages/cucumber/README.md` (already exists — only adjust if its content is stale re: imports)

- [ ] **Step 1: Write `packages/var/README.md`**

```markdown
# @oselvar/var

The package you write step definitions against. Import `defineState`, give it a
factory for your scenario state (and optionally custom parameter types), and use the
returned `context` / `action` / `sensor` functions to bind Cucumber-expression steps.

```ts
import { defineState } from '@oselvar/var'

const { action, sensor } = defineState(() => ({ greeting: '' }))
action('I greet {string}', (_state, name) => ({ greeting: `Hello, ${name}!` }))
sensor('the greeting is {string}', (state) => [state.greeting])
```

This is a thin stateful shell over the pure `@oselvar/var-core`. Adapters use the
`@oselvar/var/registry` subpath for the registry-building glue; step authors never
need it.
```

- [ ] **Step 2: Write `packages/var-core/README.md`**

```markdown
# @oselvar/var-core

The pure functional core of Vár: parser, matcher, planner, executor, AST, diagnostics,
and the return-based comparison engine. Pure functions over immutable data — no
globals, no I/O, no side effects.

**Internal.** Do not depend on this package directly. Write step definitions against
`@oselvar/var`; integrate with a test runner via an adapter such as
`@oselvar/var-vitest`. This package's surface is broad and may change without notice.
```

- [ ] **Step 3: Write `packages/var-vitest/README.md`**

```markdown
# @oselvar/var-vitest

The vitest adapter for Vár. Wire the plugin into your `vitest.config.ts` so `.var.md`
files run as tests, and add the results reporter:

```ts
import varPlugin from '@oselvar/var-vitest'
import { VarResultsReporter } from '@oselvar/var-vitest/reporter'

export default { plugins: [varPlugin()], test: { reporters: ['default', new VarResultsReporter()] } }
```

Write your step definitions against `@oselvar/var`, not this package.
```

- [ ] **Step 4: Write one-liner READMEs for the rest**

`packages/var-cli/README.md`:
```markdown
# @oselvar/var-cli

The `var` command-line runner for Vár specs: `var run`, `var lint`, `var init`, and
step-definition snippet generation. The imperative shell around `@oselvar/var-core`.
```

`packages/var-lsp/README.md`:
```markdown
# @oselvar/var-lsp

The Language Server Protocol server for Vár — diagnostics, semantic tokens, and rename
support for `.var.md` specs and their step definitions. Consumed by editor extensions
such as `@oselvar/var-vscode`.
```

`packages/var-language/README.md`:
```markdown
# @oselvar/var-language

Static analysis for Vár step definitions and specs: a TypeScript-based scanner that
discovers step definitions and custom parameter types, and a workspace indexer that
matches specs to step definitions. Used by `@oselvar/var-lsp` and the website.
```

`packages/var-vscode/README.md`:
```markdown
# Vár for VS Code

The VS Code extension for Vár. Bundles the `@oselvar/var-lsp` language server to
provide diagnostics, highlighting, and rename support for `.var.md` files.
```

- [ ] **Step 5: Check the existing cucumber README**

Run: `cat packages/cucumber/README.md`
If it references the old authoring import (`@oselvar/var-vitest` / `@oselvar/var-runtime`) for step definitions, update it to `@oselvar/var`. Otherwise leave it.

- [ ] **Step 6: Commit**

```bash
git add packages/*/README.md
git commit -m "docs: add per-package READMEs (what it is, who imports it)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review notes

- **Spec coverage:** §1 topology → Tasks 3+5; §2 export surface → Tasks 4 (`/registry`) + 5 (trim to `defineState`); §3 `defineParameterType` removal + `var-language` re-target → Tasks 1+2; §4 `var-vitest` cleanup → Task 5; §5 core breadth unchanged → Task 3 (rename only); §6 READMEs → Task 6.
- **Ordering keeps trunk green:** re-target scanner (1) → remove dead API (2) → rename core (3) → subpath split (4) → rename shell + trim + re-export removal (5) → docs (6). No commit leaves a dangling specifier.
- **Prefix-safety:** every specifier rewrite is guarded by a following `'`/`"`/`/` so sibling packages (`var-core`, `var-language`, `var-runtime`) are never partially matched.
- **`pnpm install` after each directory/name rename** relinks the workspace before the gate runs.
