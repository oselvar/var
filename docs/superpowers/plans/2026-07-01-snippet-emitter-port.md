# SnippetEmitter Port + Relocate Snippet Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract a narrow `SnippetEmitter` port (the one genuinely per-language piece of snippet generation — the type-name mapping) and relocate the whole snippet-generation module from `var-core` to `var-language`, since it's an authoring/LSP-only concern that never gets ported to Python.

**Architecture:** Move `snippet.ts`/`snippet-template.ts`/`template.ts` (plus their tests) from `var-core/src`/`tests` to `var-language/src`/`tests` unchanged in behavior; add a `snippet-emitter.ts` port there too. Update every import path this move touches. Along the way, remove `var-cli`'s `stepdef` command first, since it's the one consumer that would otherwise force `var-cli` to depend on `var-language` (and therefore `web-tree-sitter`) for a plain text-transform feature.

**Tech Stack:** TypeScript strict (`noUncheckedIndexedAccess`, `verbatimModuleSyntax`, `exactOptionalPropertyTypes`), vitest, pnpm workspace.

## Global Constraints

- Run all pnpm/vitest/tsc commands from `typescript/` (this plan's paths are relative to that directory).
- `pnpm -r build` type-checks `src/`; `pnpm typecheck` (part of `pnpm check`) type-checks `tests/`. A green vitest run does not prove either passes.
- Biome style: single quotes, no semicolons, 2-space indent, trailing commas, `import type` (or inline `type` per-specifier in a mixed import) for type-only imports (`verbatimModuleSyntax`), `node:` protocol for built-ins.
- This is a **behavior-preserving refactor plus one feature removal** (the `var stepdef` CLI command) — no other behavior changes. Existing tests are the regression guard; don't rewrite their assertions, only their import paths/fixture strings where a moved/removed symbol forces it.
- Reference design doc: `docs/superpowers/specs/2026-07-01-snippet-emitter-port-design.md`.

---

### Task 1: Remove the `var stepdef` CLI command

**Files:**
- Delete: `packages/var-cli/src/stepdef.ts`
- Delete: `packages/var-cli/tests/stepdef.test.ts`
- Modify: `packages/var-cli/src/bin.ts`
- Modify: `packages/var-cli/src/index.ts`
- Modify: `packages/var-cli/tests/argv.test.ts`
- Modify: `packages/var-cli/tests/e2e.test.ts`

**Interfaces:** none produced or consumed by later tasks — this task only removes code.

- [ ] **Step 1: Delete the stepdef source and its dedicated test file**

```bash
rm packages/var-cli/src/stepdef.ts packages/var-cli/tests/stepdef.test.ts
```

- [ ] **Step 2: Remove stepdef from `bin.ts`**

Replace the full contents of `packages/var-cli/src/bin.ts` with:

```ts
#!/usr/bin/env node
import { parseArgv } from './argv.js'
import { runInit } from './init.js'
import { runLint } from './lint.js'
import { runRun } from './run.js'

const parsed = parseArgv(process.argv.slice(2))

async function main(): Promise<void> {
  const io = {
    cwd: process.cwd(),
    writeStdout: (s: string) => process.stdout.write(s),
    writeStderr: (s: string) => process.stderr.write(s),
  }
  const globs = parsed.positionals.length > 0 ? parsed.positionals : undefined
  switch (parsed.command) {
    case '':
    case 'help':
    case '--help':
    case '-h':
      process.stdout.write(
        [
          'var — markdown-native BDD',
          '',
          'Usage:',
          '  var run [globs]        run markdown spec examples (no test runner)',
          '  var lint [globs]       check for missing/ambiguous/orphan steps',
          '  var init               scaffold a new project',
          '',
        ].join('\n'),
      )
      break
    case 'lint': {
      const result = await runLint({ ...io, json: parsed.flags.json === true, globs })
      process.exitCode = result.exitCode
      break
    }
    case 'init': {
      const result = await runInit({ cwd: io.cwd, writeStdout: io.writeStdout })
      process.exitCode = result.exitCode
      break
    }
    case 'run': {
      const result = await runRun({ ...io, globs })
      process.exitCode = result.exitCode
      break
    }
    default:
      process.stderr.write(`var: unknown command "${parsed.command}". Try \`var help\`.\n`)
      process.exitCode = 1
  }
}

