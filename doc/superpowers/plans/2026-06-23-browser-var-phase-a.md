# Browser Vár — Phase A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the in-browser Vár LSP foundation — a CodeMirror Markdown `<Editor>` island talking to the real `var-lsp` server in a Web Worker over an IndexedDB filesystem — built outside-in so each step is small and verifiable.

**Architecture:** Outside-in: (1) a CodeMirror editor with no LSP, (2) a worker + transport bridge with a minimal server, (3) refactor `var-lsp`'s store behind a `FileSystem` port, (4) put `var-language`'s TypeScript parsing behind a `StepDefScanner` port, (5) wire the real handlers over an in-memory FS to get live diagnostics, (6) swap in IndexedDB persistence. The CodeMirror client is `@codemirror/lsp-client`; the server is `vscode-languageserver/browser` in a worker.

**Tech Stack:** Astro 5 (islands via `<script>`), CodeMirror 6 (`codemirror`, `@codemirror/lang-markdown`), `@codemirror/lsp-client`, `vscode-languageserver` (browser entry), `@oselvar/var-lsp` + `@oselvar/var`(-language), vitest.

## Global Constraints

- **Outside-in, small steps:** later tasks may only depend on earlier ones; do not pull inner layers forward.
- **`@codemirror/lsp-client` API:** `import { LSPClient, languageServerExtensions } from '@codemirror/lsp-client'`; `new LSPClient({ extensions: languageServerExtensions() }).connect(transport)`; attach with `client.plugin("file:///<path>")` in the EditorView extensions. `Transport = { send(message: string): void; subscribe(handler: (value: string) => void): void; unsubscribe(handler: (value: string) => void): void }`.
- **Transport framing:** the client speaks JSON-RPC **strings**; `vscode-languageserver/browser` (`BrowserMessageReader`/`BrowserMessageWriter`) speaks JSON-RPC **objects** over `postMessage`. The bridge `JSON.parse`s on send and `JSON.stringify`s on receive.
- **Worker can't use `localStorage`** — the browser filesystem is IndexedDB (Task 6).
- **TypeScript parsing is behind a `StepDefScanner` port** (Task 4): `buildWorkspaceIndex` takes an optional `scanner` defaulting to `createTypeScriptScanner()`. Phase A uses the typescript scanner in both Node and browser; the port exists so `tsgo-wasm`/`typescript-go` can replace it later with no API change. Official CodeMirror client docs: https://code.haverbeke.berlin/codemirror/lsp-client.
- **No regression to the Node LSP:** the existing `var-lsp` stdio server (CLI/VSCode) must behave exactly as before after the store refactor.
- **`<FileEditor>` is untouched.** This is all-new code plus a contained `var-lsp` refactor.
- **Verification reality:** browser/worker behavior is verified by a green `pnpm --filter @oselvar/website build` (type+bundle), structural assertions on output, and a manual dev-server check. Only Task 3 (the pure refactor) has unit tests. Automated headless-browser testing is out of scope.
- **Fixed browser config (Task 4+):** `VarConfig` = `{ vars: ['**/*.var.md'], steps: ['**/*.steps.ts'], snippet: { template: DEFAULT_SNIPPET_TEMPLATE }, scannerPlugins: [] }`.

---

### Task 1: CodeMirror `<Editor>` island (no LSP) on a demo page

**Files:**
- Modify: `packages/website/package.json` (deps)
- Create: `packages/website/src/components/Editor.astro`
- Create: `packages/website/src/scripts/editor-mount.ts`
- Create: `packages/website/src/pages/playground.astro`

**Interfaces:**
- Produces: an `<Editor>` Astro component that renders a mount `<div class="cm-mount" data-uri data-lang data-doc>` plus a bundled client script that instantiates a CodeMirror `EditorView` per mount. Later tasks extend `editor-mount.ts` to attach an LSP client.

- [ ] **Step 1: Add CodeMirror deps**

In `packages/website/package.json` `dependencies`, add:
```json
    "codemirror": "^6.0.1",
    "@codemirror/lang-markdown": "^6.3.0"
```
Run: `pnpm install`  — Expected: completes.

- [ ] **Step 2: Create the Editor component**

