# Plan 4 — VSCode Extension Foundation (LSP + Hover + Goto + Diagnostics)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land three new packages — `@oselvar/bdd-language` (pure types + indexer), `@oselvar/bdd-lsp` (Node LSP server), `@oselvar/bdd-vscode` (extension client). After this plan, the user can `pnpm install:vscode` once, reload the editor, open a `.bdd.md` file, and get hover info, go-to-definition (md → stepdef), and missing-step / ambiguous-match diagnostics inline.

**Architecture:** Hexagonal. `bdd-language` is pure (types + indexer logic, uses `typescript` compiler API and `@oselvar/bdd` parse/plan). `bdd-lsp` is the imperative shell (vscode-languageserver runtime, filesystem, stdio transport). `bdd-vscode` is the editor client (vscode-languageclient, decorations later in Plan 5).

**Tech Stack:** Same workspace + tsx test loop. New runtime deps: `typescript` (already in devDeps; promote to runtime dep in bdd-language), `vscode-languageserver`, `vscode-languageserver-textdocument`, `vscode-languageclient`, `@types/vscode`.

**Depends on:** Plans 1, 1b, 1c, 2, 3.

**In scope:**
- Three package scaffolds with the now-standard `exports.import → src/*.ts` + `publishConfig` shape
- TS AST step-def discovery (call expressions of `step('...')`)
- `WorkspaceIndex` builder: combine step defs + parsed `.bdd.md` files via `@oselvar/bdd`'s plan
- LSP handlers: `initialize`, `textDocument/didOpen`, `textDocument/didSave`, `textDocument/hover`, `textDocument/definition`, server-pushed `textDocument/publishDiagnostics`
- VSCode client that spawns the LSP server over stdio and activates on `.bdd.md` / `.steps.ts`
- `scripts/install-vscode.mjs` symlink installer + root `install:vscode` script
- Smoke tests for: TS AST discovery, indexer, hover/definition handlers (unit-level — no full LSP)

**Out of scope (deferred to Plans 5 and 6):**
- Subtle-background highlight decorations (Plan 5)
- Code lens "➜ N references" + find-references from `.steps.ts` side (Plan 5)
- Auto-completion in `.bdd.md` (Plan 6)
- Code action / Generate-from-selection (Plan 6)
- Quick Pick of target step file (Plan 6)
- `.vsix` packaging + marketplace publishing
- Watch mode (re-analysis trigger is on-save + on-open per your call)

---

## Task 1: `@oselvar/bdd-language` package skeleton

**Files:**
- Create: `packages/bdd-language/package.json`
- Create: `packages/bdd-language/tsconfig.json`
- Create: `packages/bdd-language/vitest.config.ts`
- Create: `packages/bdd-language/src/index.ts`
- Create: `packages/bdd-language/tests/smoke.test.ts`
- Modify: `knip.json` (add the new workspace)

- [ ] **Step 1: Write `packages/bdd-language/package.json`**

```json
{
  "name": "@oselvar/bdd-language",
  "version": "0.0.0",
  "type": "module",
  "exports": { ".": { "types": "./src/index.ts", "import": "./src/index.ts" } },
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "files": ["dist", "README.md"],
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "vitest run"
  },
  "dependencies": {
    "@oselvar/bdd": "workspace:*",
    "typescript": "^5.6.3"
  },
  "publishConfig": {
    "exports": { ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" } },
    "main": "./dist/index.js",
    "types": "./dist/index.d.ts"
  }
}
```

NOTE: `typescript` was a devDep at the root; we now declare it as a runtime dep here because the indexer uses the compiler API.

- [ ] **Step 2: `packages/bdd-language/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "src" },
  "include": ["src"]
}
```

- [ ] **Step 3: `packages/bdd-language/vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    server: { deps: { inline: [/^@oselvar\//] } },
  },
})
```

- [ ] **Step 4: `packages/bdd-language/src/index.ts`**

```ts
export type { Bdd } from '@oselvar/bdd'
export const VERSION = '0.0.0'
```

- [ ] **Step 5: `packages/bdd-language/tests/smoke.test.ts`**

```ts
import { expect, test } from 'vitest'
import { VERSION } from '../src/index.js'

test('package exposes a version constant', () => {
  expect(VERSION).toBe('0.0.0')
})
```

- [ ] **Step 6: Update `knip.json`**

Add to `workspaces`:
```json
"packages/bdd-language": {
  "entry": ["src/index.ts"],
  "project": ["src/**/*.ts", "tests/**/*.ts"]
}
```

- [ ] **Step 7: Verify**

```
pnpm install
pnpm test 2>&1 | tail -10
pnpm lint
pnpm knip
pnpm jscpd
pnpm build
```

Expected: 143 tests pass (142 + 1 new smoke); all gates clean.

- [ ] **Step 8: Commit**

```bash
git add packages/bdd-language/ knip.json pnpm-lock.yaml
git commit -m "chore(bdd-language): scaffold @oselvar/bdd-language package"
```

---

## Task 2: TS AST-based step definition discovery

**Files:**
- Create: `packages/bdd-language/src/step-defs.ts`
- Create: `packages/bdd-language/tests/step-defs.test.ts`
- Modify: `packages/bdd-language/src/index.ts` (re-export)