main().catch((err: unknown) => {
  process.stderr.write(`var: ${err instanceof Error ? err.message : String(err)}\n`)
  process.exitCode = 1
})
```

- [ ] **Step 3: Remove the stepdef type export from `index.ts`**

Replace the full contents of `packages/var-cli/src/index.ts` with:

```ts
export type { VarDoc } from '@oselvar/var-core'
export type { ParsedArgv } from './argv.js'
export type { InitOptions, InitResult } from './init.js'
export type { LintOptions, LintResult } from './lint.js'
export type { RunOptions, RunResult } from './run.js'
export const VERSION = '0.0.0'
```

- [ ] **Step 4: Update `argv.test.ts` — `parseArgv` is generic and doesn't care about command semantics, but it shouldn't keep using a command name that no longer exists as its example**

Replace the full contents of `packages/var-cli/tests/argv.test.ts` with:

```ts
import { expect, test } from 'vitest'
import { parseArgv } from '../src/argv.js'

test('parses a subcommand with positionals', () => {
  const r = parseArgv(['lint', 'packages/**/*.md'])
  expect(r.command).toBe('lint')
  expect(r.positionals).toEqual(['packages/**/*.md'])
  expect(r.flags).toEqual({})
})

test('parses long flags with values', () => {
  const r = parseArgv(['lint', 'packages/**/*.md', '--file', 'steps/foo.steps.ts'])
  expect(r.flags.file).toBe('steps/foo.steps.ts')
})

test('parses long flags without values as true', () => {
  const r = parseArgv(['lint', '--json'])
  expect(r.flags.json).toBe(true)
})

test('parses --key=value syntax', () => {
  const r = parseArgv(['lint', 'x', '--file=steps/foo.steps.ts'])
  expect(r.flags.file).toBe('steps/foo.steps.ts')
})

