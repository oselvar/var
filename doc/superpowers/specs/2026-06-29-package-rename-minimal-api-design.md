# Package rename + minimal public API

**Date:** 2026-06-29
**Status:** approved

## Problem

Two issues with the current package layout:

1. **Pointless re-exports.** `packages/var-vitest/src/api.ts` re-exports the entire
   step-registration API from `@oselvar/var-runtime` purely so step files can keep
   importing from `@oselvar/var-vitest`. The indirection adds no value.

2. **Unintuitive package names.** The package authors import in their step
   definitions is `@oselvar/var-runtime` (re-exported through `@oselvar/var-vitest`),
   while `@oselvar/var` — the name users would most naturally reach for — is the pure
   internal core. The home of the broad internal surface has claimed the best name.

The underlying driver is **a minimal public API**: the smaller the surface we expose,
the more freedom we keep to refactor internals, and the less we fall prey to Hyrum's
law (consumers depending on incidental, unintended behaviour).

## Decisions

### 1. Topology — two packages, renamed

| New name | Was | Role | Imported by |
|---|---|---|---|
| `@oselvar/var` | `@oselvar/var-runtime` | Stateful **registration shell** + author API | step authors, adapters |
| `@oselvar/var-core` | `@oselvar/var` | Pure functional core (parser, matcher, planner, AST, diagnostics, …) | adapters only — **never** users |

The directories are renamed to match the package names, via a two-step `git mv`
(the target name `packages/var` is occupied until the core moves out):

1. `packages/var` → `packages/var-core`
2. `packages/var-runtime` → `packages/var`

**Why these are two separate packages, not one with subpaths:** the registration
shell holds module-scope *mutable* state (the `steps` array, `contextFactoriesByFile`
map, `customTypes` array that the role functions push into at import time). That state
is exactly what the pure core must not contain — per the project's architectural
principles, `@oselvar/var-core` is the pure functional core: no globals, no mutation,
no side effects, same input → same output. A hard package boundary keeps the stateful
shell physically out of the pure core and gives the strongest protection against
internal-surface coupling.

`@oselvar/var` depends on `@oselvar/var-core`. The pure registry *constructors*
(`createRegistry`, `addStep`, `defineParameterType` as a pure `Registry` transform)
already live in the core; `@oselvar/var` only adds the impure glue that collects
registrations into module globals and feeds them to those pure constructors.

### 2. `@oselvar/var` export surface — maximally minimal