Discover `step('...')` call expressions in a `.steps.ts` file via the TypeScript compiler API. Returns each call's expression string + source range.

- [ ] **Step 1: Write failing tests**

`packages/bdd-language/tests/step-defs.test.ts`:
```ts
import { expect, test } from 'vitest'
import { discoverStepDefs } from '../src/step-defs.js'

test('discovers a single step call with its source range', () => {
  const source = `import { step } from '@oselvar/bdd-vitest'
step('I have {int} cukes', (ctx, n) => {})
`
  const defs = discoverStepDefs('steps.ts', source)
  expect(defs).toHaveLength(1)
  expect(defs[0]?.expression).toBe('I have {int} cukes')
  // The expression literal starts at character 5 of line 2 (1-based).
  expect(defs[0]?.expressionRange.start.line).toBe(2)
  expect(defs[0]?.callRange.start.line).toBe(2)
})

test('discovers multiple step calls across the file', () => {
  const source = `import { step } from '@oselvar/bdd-vitest'
step('first', () => {})
step('second', () => {})
step('third', () => {})
`
  const defs = discoverStepDefs('steps.ts', source)
  expect(defs.map((d) => d.expression)).toEqual(['first', 'second', 'third'])
})

test('handles the destructured-step pattern: const { step } = defineContext(...)', () => {
  const source = `import { defineContext } from '@oselvar/bdd-vitest'
const { step } = defineContext(() => ({}))
step('I greet {string}', (ctx, name: string) => {})
`
  const defs = discoverStepDefs('steps.ts', source)
  expect(defs).toHaveLength(1)
  expect(defs[0]?.expression).toBe('I greet {string}')
})

test('ignores `step` in unrelated positions (e.g. shadowed locals, comments)', () => {
  const source = `// step('not a real step', () => {})
function step() {}
const obj = { step: 1 }
`
  const defs = discoverStepDefs('steps.ts', source)
  expect(defs).toHaveLength(0)
})

test('returns empty array for a file with no step calls', () => {
  expect(discoverStepDefs('empty.ts', '')).toEqual([])
  expect(discoverStepDefs('empty.ts', 'const x = 1\n')).toEqual([])
})
```

- [ ] **Step 2: Verify failure**

Run: `pnpm --filter @oselvar/bdd-language test`
Expected: cannot resolve `../src/step-defs.js`.

- [ ] **Step 3: Implement `packages/bdd-language/src/step-defs.ts`**

```ts
import ts from 'typescript'

export type Position = { readonly line: number; readonly character: number }
export type Range = { readonly start: Position; readonly end: Position }

export type StepDef = {
  readonly file: string
  readonly expression: string
  readonly expressionRange: Range
  readonly callRange: Range
}

export function discoverStepDefs(file: string, source: string): ReadonlyArray<StepDef> {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.ESNext, true)
  const out: StepDef[] = []
  visit(sf, sf, out, file)
  return out
}

function visit(
  sf: ts.SourceFile,
  node: ts.Node,
  out: StepDef[],
  file: string,
): void {
  if (ts.isCallExpression(node) && isStepCall(node) && node.arguments.length >= 1) {
    const arg0 = node.arguments[0]
    if (arg0 && ts.isStringLiteral(arg0)) {
      out.push({
        file,
        expression: arg0.text,
        expressionRange: rangeOf(sf, arg0),
        callRange: rangeOf(sf, node),
      })
    }
  }
  ts.forEachChild(node, (child) => visit(sf, child, out, file))
}

function isStepCall(node: ts.CallExpression): boolean {
  // Match `step(...)` regardless of whether `step` came from an import or a
  // destructured `defineContext(...)` return. We accept any bare identifier
  // named `step`. False positives from shadowed locals are filtered out by
  // the comment/method test in Step 1 — function declarations, properties,
  // and comments are not CallExpressions.
  return ts.isIdentifier(node.expression) && node.expression.text === 'step'
}

function rangeOf(sf: ts.SourceFile, node: ts.Node): Range {
  const start = sf.getLineAndCharacterOfPosition(node.getStart(sf))
  const end = sf.getLineAndCharacterOfPosition(node.getEnd())
  return {
    start: { line: start.line + 1, character: start.character + 1 },
    end: { line: end.line + 1, character: end.character + 1 },
  }
}
```

- [ ] **Step 4: Re-export from `packages/bdd-language/src/index.ts`**

```ts
export { discoverStepDefs } from './step-defs.js'
export type { StepDef, Range, Position } from './step-defs.js'
```

(Remove the `export type { Bdd }` placeholder — `typescript` runtime dep now keeps `@oselvar/bdd` referenced via downstream use.)

- [ ] **Step 5: Verify**

```
pnpm test 2>&1 | tail -10
pnpm lint
pnpm knip
pnpm build
```

Expected: 148 tests pass (143 + 5 new); all gates clean.

- [ ] **Step 6: Commit**

```bash
git add packages/bdd-language/src/step-defs.ts packages/bdd-language/src/index.ts packages/bdd-language/tests/step-defs.test.ts
git commit -m "feat(bdd-language): discover step defs via TypeScript AST"
```

---

## Task 3: `WorkspaceIndex` — combine step defs + parsed bdd files into match map