`packages/website/src/components/Editor.astro`:
```astro
---
interface Props {
  uri: string
  lang?: 'markdown' | 'typescript'
  doc?: string
}
const { uri, lang = 'markdown', doc = '' } = Astro.props
---
<div class="cm-mount" data-uri={uri} data-lang={lang} data-doc={doc}></div>
<style>
  .cm-mount { border: 2px solid var(--ink); border-radius: var(--radius-5); overflow: hidden; margin: 24px 0; }
  .cm-mount :global(.cm-editor) { font-size: 14px; }
  .cm-mount :global(.cm-editor.cm-focused) { outline: none; }
</style>
<script>
  import '../scripts/editor-mount.ts'
</script>
```

- [ ] **Step 3: Create the mount script**

`packages/website/src/scripts/editor-mount.ts`:
```ts
import { EditorView, basicSetup } from 'codemirror'
import { markdown } from '@codemirror/lang-markdown'

export function mountEditor(el: HTMLElement): EditorView {
  const doc = el.dataset.doc ?? ''
  const view = new EditorView({
    doc,
    extensions: [basicSetup, markdown()],
    parent: el,
  })
  return view
}

function mountAll(): void {
  for (const el of document.querySelectorAll<HTMLElement>('.cm-mount')) {
    if (el.dataset.mounted) continue
    el.dataset.mounted = 'true'
    mountEditor(el)
  }
}

mountAll()
```

- [ ] **Step 4: Create the demo page**

`packages/website/src/pages/playground.astro`:
```astro
---
import Base from '../layouts/Base.astro'
import Editor from '../components/Editor.astro'
const hello = `# Hello, Vár\n\nFirst I greet "world" okay? I think the greeting should be "Hello, world!"\n`
---
<Base title="Vár playground" description="Run Vár in the browser.">
  <main class="doc">
    <h1>playground</h1>
    <Editor uri="file:///hello.var.md" lang="markdown" doc={hello} />
  </main>
</Base>
```

- [ ] **Step 5: Build and verify**

Run: `pnpm --filter @oselvar/website build`
Expected: build succeeds; `packages/website/dist/playground/index.html` exists and contains `class="cm-mount"` with `data-uri="file:///hello.var.md"`.
Run: `grep -c 'cm-mount' packages/website/dist/playground/index.html` → ≥ 1.

- [ ] **Step 6: Manual check (note in report, do not block)**

Run `pnpm --filter @oselvar/website dev`, open `/var/playground`, confirm an editable Markdown editor renders with the seeded text. Record the result in the task report.

- [ ] **Step 7: Commit**
```bash
git add packages/website/package.json pnpm-lock.yaml packages/website/src/components/Editor.astro packages/website/src/scripts/editor-mount.ts packages/website/src/pages/playground.astro
git commit -m "feat(website): CodeMirror Editor island on a playground page (no LSP)"
```

---

### Task 2: Worker + transport bridge + minimal LSP handshake

**Files:**
- Modify: `packages/website/package.json` (deps)
- Create: `packages/website/src/lib/worker-transport.ts`
- Create: `packages/website/src/lib/var-worker.ts`
- Modify: `packages/website/src/scripts/editor-mount.ts`

**Interfaces:**
- Consumes: `mountEditor` from Task 1.
- Produces: `workerTransport(worker: Worker): Transport`; a worker that answers `initialize`. `editor-mount.ts` now connects an `LSPClient` and adds `client.plugin(uri)` to the editor.

- [ ] **Step 1: Add LSP deps**

In `packages/website/package.json` `dependencies`, add:
```json
    "@codemirror/lsp-client": "^6.0.0",
    "vscode-languageserver": "^9.0.1"
```
Run: `pnpm install` — Expected: completes.

- [ ] **Step 2: Transport bridge**

`packages/website/src/lib/worker-transport.ts`:
```ts
import type { Transport } from '@codemirror/lsp-client'

// @codemirror/lsp-client sends/receives JSON-RPC as strings; the worker's
// BrowserMessageReader/Writer send/receive JSON-RPC as objects via postMessage.
// Bridge by parsing on the way in and stringifying on the way out.
export function workerTransport(worker: Worker): Transport {
  const handlers = new Set<(value: string) => void>()
  worker.addEventListener('message', (e: MessageEvent) => {
    const text = JSON.stringify(e.data)
    for (const h of handlers) h(text)
  })
  return {
    send(message: string) {
      worker.postMessage(JSON.parse(message))
    },
    subscribe(handler) {
      handlers.add(handler)
    },
    unsubscribe(handler) {
      handlers.delete(handler)
    },
  }
}
```

- [ ] **Step 3: Minimal worker server**

`packages/website/src/lib/var-worker.ts`:
```ts
import {
  BrowserMessageReader,
  BrowserMessageWriter,
  TextDocumentSyncKind,
  createConnection,
} from 'vscode-languageserver/browser.js'