test('reports the empty command when no args', () => {
  const r = parseArgv([])
  expect(r.command).toBe('')
})
```

- [ ] **Step 5: Remove the stepdef e2e test**

In `packages/var-cli/tests/e2e.test.ts`, delete this test block (the first `test(...)` inside the `describe('var CLI (source via tsx)', ...)` block) — leave the `describe` wrapper, the `run`/`HERE`/`BIN_TS`/`WORKSPACE_ROOT`/`TSX` setup above it, and the other two tests (`init scaffolds...`, `lint --json exits 0...`) untouched:

```ts
  test('stepdef --print emits the templated snippet to stdout', () => {
    const dir = mkdtempSync(join(tmpdir(), 'var-e2e-'))
    try {
      const r = run(['stepdef', 'I have 5 cukes', '--print'], dir)
      expect(r.status).toBe(0)
      expect(r.stdout).toContain("action('I have {int} cukes', (state, count: number) => {")
      expect(r.stdout).toContain("throw new Error('not implemented')")
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

```

(Delete exactly that block, including its trailing blank line, so `describe('var CLI (source via tsx)', () => {` is immediately followed by the `test('init scaffolds three files...`.)

- [ ] **Step 6: Run the var-cli test suite**

Run: `NODE_OPTIONS="--import tsx" npx vitest run packages/var-cli`
Expected: PASS — all remaining tests green (no `stepdef` references left anywhere in the suite).

- [ ] **Step 7: Type-check**

Run: `pnpm --filter @oselvar/var-cli build`
Expected: exit 0.

Run (from `typescript/`): `pnpm typecheck`
Expected: exit 0.

- [ ] **Step 8: Commit**

```bash
git add packages/var-cli/src/bin.ts packages/var-cli/src/index.ts packages/var-cli/tests/argv.test.ts packages/var-cli/tests/e2e.test.ts
git rm packages/var-cli/src/stepdef.ts packages/var-cli/tests/stepdef.test.ts
git commit -m "feat(var-cli)!: remove the stepdef command

Only consumer of generateSnippet that would otherwise force var-cli to
depend on var-language (and web-tree-sitter) for a plain text-transform
feature. BREAKING CHANGE: \`var stepdef\` no longer exists."
```

---

### Task 2: Relocate snippet generation from `var-core` to `var-language`

**Files:**
- Create: `packages/var-language/src/snippet.ts`
- Create: `packages/var-language/src/snippet-template.ts`
- Create: `packages/var-language/src/template.ts`
- Create: `packages/var-language/tests/snippet.test.ts`
- Create: `packages/var-language/tests/template.test.ts`
- Delete: `packages/var-core/src/snippet.ts`
- Delete: `packages/var-core/src/snippet-template.ts`
- Delete: `packages/var-core/src/template.ts`
- Delete: `packages/var-core/tests/snippet.test.ts`
- Delete: `packages/var-core/tests/template.test.ts`
- Modify: `packages/var-core/src/index.ts`
- Modify: `packages/var-core/src/config-types.ts`
- Modify: `packages/var-core/src/config.ts`
- Modify: `packages/var-language/src/index.ts`
- Modify: `packages/var-language/package.json`
- Modify: `packages/var-lsp/src/store.ts`
- Modify: `packages/var-lsp/src/handlers.ts`
- Modify: `packages/var-lsp/src/store.test.ts`
- Modify: `packages/website/src/lib/var-worker.ts`
- Modify: `packages/website/package.json`

**A dependency-direction problem surfaces mid-task, fixed by Steps 7–10
below:** `var-core/src/config.ts` currently imports `DEFAULT_SNIPPET_TEMPLATE`
from `./snippet-template.js` to build its own `DEFAULT_CONFIG.snippet.template`
default. Once that file moves to `var-language` (Steps 1–6), `config.ts`
importing it back from `@oselvar/var-language` would make `var-core` depend on
`var-language` — backwards, since `var-language` already depends on
`var-core`. `generateSnippet` (in the moved `snippet.ts`) already has its own
fallback (`options.template ?? DEFAULT_SNIPPET_TEMPLATE`), so `config.ts`'s
copy of that same default is redundant duplication one layer up. Steps 7–10
remove it: `VarConfig.snippet.template` becomes optional, and
`generateSnippet`'s own fallback becomes the single source of truth for the
default template.

**Interfaces:**
- Consumes: `Registry`, `StepKind` (both exported from `@oselvar/var-core`, unchanged — `registry.ts`/`step-role.ts` stay in `var-core`).
- Produces: `generateSnippet(rawText: string, registry: Registry, options?: { template?: string; role?: StepKind }): Snippet`, `type Snippet = { expression: string; handlerSignature: string; fullCode: string }`, `DEFAULT_SNIPPET_TEMPLATE: string`, `renderTemplate(template: string, vars: Readonly<Record<string,string>>): string` — all now exported from `@oselvar/var-language` instead of `@oselvar/var-core`. Task 3 adds `SnippetEmitter`/`createTypeScriptSnippetEmitter` alongside these in the same package.

- [ ] **Step 1: Move `snippet-template.ts` and `template.ts` verbatim — no import changes needed**

```bash
git mv packages/var-core/src/snippet-template.ts packages/var-language/src/snippet-template.ts
git mv packages/var-core/src/template.ts packages/var-language/src/template.ts
git mv packages/var-core/tests/template.test.ts packages/var-language/tests/template.test.ts
```

These three files have no cross-package imports (`snippet-template.ts` is a standalone string constant; `template.ts` is a standalone pure function; `template.test.ts` only imports `renderTemplate` via a relative path that stays correct after the move). No edits needed to their contents.

- [ ] **Step 2: Move `snippet.ts`, fixing its now-cross-package imports**

```bash
git mv packages/var-core/src/snippet.ts packages/var-language/src/snippet.ts
```

Edit `packages/var-language/src/snippet.ts` — change only the two relative imports at the top (everything else in the file is unchanged):

```ts
import { CucumberExpressionGenerator } from '@cucumber/cucumber-expressions'
import type { Registry, StepKind } from '@oselvar/var-core'
import { DEFAULT_SNIPPET_TEMPLATE } from './snippet-template.js'
import { renderTemplate } from './template.js'
```

(This replaces the original `import type { Registry } from './registry.js'` and `import type { StepKind } from './step-role.js'` lines with the single `@oselvar/var-core` import above. The `CucumberExpressionGenerator`, `DEFAULT_SNIPPET_TEMPLATE`, and `renderTemplate` import lines are unchanged from the original file.)

- [ ] **Step 3: Move `snippet.test.ts`, fixing its now-cross-package import**

```bash
git mv packages/var-core/tests/snippet.test.ts packages/var-language/tests/snippet.test.ts
```

Edit `packages/var-language/tests/snippet.test.ts` — change only the `createRegistry` import line:

```ts
import { ParameterType } from '@cucumber/cucumber-expressions'
import { createRegistry } from '@oselvar/var-core'
import { expect, test } from 'vitest'
import { generateSnippet } from '../src/snippet.js'
```

(The rest of the file — all 12 `test(...)` blocks — is unchanged. `createRegistry` moves from a relative `../src/registry.js` import to the public `@oselvar/var-core` package import; `generateSnippet` stays a relative import since it now lives in the same package.)

- [ ] **Step 4: Update `var-core`'s public exports — remove the four snippet-related exports**

Edit `packages/var-core/src/index.ts`, deleting these three lines (they're consecutive in the file, interspersed with unrelated exports — delete only these, keep everything else):

```ts
export type { Snippet } from './snippet.js'
export { generateSnippet } from './snippet.js'
export { DEFAULT_SNIPPET_TEMPLATE } from './snippet-template.js'
```

and this line:

```ts
export { renderTemplate } from './template.js'
```

- [ ] **Step 5: Add the exports to `var-language`'s public entry**

Edit `packages/var-language/src/index.ts`, adding these lines (keep every existing line unchanged):

```ts
export type { Snippet } from './snippet.js'
export { generateSnippet } from './snippet.js'
export { DEFAULT_SNIPPET_TEMPLATE } from './snippet-template.js'
export { renderTemplate } from './template.js'
```

- [ ] **Step 6: Add `@cucumber/cucumber-expressions` to `var-language`'s dependencies**

Edit `packages/var-language/package.json`, adding it to `"dependencies"` (alongside the existing three entries):

```json
  "dependencies": {
    "@cucumber/cucumber-expressions": "^20.0.0",
    "@oselvar/var-core": "workspace:*",
    "typescript": "^6.0.3",
    "web-tree-sitter": "^0.26.10"
  },
```

Run `pnpm install` from `typescript/`.

- [ ] **Step 7: Make `VarConfig.snippet.template` optional**

Edit `packages/var-core/src/config-types.ts`. Change:

```ts
export type VarConfig = {
  readonly vars: VarGlobs
  readonly steps: ReadonlyArray<string>
  readonly snippet: { readonly template: string }
  // Opt-in scanner extensions. Empty by default — projects migrating from
  // Cucumber typically add `[gherkinTables(), gherkinDocStrings()]` here.
  readonly scannerPlugins: ReadonlyArray<ScannerPlugin>
}
```

to:

```ts
export type VarConfig = {
  readonly vars: VarGlobs
  readonly steps: ReadonlyArray<string>
  readonly snippet: { readonly template?: string }
  // Opt-in scanner extensions. Empty by default — projects migrating from
  // Cucumber typically add `[gherkinTables(), gherkinDocStrings()]` here.
  readonly scannerPlugins: ReadonlyArray<ScannerPlugin>
}
```

- [ ] **Step 8: Remove `config.ts`'s now-circular dependency on the default template**

Replace the full contents of `packages/var-core/src/config.ts` with:

```ts
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { VarConfig, VarGlobs } from './config-types.js'
import type { ScannerPlugin } from './scanner.js'

export type { VarConfig, VarGlobs } from './config-types.js'

const DEFAULT_CONFIG: VarConfig = {
  // No default spec glob: specs are plain `.md` files, so a greedy default would
  // parse every README in the repo. A repo must declare `vars` explicitly.
  vars: { include: [], exclude: [] },
  steps: ['**/*.steps.ts'],
  // No default template here — generateSnippet (in @oselvar/var-language)
  // already falls back to its own DEFAULT_SNIPPET_TEMPLATE when no template
  // is supplied. Keeping a second copy of that default here would just be
  // the same value duplicated one layer up, and var-core can't import
  // var-language's snippet-template.ts without creating a backwards
  // dependency (var-language already depends on var-core).
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

(The `snippet: cfg.snippet?.template !== undefined ? { template: cfg.snippet.template } : {}`
line — rather than `snippet: { template: cfg.snippet?.template } }` — matters
under this project's `exactOptionalPropertyTypes`: the key must be omitted
entirely when there's no template, never set to a literal `undefined`.)

- [ ] **Step 9: Update `store.ts`'s `snippetTemplate()` return type**

Edit `packages/var-lsp/src/store.ts`. Change:

```ts
  snippetTemplate(): string
```

to:

```ts
  snippetTemplate(): string | undefined
```

(The implementation line, `snippetTemplate: () => config.snippet.template`, needs
no change — it already returns whatever `config.snippet.template` is, which is
now typed as `string | undefined` instead of `string`.)

- [ ] **Step 10: Fix `var-lsp/src/handlers.ts`'s import and its two `generateSnippet` call sites**

Edit `packages/var-lsp/src/handlers.ts`. Change the top-of-file imports from:

```ts
import {
  diffExpressions,
  expressionSegments,
  generateSnippet,
  inferStepRole,
  renderExpression,
  type StepKind,
} from '@oselvar/var-core'
import type { MatchRef } from '@oselvar/var-language'
```

to:

```ts
import {
  diffExpressions,
  expressionSegments,
  inferStepRole,
  renderExpression,
  type StepKind,
} from '@oselvar/var-core'
import { generateSnippet, type MatchRef } from '@oselvar/var-language'
```

Find the first `generateSnippet` call site (inside the `generateSnippet({ text, uri, position })` handler). Change:

```ts
      const snippet = generateSnippet(text, store.index().registry, {
        template: store.snippetTemplate(),
        ...(role !== undefined ? { role } : {}),
      })
```

to:

```ts
      const template = store.snippetTemplate()
      const snippet = generateSnippet(text, store.index().registry, {
        ...(template !== undefined ? { template } : {}),
        ...(role !== undefined ? { role } : {}),
      })
```

Find the second call site (inside `prepareRename`). Change:

```ts
      newExpression = generateSnippet(newName, store.index().registry, {
        template: store.snippetTemplate(),
      }).expression
```

to:

```ts
      const template = store.snippetTemplate()
      newExpression = generateSnippet(newName, store.index().registry, {
        ...(template !== undefined ? { template } : {}),
      }).expression
```

(Both changes apply the same `exactOptionalPropertyTypes`-driven pattern as
Step 8's `config.ts` fix — and the one used for the same reason in the
tree-sitter plan's Task 3 `store.ts` fix.)

- [ ] **Step 11: Fix `var-lsp/src/store.test.ts`'s import**

Edit `packages/var-lsp/src/store.test.ts`. Change:

```ts
import { DEFAULT_SNIPPET_TEMPLATE } from '@oselvar/var-core'
```

to:

```ts
import { DEFAULT_SNIPPET_TEMPLATE } from '@oselvar/var-language'
```

(`var-lsp` already depends on `@oselvar/var-language` — no `package.json` change needed here.)

- [ ] **Step 12: Fix `website`'s import and add the new dependency**

Edit `packages/website/src/lib/var-worker.ts`. Change:

```ts
import { DEFAULT_SNIPPET_TEMPLATE } from '@oselvar/var-core'
```

to:

```ts
import { DEFAULT_SNIPPET_TEMPLATE } from '@oselvar/var-language'
```

Edit `packages/website/package.json`, adding `@oselvar/var-language` to `"dependencies"` (alphabetically, between the existing `@oselvar/var-core` and `@oselvar/var-lsp` lines):

```json
    "@oselvar/var": "workspace:*",
    "@oselvar/var-core": "workspace:*",
    "@oselvar/var-language": "workspace:*",
    "@oselvar/var-lsp": "workspace:*",
```

Run `pnpm install` from `typescript/`.

- [ ] **Step 13: Run the affected test suites**

Run: `NODE_OPTIONS="--import tsx" npx vitest run packages/var-language packages/var-core packages/var-lsp packages/website`
Expected: PASS — `var-language/tests/snippet.test.ts` (12 tests) and `var-language/tests/template.test.ts` (7 tests) now pass from their new location; `var-core`'s own suite has two fewer test files but everything else is unaffected; `var-lsp`'s `store.test.ts`/`handlers.test.ts` and `website`'s suite are green with the new import paths and the now-optional `snippet.template`.

- [ ] **Step 14: Type-check**

Run: `pnpm --filter @oselvar/var-core --filter @oselvar/var-language --filter @oselvar/var-lsp build`
Expected: exit 0.

Run (from `typescript/`): `pnpm typecheck`
Expected: exit 0.

Note: this step does NOT type-check `packages/website/src` (its build is `astro build`, which doesn't type-check — see the tree-sitter plan's Task 4 finding). Run `pnpm --filter @oselvar/website check` too and confirm it reports no *new* errors caused by this change (the website already had pre-existing, unrelated type errors before this plan — compare against a baseline run if unsure which errors are pre-existing).

- [ ] **Step 15: Commit**

```bash
git add packages/var-core/src/index.ts packages/var-core/src/config-types.ts packages/var-core/src/config.ts packages/var-language/src/index.ts packages/var-language/package.json packages/var-lsp/src/store.ts packages/var-lsp/src/handlers.ts packages/var-lsp/src/store.test.ts packages/website/src/lib/var-worker.ts packages/website/package.json pnpm-lock.yaml
git add packages/var-language/src/snippet.ts packages/var-language/src/snippet-template.ts packages/var-language/src/template.ts packages/var-language/tests/snippet.test.ts packages/var-language/tests/template.test.ts
git commit -m "refactor: move snippet generation from var-core to var-language

Authoring/LSP-only concern that never gets ported to Python (confirmed:
python/packages/var-core has zero snippet code) — doesn't belong in the
module that's mirrored module-for-module across language ports. Along the
way, VarConfig.snippet.template becomes optional: generateSnippet already
had its own default-template fallback, so config.ts's copy of that default
was redundant, and importing it from var-language would have made var-core
depend on var-language — backwards."
```

---

### Task 3: Add the `SnippetEmitter` port and wire it into both call sites

**Files:**
- Create: `packages/var-language/src/snippet-emitter.ts`
- Create: `packages/var-language/tests/snippet-emitter.test.ts`
- Modify: `packages/var-language/src/snippet.ts`
- Modify: `packages/var-language/src/index.ts`
- Modify: `packages/var-language/src/step-defs.ts`
- Modify: `packages/var-lsp/src/handlers.ts`

**Interfaces:**
- Consumes: nothing new from earlier tasks beyond what Task 2 already relocated.
- Produces: `interface SnippetEmitter { typeNameFor(parameterType: { readonly type: unknown }): string }`, `createTypeScriptSnippetEmitter(): SnippetEmitter` — both exported from `@oselvar/var-language`.

- [ ] **Step 1: Write the failing test for the port**

Create `packages/var-language/tests/snippet-emitter.test.ts`:

```ts
import { expect, test } from 'vitest'
import { createTypeScriptSnippetEmitter } from '../src/snippet-emitter.js'

test('maps a Number-typed parameter type to "number"', () => {
  const emitter = createTypeScriptSnippetEmitter()
  expect(emitter.typeNameFor({ type: Number })).toBe('number')
})

test('maps anything else, including custom parameter types, to "string"', () => {
  const emitter = createTypeScriptSnippetEmitter()
  expect(emitter.typeNameFor({ type: String })).toBe('string')
  expect(emitter.typeNameFor({ type: Boolean })).toBe('string')
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `NODE_OPTIONS="--import tsx" npx vitest run packages/var-language/tests/snippet-emitter.test.ts`
Expected: FAIL — `Cannot find module '../src/snippet-emitter.js'`.

- [ ] **Step 3: Implement the port**

Create `packages/var-language/src/snippet-emitter.ts`:

```ts
export interface SnippetEmitter {
  typeNameFor(parameterType: { readonly type: unknown }): string
}

export function createTypeScriptSnippetEmitter(): SnippetEmitter {
  return {
    typeNameFor(parameterType) {
      return parameterType.type === Number ? 'number' : 'string'
    },
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `NODE_OPTIONS="--import tsx" npx vitest run packages/var-language/tests/snippet-emitter.test.ts`
Expected: PASS — 2 tests passed.

- [ ] **Step 5: Wire the port into `generateSnippet`**

Edit `packages/var-language/src/snippet.ts`. Add the import (alongside the existing ones):

```ts
import { CucumberExpressionGenerator } from '@cucumber/cucumber-expressions'
import type { Registry, StepKind } from '@oselvar/var-core'
import { createTypeScriptSnippetEmitter, type SnippetEmitter } from './snippet-emitter.js'
import { DEFAULT_SNIPPET_TEMPLATE } from './snippet-template.js'
import { renderTemplate } from './template.js'
```

Change the `generateSnippet` function signature from:

```ts
export function generateSnippet(
  rawText: string,
  registry: Registry,
  options: { readonly template?: string; readonly role?: StepKind } = {},
): Snippet {
```

to:

```ts
export function generateSnippet(
  rawText: string,
  registry: Registry,
  options: {
    readonly template?: string
    readonly role?: StepKind
    readonly snippetEmitter?: SnippetEmitter
  } = {},
): Snippet {
  const emitter = options.snippetEmitter ?? createTypeScriptSnippetEmitter()
```

(That second line is a new line added right after the signature, before the existing function body.)

Change the line that computes `tsType`:

```ts
    const tsType = pt.type === Number ? 'number' : 'string'
    return `${argName}: ${tsType}`
```

to:

```ts
    return `${argName}: ${emitter.typeNameFor(pt)}`
```

- [ ] **Step 6: Run `var-language`'s full test suite to confirm no regression**

Run: `NODE_OPTIONS="--import tsx" npx vitest run packages/var-language`
Expected: PASS — `snippet.test.ts`'s existing 12 tests still pass unchanged (they exercise `generateSnippet`'s default behavior, which is now routed through `createTypeScriptSnippetEmitter()` instead of an inline ternary — same output).

- [ ] **Step 7: Wire the port into `var-lsp`'s rename-refactor path, removing the duplicate `tsTypeFor`**

Edit `packages/var-lsp/src/handlers.ts`. Change the import from `@oselvar/var-language`
(as left by Task 2 Step 10) from:

```ts
import { generateSnippet, type MatchRef } from '@oselvar/var-language'
```

to:

```ts
import {
  createTypeScriptSnippetEmitter,
  generateSnippet,
  type MatchRef,
  type SnippetEmitter,
} from '@oselvar/var-language'
```

Find the `buildHandlerSync` function signature (currently starts `function buildHandlerSync(input: {`) and add a `snippetEmitter` field to its `input` type, plus a default inside the function body. Change:

```ts
function buildHandlerSync(input: {
  stepDefUri: string
  old: {
    range: { start: Position; end: Position }
    params: ReadonlyArray<{ name: string; typeText: string }>
  }
  paramFates: ReadonlyArray<
    | { kind: 'kept'; oldIndex: number; newIndex: number; nameUnchanged: boolean }
    | { kind: 'added'; newIndex: number; name: string }
    | { kind: 'removed'; oldIndex: number }
  >
  newExpressionParams: ReadonlyArray<string>
  registry: {
    parameterTypes: { parameterTypes: Iterable<{ name?: string | undefined; type: unknown }> }
  }
}): HandlerSync {
  const { old, paramFates, newExpressionParams, registry } = input
```

to:

```ts
function buildHandlerSync(input: {
  stepDefUri: string
  old: {
    range: { start: Position; end: Position }
    params: ReadonlyArray<{ name: string; typeText: string }>
  }
  paramFates: ReadonlyArray<
    | { kind: 'kept'; oldIndex: number; newIndex: number; nameUnchanged: boolean }
    | { kind: 'added'; newIndex: number; name: string }
    | { kind: 'removed'; oldIndex: number }
  >
  newExpressionParams: ReadonlyArray<string>
  registry: {
    parameterTypes: { parameterTypes: Iterable<{ name?: string | undefined; type: unknown }> }
  }
  snippetEmitter?: SnippetEmitter
}): HandlerSync {
  const { old, paramFates, newExpressionParams, registry } = input
  const emitter = input.snippetEmitter ?? createTypeScriptSnippetEmitter()
```

Find the line that calls `tsTypeFor`:

```ts
    const typeText = tsTypeFor(newPtName, paramTypeByName)
```

Replace it with:

```ts
    const paramType = paramTypeByName.get(newPtName)
    const typeText = paramType ? emitter.typeNameFor(paramType) : 'string'
```

Delete the now-unused `tsTypeFor` function entirely:

```ts
function tsTypeFor(ptName: string, index: Map<string, { type: unknown }>): string {
  const pt = index.get(ptName)
  return pt && (pt.type as unknown) === Number ? 'number' : 'string'
}
```

- [ ] **Step 8: Run `var-lsp`'s full test suite to confirm no regression**

Run: `NODE_OPTIONS="--import tsx" npx vitest run packages/var-lsp`
Expected: PASS — in particular, `handlers.test.ts`'s `planRename emits a handlerSync that adds a new typed arg when a parameter is added` (asserts `'ctx, name: string, count: number'`) and `planRename emits a handlerSync that swaps the TS type when a param type changes` (asserts `'ctx, airport: string'`) must still pass — these are the tests that directly exercise the code path `tsTypeFor` used to own.

- [ ] **Step 9: Tighten the `typeText` doc comment**

Edit `packages/var-language/src/step-defs.ts`. Find the `HandlerParam` type:

```ts
export type HandlerParam = {
  // The source text after the colon, e.g. `string` for `name: string` or
  // empty when no annotation is present (e.g. `ctx`).
  readonly typeText: string
  readonly name: string
}
```

Replace its comment with:

```ts
export type HandlerParam = {
  // The source text after the colon, e.g. `string` for `name: string` or
  // empty when no annotation is present (e.g. `ctx`). Opaque: produced
  // verbatim by whichever per-language scanner extracted it (TypeScript
  // compiler AST or tree-sitter node text) and never parsed downstream —
  // every consumer only concatenates it into rendered source.
  readonly typeText: string
  readonly name: string
}
```

- [ ] **Step 10: Export the new port from `var-language`'s public entry**

Edit `packages/var-language/src/index.ts`, adding this line (alongside the `Snippet`/`generateSnippet` exports added in Task 2):

```ts
export type { SnippetEmitter } from './snippet-emitter.js'
export { createTypeScriptSnippetEmitter } from './snippet-emitter.js'
```

- [ ] **Step 11: Full re-run and type-check**

Run: `NODE_OPTIONS="--import tsx" npx vitest run packages/var-language packages/var-lsp`
Expected: PASS.

Run: `pnpm --filter @oselvar/var-language --filter @oselvar/var-lsp build`
Expected: exit 0.

Run (from `typescript/`): `pnpm typecheck`
Expected: exit 0.

- [ ] **Step 12: Commit**

```bash
git add packages/var-language/src/snippet-emitter.ts packages/var-language/tests/snippet-emitter.test.ts packages/var-language/src/snippet.ts packages/var-language/src/index.ts packages/var-language/src/step-defs.ts packages/var-lsp/src/handlers.ts
git commit -m "feat(var-language): extract SnippetEmitter port, dedupe the TS type-name mapping

Consolidates two independent hardcoded copies of the same 'Number -> number,
else -> string' mapping (var-core/snippet.ts and var-lsp/handlers.ts's
tsTypeFor) behind one port. Also documents typeText's already-true opaque
invariant."
```

---

### Task 4: Full workspace verification

**Files:** none (verification only).

- [ ] **Step 1: Full build**

Run (from `typescript/`): `pnpm -r build`
Expected: exit 0 across every package, including `@oselvar/website`'s Astro build.

- [ ] **Step 2: Full check**

Run (from `typescript/`): `pnpm check`
Expected: exit 0. This runs `pnpm lint && pnpm typecheck && pnpm test && pnpm knip && pnpm jscpd` in sequence.

If `knip` flags anything in `var-core` or `var-cli` as newly unused (e.g. leftover `@cucumber/cucumber-expressions` references, or a stale `ignoreDependencies` entry no longer needed since `stepdef.ts` is gone), remove the stale config rather than adding a new ignore. If `pnpm lint`'s literal `biome check .` invocation fails specifically because of the pre-existing worktree-path/`.claude`-exclude-glob collision documented in the tree-sitter plan's Task 4, that's a known, unrelated environmental issue — verify with `biome check packages` instead and don't attempt to fix `biome.json` as part of this plan.

- [ ] **Step 3: Manually confirm the LSP's generate-snippet and rename-refactor code actions still work**

Run: `NODE_OPTIONS="--import tsx" npx vitest run packages/var-lsp/tests/handlers.test.ts -t "generateSnippet"`
Expected: PASS — all three `generateSnippet` tests in `handlers.test.ts` (turns selected text into a stub; infers action role; infers sensor role) pass, proving the LSP's `var/generateSnippet` request still produces correct output end-to-end through the relocated code.

- [ ] **Step 4: Final commit (if any fixups were needed)**

If Steps 1–3 required any fixes, commit them now with a message describing what broke and why. If everything was already green, there's nothing to commit here.

---

## Self-Review Notes

- **Spec coverage:** every section of the design doc has a task — the `var-cli` removal (Task 1, resolving the dependency-weight question the user answered), the relocation (Task 2, including the `VarConfig.snippet` field correctly staying in `var-core`), the port itself and both call-site wirings (Task 3), the `typeText` doc tightening (Task 3 Step 9), and full verification (Task 4). The de-hardcoding of `.steps.ts` literals and any actual second-language emitter are correctly absent — both are explicitly out of scope per the design doc.
- **Placeholder scan:** no TBD/TODO; every step shows exact file content or exact commands.
- **Type consistency:** `SnippetEmitter.typeNameFor(parameterType: { readonly type: unknown })` is the same shape everywhere it appears — the port definition (Task 3 Step 3), `generateSnippet`'s usage (Task 3 Step 5, called on a real `ParameterType` from `cucumber-expressions`, which has a `.type` field), and `buildHandlerSync`'s usage (Task 3 Step 7, called on a `paramTypeByName` entry whose value type is `{ type: unknown }` — structurally compatible). `createTypeScriptSnippetEmitter` is imported and referenced identically in `snippet.ts` and `handlers.ts`.