**Files:**
- Create: `packages/bdd-language/src/index-workspace.ts`
- Create: `packages/bdd-language/tests/index-workspace.test.ts`
- Modify: `packages/bdd-language/src/index.ts` (re-export)

A pure builder that takes raw source strings for `.steps.ts` and `.bdd.md` files and produces a `WorkspaceIndex` — the data structure the LSP queries for hover, definition, references, diagnostics.

- [ ] **Step 1: Write failing tests**

`packages/bdd-language/tests/index-workspace.test.ts`:
```ts
import { expect, test } from 'vitest'
import { buildWorkspaceIndex } from '../src/index-workspace.js'

test('cross-references matched substrings in .bdd.md to their step defs', () => {
  const idx = buildWorkspaceIndex({
    stepFiles: [
      {
        path: '/abs/steps/account.steps.ts',
        source: `step('I have {int} cukes', (ctx, n) => {})
`,
      },
    ],
    bddFiles: [
      {
        path: '/abs/belly.bdd.md',
        source: '# Belly\n\nGiven I have 5 cukes',
      },
    ],
  })
  expect(idx.stepDefs).toHaveLength(1)
  expect(idx.matches).toHaveLength(1)
  const m = idx.matches[0]
  expect(m?.bddPath).toBe('/abs/belly.bdd.md')
  expect(m?.stepDef.expression).toBe('I have {int} cukes')
  // Match starts somewhere inside line 3 (the body).
  expect(m?.range.start.line).toBe(3)
})

test('an unmatched keyword-led sentence becomes a missing-step diagnostic', () => {
  const idx = buildWorkspaceIndex({
    stepFiles: [],
    bddFiles: [{ path: '/m.bdd.md', source: '# M\n\nGiven I have 5 cukes' }],
  })
  expect(idx.diagnostics).toHaveLength(1)
  expect(idx.diagnostics[0]?.code).toBe('missing-step')
  expect(idx.diagnostics[0]?.bddPath).toBe('/m.bdd.md')
})

test('ambiguous matches surface as ambiguous-match diagnostics', () => {
  const idx = buildWorkspaceIndex({
    stepFiles: [
      {
        path: '/s.ts',
        source: `step('I have {int} cukes', () => {})
step('I have {int} {word}', () => {})
`,
      },
    ],
    bddFiles: [{ path: '/a.bdd.md', source: '# Ambig\n\nGiven I have 5 cukes' }],
  })
  const codes = idx.diagnostics.map((d) => d.code)
  expect(codes).toContain('ambiguous-match')
})

test('the index is empty for an empty workspace', () => {
  const idx = buildWorkspaceIndex({ stepFiles: [], bddFiles: [] })
  expect(idx.stepDefs).toEqual([])
  expect(idx.matches).toEqual([])
  expect(idx.diagnostics).toEqual([])
})
```

- [ ] **Step 2: Verify failure**

Run: `pnpm --filter @oselvar/bdd-language test`
Expected: cannot resolve `../src/index-workspace.js`.

- [ ] **Step 3: Implement `packages/bdd-language/src/index-workspace.ts`**

```ts
import { addStep, createRegistry, parse, plan } from '@oselvar/bdd'
import { type Range, type StepDef, discoverStepDefs } from './step-defs.js'

export type WorkspaceInput = {
  readonly stepFiles: ReadonlyArray<{ readonly path: string; readonly source: string }>
  readonly bddFiles: ReadonlyArray<{ readonly path: string; readonly source: string }>
}

export type MatchRef = {
  readonly bddPath: string
  readonly range: Range
  readonly stepDef: StepDef
}

export type DiagnosticRef = {
  readonly bddPath: string
  readonly code: string
  readonly severity: 'error' | 'warning'
  readonly message: string
  readonly range: Range
}

export type WorkspaceIndex = {
  readonly stepDefs: ReadonlyArray<StepDef>
  readonly matches: ReadonlyArray<MatchRef>
  readonly diagnostics: ReadonlyArray<DiagnosticRef>
}

const EMPTY_HANDLER = (): void => {}

export function buildWorkspaceIndex(input: WorkspaceInput): WorkspaceIndex {
  const stepDefs: StepDef[] = []
  let registry = createRegistry()
  for (const file of input.stepFiles) {
    const defs = discoverStepDefs(file.path, file.source)
    for (const def of defs) {
      stepDefs.push(def)
      try {
        registry = addStep(registry, {
          expression: def.expression,
          expressionSourceFile: def.file,
          expressionSourceLine: def.expressionRange.start.line,
          handler: EMPTY_HANDLER,
        })
      } catch {
        // duplicate step definition — surface as a diagnostic in a future iteration.
      }
    }
  }

  const matches: MatchRef[] = []
  const diagnostics: DiagnosticRef[] = []

  for (const file of input.bddFiles) {
    const bdd = parse(file.path, file.source)
    const result = plan(bdd, registry)
    for (const ex of result.examples) {
      for (const step of ex.steps) {
        const def = stepDefs.find(
          (d) =>
            d.expression === step.stepDef.expression &&
            d.file === step.stepDef.expressionSourceFile,
        )
        if (!def) continue
        matches.push({
          bddPath: file.path,
          range: toRange(step.matchSpan),
          stepDef: def,
        })
      }
    }
    for (const d of result.diagnostics) {
      diagnostics.push({
        bddPath: file.path,
        code: d.code,
        severity: d.severity,
        message: d.message,
        range: toRange(d.span),
      })
    }
  }

  return { stepDefs, matches, diagnostics }
}

type SpanLike = {
  readonly startLine: number
  readonly startCol: number
  readonly endLine: number
  readonly endCol: number
}

function toRange(span: SpanLike): Range {
  return {
    start: { line: span.startLine, character: span.startCol },
    end: { line: span.endLine, character: span.endCol },
  }
}
```