const reader = new BrowserMessageReader(self as DedicatedWorkerGlobalScope)
const writer = new BrowserMessageWriter(self as DedicatedWorkerGlobalScope)
const connection = createConnection(reader, writer)

connection.onInitialize(() => ({
  capabilities: { textDocumentSync: TextDocumentSyncKind.Incremental },
}))

connection.listen()
```

- [ ] **Step 4: Connect the client in the mount script**

Replace `packages/website/src/scripts/editor-mount.ts` with:
```ts
import { markdown } from '@codemirror/lang-markdown'
import { LSPClient, languageServerExtensions } from '@codemirror/lsp-client'
import { EditorView, basicSetup } from 'codemirror'
import { workerTransport } from '../lib/worker-transport.ts'

// One shared LSP client (one worker) for the page. Phase C generalises this to
// a registry keyed by an `lsp=` attribute.
let sharedClient: LSPClient | null = null

function lspClient(): LSPClient {
  if (sharedClient) return sharedClient
  const worker = new Worker(new URL('../lib/var-worker.ts', import.meta.url), { type: 'module' })
  sharedClient = new LSPClient({ extensions: languageServerExtensions() }).connect(workerTransport(worker))
  return sharedClient
}

export function mountEditor(el: HTMLElement): EditorView {
  const doc = el.dataset.doc ?? ''
  const uri = el.dataset.uri ?? 'file:///untitled.var.md'
  const client = lspClient()
  return new EditorView({
    doc,
    extensions: [basicSetup, markdown(), client.plugin(uri)],
    parent: el,
  })
}

function mountAll(): void {
  for (const el of document.querySelectorAll<HTMLElement>('.cm-mount')) {
    if (el.dataset.mounted) continue
    el.dataset.mounted = 'true'
    mountEditor(el)
  }
}

mountAll()
```

- [ ] **Step 5: Build and verify**

Run: `pnpm --filter @oselvar/website build`
Expected: build succeeds (Vite bundles the worker via `new Worker(new URL(...))`). Confirm a worker chunk was emitted:
`ls packages/website/dist/_astro/ | grep -i worker || find packages/website/dist -name '*.js' | xargs grep -l 'onInitialize' 2>/dev/null` → at least one match (the worker bundle).

- [ ] **Step 6: Manual check (note in report)**

`pnpm --filter @oselvar/website dev`, open `/var/playground`, open devtools: confirm no console errors and the LSP client completes `initialize` with the worker (the editor still renders and is editable). Record in report.

- [ ] **Step 7: Commit**
```bash
git add packages/website/package.json pnpm-lock.yaml packages/website/src/lib/worker-transport.ts packages/website/src/lib/var-worker.ts packages/website/src/scripts/editor-mount.ts
git commit -m "feat(website): worker LSP transport bridge + minimal initialize handshake"
```

---

### Task 3: `var-lsp` `FileSystem` port + store refactor (no browser)

**Files:**
- Create: `packages/var-lsp/src/file-system.ts`
- Create: `packages/var-lsp/src/node-file-system.ts`
- Modify: `packages/var-lsp/src/store.ts`
- Modify: `packages/var-lsp/src/server.ts`
- Modify: `packages/var-lsp/src/bin.ts`
- Create: `packages/var-lsp/src/store.test.ts`

**Interfaces:**
- Produces:
  - `interface FileSystem { list(globs: readonly string[]): Promise<string[]>; read(path: string): Promise<string>; write(path: string, content: string): Promise<void> }`
  - `type StoreDeps = { fs: FileSystem; config: VarConfig }` and `createStore(deps: StoreDeps): Store` with `reindex(): Promise<void>` (no path arg).
  - `registerHandlers(connection, makeDeps: (rootUri?: string) => Promise<StoreDeps>)`.
  - `createNodeFileSystem(root: string): FileSystem`.
- Consumes: `VarConfig`, `loadVarConfig`, `buildWorkspaceIndex` (unchanged).

- [ ] **Step 1: Write the failing store test**

`packages/var-lsp/src/store.test.ts`:
```ts
import { DEFAULT_SNIPPET_TEMPLATE } from '@oselvar/var'
import { describe, expect, it } from 'vitest'
import { type FileSystem, createStore } from './store.js'

