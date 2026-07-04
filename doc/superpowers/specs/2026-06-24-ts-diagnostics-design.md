# TypeScript diagnostics in the browser `.steps.ts` editor

**Date:** 2026-06-24
**Status:** Approved (design), pending implementation plan

## Context

The browser playground edits a `.var.md` spec and its `.steps.ts` step
definitions. The spec editor gets Vár LSP feedback (highlighting, diagnostics);
the `.steps.ts` editor has only syntax highlighting. This adds **TypeScript
diagnostics** (type errors) to the `.steps.ts` editor — a small TS "LSP"
capability — without bundling `typescript` a second time.

## Decisions

- **Reuse the existing browser Vár LSP worker.** It already bundles `typescript`
  (via `@oselvar/var-language`'s `discoverStepDefs`) and the `.steps.ts` editor is
  already connected to it through `@codemirror/lsp-client` (`client.plugin(uri)`
  is added to both editors). `@codemirror/lsp-client`'s built-in diagnostics
  feature renders `textDocument/publishDiagnostics` for free. So `typescript`
  stays bundled **once**.
- **A real (small) LSP capability, not a separate mechanism.** No
  `@codemirror/lint`, no `typescript-language-server` (Node-only; spawns
  `tsserver`), no extra worker. Diagnostics only for now; hover/completion are
  easy follow-ons.
- **Lib bundled** (per the user's choice): the lib `.d.ts` closure is bundled
  into the worker via Vite `?raw` and served from an in-memory map — no CDN/network.
- **`var-lsp` stays TypeScript-agnostic.** It gains a *generic* optional
  `onDidChangeDocument` hook; the TS specifics live in the website worker, which
  Node never loads.

## Architecture

```
.steps.ts CodeMirror editor                 browser Vár LSP worker (var-worker.ts)
┌────────────────────────────┐  LSP/        ┌──────────────────────────────────────┐
│ @codemirror/lsp-client      │ publish     │ registerHandlers(conn, deps, {         │
│  diagnostics feature renders│◄────────────│   onDidChangeDocument(uri, text) })    │
│  squiggles for .steps.ts    │ Diagnostics │   └─ for *.steps.ts (debounced):       │
└────────────────────────────┘             │       tsDiagnostics(uri, text)         │
                                            │       → conn.sendDiagnostics(uri, …)    │
                                            │   TS LanguageService over a virtual    │
                                            │   host: bundled lib .d.ts + ambient    │
                                            │   @oselvar/var-runtime .d.ts + open     │
                                            │   .steps.ts docs                        │
                                            └──────────────────────────────────────┘
```

## Components

### `@oselvar/var-lsp` — generic document-change hook

- `registerHandlers(connection, makeDeps, opts?: { onDidChangeDocument?: (uri: string, text: string) => void | Promise<void> })`.
- Inside the existing `documents.onDidChangeContent`, after the write-through,
  call `await opts?.onDidChangeDocument?.(e.document.uri, e.document.getText())`.
- No TypeScript dependency added to `var-lsp`; the hook is generic. Node callers
  (CLI/VSCode `bin.ts`) pass no `opts`, so behaviour is unchanged.

### Website — `packages/website/src/lib/ts-diagnostics.ts`

A TS `LanguageService` wrapper, created once per worker:
- **Virtual host** (`ts.LanguageServiceHost`): `getScriptFileNames` returns the
  open `.steps.ts` uris + the ambient decl + the lib files; `getScriptSnapshot`/
  `getScriptVersion` from an in-memory `Map<path, { text, version }>`;
  `getDefaultLibFileName` returns the chosen lib (e.g. `lib.es2020.d.ts`);
  `readFile`/`fileExists` serve the bundled lib map + ambient decl + open docs;
  `getCompilationSettings` → `{ target: ES2020, module: ESNext, lib: ['es2020'], noEmit: true, strict: true, skipLibCheck: true }`.
- **Bundled lib**: `import.meta.glob('/node_modules/typescript/lib/lib.es*.d.ts', { query: '?raw', eager: true, import: 'default' })` (es-libs only, excluding `dom`/`webworker` to keep size down) → a `Map` keyed by `lib.<name>.d.ts`. The checker follows the `/// <reference lib=…>` graph; serving the es-closure covers it.
- **Ambient module decl**: an inline `declare module '@oselvar/var-runtime' { … }`
  giving `defineContext`/`step`/`defineParameterType` enough types that the seed
  imports resolve and `ctx`/args typecheck.
- **API**: `updateDoc(path, text)` (bumps version) and
  `diagnostics(path): LspDiagnostic[]` — runs `getSyntacticDiagnostics` +
  `getSemanticDiagnostics`, maps each `ts.Diagnostic` (`start`/`length` →
  line/character via the snapshot, `messageText` flattened, `category` → LSP
  severity 1/2/3) to an LSP `Diagnostic`.

### Website — `packages/website/src/lib/var-worker.ts` (wiring)

- Build a single `ts-diagnostics` instance.
- Pass `onDidChangeDocument` to `registerHandlers`. For uris ending `.steps.ts`:
  `updateDoc(path, text)` then (debounced per uri, ~250 ms) compute
  `diagnostics(path)` and `connection.sendDiagnostics({ uri, diagnostics })`.
  Non-`.steps.ts` uris are ignored by the provider (the Vár path is unchanged).
- The `.steps.ts` editor renders them via the already-connected `lsp-client`.

### Editor

No change required: `client.plugin('file:///…steps.ts')` is already added to the
TypeScript editor, and `lsp-client`'s diagnostics feature renders
`publishDiagnostics`. (Confirm the diagnostics feature is included by
`languageServerExtensions()`; if not, add it for that editor.)

## Testing

- **Node unit test** of `ts-diagnostics` (no worker, no browser): feed a
  `.steps.ts` with (a) a clean handler → zero diagnostics; (b) a type error
  (e.g. `const n: number = 'x'`) → one diagnostic at the right range with a
  sensible message; (c) a use of `@oselvar/var-runtime`'s `defineContext` → no
  "cannot find module" error (the ambient decl resolves it). The lib bundling in
  the test uses the same Map source (or a small inline lib subset) so the
  semantic checks run.
- **Manual browser**: type a type error in the `.steps.ts` editor → a red
  squiggle + message appears (debounced); fixing it clears it; the `.var.md`
  highlighting/run behaviour is unaffected.

## Build order (small steps)

1. **`var-lsp` hook** — add the generic `onDidChangeDocument` opt; confirm Node
   behaviour unchanged (existing var-lsp suite green).
2. **`ts-diagnostics` module + node unit test** — LanguageService + bundled lib
   + ambient decl + TS→LSP mapping.
3. **Wire into `var-worker.ts`** — provider + debounced `sendDiagnostics`;
   manual browser verification.

## Out of scope

- Hover / completion / go-to-definition in the `.steps.ts` editor (later).
- `tsgo-wasm` (not browser-ready today; the `StepDefScanner` port keeps it an
  easy future swap on the parsing side).
- Type-checking the `.var.md` or wiring diagnostics for any non-`.steps.ts` file.
- Bundle-size optimisation of the `typescript` payload.