- [ ] **Step 4: Re-export from `packages/bdd-language/src/index.ts`**

```ts
export { buildWorkspaceIndex } from './index-workspace.js'
export type { WorkspaceIndex, WorkspaceInput, MatchRef, DiagnosticRef } from './index-workspace.js'
```

- [ ] **Step 5: Verify**

```
pnpm test 2>&1 | tail -10
pnpm lint
pnpm build
```

Expected: 152 tests pass (148 + 4 new); all gates clean.

- [ ] **Step 6: Commit**

```bash
git add packages/bdd-language/src/index-workspace.ts packages/bdd-language/src/index.ts packages/bdd-language/tests/index-workspace.test.ts
git commit -m "feat(bdd-language): build workspace index from step defs + bdd files"
```

---

## Task 4: `@oselvar/bdd-lsp` package skeleton + LSP connection

**Files:**
- Create: `packages/bdd-lsp/package.json`
- Create: `packages/bdd-lsp/tsconfig.json`
- Create: `packages/bdd-lsp/vitest.config.ts`
- Create: `packages/bdd-lsp/src/server.ts`
- Create: `packages/bdd-lsp/src/bin.ts`
- Create: `packages/bdd-lsp/tests/smoke.test.ts`
- Modify: `knip.json`

Bare-bones LSP server: responds to `initialize`, says hello on a custom request. Real handlers land in Task 5+.

- [ ] **Step 1: Write `packages/bdd-lsp/package.json`**

```json
{
  "name": "@oselvar/bdd-lsp",
  "version": "0.0.0",
  "type": "module",
  "exports": { ".": { "types": "./src/server.ts", "import": "./src/server.ts" } },
  "main": "./src/server.ts",
  "types": "./src/server.ts",
  "bin": { "bdd-lsp": "./dist/bin.js" },
  "files": ["dist", "README.md"],
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "vitest run"
  },
  "dependencies": {
    "@oselvar/bdd": "workspace:*",
    "@oselvar/bdd-language": "workspace:*",
    "vscode-languageserver": "^9.0.1",
    "vscode-languageserver-textdocument": "^1.0.12"
  },
  "publishConfig": {
    "exports": { ".": { "types": "./dist/server.d.ts", "import": "./dist/server.js" } },
    "main": "./dist/server.js",
    "types": "./dist/server.d.ts"
  }
}
```

- [ ] **Step 2: `packages/bdd-lsp/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "src" },
  "include": ["src"]
}
```

- [ ] **Step 3: `packages/bdd-lsp/vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    server: { deps: { inline: [/^@oselvar\//] } },
  },
})
```

- [ ] **Step 4: `packages/bdd-lsp/src/server.ts`**

```ts
import { type Connection, TextDocumentSyncKind } from 'vscode-languageserver'

export function registerHandlers(connection: Connection): void {
  connection.onInitialize(() => ({
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Full,
    },
  }))
}
```

- [ ] **Step 5: `packages/bdd-lsp/src/bin.ts`**

```ts
#!/usr/bin/env node
import { ProposedFeatures, createConnection } from 'vscode-languageserver/node.js'
import { registerHandlers } from './server.js'

const connection = createConnection(ProposedFeatures.all)
registerHandlers(connection)
connection.listen()
```

- [ ] **Step 6: `packages/bdd-lsp/tests/smoke.test.ts`**

```ts
import { expect, test } from 'vitest'
import { registerHandlers } from '../src/server.js'

test('registerHandlers is a function', () => {
  expect(typeof registerHandlers).toBe('function')
})
```

(LSP integration tests come in Task 5+; smoke just confirms the module loads cleanly.)

- [ ] **Step 7: Update `knip.json`**

Add to `workspaces`:
```json
"packages/bdd-lsp": {
  "entry": ["src/server.ts", "src/bin.ts"],
  "project": ["src/**/*.ts", "tests/**/*.ts"]
}
```

- [ ] **Step 8: Verify**

```
pnpm install
pnpm test 2>&1 | tail -10
pnpm lint
pnpm knip
pnpm build
```

Expected: 153 tests pass; build emits `packages/bdd-lsp/dist/bin.js`.

- [ ] **Step 9: Commit**

```bash
git add packages/bdd-lsp/ knip.json pnpm-lock.yaml
git commit -m "chore(bdd-lsp): scaffold @oselvar/bdd-lsp package"
```

---

## Task 5: LSP handlers — hover + goto definition + diagnostics

**Files:**
- Create: `packages/bdd-lsp/src/handlers.ts`
- Create: `packages/bdd-lsp/src/store.ts`
- Create: `packages/bdd-lsp/tests/handlers.test.ts`
- Modify: `packages/bdd-lsp/src/server.ts`

