# TypeScript Diagnostics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show TypeScript diagnostics (type errors) in the browser `.steps.ts` editor by adding a small TS-diagnostics capability to the existing Vár LSP worker (which already bundles `typescript`), rendered via the already-connected `@codemirror/lsp-client`.

**Architecture:** A node-tested `ts-diagnostics` module runs a TypeScript `LanguageService` over a virtual host (bundled lib `.d.ts` + an ambient `@oselvar/var-runtime` decl + open `.steps.ts` docs). `var-lsp` gains a generic `onDidChangeDocument` hook; the browser `var-worker.ts` plugs in the provider and `sendDiagnostics` for `.steps.ts` uris. The editor renders `publishDiagnostics` for free.

**Tech Stack:** `typescript` (`LanguageService`), `vscode-languageserver/browser`, `@oselvar/var-lsp`, `@codemirror/lsp-client` (`serverDiagnostics`), Vite `?raw`/`import.meta.glob`, vitest.

## Global Constraints

- **No second `typescript` bundle for this feature** — reuse the Vár LSP worker (already bundles `typescript` via `@oselvar/var-language`). No new worker, no `@codemirror/lint`, no `typescript-language-server`.
- **Lib bundled locally** (no CDN/network): lib `.d.ts` via Vite `?raw`/`import.meta.glob`, served from an in-memory map.
- **`var-lsp` stays TypeScript-agnostic** — only a generic `onDidChangeDocument?: (uri, text) => void | Promise<void>` opt; Node callers pass none (behaviour unchanged).
- **Diagnostics only** (no hover/completion yet); only `.steps.ts` files.
- **`strict: false`** in the LS options so untyped step params (`(ctx, name) =>`) don't spam implicit-any errors in the demo; real type mismatches are still reported (assignability is always checked).
- Do not touch `<FileEditor>`, `step-highlight`, the run worker, or semantic tokens.

---

### Task 1: `var-lsp` generic `onDidChangeDocument` hook

**Files:**
- Modify: `packages/var-lsp/src/server.ts`
- Modify: `packages/var-lsp/src/bin.ts` (no behaviour change — confirms the optional arg)

**Interfaces:**
- Produces: `registerHandlers(connection, makeDeps, opts?: { onDidChangeDocument?: (uri: string, text: string) => void | Promise<void> })`.

- [ ] **Step 1: Add the optional opts param + call the hook**

In `packages/var-lsp/src/server.ts`, change the signature and the `documents.onDidChangeContent` body:
```ts
export function registerHandlers(
  connection: Connection,
  makeDeps: (rootUri?: string) => Promise<StoreDeps>,
  opts?: { onDidChangeDocument?: (uri: string, text: string) => void | Promise<void> },
): void {
```
and inside the existing `documents.onDidChangeContent(async (e) => { ... })`, after the write-through + reindex, add:
```ts
    await opts?.onDidChangeDocument?.(e.document.uri, e.document.getText())
```
(Keep the early `if (!store) return` — but call the hook even when there is no store? No: leave it after the reindex so the existing guard stays. If `!store`, the doc-open hook still matters for TS; move the hook call to the TOP of the handler, before `if (!store) return`, so TS diagnostics run regardless of Vár store state:)
```ts
  documents.onDidChangeContent(async (e) => {
    await opts?.onDidChangeDocument?.(e.document.uri, e.document.getText())
    if (!store) return
    await store.fs().write(uriToPath(e.document.uri), e.document.getText())
    await store.reindex()
    afterReindex()
  })
```

- [ ] **Step 2: Build + existing var-lsp suite (no regression)**

Run: `pnpm --filter @oselvar/var-lsp build && NODE_OPTIONS="--import tsx" pnpm vitest run packages/var-lsp`
Expected: build succeeds; all existing var-lsp tests pass (the new param is optional; `bin.ts` passes no `opts`, so the Node LSP is unchanged). The hook is exercised end-to-end in Task 3.

- [ ] **Step 3: Commit**
```bash
git add packages/var-lsp/src/server.ts
git commit -m "feat(var-lsp): generic onDidChangeDocument hook for extra diagnostics providers"
```