function fakeFs(files: Record<string, string>): FileSystem {
  const map = new Map(Object.entries(files))
  return {
    async list(globs) {
      // Minimal matcher: support '**/*.ext' by extension suffix.
      const exts = globs.map((g) => g.slice(g.lastIndexOf('.')))
      return [...map.keys()].filter((p) => exts.some((e) => p.endsWith(e)))
    },
    async read(path) {
      const v = map.get(path)
      if (v === undefined) throw new Error(`no such file: ${path}`)
      return v
    },
    async write(path, content) {
      map.set(path, content)
    },
  }
}

const config = {
  vars: ['**/*.var.md'],
  steps: ['**/*.steps.ts'],
  snippet: { template: DEFAULT_SNIPPET_TEMPLATE },
  scannerPlugins: [],
}

describe('createStore over a FileSystem', () => {
  it('indexes matches from in-memory step + var files', async () => {
    const fs = fakeFs({
      '/s.steps.ts': `import { defineContext } from '@oselvar/var-vitest'\nconst { step } = defineContext(() => ({}))\nstep('I greet {string}', (ctx, name: string) => {})\n`,
      '/hello.var.md': `# Hi\n\nFirst I greet "world" okay?\n`,
    })
    const store = createStore({ fs, config })
    await store.reindex()
    const matches = store.index().matches.filter((m) => m.varPath === '/hello.var.md')
    expect(matches.length).toBeGreaterThan(0)
  })

  it('reflects a written file on reindex', async () => {
    const fs = fakeFs({ '/s.steps.ts': '', '/a.var.md': '# none\n' })
    const store = createStore({ fs, config })
    await store.reindex()
    expect(store.index().matches.length).toBe(0)
    await fs.write('/s.steps.ts', `step('I greet {string}', () => {})`)
    await fs.write('/a.var.md', `I greet "x"`)
    await store.reindex()
    expect(store.index().matches.length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `NODE_OPTIONS="--import tsx" pnpm vitest run packages/var-lsp/src/store.test.ts`
Expected: FAIL — `createStore`/`FileSystem` not exported with the new shape.

- [ ] **Step 3: Define the port + Node adapter**

`packages/var-lsp/src/file-system.ts`:
```ts
export interface FileSystem {
  list(globs: readonly string[]): Promise<string[]>
  read(path: string): Promise<string>
  write(path: string, content: string): Promise<void>
}
```

`packages/var-lsp/src/node-file-system.ts` (move the existing glob/read logic here):
```ts
import { readFileSync, writeFileSync } from 'node:fs'
import { glob as nativeGlob } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { FileSystem } from './file-system.js'

const glob = nativeGlob as unknown as (
  pattern: string,
  opts: { cwd: string },
) => AsyncIterable<string>

export function createNodeFileSystem(root: string): FileSystem {
  return {
    async list(patterns) {
      const out: string[] = []
      const seen = new Set<string>()
      for (const pattern of patterns) {
        for await (const rel of glob(pattern, { cwd: root })) {
          const abs = resolve(root, rel)
          if (!seen.has(abs)) {
            seen.add(abs)
            out.push(abs)
          }
        }
      }
      return out
    },
    async read(path) {
      return readFileSync(path, 'utf8')
    },
    async write(path, content) {
      writeFileSync(path, content, 'utf8')
    },
  }
}
```

- [ ] **Step 4: Refactor the store to take deps**

Rewrite `packages/var-lsp/src/store.ts` so it no longer imports `node:fs`/`node:path`/`loadVarConfig`:
```ts
import { createRegistry } from '@oselvar/var'
import type { VarConfig } from '@oselvar/var'
import { type WorkspaceIndex, buildWorkspaceIndex } from '@oselvar/var-language'
import type { FileSystem } from './file-system.js'

export type { FileSystem } from './file-system.js'

export type StoreDeps = { readonly fs: FileSystem; readonly config: VarConfig }

export type Store = {
  reindex(): Promise<void>
  index(): WorkspaceIndex
  snippetTemplate(): string
  stepGlobs(): ReadonlyArray<string>
  fs(): FileSystem
}

export function createStore(deps: StoreDeps): Store {
  const { fs, config } = deps
  let current: WorkspaceIndex = {
    stepDefs: [],
    matches: [],
    diagnostics: [],
    registry: createRegistry(),
  }
  return {
    async reindex() {
      const stepPaths = await fs.list(config.steps)
      const varPaths = await fs.list(config.vars)
      const stepFiles = await Promise.all(
        stepPaths.map(async (path) => ({ path, source: await fs.read(path) })),
      )
      const varFiles = await Promise.all(
        varPaths.map(async (path) => ({ path, source: await fs.read(path) })),
      )
      current = buildWorkspaceIndex({ stepFiles, varFiles, scannerPlugins: config.scannerPlugins })
    },
    index: () => current,
    snippetTemplate: () => config.snippet.template,
    stepGlobs: () => config.steps,
    fs: () => fs,
  }
}
```
(Note: `workspaceRoot()` is removed; confirm no remaining caller depends on it — Step 6 updates `server.ts`.)

- [ ] **Step 5: Thread deps through `registerHandlers` + write-through**

In `packages/var-lsp/src/server.ts`: change the signature and the store wiring. Replace the `createStore()` line and `onInitialize`/`onDidSave` bodies:
```ts
import type { StoreDeps } from './store.js'
// ...
export function registerHandlers(
  connection: Connection,
  makeDeps: (rootUri?: string) => Promise<StoreDeps>,
): void {
  let store: Store | null = null
  let handlers: ReturnType<typeof buildHandlers> | null = null
  const documents = new TextDocuments(TextDocument)
  documents.listen(connection)

  connection.onInitialize(async (params) => {
    const root = params.workspaceFolders?.[0]?.uri
    store = createStore(await makeDeps(root))
    handlers = buildHandlers(store)
    await store.reindex()
    afterReindex()
    return {
      capabilities: {
        textDocumentSync: TextDocumentSyncKind.Incremental,
        hoverProvider: true,
        definitionProvider: true,
        completionProvider: { resolveProvider: false },
      },
    }
  })

  // Write-through: persist edited docs to the FileSystem, then reindex.
  documents.onDidChangeContent(async (e) => {
    if (!store) return
    await store.fs().write(uriToPath(e.document.uri), e.document.getText())
    await store.reindex()
    afterReindex()
  })

  function afterReindex(): void {
    if (!store || !handlers) return
    pushDiagnostics(connection, store, handlers)
    void connection.sendNotification('var/didIndex')
  }
  // ... rest of the handlers reference `store!`/`handlers!` (guard with early return if null)
}
```
Adjust the remaining `connection.on*` handlers to no-op until `handlers` is set (e.g. `if (!handlers) return null`). Remove the old `onDidSaveTextDocument` disk-reindex (the in-memory documents + write-through replace it). Keep `uriToPath` (strip `file://`).

- [ ] **Step 6: Wire the Node adapter in `bin.ts`**

`packages/var-lsp/src/bin.ts`:
```ts
#!/usr/bin/env node
import { ProposedFeatures, createConnection } from 'vscode-languageserver/node.js'
import { loadVarConfig } from '@oselvar/var'
import { createNodeFileSystem } from './node-file-system.js'
import { registerHandlers } from './server.js'

const connection = createConnection(ProposedFeatures.all)
registerHandlers(connection, async (rootUri) => {
  const root = (rootUri ?? process.cwd()).replace(/^file:\/\//, '')
  return { fs: createNodeFileSystem(root), config: await loadVarConfig(root) }
})
connection.listen()
```

- [ ] **Step 7: Run the store test + full var-lsp suite**

Run: `NODE_OPTIONS="--import tsx" pnpm vitest run packages/var-lsp`
Expected: the new `store.test.ts` passes AND the existing `var-lsp` handler tests still pass (no Node-LSP regression). If a handler test constructed the store/handlers directly, update it to the new `createStore({fs,config})` shape using `createNodeFileSystem` or a fake fs.

- [ ] **Step 8: Build + typecheck the package**

Run: `pnpm --filter @oselvar/var-lsp build`
Expected: succeeds.

- [ ] **Step 9: Commit**
```bash
git add packages/var-lsp/src/file-system.ts packages/var-lsp/src/node-file-system.ts packages/var-lsp/src/store.ts packages/var-lsp/src/server.ts packages/var-lsp/src/bin.ts packages/var-lsp/src/store.test.ts
git commit -m "refactor(var-lsp): inject FileSystem port + config into store (Node adapter unchanged behaviour)"
```

---

### Task 4: `@oselvar/var-language` — `StepDefScanner` port (typescript default)

**Files:**
- Create: `packages/var-language/src/scanner.ts`
- Modify: `packages/var-language/src/index-workspace.ts`
- Modify: `packages/var-language/src/index.ts`
- Create: `packages/var-language/src/scanner.test.ts`

**Interfaces:**
- Produces:
  - `interface StepDefScanner { discoverStepDefs(path: string, source: string): StepDef[]; discoverParameterTypes(path: string, source: string): ParameterTypeDef[] }`
  - `createTypeScriptScanner(): StepDefScanner`
  - `buildWorkspaceIndex(input: { ...; scanner?: StepDefScanner })` — defaults to `createTypeScriptScanner()`.
- Consumes: existing `discoverStepDefs`, `discoverParameterTypes` (typescript-based) and types `StepDef`, `ParameterTypeDef` from `./step-defs.js`.

- [ ] **Step 1: Write the failing test (seam is injectable)**

`packages/var-language/src/scanner.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest'
import { buildWorkspaceIndex } from './index-workspace.js'
import type { StepDefScanner } from './scanner.js'

describe('buildWorkspaceIndex scanner injection', () => {
  it('uses the injected scanner instead of the default', () => {
    const scanner: StepDefScanner = {
      discoverStepDefs: vi.fn(() => [
        {
          file: 's.steps.ts',
          expression: 'I greet {string}',
          expressionRange: { start: { line: 1, character: 1 }, end: { line: 1, character: 10 } },
          callRange: { start: { line: 1, character: 1 }, end: { line: 1, character: 10 } },
        },
      ]),
      discoverParameterTypes: vi.fn(() => []),
    }
    const index = buildWorkspaceIndex({
      stepFiles: [{ path: 's.steps.ts', source: 'IGNORED BY FAKE' }],
      varFiles: [{ path: 'a.var.md', source: 'First I greet "world"' }],
      scanner,
    })
    expect(scanner.discoverStepDefs).toHaveBeenCalledOnce()
    expect(index.matches.length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `NODE_OPTIONS="--import tsx" pnpm vitest run packages/var-language/src/scanner.test.ts`
Expected: FAIL — `./scanner.js` / `StepDefScanner` not found; `buildWorkspaceIndex` has no `scanner` option.

- [ ] **Step 3: Create the scanner port + typescript impl**

`packages/var-language/src/scanner.ts`:
```ts
import {
  type ParameterTypeDef,
  type StepDef,
  discoverParameterTypes,
  discoverStepDefs,
} from './step-defs.js'

export interface StepDefScanner {
  discoverStepDefs(path: string, source: string): StepDef[]
  discoverParameterTypes(path: string, source: string): ParameterTypeDef[]
}

// Default scanner: the existing TypeScript-compiler-based parser. A lighter
// browser scanner (e.g. tsgo-wasm) can implement the same interface later.
export function createTypeScriptScanner(): StepDefScanner {
  return {
    discoverStepDefs: (path, source) => discoverStepDefs(path, source),
    discoverParameterTypes: (path, source) => discoverParameterTypes(path, source),
  }
}
```

- [ ] **Step 4: Thread the scanner through `buildWorkspaceIndex`**

In `packages/var-language/src/index-workspace.ts`:
- Add `scanner?: StepDefScanner` to `WorkspaceInput` (import `StepDefScanner`, `createTypeScriptScanner` from `./scanner.js`).
- At the top of `buildWorkspaceIndex`, add: `const scanner = input.scanner ?? createTypeScriptScanner()`.
- Replace the two direct calls `discoverParameterTypes(file.path, file.source)` → `scanner.discoverParameterTypes(file.path, file.source)` and `discoverStepDefs(file.path, file.source)` → `scanner.discoverStepDefs(file.path, file.source)`.
- Remove the now-unused direct imports of `discoverStepDefs`/`discoverParameterTypes` if they are no longer referenced (keep the type imports `StepDef`/`Range` etc.).

- [ ] **Step 5: Export from the package index**

In `packages/var-language/src/index.ts` add:
```ts
export { createTypeScriptScanner } from './scanner.js'
export type { StepDefScanner } from './scanner.js'
```

- [ ] **Step 6: Run the test + full var-language suite**

Run: `NODE_OPTIONS="--import tsx" pnpm vitest run packages/var-language`
Expected: the new test passes; existing `var-language` tests still pass (default scanner = previous behavior). Also run the dependents to confirm no break:
`NODE_OPTIONS="--import tsx" pnpm vitest run packages/var-lsp packages/website/src/lib/step-highlight.test.ts` → still green (they use the default scanner).

- [ ] **Step 7: Commit**
```bash
git add packages/var-language/src/scanner.ts packages/var-language/src/index-workspace.ts packages/var-language/src/index.ts packages/var-language/src/scanner.test.ts
git commit -m "refactor(var-language): inject StepDefScanner port (typescript default)"
```

---

### Task 5: Real handlers in the worker over an in-memory FileSystem → live diagnostics

**Files:**
- Create: `packages/website/src/lib/map-file-system.ts`
- Create: `packages/website/src/lib/seed-files.ts`
- Modify: `packages/website/src/lib/var-worker.ts`
- Modify: `packages/website/package.json` (deps: var-lsp/var/var-language)

**Interfaces:**
- Consumes: `FileSystem`, `registerHandlers`, `StoreDeps` from `@oselvar/var-lsp`; `DEFAULT_SNIPPET_TEMPLATE` from `@oselvar/var`.
- Produces: `createMapFileSystem(initial: Record<string,string>): FileSystem`; the worker now serves the real Vár handlers.

- [ ] **Step 1: Add workspace deps to the website**

In `packages/website/package.json` `dependencies`, add:
```json
    "@oselvar/var": "workspace:*",
    "@oselvar/var-lsp": "workspace:*"
```
(`@oselvar/var-language` comes transitively; it is already a direct dep from the step-highlight feature.)
Run: `pnpm install`.

- [ ] **Step 2: In-memory FileSystem**

`packages/website/src/lib/map-file-system.ts`:
```ts
import type { FileSystem } from '@oselvar/var-lsp'

export function createMapFileSystem(initial: Record<string, string> = {}): FileSystem {
  const map = new Map(Object.entries(initial))
  return {
    async list(globs) {
      const exts = globs.map((g) => g.slice(g.lastIndexOf('.')))
      return [...map.keys()].filter((p) => exts.some((e) => p.endsWith(e)))
    },
    async read(path) {
      const v = map.get(path)
      if (v === undefined) throw new Error(`no such file: ${path}`)
      return v
    },
    async write(path, content) {
      map.set(path, content)
    },
  }
}
```

- [ ] **Step 3: Seed files**

`packages/website/src/lib/seed-files.ts`:
```ts
export const SEED_FILES: Record<string, string> = {
  '/hello.var.md': `# Hello, Vár\n\nFirst I greet "world" okay? I think the greeting should be "Hello, world!"\n`,
  '/01-hello.steps.ts': `import { defineContext } from '@oselvar/var-vitest'\nconst { step } = defineContext(() => ({ greeting: '' }))\nstep('I greet {string}', (ctx, name: string) => {})\nstep('the greeting should be {string}', (ctx, expected: string) => {})\n`,
}
```
(URIs in the editor are `file:///hello.var.md`; the FS keys are the path `/hello.var.md`. The worker strips `file://` consistently — `registerHandlers`' `uriToPath` already does this; keep the editor `uri` and FS keys aligned.)

- [ ] **Step 4: Swap the minimal server for the real handlers**

Rewrite `packages/website/src/lib/var-worker.ts`:
```ts
import { DEFAULT_SNIPPET_TEMPLATE } from '@oselvar/var'
import { registerHandlers } from '@oselvar/var-lsp'
import { BrowserMessageReader, BrowserMessageWriter, createConnection } from 'vscode-languageserver/browser.js'
import { createMapFileSystem } from './map-file-system.ts'
import { SEED_FILES } from './seed-files.ts'

const reader = new BrowserMessageReader(self as DedicatedWorkerGlobalScope)
const writer = new BrowserMessageWriter(self as DedicatedWorkerGlobalScope)
const connection = createConnection(reader, writer)

const fs = createMapFileSystem(SEED_FILES)
const config = {
  vars: ['**/*.var.md'],
  steps: ['**/*.steps.ts'],
  snippet: { template: DEFAULT_SNIPPET_TEMPLATE },
  scannerPlugins: [],
}

registerHandlers(connection, async () => ({ fs, config }))
connection.listen()
```

- [ ] **Step 5: Build + verify the worker bundles the real server**

Run: `pnpm --filter @oselvar/website build`
Expected: succeeds (this also confirms `@oselvar/var-language`'s `typescript`-based `discoverStepDefs` bundles into the worker). Confirm the worker bundle includes the handler code:
`find packages/website/dist -name '*.js' | xargs grep -l 'var/didIndex' 2>/dev/null` → ≥ 1 match.

- [ ] **Step 6: Manual proof (the Phase A acceptance — record in report)**

`pnpm --filter @oselvar/website dev`, open `/var/playground`. With the seeded steps, the diagnostics for unmatched sentences should appear in the editor. Edit the text so `the greeting should be "..."` is broken/removed and confirm a diagnostic appears/clears live. Record the observed behavior (and any console errors) in the report.

- [ ] **Step 7: Commit**
```bash
git add packages/website/package.json pnpm-lock.yaml packages/website/src/lib/map-file-system.ts packages/website/src/lib/seed-files.ts packages/website/src/lib/var-worker.ts
git commit -m "feat(website): real var-lsp handlers in the worker over an in-memory FileSystem"
```

---

### Task 6: IndexedDB FileSystem + write-through persistence

**Files:**
- Create: `packages/website/src/lib/idb-file-system.ts`
- Modify: `packages/website/src/lib/var-worker.ts`

**Interfaces:**
- Consumes: `FileSystem` from `@oselvar/var-lsp`; `SEED_FILES` from Task 4.
- Produces: `createIdbFileSystem(): Promise<FileSystem>` backed by IndexedDB, seeded from `SEED_FILES` when empty.

- [ ] **Step 1: IndexedDB FileSystem adapter**

`packages/website/src/lib/idb-file-system.ts`:
```ts
import type { FileSystem } from '@oselvar/var-lsp'

const DB = 'var-fs'
const STORE = 'files'

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function tx<T>(db: IDBDatabase, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const req = fn(db.transaction(STORE, mode).objectStore(STORE))
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function createIdbFileSystem(seed: Record<string, string> = {}): Promise<FileSystem> {
  const db = await open()
  const keys = await tx<IDBValidKey[]>(db, 'readonly', (s) => s.getAllKeys() as IDBRequest<IDBValidKey[]>)
  if (keys.length === 0) {
    for (const [path, content] of Object.entries(seed)) {
      await tx(db, 'readwrite', (s) => s.put(content, path))
    }
  }
  return {
    async list(globs) {
      const all = await tx<IDBValidKey[]>(db, 'readonly', (s) => s.getAllKeys() as IDBRequest<IDBValidKey[]>)
      const paths = all.map(String)
      const exts = globs.map((g) => g.slice(g.lastIndexOf('.')))
      return paths.filter((p) => exts.some((e) => p.endsWith(e)))
    },
    async read(path) {
      const v = await tx<string | undefined>(db, 'readonly', (s) => s.get(path) as IDBRequest<string | undefined>)
      if (v === undefined) throw new Error(`no such file: ${path}`)
      return v
    },
    async write(path, content) {
      await tx(db, 'readwrite', (s) => s.put(content, path))
    },
  }
}
```

- [ ] **Step 2: Use IDB in the worker**

In `packages/website/src/lib/var-worker.ts`, replace the `createMapFileSystem` usage with the async IDB FS (built before wiring deps; `makeDeps` is already async):
```ts
import { createIdbFileSystem } from './idb-file-system.ts'
// ...
registerHandlers(connection, async () => ({
  fs: await createIdbFileSystem(SEED_FILES),
  config,
}))
```
Remove the `createMapFileSystem` import. (Keep `map-file-system.ts` for tests/fallback.)

- [ ] **Step 3: Build + verify**

Run: `pnpm --filter @oselvar/website build`
Expected: succeeds. `find packages/website/dist -name '*.js' | xargs grep -l 'indexedDB.open' 2>/dev/null` → ≥ 1 (IDB code in the worker bundle).

- [ ] **Step 4: Manual persistence check (record in report)**

`pnpm --filter @oselvar/website dev`, open `/var/playground`, edit the markdown, reload the page: the edited content persists (loaded from IDB), and diagnostics still update on edit. Record the result. (To reset: clear the `var-fs` IndexedDB in devtools.)

- [ ] **Step 5: Commit**
```bash
git add packages/website/src/lib/idb-file-system.ts packages/website/src/lib/var-worker.ts
git commit -m "feat(website): IndexedDB-backed FileSystem with write-through persistence"
```

---

## Notes for the implementer

- Run tasks in order; each builds on the previous. Tasks 1, 2, 4, 5 are browser-integration tasks whose automated gate is a green website build + the structural `grep`/`find` checks; the functional behavior is confirmed by the manual dev-server step (record observations in the report). Task 3 is the only one with unit tests and must keep the existing `var-lsp` suite green.
- Exact dependency versions: if a pinned version above doesn't resolve, install the current major-compatible version and note it; TypeScript will surface any API drift in `@codemirror/lsp-client` / `vscode-languageserver` at build time.
- The `file://` ↔ path mapping must stay consistent: editor `uri` = `file:///hello.var.md`, FS key = `/hello.var.md`, and `registerHandlers` strips `file://`. If diagnostics never appear, a path mismatch here is the first suspect.
- Do not change `<FileEditor>` or the step-highlight helper.