The store holds the current `WorkspaceIndex` plus open document contents. Handlers query the store and translate to LSP responses.

- [ ] **Step 1: Write failing tests**

`packages/bdd-lsp/tests/handlers.test.ts`:
```ts
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { buildHandlers } from '../src/handlers.js'
import { createStore } from '../src/store.js'

function tempWorkspace(setup: (dir: string) => void): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'bdd-lsp-'))
  setup(dir)
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) }
}

test('hoverOnMd returns the matching step def expression and source location', async () => {
  const { dir, cleanup } = tempWorkspace((dir) => {
    writeFileSync(join(dir, 'bdd.config.ts'), 'export default {}\n')
    writeFileSync(
      join(dir, 'a.steps.ts'),
      `step('I have {int} cukes', () => {})
`,
    )
    writeFileSync(join(dir, 'b.bdd.md'), '# B\n\nGiven I have 5 cukes')
  })
  try {
    const store = createStore()
    await store.reindex(dir)
    const h = buildHandlers(store)
    // Cursor on line 3, character 12 (somewhere inside "I have 5 cukes")
    const result = h.hover({
      uri: `file://${join(dir, 'b.bdd.md')}`,
      position: { line: 3, character: 12 },
    })
    expect(result?.contents).toMatch(/I have \{int\} cukes/)
    expect(result?.contents).toContain('a.steps.ts')
  } finally {
    cleanup()
  }
})

test('definitionFromMd returns the steps.ts location for a matched step', async () => {
  const { dir, cleanup } = tempWorkspace((dir) => {
    writeFileSync(join(dir, 'bdd.config.ts'), 'export default {}\n')
    writeFileSync(
      join(dir, 'a.steps.ts'),
      `step('I have {int} cukes', () => {})
`,
    )
    writeFileSync(join(dir, 'b.bdd.md'), '# B\n\nGiven I have 5 cukes')
  })
  try {
    const store = createStore()
    await store.reindex(dir)
    const h = buildHandlers(store)
    const result = h.definition({
      uri: `file://${join(dir, 'b.bdd.md')}`,
      position: { line: 3, character: 12 },
    })
    expect(result?.uri).toBe(`file://${join(dir, 'a.steps.ts')}`)
    expect(result?.range.start.line).toBe(0) // LSP uses 0-based lines
  } finally {
    cleanup()
  }
})

test('diagnosticsFor returns missing-step diagnostics for unmatched keyword-led sentences', async () => {
  const { dir, cleanup } = tempWorkspace((dir) => {
    writeFileSync(join(dir, 'bdd.config.ts'), 'export default {}\n')
    writeFileSync(join(dir, 'b.bdd.md'), '# B\n\nGiven I have 5 cukes')
  })
  try {
    const store = createStore()
    await store.reindex(dir)
    const h = buildHandlers(store)
    const diags = h.diagnosticsFor(`file://${join(dir, 'b.bdd.md')}`)
    expect(diags).toHaveLength(1)
    expect(diags[0]?.code).toBe('missing-step')
  } finally {
    cleanup()
  }
})
```

- [ ] **Step 2: Verify failure**

Run: `pnpm --filter @oselvar/bdd-lsp test`
Expected: cannot resolve `../src/handlers.js` / `../src/store.js`.

- [ ] **Step 3: Implement `packages/bdd-lsp/src/store.ts`**

```ts
import { readFileSync } from 'node:fs'
import { glob as nativeGlob } from 'node:fs/promises'
import { resolve } from 'node:path'
import { loadBddConfig } from '@oselvar/bdd'
import { type WorkspaceIndex, buildWorkspaceIndex } from '@oselvar/bdd-language'

export type Store = {
  reindex(workspaceRoot: string): Promise<void>
  index(): WorkspaceIndex
  workspaceRoot(): string
}

export function createStore(): Store {
  let current: WorkspaceIndex = { stepDefs: [], matches: [], diagnostics: [] }
  let root = ''
  return {
    async reindex(workspaceRoot: string) {
      root = workspaceRoot
      const cfg = await loadBddConfig(workspaceRoot)
      const stepPaths = await findFiles(workspaceRoot, cfg.steps)
      const bddPaths = await findFiles(workspaceRoot, cfg.bdds)
      const stepFiles = stepPaths.map((path) => ({
        path,
        source: readFileSync(path, 'utf8'),
      }))
      const bddFiles = bddPaths.map((path) => ({
        path,
        source: readFileSync(path, 'utf8'),
      }))
      current = buildWorkspaceIndex({ stepFiles, bddFiles })
    },
    index() {
      return current
    },
    workspaceRoot() {
      return root
    },
  }
}

const glob = nativeGlob as unknown as (
  pattern: string,
  opts: { cwd: string },
) => AsyncIterable<string>

async function findFiles(cwd: string, patterns: ReadonlyArray<string>): Promise<string[]> {
  const out: string[] = []
  const seen = new Set<string>()
  for (const pattern of patterns) {
    for await (const entry of glob(pattern, { cwd })) {
      const abs = resolve(cwd, entry)
      if (!seen.has(abs)) {
        seen.add(abs)
        out.push(abs)
      }
    }
  }
  return out
}
```

NOTE: `findFiles` is duplicated from `bdd-cli/lint.ts` and `bdd-vitest/plugin.ts`. Address in a follow-up by extracting to `@oselvar/bdd` core — not in scope here.

- [ ] **Step 4: Implement `packages/bdd-lsp/src/handlers.ts`**

```ts
import { fileURLToPath } from 'node:url'
import type { MatchRef } from '@oselvar/bdd-language'
import type { Store } from './store.js'