---

### Task 2: `ts-diagnostics` module + node unit test

**Files:**
- Create: `packages/website/src/lib/ts-diagnostics.ts`
- Create: `packages/website/src/lib/ts-diagnostics.test.ts`

**Interfaces:**
- Produces: `createTsDiagnostics(): { updateDoc(path: string, text: string): void; diagnostics(path: string): LspDiagnostic[] }` and `type LspDiagnostic = { range: { start: { line: number; character: number }; end: { line: number; character: number } }; message: string; severity: number }`.
- Consumes: `typescript`; the bundled lib `.d.ts` (Vite glob).

- [ ] **Step 1: Write the failing test**

`packages/website/src/lib/ts-diagnostics.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { createTsDiagnostics } from './ts-diagnostics.js'

describe('ts-diagnostics', () => {
  it('reports a type mismatch', () => {
    const ts = createTsDiagnostics()
    ts.updateDoc('a.steps.ts', 'const n: number = "x"\n')
    const d = ts.diagnostics('a.steps.ts')
    expect(d.length).toBeGreaterThan(0)
    expect(d.some((x) => /not assignable/.test(x.message))).toBe(true)
  })

  it('resolves @oselvar/var-runtime via the ambient decl (no cannot-find-module)', () => {
    const ts = createTsDiagnostics()
    ts.updateDoc(
      'b.steps.ts',
      `import { defineContext } from '@oselvar/var-runtime'\nconst { step } = defineContext(() => ({ greeting: '' }))\nstep('I greet {string}', (ctx, name) => { ctx.greeting = name })\n`,
    )
    const d = ts.diagnostics('b.steps.ts')
    expect(d.find((x) => /Cannot find module/.test(x.message))).toBeUndefined()
  })

  it('has the standard lib bundled (Error resolves)', () => {
    const ts = createTsDiagnostics()
    ts.updateDoc('c.steps.ts', 'throw new Error("boom")\n')
    const d = ts.diagnostics('c.steps.ts')
    expect(d.find((x) => /Cannot find name 'Error'/.test(x.message))).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `NODE_OPTIONS="--import tsx" pnpm vitest run packages/website/src/lib/ts-diagnostics.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