- `.` → **`defineState`** — and nothing else.
- `./registry` → `buildRegistry`, `contextFactory`, `_resetBuilder` — adapter-only
  glue (used by `var-vitest`, `var-cli`, and the website's runner; never by authors).

Principle: **export as little as possible; open up later.** The following are
deliberately *not* exported from `.`:

- **`context` / `action` / `sensor` standalone** — authors never import these; they
  destructure them from `defineState`'s return value. The standalone primitives stay
  internal (used to implement `defineState`).
- **`RoleFn` / `SensorFn` types** — type inference through `defineState`'s return
  value covers the common case, and structural typing still works for users without
  the named export. Add later if a concrete need appears.
- **`VarConfig` type** — `var.config.ts` stays untyped, exactly as it is today. Not
  re-exporting it keeps this change a pure rename with no new capability.

### 3. Remove standalone `defineParameterType` end-to-end

Custom parameter types are declared **only** via `defineState(factory, { paramTypes })`.
This is not a capability reduction — it is an upgrade:

- Standalone `defineParameterType` pushed into the module `customTypes` for runtime
  matching + snippet inference, but was **not** wired into the compile-time generic of
  the role functions, so a captured arg fell back to `any`.
- `defineState(factory, { paramTypes })` pushes into the *same* module `customTypes`
  (identical runtime matching and cross-file behaviour) **and** captures `P` into
  `CustomRegistry<P>`, which drives `RoleFn<C, Custom>` — so the captured arg is
  **fully typed**. A stepfile that wants param types but no real state writes
  `defineState(() => ({}), { paramTypes })`.

Because authors can no longer write a bare `defineParameterType({...})` call, leaving
tooling that detects that pattern would be incoherent. Full removal therefore touches:

- the standalone `defineParameterType` function in the registration shell;
- the website's `ts-diagnostics.ts` ambient declaration of `defineParameterType`;
- the tutorial comment in `02-airport.steps.ts` referencing a "separate
  `defineParameterType` call".

**`var-language` is a re-target, not a deletion.** `buildWorkspaceIndex`
(`index-workspace.ts`) depends on `scanner.discoverParameterTypes()` to register
custom parameter types *before* compiling step expressions — without them, a spec
using `{airport}` fails to compile with `UndefinedParameterTypeError`, regressing LSP
highlighting and diagnostics. So `discoverParameterTypes` must be re-pointed: instead
of detecting bare `defineParameterType({ name, regexp })` calls, it discovers the
`paramTypes` argument of `defineState(factory, { airport: { regexp, transformer } })`
— each property key is the type name and its `regexp` sub-property is the pattern. The
`ParameterTypeDef` return shape (`{ file, name, regexp, callRange }`) is unchanged, so
`buildWorkspaceIndex` needs no change. `var-language`'s scanner tests and the
`var-lsp` test fixtures that used the bare form are rewritten to the `defineState`
form.

The pure-core `defineParameterType` `Registry` transform (`var-core/src/registry.ts`)
**stays** — `buildRegistry` still calls it to register the types collected from
`defineState`'s `paramTypes`.

### 4. `@oselvar/var-vitest` cleanup

- **Delete `src/api.ts`** and stop re-exporting the authoring API (and `VarConfig` /
  `VarDoc`) from `src/index.ts`. Step authors import `defineState` from `@oselvar/var`.
- Import the adapter glue (`buildRegistry`, `contextFactory`, `_resetBuilder`) from
  `@oselvar/var/registry` in `src/runtime.ts`.
- **Delete `tests/api.test.ts`** — it tested the re-export and duplicates the
  canonical authoring-API tests, which travel with the `var-runtime` → `var`
  directory rename.
- The vitest adapter's own surface is unchanged: default plugin export, `./reporter`,
  `./runtime`.

### 5. `@oselvar/var-core`

Keeps its current broad `.` + `./node` exports (this is the internal toolkit; breadth
is fine because it is not user-facing). All consumers rename their imports:

- `@oselvar/var` → `@oselvar/var-core`
- `@oselvar/var/node` → `@oselvar/var-core/node`

### 6. READMEs

A short, high-level README (1–2 paragraphs) in every `packages/*` directory, each
stating *what it is*, *who imports it*, and *what not to import*:

- **`var`** — write your step definitions against this:
  `import { defineState } from '@oselvar/var'`.
- **`var-core`** — internal pure core; **do not depend on this directly**, use
  `@oselvar/var`. (the loudest "hands off")
- **`var-vitest`** — vitest adapter; wire `varPlugin` into `vitest.config.ts`.
- **`var-cli`**, **`var-lsp`**, **`var-language`**, **`cucumber`**, **`var-vscode`** —
  one-liner on role.

## Migration mechanics

1. Two-step `git mv` (§1).
2. Rewrite imports across the repo:
   - core consumers: `@oselvar/var` → `@oselvar/var-core`, `@oselvar/var/node` →
     `@oselvar/var-core/node`;
   - authoring imports in step files: `@oselvar/var-vitest` → `@oselvar/var`;
   - adapter glue: `@oselvar/var-runtime` → `@oselvar/var/registry`.
3. Update `package.json` `name` + `exports`/`publishConfig` (add `./registry` to
   `@oselvar/var`; move `./node` to `@oselvar/var-core`).
4. Update root + per-package `tsconfig` project references, `vitest` configs,
   `knip` config, and any path references in `var.config.ts` / scripts.
5. Apply §3 removal and §4 cleanup.
6. Write §6 READMEs.

## Affected files (non-exhaustive map)

- **Step files importing the authoring API from `@oselvar/var-vitest`:**
  `docs/tutorial/steps/*.steps.ts`, `packages/cucumber/steps/*.steps.ts`,
  `packages/var-language/tests`, `packages/var-cli/tests` + `src/init.ts`,
  `packages/website/src/lib/run-worker.ts`.
- **Adapter glue consumers (`@oselvar/var-runtime`):** `packages/var-cli/src/run.ts`,
  `packages/var-vitest/src/runtime.ts`, `packages/website/src/lib/run-spec.ts` +
  `run-worker.ts`, plus tests.
- **Core consumers (`@oselvar/var`):** every adapter package's `src/*` that imports
  `parse`/`plan`/`executePlan`/`findHits`/etc., and `var-runtime/src/index.ts` itself.
- **`defineParameterType` removal:** `packages/var-language/src/step-defs.ts` +
  tests, `packages/var-lsp/tests`, `packages/website/src/lib/ts-diagnostics.ts`,
  `docs/tutorial/steps/02-airport.steps.ts`.

## Success criteria

- Step authors import only `defineState` from `@oselvar/var`; nothing else is reachable
  on its main entry point.
- `@oselvar/var-core` is imported by adapters only; no user-facing path leads to it.
- No standalone `defineParameterType` remains anywhere (function, export, scanner, LSP,
  ambient, docs); custom parameter types work via `defineState`'s `paramTypes`.
- `packages/var-vitest/src/api.ts` is gone and nothing re-exports the authoring API.
- Every `packages/*` has a 1–2 paragraph README.
- `pnpm -r build` exits 0 and `pnpm check` (lint + typecheck + test + knip + jscpd)
  is green.

## Out of scope

- Trimming `@oselvar/var-core`'s broad surface — it is internal; breadth is acceptable.
- Re-introducing `VarConfig` / `RoleFn` / `SensorFn` / standalone roles on the public
  surface — deferred until a concrete consumer need appears ("open up later").
- Any change to the cucumber, lsp, or language *behaviour* beyond the rename and the
  `defineParameterType` removal.