export type Position = { readonly line: number; readonly character: number }

export type HoverParams = { readonly uri: string; readonly position: Position }
export type HoverResult = { readonly contents: string } | null

export type DefinitionParams = HoverParams
export type DefinitionResult = {
  readonly uri: string
  readonly range: { readonly start: Position; readonly end: Position }
} | null

export type Diagnostic = {
  readonly code: string
  readonly severity: 'error' | 'warning'
  readonly message: string
  readonly range: { readonly start: Position; readonly end: Position }
}

export type Handlers = {
  hover(params: HoverParams): HoverResult
  definition(params: DefinitionParams): DefinitionResult
  diagnosticsFor(uri: string): ReadonlyArray<Diagnostic>
}

export function buildHandlers(store: Store): Handlers {
  return {
    hover({ uri, position }) {
      const m = findMatchAt(store, uri, position)
      if (!m) return null
      const contents = `Matched by \`step('${m.stepDef.expression}')\` at ${relative(m.stepDef.file, store.workspaceRoot())}:${m.stepDef.expressionRange.start.line}`
      return { contents }
    },
    definition({ uri, position }) {
      const m = findMatchAt(store, uri, position)
      if (!m) return null
      return {
        uri: `file://${m.stepDef.file}`,
        range: {
          start: { line: m.stepDef.expressionRange.start.line - 1, character: m.stepDef.expressionRange.start.character - 1 },
          end: { line: m.stepDef.expressionRange.end.line - 1, character: m.stepDef.expressionRange.end.character - 1 },
        },
      }
    },
    diagnosticsFor(uri) {
      const path = uriToPath(uri)
      return store
        .index()
        .diagnostics.filter((d) => d.bddPath === path)
        .map((d) => ({
          code: d.code,
          severity: d.severity,
          message: d.message,
          range: d.range,
        }))
    },
  }
}

function findMatchAt(store: Store, uri: string, position: Position): MatchRef | undefined {
  const path = uriToPath(uri)
  return store.index().matches.find((m) => {
    if (m.bddPath !== path) return false
    return contains(m.range, position)
  })
}

function contains(
  range: { start: Position; end: Position },
  position: Position,
): boolean {
  if (position.line < range.start.line || position.line > range.end.line) return false
  if (position.line === range.start.line && position.character < range.start.character) return false
  if (position.line === range.end.line && position.character > range.end.character) return false
  return true
}

function uriToPath(uri: string): string {
  return uri.startsWith('file://') ? fileURLToPath(uri) : uri
}