`packages/website/src/lib/ts-diagnostics.ts`:
```ts
import * as ts from 'typescript'

// Bundled TypeScript lib .d.ts files, keyed by basename (e.g. "lib.es2020.d.ts").
// Vite/Vitest resolve this glob at build/test time; no CDN.
const libModules = import.meta.glob('/node_modules/typescript/lib/lib.*.d.ts', {
  query: '?raw',
  eager: true,
  import: 'default',
}) as Record<string, string>
const LIB = new Map<string, string>()
for (const [p, text] of Object.entries(libModules)) {
  const base = p.split('/').pop()
  if (base) LIB.set(base, text)
}

// Ambient types for the browser step-definition runtime, so imports resolve and
// ctx/args typecheck without real module resolution.
const AMBIENT_FILE = 'var-runtime.d.ts'
const AMBIENT = `declare module '@oselvar/var-runtime' {
  export type Step<C = unknown> = <A extends readonly unknown[]>(
    expression: string,
    handler: (ctx: C, ...args: A) => void | Promise<void>,
  ) => void
  export const step: Step<unknown>
  export function defineContext<C>(factory: () => C | Promise<C>): { readonly step: Step<C> }
  export function defineParameterType<T>(opts: {
    name: string
    regexp: RegExp | readonly RegExp[]
    transformer: (...captures: string[]) => T
  }): void
}`

const OPTIONS: ts.CompilerOptions = {
  target: ts.ScriptTarget.ES2020,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  noEmit: true,
  strict: false,
  skipLibCheck: true,
}

export type LspDiagnostic = {
  range: { start: { line: number; character: number }; end: { line: number; character: number } }
  message: string
  severity: number
}

export function createTsDiagnostics() {
  const docs = new Map<string, { text: string; version: number }>()
  docs.set(AMBIENT_FILE, { text: AMBIENT, version: 0 })

  const base = (f: string) => f.split('/').pop() ?? f

  const host: ts.LanguageServiceHost = {
    getScriptFileNames: () => [...docs.keys()],
    getScriptVersion: (f) => String(docs.get(f)?.version ?? 0),
    getScriptSnapshot: (f) => {
      const d = docs.get(f)
      if (d) return ts.ScriptSnapshot.fromString(d.text)
      const lib = LIB.get(base(f))
      return lib ? ts.ScriptSnapshot.fromString(lib) : undefined
    },
    getCurrentDirectory: () => '/',
    getCompilationSettings: () => OPTIONS,
    getDefaultLibFileName: () => 'lib.es2020.d.ts',
    fileExists: (f) => docs.has(f) || LIB.has(base(f)),
    readFile: (f) => docs.get(f)?.text ?? LIB.get(base(f)),
    readDirectory: () => [],
    directoryExists: () => true,
    getDirectories: () => [],
  }

  const service = ts.createLanguageService(host, ts.createDocumentRegistry())

  function updateDoc(path: string, text: string): void {
    const prev = docs.get(path)
    docs.set(path, { text, version: (prev?.version ?? 0) + 1 })
  }

  function diagnostics(path: string): LspDiagnostic[] {
    const raw = [...service.getSyntacticDiagnostics(path), ...service.getSemanticDiagnostics(path)]
    const sf = service.getProgram()?.getSourceFile(path)
    return raw.map((d) => {
      const start = d.start ?? 0
      const s = sf?.getLineAndCharacterOfPosition(start) ?? { line: 0, character: 0 }
      const e = sf?.getLineAndCharacterOfPosition(start + (d.length ?? 0)) ?? s
      return {
        range: { start: { line: s.line, character: s.character }, end: { line: e.line, character: e.character } },
        message: ts.flattenDiagnosticMessageText(d.messageText, '\n'),
        severity:
          d.category === ts.DiagnosticCategory.Error
            ? 1
            : d.category === ts.DiagnosticCategory.Warning
              ? 2
              : 3,
      }
    })
  }

  return { updateDoc, diagnostics }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `NODE_OPTIONS="--import tsx" pnpm vitest run packages/website/src/lib/ts-diagnostics.test.ts`
Expected: PASS (3 tests). If test "c" fails with `Cannot find name 'Error'`, the lib glob didn't load — debug by logging `LIB.size` (should be ~90+). If it's 0, the glob path is wrong: try `import.meta.glob('/node_modules/typescript/lib/lib.*.d.ts', …)` relative forms, or an absolute `new URL`-based path, until `LIB.size > 0`. If `getDefaultLibFileName` mismatch causes lib loading to fail, confirm the referenced files (`lib.es2019.d.ts` … `lib.es5.d.ts`) are all present in `LIB` (the glob `lib.*.d.ts` includes them). Do not weaken the test assertions.

- [ ] **Step 5: Commit**
```bash
git add packages/website/src/lib/ts-diagnostics.ts packages/website/src/lib/ts-diagnostics.test.ts
git commit -m "feat(website): TS LanguageService diagnostics module (bundled lib, ambient var-runtime)"
```

---

### Task 3: Wire diagnostics into the Vár worker

**Files:**
- Modify: `packages/website/src/lib/var-worker.ts`
- Modify (only if needed): `packages/website/src/scripts/editor-mount.ts`

**Interfaces:**
- Consumes: `createTsDiagnostics` (Task 2); the `onDidChangeDocument` opt (Task 1).

- [ ] **Step 1: Plug the provider into `registerHandlers`**

Rewrite `packages/website/src/lib/var-worker.ts` to build a `ts-diagnostics` instance and pass the hook (debounced per uri):
```ts
import { DEFAULT_SNIPPET_TEMPLATE } from '@oselvar/var'
import { registerHandlers } from '@oselvar/var-lsp'
import { BrowserMessageReader, BrowserMessageWriter, createConnection } from 'vscode-languageserver/browser.js'
import { createIdbFileSystem } from './idb-file-system.ts'
import { SEED_FILES } from './seed-files.ts'
import { createTsDiagnostics } from './ts-diagnostics.ts'

