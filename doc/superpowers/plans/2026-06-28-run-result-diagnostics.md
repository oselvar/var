# Run-result Diagnostics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render run-result mismatches as diagnostics (red squiggle + hover) in both VSCode (via the LSP) and the web editor (via CodeMirror lint), driven by one shared pure projection over the `.var/<spec>.json` `SpecResults` format.

**Architecture:** A pure core `runResultDiagnostics(SpecResults, source) → RunDiagnostic[]` (offset-based, hash-staleness-aware) is the single model. The `var-lsp` server keeps a `.var/`-fed `RunResultsStore`, projects it to LSP diagnostics (offset→position via `spanFromOffsets`), and merges them into its `sendDiagnostics`; the VSCode extension registers a `.var/**` file watcher. The website's `cm-run.ts` keeps its line wash but replaces the bespoke gutter/dialog/red-marks with a `@codemirror/lint` source over the same projection.

**Tech Stack:** TypeScript (ESM, `node:` imports, Node ≥ 22), pnpm workspace, vitest 4, `vscode-languageserver`, `vscode-languageclient`, `@codemirror/lint@6.9.7`, biome.

## Global Constraints

- Core (`packages/var/src/*`) stays pure: **no `node:*`**, no I/O.
- Immutable types: `readonly`, `ReadonlyArray<T>`.
- ESM with **explicit `.js` import specifiers**.
- `runResultDiagnostics` is **offset-based**; a stale `sourceHash` (≠ `hashSource(source)`) → `[]`; passing examples → nothing.
- LSP run diagnostics: **severity `1` (Error)**, **`source: 'var'`**, **0-based** positions (`span.startLine - 1`, `span.startCol - 1`), matching the existing parse-diagnostic mapping.
- `var-lsp` tests are **colocated in `src/` as `*.test.ts`** (e.g. `src/run-results.test.ts`), importing `./<module>.js`. Core tests live in `packages/var/tests/*.test.ts` importing `../src/<module>.js`.
- Web editor: **keep** the pass/fail line wash + `resultsField`; **remove** the `✓`/`✗` gutter, stack dialog, and red-text marks.
- **Build gate:** run the per-package `pnpm --filter <pkg> build` (tsc) after each task. NOTE: full `pnpm -r build` and `pnpm --filter @oselvar/website build` (astro) currently fail ONLY on an untracked user WIP content doc (`packages/website/src/content/docs/concepts/sensors-and-actuators.md`); that is pre-existing and not ours. For the website task, validate via vitest + a leftover-reference grep (the controller type-checks the website separately).

---

### Task 1: Core — `runResultDiagnostics` (the shared projection)

**Files:**
- Create: `packages/var/src/run-diagnostics.ts`
- Test: `packages/var/tests/run-diagnostics.test.ts`
- Modify: `packages/var/src/index.ts` (add exports)

**Interfaces:**
- Consumes: `hashSource` (`./hash.js`), `SpecResults` (`./result.js`).
- Produces:
  - `type RunDiagnostic = { readonly from: number; readonly to: number; readonly message: string }`
  - `runResultDiagnostics(results: SpecResults, source: string): ReadonlyArray<RunDiagnostic>`

- [ ] **Step 1: Write the failing test**

Create `packages/var/tests/run-diagnostics.test.ts`:

```ts
import { expect, test } from 'vitest'
import { hashSource } from '../src/hash.js'
import type { SpecResults } from '../src/result.js'
import { runResultDiagnostics } from '../src/run-diagnostics.js'

function results(source: string, examples: SpecResults['examples']): SpecResults {
  return { version: 1, specPath: 's.var.md', sourceHash: hashSource(source), examples }
}

test('cell mismatch → one diagnostic per cell with expected/actual message', () => {
  const source = 'x 6 y'
  const r = results(source, [
    { name: 'r', status: 'failed', lines: [1], failure: { line: 1, message: 'm', stack: 's', cells: [{ from: 2, to: 3, actual: '50' }] } },
  ])
  expect(runResultDiagnostics(r, source)).toEqual([{ from: 2, to: 3, message: 'expected 6 but was 50' }])
})

test('whole-table mismatch yields multiple cell diagnostics', () => {
  const source = 'a 1 b 2 c'
  const r = results(source, [
    { name: 'r', status: 'failed', lines: [1], failure: { line: 1, message: 'm', stack: 's', cells: [{ from: 2, to: 3, actual: '9' }, { from: 6, to: 7, actual: '8' }] } },
  ])
  expect(runResultDiagnostics(r, source)).toEqual([
    { from: 2, to: 3, message: 'expected 1 but was 9' },
    { from: 6, to: 7, message: 'expected 2 but was 8' },
  ])
})

test('doc mismatch → one diagnostic on the body span', () => {
  const source = 'say:\nHello!\n'
  const r = results(source, [
    { name: 'd', status: 'failed', lines: [2], failure: { line: 2, message: 'm', stack: 's', doc: { from: 5, to: 11, actual: 'Bye' } } },
  ])
  expect(runResultDiagnostics(r, source)).toEqual([{ from: 5, to: 11, message: 'expected Hello! but was Bye' }])
})

test('plain throw (no cells/doc) → one diagnostic spanning the failing line, with the error message', () => {
  const source = 'line one\nline two\nline three'
  const r = results(source, [
    { name: 'p', status: 'failed', lines: [2], failure: { line: 2, message: 'boom', stack: 's' } },
  ])
  expect(runResultDiagnostics(r, source)).toEqual([{ from: 9, to: 17, message: 'boom' }])
})

test('stale sourceHash → no diagnostics', () => {
  const source = 'x 6 y'
  const r: SpecResults = { version: 1, specPath: 's.var.md', sourceHash: 'fnv1a:00000000', examples: [
    { name: 'r', status: 'failed', lines: [1], failure: { line: 1, message: 'm', stack: 's', cells: [{ from: 2, to: 3, actual: '50' }] } },
  ] }
  expect(runResultDiagnostics(r, source)).toEqual([])
})

test('all-passed results → no diagnostics', () => {
  const source = 'whatever'
  const r = results(source, [{ name: 'ok', status: 'passed', lines: [1] }])
  expect(runResultDiagnostics(r, source)).toEqual([])
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/var && npx vitest run tests/run-diagnostics.test.ts`
Expected: FAIL — cannot resolve `../src/run-diagnostics.js`.

- [ ] **Step 3: Implement**

Create `packages/var/src/run-diagnostics.ts`:

```ts
import { hashSource } from './hash.js'
import type { SpecResults } from './result.js'

// One renderable failure: a source-offset range plus a human message. Offsets
// are absolute source positions (== CodeMirror positions); `to` is exclusive.
// Renderer-agnostic — the LSP converts to line/character, the web editor uses
// the offsets directly.
export type RunDiagnostic = {
  readonly from: number
  readonly to: number
  readonly message: string
}

// [from, to) of 1-based `line` in `source`, where `to` excludes the trailing newline.
function lineRange(source: string, line: number): { from: number; to: number } {
  let from = 0
  let current = 1
  for (let i = 0; i < source.length && current < line; i++) {
    if (source.charCodeAt(i) === 0x0a) {
      current++
      from = i + 1
    }
  }
  const nl = source.indexOf('\n', from)
  return { from, to: nl === -1 ? source.length : nl }
}

// Project a SpecResults onto offset-based diagnostics against the CURRENT
// source. If the source changed since the run (hash mismatch) the offsets no
// longer apply, so emit nothing.
export function runResultDiagnostics(
  results: SpecResults,
  source: string,
): ReadonlyArray<RunDiagnostic> {
  if (hashSource(source) !== results.sourceHash) return []
  const out: RunDiagnostic[] = []
  for (const ex of results.examples) {
    if (ex.status !== 'failed' || !ex.failure) continue
    const f = ex.failure
    if (f.cells && f.cells.length > 0) {
      for (const c of f.cells) {
        out.push({ from: c.from, to: c.to, message: `expected ${source.slice(c.from, c.to)} but was ${c.actual}` })
      }
    } else if (f.doc) {
      out.push({
        from: f.doc.from,
        to: f.doc.to,
        message: `expected ${source.slice(f.doc.from, f.doc.to)} but was ${f.doc.actual}`,
      })
    } else {
      const { from, to } = lineRange(source, f.line)
      out.push({ from, to, message: f.message })
    }
  }
  return out
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/var && npx vitest run tests/run-diagnostics.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Add the exports**

In `packages/var/src/index.ts`, add:

```ts
export type { RunDiagnostic } from './run-diagnostics.js'
export { runResultDiagnostics } from './run-diagnostics.js'
```

- [ ] **Step 6: Build gate + commit**

```bash
pnpm --filter @oselvar/var build
git add packages/var/src/run-diagnostics.ts packages/var/tests/run-diagnostics.test.ts packages/var/src/index.ts
git commit -m "feat(var): runResultDiagnostics — shared offset-based run-result projection"
```

---

### Task 2: var-lsp — `RunResultsStore` + `runLspDiagnostics`

**Files:**
- Create: `packages/var-lsp/src/run-results.ts`
- Test: `packages/var-lsp/src/run-results.test.ts`

**Interfaces:**
- Consumes: `runResultDiagnostics`, `spanFromOffsets`, `SpecResults` (all from `@oselvar/var`).
- Produces:
  - `type LspPosition = { readonly line: number; readonly character: number }`
  - `type LspDiagnostic = { readonly severity: number; readonly source: string; readonly message: string; readonly range: { readonly start: LspPosition; readonly end: LspPosition }; readonly code?: string }`
  - `runLspDiagnostics(results: SpecResults, source: string): LspDiagnostic[]`
  - `type RunResultsStore = { ingest(varJsonPath: string, content: string): string | null; remove(varJsonPath: string): string | null; get(specUri: string): SpecResults | undefined; specUris(): ReadonlyArray<string> }`
  - `createRunResultsStore(rootUri: string): RunResultsStore`

- [ ] **Step 1: Write the failing test**

Create `packages/var-lsp/src/run-results.test.ts`:

```ts
import { hashSource, type SpecResults } from '@oselvar/var'
import { describe, expect, it } from 'vitest'
import { createRunResultsStore, runLspDiagnostics } from './run-results.js'

