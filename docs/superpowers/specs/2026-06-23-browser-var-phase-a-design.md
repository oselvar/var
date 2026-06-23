# Browser Vár — Phase A: in-browser LSP foundation

**Date:** 2026-06-23
**Status:** Approved, pending implementation plan

## Context

Goal (overall): run Vár in the browser — CodeMirror editors backed by the real
Vár LSP server, showing the same step/parameter highlighting as the VSCode
extension, with one Editor for Markdown and one for TypeScript sharing a single
LSP server. This is large, so it is split into three phases:

- **Phase A (this spec):** the in-browser LSP foundation — the real `var-lsp`
  server running in a Web Worker over an IndexedDB-backed virtual filesystem,
  with one Markdown CodeMirror `<Editor>` island proving an end-to-end LSP
  roundtrip (live diagnostics).
- **Phase B (deferred):** `var/matchRanges` highlighting decorations in
  CodeMirror (parity with the VSCode extension).
- **Phase C (deferred):** the TypeScript `<Editor>`, the `lsp="..."`
  shared-server mechanism, and live cross-file updates.

The existing static `<FileEditor>` component stays untouched and in parallel
throughout all phases.

## Decisions

- **Real LSP in a Web Worker.** The actual `var-lsp` handlers run server-side in
  a worker, speaking LSP/JSON-RPC to a CodeMirror LSP client on the main thread.
- **IndexedDB filesystem owned by the worker.** `localStorage` is unavailable in
  workers; IndexedDB is. The worker owns the virtual filesystem; the Editor
  syncs content via LSP `didOpen`/`didChange`, and the server writes through to
  IDB and reindexes.
- **Astro island.** The Editor is a `client:only` island; the rest of the site
  stays static. This is the first client-side JS in the site.
- **Hexagonal refactor of the store.** The store's file/config I/O moves behind
  a `FileSystem` port + an injected `VarConfig`, so the same handlers run over
  Node (`node:fs`) or the browser (IndexedDB). This aligns with the repo's
  functional-core / ports rule and removes I/O from the store core.

## Architecture

```
main thread                                worker
┌─────────────────────────────┐           ┌──────────────────────────────────┐
│ <Editor> island (CodeMirror) │   LSP /   │ vscode-languageserver/browser conn │
│  markdown mode               │ JSON-RPC  │  registerHandlers(conn, deps)      │
│  CodeMirror LSP client  ◄────┼──────────►│  store ── FileSystem port ──┐      │
│                              │ postMessage│  TextDocuments (open docs)  │      │
└─────────────────────────────┘           │                     IndexedDB FS   │
                                            │  seed demo files if FS empty       │
                                            └──────────────────────────────────┘
```

Data flow: the Editor opens `hello.var.md` (`didOpen`) → worker indexes the
seeded `.steps.ts` + open doc → pushes diagnostics + `var/didIndex`. Typing
fires `didChange` → server writes through to IDB, reindexes, pushes updated
diagnostics → the CodeMirror LSP client renders them.

## Components

### `@oselvar/var-lsp` — `FileSystem` port + store refactor

New port:

```ts
export interface FileSystem {
  list(globs: readonly string[]): Promise<string[]>
  read(path: string): Promise<string>
  write(path: string, content: string): Promise<void>
}
```

- `createStore(deps: { fs: FileSystem; config: VarConfig })` — `reindex()` reads
  files via `fs.list`/`fs.read` and uses the injected `config` (no `node:fs`, no
  `loadVarConfig` dynamic import).
- **Node adapter:** a `FileSystem` backed by `node:fs` (the existing `glob` +
  `readFileSync` logic moves here) plus `loadVarConfig` to produce the config.
  The Node `bin.ts` wires this so the CLI/desktop LSP behaves exactly as before.
- `registerHandlers(connection, deps)` threads the port through; on `didChange`
  it `fs.write`s the new content then reindexes (write-through). `onInitialize`
  no longer needs a disk `workspaceFolders` path in the browser case.

The store becomes unit-testable with a fake in-memory `FileSystem`.

### Website — the browser edge

- **IndexedDB FS adapter** implementing `FileSystem` (object store keyed by
  path; `list` matches against the configured globs).
- **Worker entry** (`src/lib/var-worker.ts` or similar): creates a
  `vscode-languageserver/browser` connection (`BrowserMessageReader`/`Writer`
  over `self`), constructs the IDB FS + a fixed `VarConfig`
  (`vars: ['**/*.var.md']`, `steps: ['**/*.steps.ts']`, default snippet), seeds
  the demo files into IDB on first run, calls `registerHandlers`, `listen()`.
- **`<Editor>` Astro island** (`client:only`): CodeMirror 6 with
  `@codemirror/lang-markdown`, a CodeMirror LSP client connected to the worker,
  opening `hello.var.md`.
- **Transport bridge:** wire the CodeMirror LSP client to the worker's
  JSON-RPC framing over `postMessage`. The exact client library and transport
  shim are pinned in the implementation plan, grounded against the CodeMirror
  LSP-client discussion (https://discuss.codemirror.net/t/codemirror-lsp-client/9309)
  and the chosen library's README. This is the one genuine integration spike.
- **Seed content:** a `hello.var.md`, a `01-hello.steps.ts` (the tutorial step
  file expressions), and a config — bundled into the worker and written to IDB
  when empty.

New website dependencies: CodeMirror 6 packages (`@codemirror/state`,
`@codemirror/view`, `@codemirror/lang-markdown`, and a basic-setup), a CodeMirror
LSP client, and `vscode-languageserver-protocol`.

## Proof / acceptance for Phase A

Running the dev site, the Markdown `<Editor>` connects to the worker LSP and
shows **live diagnostics**: with the seeded `.steps.ts` providing step
definitions, editing `hello.var.md` so a sentence no longer matches a step
surfaces the corresponding Vár diagnostic in the editor, and fixing it clears
the diagnostic. This proves the in-browser LSP roundtrip end to end.

## Testing

- Unit-test the refactored `createStore` against a fake in-memory `FileSystem`
  (no disk): seeding step + var files produces the expected `matches`/
  `diagnostics`; a `write` + reindex updates them.
- The Node `FileSystem` adapter is exercised by the existing `var-lsp` /
  workspace tests (the desktop LSP behaviour must remain unchanged).
- Browser/worker/CodeMirror integration is verified by running the dev site
  manually (headless-browser testing is out of scope for Phase A).

## Error handling

- IDB unavailable / blocked: the worker reports an init error; the Editor shows a
  non-fatal "LSP unavailable" state and still functions as a plain editor.
- A malformed seeded/edited `.steps.ts` must not crash the worker — the existing
  `buildWorkspaceIndex` already swallows per-file parse errors; the worker keeps
  serving the last good index.

## Out of scope (Phase A)

- `var/matchRanges` highlighting decorations (Phase B).
- The TypeScript `<Editor>` and the `lsp="..."` shared-server (Phase C).
- Hover/completion/rename UI polish (the server already supports them; wiring
  them into CodeMirror beyond what the LSP client gives for free is later work).
- Headless/automated browser tests.
- Any change to the existing static `<FileEditor>`.