const reader = new BrowserMessageReader(self as DedicatedWorkerGlobalScope)
const writer = new BrowserMessageWriter(self as DedicatedWorkerGlobalScope)
const connection = createConnection(reader, writer)

const config = {
  vars: ['**/*.var.md'],
  steps: ['**/*.steps.ts'],
  snippet: { template: DEFAULT_SNIPPET_TEMPLATE },
  scannerPlugins: [],
}

const tsd = createTsDiagnostics()
const timers = new Map<string, ReturnType<typeof setTimeout>>()

function onDidChangeDocument(uri: string, text: string): void {
  if (!uri.endsWith('.steps.ts')) return
  tsd.updateDoc(uri, text)
  clearTimeout(timers.get(uri))
  timers.set(
    uri,
    setTimeout(() => {
      const diagnostics = tsd.diagnostics(uri)
      void connection.sendDiagnostics({ uri, diagnostics })
    }, 250),
  )
}

registerHandlers(
  connection,
  async () => ({ fs: await createIdbFileSystem(SEED_FILES), config }),
  { onDidChangeDocument },
)
connection.listen()
```
(Note: the LanguageService is keyed by the full `uri` as the script path — consistent with `sendDiagnostics({ uri })` and `getSourceFile(uri)`. That is fine; the path just needs to be stable and end in `.ts`. `file:///01-hello.steps.ts` ends in `.ts`, so the host treats it as a TS file.)

- [ ] **Step 2: Ensure the editor renders server diagnostics**

The `.steps.ts` editor connects via `client.plugin(uri)` and the shared client uses `languageServerExtensions()`. Confirm that bundle includes the diagnostics renderer; if diagnostics don't show in Task 3's manual check, add `serverDiagnostics` explicitly to the client extensions in `packages/website/src/scripts/editor-mount.ts`:
```ts
import { LSPClient, languageServerExtensions, serverDiagnostics } from '@codemirror/lsp-client'
// ...
extensions: [
  ...languageServerExtensions(),
  serverDiagnostics(),
  semanticTokens({ legend: { tokenTypes: ['function', 'parameter'] } }),
],
```
(Only add this if the manual check shows no squiggles — `languageServerExtensions()` likely already includes it.)

- [ ] **Step 3: Build + verify the worker bundles ts-diagnostics**

Run: `pnpm --filter @oselvar/website build`
Expected: succeeds. Confirm the var-worker bundle includes the TS diagnostics path:
`find packages/website/dist -name '*.js' | xargs grep -l 'getSemanticDiagnostics' 2>/dev/null` → ≥1 (the var-worker bundle).

- [ ] **Step 4: Manual proof (record in report)**

`dev`, open `/var/playground`, in the **step definitions** editor type a type error — e.g. `const x: number = 'nope'` on a new line, or break a handler so the body has a type mismatch. After ~0.25 s a red squiggle + message should appear; fixing it clears it. The `.var.md` highlighting + run behaviour are unaffected. Record the result + whether `serverDiagnostics()` had to be added in Step 2.

- [ ] **Step 5: Commit**
```bash
git add packages/website/src/lib/var-worker.ts packages/website/src/scripts/editor-mount.ts
git commit -m "feat(website): TS diagnostics for .steps.ts in the browser editor via the Vár LSP worker"
```

---

## Notes for the implementer

- Tasks 1 and 2 are independently testable (var-lsp suite; the ts-diagnostics node test). Task 3 is browser-integration verified by build + the manual check.
- The single biggest risk is the lib glob / lib-reference resolution in Task 2 — the test "c" (`Error` resolves) is the gate; iterate the glob path until `LIB.size > 0` and test c passes. Keep `strict: false` so the demo's untyped step params don't produce implicit-any noise.
- Reuse the existing `typescript` already in the var-worker bundle — do not add a separate typecheck worker.
- Do not touch `<FileEditor>`, `step-highlight`, the run worker, or the semantic-tokens code.
```