function relative(file: string, root: string): string {
  return file.startsWith(root) ? file.slice(root.length).replace(/^\//, '') : file
}
```

- [ ] **Step 5: Wire `registerHandlers` to use the store + handlers**

Update `packages/bdd-lsp/src/server.ts`:
```ts
import { type Connection, TextDocumentSyncKind } from 'vscode-languageserver'
import { buildHandlers } from './handlers.js'
import { createStore } from './store.js'

export function registerHandlers(connection: Connection): void {
  const store = createStore()
  const handlers = buildHandlers(store)

  connection.onInitialize((params) => {
    const root = params.workspaceFolders?.[0]?.uri
    if (root) {
      void store
        .reindex(root.replace(/^file:\/\//, ''))
        .then(() => pushDiagnostics(connection, store, handlers))
    }
    return {
      capabilities: {
        textDocumentSync: TextDocumentSyncKind.Full,
        hoverProvider: true,
        definitionProvider: true,
      },
    }
  })

  connection.onDidSaveTextDocument(async () => {
    await store.reindex(store.workspaceRoot())
    pushDiagnostics(connection, store, handlers)
  })

  connection.onHover((params) =>
    handlers.hover({
      uri: params.textDocument.uri,
      position: params.position,
    }) ?? null,
  )

  connection.onDefinition((params) => handlers.definition({
    uri: params.textDocument.uri,
    position: params.position,
  }))
}

function pushDiagnostics(
  connection: Connection,
  store: ReturnType<typeof createStore>,
  handlers: ReturnType<typeof buildHandlers>,
): void {
  const seen = new Set<string>()
  for (const d of store.index().diagnostics) seen.add(`file://${d.bddPath}`)
  for (const uri of seen) {
    const diags = handlers.diagnosticsFor(uri)
    void connection.sendDiagnostics({
      uri,
      diagnostics: diags.map((d) => ({
        severity: d.severity === 'error' ? 1 : 2,
        message: d.message,
        range: {
          start: { line: d.range.start.line - 1, character: d.range.start.character - 1 },
          end: { line: d.range.end.line - 1, character: d.range.end.character - 1 },
        },
        code: d.code,
      })),
    })
  }
}
```

NOTE: vscode-languageserver's `DiagnosticSeverity.Error = 1`, `Warning = 2`. The hover response shape expected by the LSP protocol is `{ contents: MarkupContent | MarkedString[] }`. The `contents: string` in our handler is shorthand — the LSP spec accepts a plain string as a `MarkedString`. Cast if needed.

- [ ] **Step 6: Verify**

```
pnpm test 2>&1 | tail -10
pnpm lint
pnpm knip
pnpm build
```

Expected: 156 tests pass (153 + 3 new); all gates clean.

- [ ] **Step 7: Commit**

```bash
git add packages/bdd-lsp/src/handlers.ts packages/bdd-lsp/src/store.ts packages/bdd-lsp/src/server.ts packages/bdd-lsp/tests/handlers.test.ts
git commit -m "feat(bdd-lsp): hover + definition + diagnostics handlers"
```

---

## Task 6: `@oselvar/bdd-vscode` extension package skeleton

**Files:**
- Create: `packages/bdd-vscode/package.json`
- Create: `packages/bdd-vscode/tsconfig.json`
- Create: `packages/bdd-vscode/src/extension.ts`
- Create: `packages/bdd-vscode/.vscodeignore`
- Modify: `knip.json`

VSCode extension manifests are in `package.json` (`engines.vscode`, `activationEvents`, `contributes`, `main`). This task lands the scaffold; Task 7 wires the LanguageClient.

- [ ] **Step 1: Write `packages/bdd-vscode/package.json`**

```json
{
  "name": "oselvar-bdd",
  "displayName": "oselvar BDD",
  "description": "Markdown-native BDD: highlight matched steps, go-to step definitions, missing-step diagnostics.",
  "publisher": "oselvar",
  "version": "0.0.0",
  "type": "module",
  "engines": { "vscode": "^1.92.0", "node": ">=22" },
  "categories": ["Programming Languages", "Linters", "Testing"],
  "main": "./src/extension.ts",
  "activationEvents": [
    "onLanguage:markdown",
    "onLanguage:typescript",
    "workspaceContains:**/bdd.config.ts",
    "workspaceContains:**/*.bdd.md"
  ],
  "contributes": {
    "languages": [
      {
        "id": "bdd-markdown",
        "aliases": ["BDD Markdown", "bdd-md"],
        "extensions": [".bdd.md"]
      }
    ]
  },
  "scripts": {
    "build": "tsc -p tsconfig.json"
  },
  "dependencies": {
    "@oselvar/bdd-language": "workspace:*",
    "@oselvar/bdd-lsp": "workspace:*",
    "vscode-languageclient": "^9.0.1"
  },
  "devDependencies": {
    "@types/vscode": "^1.92.0"
  }
}
```

NOTE: the `name` is `oselvar-bdd` (no `@oselvar/` scope) because the VSCode marketplace doesn't support scoped names. The `publisher` field is `oselvar`. Full marketplace ID will be `oselvar.oselvar-bdd`.

- [ ] **Step 2: `packages/bdd-vscode/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "src", "module": "node16", "moduleResolution": "node16" },
  "include": ["src"]
}
```

The VSCode extension host requires CommonJS-compatible module resolution; `node16` handles both ESM and CJS at the extension boundary. We'll bundle to a single CJS file in a future task; for the symlink dev loop, point to `src/extension.ts` directly via tsx.

Actually — VSCode extension host runs Node, and Node now supports ESM. For a pure ESM extension, set `"type": "module"` and use `main: src/extension.ts`. VSCode 1.84+ supports ESM extensions natively. Keep `"type": "module"` from Step 1 and skip CJS bundling.

- [ ] **Step 3: `packages/bdd-vscode/src/extension.ts` (placeholder)**

```ts
import type { ExtensionContext } from 'vscode'

export function activate(_context: ExtensionContext): void {
  // Task 7 wires the LanguageClient here.
}

export function deactivate(): void {
  // No-op for now.
}
```

- [ ] **Step 4: `packages/bdd-vscode/.vscodeignore`**

```
**/.vscode/**
**/tests/**
**/node_modules/**
**/.git/**
tsconfig.json
```

- [ ] **Step 5: Update `knip.json`**

Add to `workspaces`:
```json
"packages/bdd-vscode": {
  "entry": ["src/extension.ts"],
  "project": ["src/**/*.ts"]
}
```

- [ ] **Step 6: Verify**

```
pnpm install
pnpm lint
pnpm knip
pnpm build
```

Note: no tests yet for the VSCode package — it activates only inside the editor. Smoke tests via the symlink install in Task 8.

- [ ] **Step 7: Commit**

```bash
git add packages/bdd-vscode/ knip.json pnpm-lock.yaml
git commit -m "chore(bdd-vscode): scaffold VSCode extension package"
```

---

## Task 7: VSCode extension wires LanguageClient to `bdd-lsp`

**Files:**
- Modify: `packages/bdd-vscode/src/extension.ts`

- [ ] **Step 1: Implement the activation function**

```ts
import { resolve } from 'node:path'
import type { ExtensionContext } from 'vscode'
import {
  type LanguageClientOptions,
  type ServerOptions,
  TransportKind,
} from 'vscode-languageclient/node.js'
import { LanguageClient } from 'vscode-languageclient/node.js'

let client: LanguageClient | undefined

