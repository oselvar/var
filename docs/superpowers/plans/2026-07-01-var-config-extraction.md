# Extract @oselvar/var-config Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move `config.ts`/`config-types.ts`/`find-files.ts` out of `@oselvar/var-core` into a new `@oselvar/var-config` package, so `var-core` has zero Node/filesystem exports and a future consumer (`var-vscode`) can call `loadVarConfig` directly without pulling in `cucumber-expressions`/the matcher/the parser.

**Architecture:** A single atomic move-and-rewire: create the new package with the three files moved verbatim (import paths fixed), delete them from `var-core` along with the now-empty `@oselvar/var-core/node` subpath entirely, and update every real consumer (`var-lsp`, `var-runner`) in the same commit so the workspace stays green throughout — splitting this into "move" then "rewire consumers" would leave an intermediate broken build.

**Tech Stack:** TypeScript strict (`noUncheckedIndexedAccess`, `verbatimModuleSyntax`, `exactOptionalPropertyTypes`), vitest, pnpm workspace.

## Global Constraints

- Run all pnpm/vitest/tsc commands from `typescript/` (this plan's paths are relative to that directory).
- `pnpm -r build` type-checks `src/`; `pnpm typecheck` (part of `pnpm check`) type-checks `tests/`. A green vitest run does not prove either passes.
- Biome style: single quotes, no semicolons, 2-space indent, trailing commas, `import type` (or inline `type` per-specifier in a mixed import) for type-only imports (`verbatimModuleSyntax`), `node:` protocol for built-ins. Named imports from the same module group together and sort alphabetically; among distinct `@oselvar/...` packages, imports sort alphabetically by package name (`@oselvar/var-config` before `@oselvar/var-core`).
- This is a **behavior-preserving move** — no logic changes anywhere. Existing tests are the regression guard; only import paths change.
- Reference design doc: `docs/superpowers/specs/2026-07-01-var-config-extraction-design.md`.

---

### Task 1: Create `@oselvar/var-config`, remove it from `var-core`, rewire every consumer

**Files:**
- Create: `packages/var-config/package.json`
- Create: `packages/var-config/tsconfig.json`
- Create: `packages/var-config/src/index.ts`
- Create: `packages/var-config/src/config.ts` (moved from `var-core`, import fixed)
- Create: `packages/var-config/src/config-types.ts` (moved from `var-core`, import fixed)
- Create: `packages/var-config/src/find-files.ts` (moved from `var-core`, verbatim)
- Create: `packages/var-config/tests/config.test.ts` (moved from `var-core`, verbatim)
- Delete: `packages/var-core/src/config.ts`
- Delete: `packages/var-core/src/config-types.ts`
- Delete: `packages/var-core/src/find-files.ts`
- Delete: `packages/var-core/src/node.ts`
- Delete: `packages/var-core/tests/config.test.ts`
- Modify: `packages/var-core/src/index.ts`
- Modify: `packages/var-core/package.json`
- Modify: `packages/var-lsp/src/bin.ts`
- Modify: `packages/var-lsp/src/file-system.ts`
- Modify: `packages/var-lsp/src/store.ts`
- Modify: `packages/var-lsp/package.json`
- Modify: `packages/var-lsp/tests/handlers.test.ts`
- Modify: `packages/var-runner/src/config.ts`
- Modify: `packages/var-runner/package.json`
- Modify: `knip.json`
- Modify: `tsconfig.tests.json`

**Interfaces:**
- Produces: `loadVarConfig(cwd: string): Promise<VarConfig>`, `findFiles(cwd: string, include: ReadonlyArray<string>, exclude?: ReadonlyArray<string>): string[]`, `type VarConfig`, `type VarGlobs` — all exported from `@oselvar/var-config`'s single entry point (no subpaths).
- Consumes: `ScannerPlugin` type, exported from `@oselvar/var-core` (unchanged — `scanner.ts` stays in `var-core`).

- [ ] **Step 1: Scaffold the new package**

Create `packages/var-config/package.json`:

```json
{
  "name": "@oselvar/var-config",
  "version": "0.0.0",
  "type": "module",
  "exports": {
    ".": {
      "types": "./src/index.ts",
      "import": "./src/index.ts"
    }
  },
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "files": [
    "dist",
    "README.md"
  ],
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "vitest run"
  },
  "dependencies": {
    "@oselvar/var-core": "workspace:*"
  },
  "publishConfig": {
    "exports": {
      ".": {
        "types": "./dist/index.d.ts",
        "import": "./dist/index.js"
      }
    },
    "main": "./dist/index.js",
    "types": "./dist/index.d.ts"
  }
}
```

Create `packages/var-config/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "src" },
  "include": ["src"]
}
```

- [ ] **Step 2: Move `config-types.ts`**

```bash
git mv packages/var-core/src/config-types.ts packages/var-config/src/config-types.ts
```

Edit `packages/var-config/src/config-types.ts` — change only the import line (`ScannerPlugin` now comes from the public `@oselvar/var-core` package instead of a relative path, since `scanner.ts` stays in `var-core`):

```ts
import type { ScannerPlugin } from '@oselvar/var-core'

// Spec discovery globs. `include` is globbed; anything also matching `exclude`
// is dropped. Both are plain globs — no `!` prefix semantics.
export type VarGlobs = {
  readonly include: ReadonlyArray<string>
  readonly exclude: ReadonlyArray<string>
}

export type VarConfig = {
  readonly vars: VarGlobs
  readonly steps: ReadonlyArray<string>
  readonly snippet: { readonly template?: string }
  // Opt-in scanner extensions. Empty by default — projects migrating from
  // Cucumber typically add `[gherkinTables(), gherkinDocStrings()]` here.
  readonly scannerPlugins: ReadonlyArray<ScannerPlugin>
}
```

- [ ] **Step 3: Move `config.ts`**

```bash
git mv packages/var-core/src/config.ts packages/var-config/src/config.ts
```

Replace the full contents of `packages/var-config/src/config.ts` with:

```ts
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { ScannerPlugin } from '@oselvar/var-core'
import type { VarConfig, VarGlobs } from './config-types.js'

export type { VarConfig, VarGlobs } from './config-types.js'

const DEFAULT_CONFIG: VarConfig = {
  // No default spec glob: specs are plain `.md` files, so a greedy default would
  // parse every README in the repo. A repo must declare `vars` explicitly.
  vars: { include: [], exclude: [] },
  steps: ['**/*.steps.ts'],
  // No default template here — generateSnippet (in @oselvar/var-language)
  // already falls back to its own DEFAULT_SNIPPET_TEMPLATE when no template
  // is supplied. Keeping a second copy of that default here would just be
  // the same value duplicated one layer up, and this package can't import
  // var-language's snippet-template.ts without creating a circular
  // dependency (var-language depends on var-core, which this package also
  // depends on).
  snippet: {},
  scannerPlugins: [],
}

// `vars` accepts either a plain glob array (include-only shorthand) or an
// explicit `{ include, exclude }`. Both normalise to VarGlobs.
type VarsInput =
  | ReadonlyArray<string>
  | { readonly include?: ReadonlyArray<string>; readonly exclude?: ReadonlyArray<string> }

type UserConfig = {
  readonly vars?: VarsInput
  readonly steps?: ReadonlyArray<string>
  readonly snippet?: { readonly template?: string }
  readonly scannerPlugins?: ReadonlyArray<ScannerPlugin>
}

function normalizeVars(vars: VarsInput | undefined): VarGlobs {
  if (vars === undefined) return DEFAULT_CONFIG.vars
  if (Array.isArray(vars)) return { include: vars, exclude: [] }
  const obj = vars as { include?: ReadonlyArray<string>; exclude?: ReadonlyArray<string> }
  return { include: obj.include ?? [], exclude: obj.exclude ?? [] }
}

export async function loadVarConfig(cwd: string): Promise<VarConfig> {
  const candidates = ['var.config.ts', 'var.config.js', 'var.config.mjs']
  for (const name of candidates) {
    const path = resolve(cwd, name)
    if (!existsSync(path)) continue
    const mod = await import(pathToFileURL(path).href)
    const cfg = (mod.default ?? mod) as UserConfig
    return {
      vars: normalizeVars(cfg.vars),
      steps: cfg.steps ?? DEFAULT_CONFIG.steps,
      snippet: cfg.snippet?.template !== undefined ? { template: cfg.snippet.template } : {},
      scannerPlugins: cfg.scannerPlugins ?? DEFAULT_CONFIG.scannerPlugins,
    }
  }
  return DEFAULT_CONFIG
}
```

- [ ] **Step 4: Move `find-files.ts` verbatim — no import changes needed**

```bash
git mv packages/var-core/src/find-files.ts packages/var-config/src/find-files.ts
```

This file only imports `node:fs`/`node:path` and has no `var-core` references — no edits needed.

- [ ] **Step 5: Write the new package's entry point**

Create `packages/var-config/src/index.ts`:

```ts
export type { VarConfig, VarGlobs } from './config-types.js'
export { loadVarConfig } from './config.js'
export { findFiles } from './find-files.js'
```

- [ ] **Step 6: Move the test file verbatim — no import changes needed**

```bash
git mv packages/var-core/tests/config.test.ts packages/var-config/tests/config.test.ts
```

Its only import (`import { loadVarConfig } from '../src/config.js'`) is relative and stays correct after the move (both the test and the source moved to the same relative structure) — no edits needed.

- [ ] **Step 7: Delete `var-core/src/node.ts` and update `var-core`'s exports**

```bash
git rm packages/var-core/src/node.ts
```

Edit `packages/var-core/src/index.ts`. Delete this line (it's between the `cell-diff.js` and `conformance.js` export blocks):

```ts
export type { VarConfig, VarGlobs } from './config-types.js'
```

- [ ] **Step 8: Remove the now-empty `./node` subpath from `var-core`'s package.json**

Replace the full contents of `packages/var-core/package.json` with:

```json
{
  "name": "@oselvar/var-core",
  "version": "0.0.0",
  "type": "module",
  "exports": {
    ".": {
      "types": "./src/index.ts",
      "import": "./src/index.ts"
    }
  },
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "files": [
    "dist",
    "README.md"
  ],
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "vitest run"
  },
  "dependencies": {
    "@cucumber/cucumber-expressions": "^20.0.0"
  },
  "publishConfig": {
    "exports": {
      ".": {
        "types": "./dist/index.d.ts",
        "import": "./dist/index.js"
      }
    },
    "main": "./dist/index.js",
    "types": "./dist/index.d.ts"
  }
}
```

- [ ] **Step 9: Fix `var-lsp/src/bin.ts`**

Replace the full contents of `packages/var-lsp/src/bin.ts` with:

```ts
#!/usr/bin/env node
import { loadVarConfig } from '@oselvar/var-config'
import { createConnection, ProposedFeatures } from 'vscode-languageserver/node'
import { createNodeFileSystem } from './node-file-system.js'
import { createNodeGrammarLoader } from './node-grammar-loader.js'
import { registerHandlers } from './server.js'

const connection = createConnection(ProposedFeatures.all)
registerHandlers(connection, async (rootUri) => {
  const root = (rootUri ?? process.cwd()).replace(/^file:\/\//, '')
  return {
    fs: createNodeFileSystem(root),
    config: await loadVarConfig(root),
    grammarLoader: createNodeGrammarLoader(),
  }
})
connection.listen()
```

- [ ] **Step 10: Fix `var-lsp/src/file-system.ts`**

Edit `packages/var-lsp/src/file-system.ts`. Change:

```ts
import type { VarGlobs } from '@oselvar/var-core'
```

to:

```ts
import type { VarGlobs } from '@oselvar/var-config'
```

- [ ] **Step 11: Fix `var-lsp/src/store.ts`**

Edit `packages/var-lsp/src/store.ts`. Change:

```ts
import type { VarConfig } from '@oselvar/var-core'
import { createRegistry } from '@oselvar/var-core'
```

to:

```ts
import type { VarConfig } from '@oselvar/var-config'
import { createRegistry } from '@oselvar/var-core'
```

- [ ] **Step 12: Fix `var-lsp/tests/handlers.test.ts`**

Edit `packages/var-lsp/tests/handlers.test.ts`. Change:

```ts
import { loadVarConfig } from '@oselvar/var-core/node'
```

to:

```ts
import { loadVarConfig } from '@oselvar/var-config'
```

- [ ] **Step 13: Add `@oselvar/var-config` to `var-lsp`'s dependencies**

Edit `packages/var-lsp/package.json`, adding it to `"dependencies"` (alphabetically first among the `@oselvar/...` entries):

```json
  "dependencies": {
    "@oselvar/var-config": "workspace:*",
    "@oselvar/var-core": "workspace:*",
    "@oselvar/var-language": "workspace:*",
    "tree-sitter-typescript": "^0.23.2",
    "vscode-languageserver": "^10.0.1",
    "vscode-languageserver-textdocument": "^1.0.12"
  },
```

Run `pnpm install` from `typescript/`.

- [ ] **Step 14: Fix `var-runner/src/config.ts`**

Replace the full contents of `packages/var-runner/src/config.ts` with:

```ts
export type { VarConfig } from '@oselvar/var-config'
export { findFiles as findSpecs, loadVarConfig as readVarConfig } from '@oselvar/var-config'
```

- [ ] **Step 15: Add `@oselvar/var-config` to `var-runner`'s dependencies**

Edit `packages/var-runner/package.json`, adding it to `"dependencies"` (`var-runner`'s other files — `run.ts`, `render.ts`, `steps.ts` — still use `@oselvar/var-core` directly, so that dependency stays):

```json
  "dependencies": {
    "@oselvar/var": "workspace:*",
    "@oselvar/var-config": "workspace:*",
    "@oselvar/var-core": "workspace:*"
  },
```

Run `pnpm install` from `typescript/`.

- [ ] **Step 16: Register the new package with knip**

Edit `knip.json`. Add a `"packages/var-config"` entry (alphabetically, right before the existing `"packages/var-core"` entry):

```json
    "packages/var-config": {
      "project": ["src/**/*.ts", "tests/**/*.ts"]
    },
```

- [ ] **Step 17: Register the new package's tests with the root typecheck config**

Edit `tsconfig.tests.json`. Add `"packages/var-config/tests"` to the `include` array (alphabetically, right before `"packages/var-cli/tests"`... actually `var-config` sorts before `var-core` which sorts before `var-cli`? Check: `var-c` common prefix, then `l` (cli) vs `o` (config/core) — `l` < `o`, so `var-cli` sorts BEFORE both `var-config` and `var-core`. Between `var-config`/`var-core`: `var-co` common, then `n` vs `r` — `n` < `r`, so `var-config` sorts before `var-core`. Full order: `var-cli`, `var-config`, `var-core`... but `var-core` doesn't currently have its own entry in this list — check the existing array below before inserting):

```json
  "include": [
    "packages/var-config/tests",
    "packages/var-core/tests",
    "packages/var-cli/tests",
    "packages/var-language/tests",
    "packages/var-lsp/tests",
    "packages/var/tests",
    "packages/var-vitest/tests",
    "var.config.ts",
    "vitest.config.ts",
    "vitest.plugins.ts",
    "packages/*/vitest.config.ts",
    "packages/*/var.config.ts"
  ]
```

(The existing array is not alphabetically sorted as a whole — e.g. `var-cli` already comes after `var-core` in the current file. Just add `"packages/var-config/tests"` as a new line immediately before the existing `"packages/var-core/tests"` line; don't reorder the other entries.)

- [ ] **Step 18: Run every affected test suite**

Run: `NODE_OPTIONS="--import tsx" npx vitest run packages/var-config packages/var-core packages/var-lsp packages/var-runner packages/var-cli packages/var-vitest`
Expected: PASS — `var-config/tests/config.test.ts` (7 tests) now passes from its new location; `var-core`'s suite has one fewer test file but everything else is unaffected; `var-lsp`, `var-runner`, `var-cli`, `var-vitest` are all green with the new import paths.

- [ ] **Step 19: Type-check**

Run: `pnpm --filter @oselvar/var-config --filter @oselvar/var-core --filter @oselvar/var-lsp --filter @oselvar/var-runner build`
Expected: exit 0.

Run (from `typescript/`): `pnpm typecheck`
Expected: exit 0.

- [ ] **Step 20: Commit**

```bash
git add packages/var-config packages/var-core/src/index.ts packages/var-core/package.json packages/var-lsp/src/bin.ts packages/var-lsp/src/file-system.ts packages/var-lsp/src/store.ts packages/var-lsp/package.json packages/var-lsp/tests/handlers.test.ts packages/var-runner/src/config.ts packages/var-runner/package.json knip.json tsconfig.tests.json pnpm-lock.yaml
git commit -m "refactor: extract @oselvar/var-config out of var-core

Config loading does real Node I/O (existsSync, dynamic import, globSync) and
was already gated behind the @oselvar/var-core/node subpath specifically
because it's impure — this move makes that boundary a real package
boundary instead. var-core now has zero Node/filesystem exports, matching
the Java and Python ports' own \"zero I/O in the core\" shape exactly. Checked
first: neither Python's nor Java's config loading is a literal port of TS's
config.ts (each is hand-rolled per ecosystem, sharing only field semantics),
so this is a TypeScript-internal cleanup with no cross-language follow-up
needed."
```

---

### Task 2: Full workspace verification

**Files:** none (verification only).

- [ ] **Step 1: Full build**

Run (from `typescript/`): `pnpm -r build`
Expected: exit 0 across every package, including `@oselvar/website`'s and `@oselvar/website-starlight`'s Astro builds.

- [ ] **Step 2: Full check**

Run (from `typescript/`): `pnpm check`
Expected: exit 0. This runs `pnpm lint && pnpm typecheck && pnpm test && pnpm knip && pnpm jscpd` in sequence.

If `pnpm lint`'s literal `biome check .` invocation fails specifically because of a worktree-path/`.claude`-exclude-glob collision (a known, pre-existing, unrelated environmental issue documented in earlier plans on this branch), verify with `biome check packages` instead and don't attempt to fix `biome.json`.

If `knip` reports anything about `var-core`'s removed `/node` subpath or the new `var-config` package, investigate whether it's a real leftover reference (fix it) versus a stale `ignoreDependencies` entry that's no longer needed anywhere (remove it) — don't add a new ignore to silence a real finding.

- [ ] **Step 3: Confirm no other package still references the removed `@oselvar/var-core/node` subpath**

Run: `grep -rln "@oselvar/var-core/node" packages --include="*.ts" | grep -v node_modules | grep -v dist`
Expected: no output (empty). If anything is found, it's a missed consumer — fix its import to `@oselvar/var-config` and re-run Steps 1-2.

- [ ] **Step 4: Final commit (if any fixups were needed)**

If Steps 1–3 required any fixes, commit them now with a message describing what broke and why. If everything was already green, there's nothing to commit here.

---

## Self-Review Notes

- **Spec coverage:** the design doc's "what moves" (config.ts, config-types.ts, find-files.ts, their test), "stays in var-core" (ScannerPlugin), "consumers" (var-lsp's 3 files + a 4th the design doc didn't originally list — `tests/handlers.test.ts`, found during grounding and added here — plus var-runner's config.ts), and "package setup" (single export surface, no subpath split) are all covered by Task 1. The design doc's explicit out-of-scope items (wiring `var-vscode`, renaming `var-runner`'s aliases) have no corresponding task — correct.
- **Placeholder scan:** no TBD/TODO; every step shows exact file content or exact commands.
- **Type consistency:** `VarConfig`/`VarGlobs`/`loadVarConfig`/`findFiles` are exported identically from `var-config/src/index.ts` (Step 5) and consumed with matching names at every call site (Steps 9-15) — no renaming anywhere except the pre-existing, unchanged `var-runner` aliases (`readVarConfig`/`findSpecs`), which this plan deliberately leaves alone per the design doc.