const SOURCE = 'x 6 y'
const SPEC: SpecResults = {
  version: 1,
  specPath: 'docs/a.var.md',
  sourceHash: hashSource(SOURCE),
  examples: [
    { name: 'r', status: 'failed', lines: [1], failure: { line: 1, message: 'm', stack: 's', cells: [{ from: 2, to: 3, actual: '50' }] } },
  ],
}

describe('runLspDiagnostics', () => {
  it('maps run diagnostics to 0-based LSP diagnostics tagged source: var, severity error', () => {
    expect(runLspDiagnostics(SPEC, SOURCE)).toEqual([
      {
        severity: 1,
        source: 'var',
        message: 'expected 6 but was 50',
        range: { start: { line: 0, character: 2 }, end: { line: 0, character: 3 } },
      },
    ])
  })

  it('returns nothing when the source no longer hash-matches (stale)', () => {
    expect(runLspDiagnostics(SPEC, `${SOURCE} edited`)).toEqual([])
  })
})

describe('RunResultsStore', () => {
  it('ingests a valid .var json and keys it by the spec file URI', () => {
    const store = createRunResultsStore('file:///root')
    const uri = store.ingest('/root/.var/docs/a.var.md.json', JSON.stringify(SPEC))
    expect(uri).toBe('file:///root/docs/a.var.md')
    expect(store.get('file:///root/docs/a.var.md')).toEqual(SPEC)
    expect(store.specUris()).toEqual(['file:///root/docs/a.var.md'])
  })

  it('rejects malformed JSON and a wrong version (stores nothing)', () => {
    const store = createRunResultsStore('file:///root')
    expect(store.ingest('/root/.var/x.json', 'not json')).toBeNull()
    expect(store.ingest('/root/.var/x.json', JSON.stringify({ version: 2, specPath: 'x', sourceHash: 'h', examples: [] }))).toBeNull()
    expect(store.specUris()).toEqual([])
  })

  it('remove() drops the entry and returns its spec URI', () => {
    const store = createRunResultsStore('file:///root')
    store.ingest('/root/.var/docs/a.var.md.json', JSON.stringify(SPEC))
    expect(store.remove('/root/.var/docs/a.var.md.json')).toBe('file:///root/docs/a.var.md')
    expect(store.get('file:///root/docs/a.var.md')).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/var-lsp && npx vitest run src/run-results.test.ts`
Expected: FAIL — cannot resolve `./run-results.js`.

- [ ] **Step 3: Implement**

Create `packages/var-lsp/src/run-results.ts`:

```ts
import { runResultDiagnostics, type SpecResults, spanFromOffsets } from '@oselvar/var'

export type LspPosition = { readonly line: number; readonly character: number }
export type LspDiagnostic = {
  readonly severity: number
  readonly source: string
  readonly message: string
  readonly range: { readonly start: LspPosition; readonly end: LspPosition }
  readonly code?: string // preserved from parse diagnostics; run diagnostics omit it
}

// Pure: SpecResults + current source → LSP diagnostics (0-based positions).
// Reuses the core projection; converts each offset range via spanFromOffsets
// (1-based span → 0-based LSP), matching the existing parse-diagnostic mapping.
export function runLspDiagnostics(results: SpecResults, source: string): LspDiagnostic[] {
  return runResultDiagnostics(results, source).map((d) => {
    const span = spanFromOffsets(source, d.from, d.to)
    return {
      severity: 1, // Error
      source: 'var',
      message: d.message,
      range: {
        start: { line: span.startLine - 1, character: span.startCol - 1 },
        end: { line: span.endLine - 1, character: span.endCol - 1 },
      },
    }
  })
}

function isSpecResults(v: unknown): v is SpecResults {
  if (typeof v !== 'object' || v === null) return false
  const o = v as Record<string, unknown>
  return o.version === 1 && typeof o.specPath === 'string' && typeof o.sourceHash === 'string' && Array.isArray(o.examples)
}

export type RunResultsStore = {
  // Parse a .var/<spec>.json and key it by its spec's file:// URI. Returns that
  // URI, or null if the content is unparseable / the wrong version.
  ingest(varJsonPath: string, content: string): string | null
  // Forget a .var json (on delete). Returns the spec URI it had mapped, or null.
  remove(varJsonPath: string): string | null
  get(specUri: string): SpecResults | undefined
  specUris(): ReadonlyArray<string>
}

export function createRunResultsStore(rootUri: string): RunResultsStore {
  const root = rootUri.replace(/\/$/, '')
  const byUri = new Map<string, SpecResults>()
  const uriByPath = new Map<string, string>() // varJsonPath → specUri, so deletes resolve
  return {
    ingest(varJsonPath, content) {
      let parsed: unknown
      try {
        parsed = JSON.parse(content)
      } catch {
        return null
      }
      if (!isSpecResults(parsed)) return null
      const specUri = `${root}/${parsed.specPath}`
      byUri.set(specUri, parsed)
      uriByPath.set(varJsonPath, specUri)
      return specUri
    },
    remove(varJsonPath) {
      const specUri = uriByPath.get(varJsonPath)
      if (specUri === undefined) return null
      byUri.delete(specUri)
      uriByPath.delete(varJsonPath)
      return specUri
    },
    get: (specUri) => byUri.get(specUri),
    specUris: () => [...byUri.keys()],
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/var-lsp && npx vitest run src/run-results.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Build gate + commit**

```bash
pnpm --filter @oselvar/var-lsp build
git add packages/var-lsp/src/run-results.ts packages/var-lsp/src/run-results.test.ts
git commit -m "feat(var-lsp): RunResultsStore + runLspDiagnostics projection"
```

---

### Task 3: var-lsp — wire run diagnostics into the server

**Files:**
- Modify: `packages/var-lsp/src/server.ts`

**Interfaces:**
- Consumes: `createRunResultsStore`, `runLspDiagnostics`, `type RunResultsStore`, `type LspDiagnostic` (from `./run-results.js`); existing `uriToPath`, `store.fs()`, `handlers.diagnosticsFor`, `documents`.

This task is server wiring (the imperative shell). Its testable logic already lives in Tasks 1–2; verification here is the build plus the manual end-to-end (Task 5 / spec). Follow the existing un-unit-tested server pattern.

- [ ] **Step 1: Add the run-results store + initial load**

In `packages/var-lsp/src/server.ts`:

Add imports near the top:
```ts
import { createRunResultsStore, type LspDiagnostic, runLspDiagnostics } from './run-results.js'
```

Add a module-scoped handle alongside `store`/`handlers`:
```ts
  let runResults: ReturnType<typeof createRunResultsStore> | null = null
```

In `connection.onInitialize`, after `await store.reindex()` and before `afterReindex()`, create the store and glob-load existing `.var/` files:
```ts
    runResults = createRunResultsStore(root ?? '')
    const varJsonPaths = await store.fs().list(['**/.var/**/*.json'])
    for (const p of varJsonPaths) {
      try {
        runResults.ingest(p, await store.fs().read(p))
      } catch {
        // a .var file that vanished between list and read — ignore
      }
    }
```
(`root` is the existing `params.workspaceFolders?.[0]?.uri`.)

- [ ] **Step 2: Replace `pushDiagnostics` with `publishAll` + `publishFor`**

Replace the standalone `pushDiagnostics(connection, store, handlers)` function and its call in `afterReindex` with two closures inside `registerHandlers` (so they can read `documents`, `runResults`, `store`, `handlers`). The parse-diagnostic mapping is unchanged — only the merge with run diagnostics is new:

```ts
  function toParseDiagnostics(uri: string): LspDiagnostic[] {
    if (!handlers) return []
    return handlers.diagnosticsFor(uri).map((d) => ({
      severity: d.severity === 'error' ? 1 : 2,
      source: 'var',
      message: d.message,
      range: {
        start: { line: d.range.start.line - 1, character: d.range.start.character - 1 },
        end: { line: d.range.end.line - 1, character: d.range.end.character - 1 },
      },
      code: d.code,
    }))
  }

  async function publishFor(uri: string): Promise<void> {
    if (!store) return
    const parse = toParseDiagnostics(uri)
    let run: LspDiagnostic[] = []
    const results = runResults?.get(uri)
    if (results) {
      let source = documents.get(uri)?.getText()
      if (source === undefined) {
        try {
          source = await store.fs().read(uriToPath(uri))
        } catch {
          source = undefined
        }
      }
      if (source !== undefined) run = runLspDiagnostics(results, source)
    }
    void connection.sendDiagnostics({ uri, diagnostics: [...parse, ...run] })
  }

  function publishAll(): void {
    if (!store) return
    const uris = new Set<string>()
    for (const d of store.index().diagnostics) uris.add(`file://${d.varPath}`)
    if (runResults) for (const u of runResults.specUris()) uris.add(u)
    for (const u of uris) void publishFor(u)
  }
```

Update `afterReindex` to call `publishAll()` instead of `pushDiagnostics(...)`:
```ts
  function afterReindex(): void {
    if (!store || !handlers) return
    publishAll()
    void connection.sendNotification('var/didIndex')
  }
```

Delete the old top-level `pushDiagnostics` function entirely. `toParseDiagnostics` preserves the parse diagnostic's `code` (via the optional `code` field already on `LspDiagnostic` from Task 2); run diagnostics simply omit it. Parse-diagnostic behavior is otherwise unchanged.

- [ ] **Step 3: Handle `.var/` file-watch events**

Add a `connection.onDidChangeWatchedFiles` handler inside `registerHandlers` (e.g. after the `documents.onDidChangeContent` block):

```ts
  connection.onDidChangeWatchedFiles(async (params) => {
    if (!runResults) return
    for (const change of params.changes) {
      const path = uriToPath(change.uri)
      if (!path.includes('/.var/') || !path.endsWith('.json')) continue
      // FileChangeType: 1 Created, 2 Changed, 3 Deleted
      const specUri =
        change.type === 3 ? runResults.remove(path) : await ingestWatched(path)
      if (specUri) await publishFor(specUri)
    }
  })

  async function ingestWatched(path: string): Promise<string | null> {
    if (!store || !runResults) return null
    try {
      return runResults.ingest(path, await store.fs().read(path))
    } catch {
      return null
    }
  }
```

- [ ] **Step 4: Build gate**

Run: `pnpm --filter @oselvar/var-lsp build`
Expected: exit 0.

- [ ] **Step 5: Manual smoke (no automated test for server wiring)**

Confirm the file compiles and the existing var-lsp tests still pass:
```bash
cd packages/var-lsp && npx vitest run
```
Expected: existing tests pass (this task adds no unit tests — the run-result logic is covered by Tasks 1–2; end-to-end coverage is the Task 5 manual step).

- [ ] **Step 6: Commit**

```bash
git add packages/var-lsp/src/server.ts
git commit -m "feat(var-lsp): merge .var/ run diagnostics into publishDiagnostics"
```

---

### Task 4: var-vscode — register the `.var/**` file watcher

**Files:**
- Modify: `packages/var-vscode/src/extension.ts`

**Interfaces:**
- Consumes: `workspace` (already imported from `vscode`).

- [ ] **Step 1: Add `synchronize.fileEvents` to the client options**

In `packages/var-vscode/src/extension.ts`, find the `clientOptions` object in `activate` and add a `synchronize` block so the client watches `.var/` and forwards changes to the server as `workspace/didChangeWatchedFiles`:

```ts
  const clientOptions: LanguageClientOptions = {
    documentSelector: [
      { scheme: 'file', pattern: '**/*.var.md' },
      { scheme: 'file', pattern: '**/*.steps.ts' },
    ],
    synchronize: {
      fileEvents: workspace.createFileSystemWatcher('**/.var/**/*.json'),
    },
  }
```

- [ ] **Step 2: Build gate**

Run: `pnpm --filter oselvar-var build`
Expected: exit 0 (tsc).

- [ ] **Step 3: Commit**

```bash
git add packages/var-vscode/src/extension.ts
git commit -m "feat(var-vscode): watch .var/ so run diagnostics reach the server"
```

---

### Task 5: website — replace bespoke run-render with a `@codemirror/lint` source

**Files:**
- Modify: `packages/website/src/lib/cm-run.ts`
- Modify: `packages/website/src/lib/cm-run.test.ts`
- Modify: `packages/website/package.json` (add `@codemirror/lint` as a direct dependency)

**Interfaces:**
- Consumes: `runResultDiagnostics` (`@oselvar/var`), `linter`, `lintGutter`, `Diagnostic` (`@codemirror/lint`), the existing `resultsField` + `setRunResults`.
- Produces: `varDiagnostics(results: SpecResults | null, docText: string): Diagnostic[]` (exported, pure); `varRunExtension(): Extension` returning `[resultsField, decoField, runLinter, lintGutter(), runTheme]`.

- [ ] **Step 1: Add the dependency**

In `packages/website/package.json`, add `@codemirror/lint` to `dependencies`, matching the version-range style of the sibling `@codemirror/*` entries (the installed version is `6.9.7`, so e.g. `"@codemirror/lint": "^6.9.0"`). Run `pnpm install` if needed so the workspace resolves it as a direct dep.

- [ ] **Step 2: Rewrite the test for `varDiagnostics`**

Replace the entire contents of `packages/website/src/lib/cm-run.test.ts` with:

```ts
import { hashSource, type SpecResults } from '@oselvar/var'
import { describe, expect, it } from 'vitest'
import { varDiagnostics } from './cm-run.js'

const SOURCE = 'x 6 y'
const results: SpecResults = {
  version: 1,
  specPath: 's.var.md',
  sourceHash: hashSource(SOURCE),
  examples: [
    { name: 'r', status: 'failed', lines: [1], failure: { line: 1, message: 'm', stack: 's', cells: [{ from: 2, to: 3, actual: '50' }] } },
  ],
}

describe('varDiagnostics', () => {
  it('maps a cell mismatch to a CodeMirror error diagnostic', () => {
    expect(varDiagnostics(results, SOURCE)).toEqual([
      { from: 2, to: 3, severity: 'error', message: 'expected 6 but was 50' },
    ])
  })

  it('returns nothing when results are null', () => {
    expect(varDiagnostics(null, SOURCE)).toEqual([])
  })

  it('returns nothing when the doc no longer hash-matches (stale)', () => {
    expect(varDiagnostics(results, `${SOURCE} edited`)).toEqual([])
  })
})
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd packages/website && npx vitest run src/lib/cm-run.test.ts`
Expected: FAIL — `varDiagnostics` is not exported from `./cm-run.js` (it still exports `cellFailRanges`/`actualAt`).

- [ ] **Step 4: Rewrite `cm-run.ts`**

Edit `packages/website/src/lib/cm-run.ts`:

1. **Imports** — replace the top imports with (keep only what's still used):
```ts
import { type Extension, RangeSetBuilder, StateEffect, StateField } from '@codemirror/state'
import { Decoration, type DecorationSet, EditorView } from '@codemirror/view'
import { type Diagnostic, linter, lintGutter } from '@codemirror/lint'
import { runResultDiagnostics, type SpecResults } from '@oselvar/var'
```
(Drop `GutterMarker`, `gutter`, `hoverTooltip` — no longer used. Drop the old `RunResults` import; it's `SpecResults` now if referenced.)

2. **Keep** `setRunResults`, `resultsField`, and `decoField` exactly as they are (the line-wash field).

3. **Delete** these and their helpers: `cellFailRanges`, `actualAt`, `cellMarkField`, the `ErrorMarker` and `PassMarker` classes, `PASS_MARKER`, `errorGutter`, and `cellHover`.

4. **Add** the lint source + pure mapping (after `decoField`):
```ts
// Pure projection used by the linter and unit-tested directly.
export function varDiagnostics(results: SpecResults | null, docText: string): Diagnostic[] {
  if (!results) return []
  return runResultDiagnostics(results, docText).map((d) => ({
    from: d.from,
    to: d.to,
    severity: 'error',
    message: d.message,
  }))
}

const runLinter = linter(
  (view) => varDiagnostics(view.state.field(resultsField), view.state.doc.toString()),
  // Results arrive via the setRunResults effect, not a doc change — re-lint then.
  { needsRefresh: (u) => u.transactions.some((t) => t.effects.some((e) => e.is(setRunResults))) },
)
```

5. **Trim `runTheme`** to only the line-wash rules (and the active-line note), removing the now-unused blocks (`.cm-run-cell-fail`, `.cm-run-cell-tip`, `.cm-run-gutter`, `.cm-run-errmark`, `.cm-run-passmark`, `.cm-run-dialog`, `.cm-run-stack`):
```ts
const runTheme = EditorView.baseTheme({
  '.cm-line.cm-run-pass': { background: 'var(--ed-pass-bg)' },
  '.cm-line.cm-run-fail': { background: 'var(--ed-fail-bg)' },
})
```

6. **Update `varRunExtension`**:
```ts
export function varRunExtension(): Extension {
  return [resultsField, decoField, runLinter, lintGutter(), runTheme]
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd packages/website && npx vitest run src/lib/cm-run.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Verify no leftover references + lib suite green**

```bash
grep -rn "cellFailRanges\|actualAt\|cellMarkField\|errorGutter\|cm-run-cell-fail\|ErrorMarker\|PassMarker" packages/website/src
cd packages/website && npx vitest run src/lib
```
Expected: the grep finds nothing (all removed); the lib suite passes. Do NOT run `astro build` — it is blocked by the unrelated untracked user content doc. Note that in your report; the controller type-checks the website separately.

- [ ] **Step 7: Commit**

```bash
git add packages/website/src/lib/cm-run.ts packages/website/src/lib/cm-run.test.ts packages/website/package.json
git commit -m "refactor(website): run-result diagnostics via @codemirror/lint; keep line wash"
```

---

## Self-Review

**Spec coverage:**
- Shared `runResultDiagnostics` projection (offset-based, hash-stale → [], passes → nothing, cell/doc/plain-throw cases) → Task 1 ✓
- `RunResultsStore` (ingest/get/specUris/remove, version-validated, keyed by spec URI) → Task 2 ✓
- `runLspDiagnostics` (offset→0-based position, severity 1, source 'var') → Task 2 ✓
- LSP wiring: init glob load, `didChangeWatchedFiles`, publish merge, open-vs-disk source, staleness on edit → Task 3 ✓
- Extension `.var/**` watcher → Task 4 ✓
- Web editor: keep line wash + resultsField, remove gutter/dialog/red-marks, add lint source + lintGutter → Task 5 ✓

**Placeholder scan:** No TBD/TODO. Hash-dependent test fixtures use `hashSource(SOURCE)` so the staleness gate passes (a fixed `fnv1a:00000000` would make every diagnostic stale — used deliberately only in the stale-path test). Plain-throw offsets (`{from:9,to:17}` for line 2 of `'line one\nline two\nline three'`) are computed, not placeholder.

**Type consistency:** `RunDiagnostic` `{from,to,message}` (Task 1) is consumed unchanged by `runLspDiagnostics` (Task 2) and `varDiagnostics` (Task 5). `LspDiagnostic` shape (Task 2, including the optional `code?`) is what `publishFor` concatenates and sends (Task 3); `toParseDiagnostics` sets `code` to preserve parse-diagnostic behavior, run diagnostics omit it. `createRunResultsStore`/`runLspDiagnostics` names match across Tasks 2–3. `varRunExtension` keeps its `(): Extension` signature (Task 5), so `editor-mount.ts:109` is unaffected.

## Out of scope (deferred)

`var.js` HTML overlay (#3) and example-drift detection (#4) are not in this plan. The recolored-text rendering is intentionally dropped in favour of diagnostics; VSCode shows no pass indicator by design.