export function activate(context: ExtensionContext): void {
  const serverModule = resolve(
    context.extensionPath,
    'node_modules',
    '@oselvar',
    'bdd-lsp',
    'src',
    'bin.ts',
  )
  const serverOptions: ServerOptions = {
    run: { module: serverModule, transport: TransportKind.stdio },
    debug: { module: serverModule, transport: TransportKind.stdio },
  }
  const clientOptions: LanguageClientOptions = {
    documentSelector: [
      { scheme: 'file', pattern: '**/*.bdd.md' },
      { scheme: 'file', pattern: '**/*.steps.ts' },
    ],
  }
  client = new LanguageClient('oselvar-bdd', 'oselvar BDD', serverOptions, clientOptions)
  void client.start()
}

export async function deactivate(): Promise<void> {
  if (client) await client.stop()
}
```

NOTE: pointing `serverModule` at `src/bin.ts` (TS source) works because the dev loop uses the symlink install AND the extension host can load TS via the parent tsx loader IF we register it. Simpler: bundle `bdd-lsp` to CJS via the build, and point at `dist/bin.js`. But that means we need `pnpm build` before testing the extension.

For the symlink loop: point at `dist/bin.js` and require `pnpm --filter @oselvar/bdd-lsp build` once before installing. Re-iterate by re-running build + reload window. Update the install script in Task 8 to run the build.

Update the path to:
```ts
const serverModule = resolve(
  context.extensionPath,
  '..',  // packages/bdd-vscode → packages
  'bdd-lsp',
  'dist',
  'bin.js',
)
```

Since the symlink mirrors the workspace structure, `..` lands us in `packages/`.

- [ ] **Step 2: Verify build**

```
pnpm --filter oselvar-bdd build 2>&1 | tail -5
pnpm lint
```

The extension package itself has no runtime tests; build success is the gate.

- [ ] **Step 3: Commit**

```bash
git add packages/bdd-vscode/src/extension.ts
git commit -m "feat(bdd-vscode): spawn bdd-lsp via LanguageClient on activate"
```

---

## Task 8: Symlink installer + dev loop

**Files:**
- Create: `scripts/install-vscode.mjs`
- Modify: root `package.json` (add `install:vscode` script)

After running once, edits in `packages/bdd-vscode/src/` or `packages/bdd-lsp/src/` (plus a `pnpm build` for the latter) appear after reloading the VSCode window.

- [ ] **Step 1: Write `scripts/install-vscode.mjs`**

```js
#!/usr/bin/env node
import { existsSync, lstatSync, mkdirSync, rmSync, symlinkSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(ROOT, 'packages', 'bdd-vscode')
const DST = join(homedir(), '.vscode', 'extensions', 'oselvar.oselvar-bdd-0.0.0')

if (existsSync(DST) || isBrokenSymlink(DST)) {
  rmSync(DST, { recursive: true, force: true })
}
mkdirSync(dirname(DST), { recursive: true })
symlinkSync(SRC, DST, 'dir')

console.log(`linked: ${DST} → ${SRC}`)
console.log('Reload VSCode (Cmd+Shift+P → "Reload Window") to pick up the extension.')

function isBrokenSymlink(p) {
  try {
    return lstatSync(p).isSymbolicLink() && !existsSync(p)
  } catch {
    return false
  }
}
```

- [ ] **Step 2: Add the script to root `package.json`**

```json
"install:vscode": "pnpm -r --filter @oselvar/bdd-lsp --filter oselvar-bdd build && node scripts/install-vscode.mjs"
```

The script builds `bdd-lsp` (so the dist/bin.js exists for the extension to spawn) and the extension package, then symlinks.

- [ ] **Step 3: Verify**

```
pnpm install:vscode
ls -la ~/.vscode/extensions/oselvar.oselvar-bdd-0.0.0
```

The output should show a symlink to `packages/bdd-vscode`. Then in VSCode: Cmd+Shift+P → "Reload Window". Open a `.bdd.md` file from the workspace; hover an unmatched keyword-led sentence; expect to see a "Step missing" hover (from the diagnostic, displayed by VSCode's default diagnostic hover).

If the extension does not activate, check the Output panel → "oselvar BDD" channel for connection logs.

- [ ] **Step 4: Commit**

```bash
git add scripts/install-vscode.mjs package.json
git commit -m "chore: add install:vscode script for symlink dev loop"
```

---

## Plan summary

After Plan 4, the workspace has three new packages — pure language types, an LSP server, and a VSCode extension client. `pnpm install:vscode` once, reload the editor, and:

- **Hover** any matched substring in a `.bdd.md` file to see which step def + source location matched it.
- **Cmd-click (Go to Definition)** any matched substring to jump to the `step('...')` call in `.steps.ts`.
- **Squigglies** appear under keyword-led sentences with no step def, and under ambiguous matches.

Carry-forward:

| Capability | Comes in |
|---|---|
| Subtle background-tint decorations on matched substrings | Plan 5 |
| Code lens "➜ N references" above each `step('...')` | Plan 5 |
| Find references from `.steps.ts` → `.bdd.md` | Plan 5 |
| Auto-completion in `.bdd.md` with `${1:int}` placeholders | Plan 6 |
| Code action / context menu / palette / hotkey for "Generate step definition" | Plan 6 |
| Quick Pick of target step file | Plan 6 |
| `.vsix` packaging + marketplace publishing | post-1.0 |
| `findFiles` extraction to core | Cleanup pass |
