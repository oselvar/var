# Vár highlighting via standard LSP semantic tokens

**Date:** 2026-06-23
**Status:** Approved, pending implementation plan

## Context

Vár highlights matched step text and captured parameters. Today this uses a
**custom** `var/matchRanges` LSP request that each client (VSCode, and planned
browser) must call and render manually. This spec migrates highlighting to
**standard LSP semantic tokens** (`textDocument/semanticTokens/full`), so it
becomes a server capability that any LSP-aware editor consumes — VSCode via
`vscode-languageclient`'s built-in support, and CodeMirror via a new generic
extension to `@codemirror/lsp-client`.

Depends on the Phase A browser foundation (the in-browser worker LSP + CodeMirror
`<Editor>`). The prerendered `<FileEditor>` and its `step-highlight` helper are
NOT affected — they compute highlights from `buildWorkspaceIndex` directly, not
via the LSP.

## Decisions

- **Migrate fully:** add semantic tokens to `var-lsp`, switch the VSCode
  extension to them, and **remove** `var/matchRanges` (handler, types, client
  calls). End state: one standard highlighting path.
- **Standard-ish legend:** `tokenTypes: ['function', 'parameter']` — `function`
  = a matched step span, `parameter` = a captured argument. Standard types so
  editors theme them without custom config. (`function` is adjustable to `macro`;
  no token modifiers.)
- **Generic, upstreamable client extension:** the CodeMirror `semanticTokens()`
  extension is server-agnostic (reads the server's legend, renders
  `cm-token-<type>` decorations, themes via a facet). Vár only supplies a theme.
  Self-contained now; extractable to a PR/package later.
- **Non-overlap:** LSP semantic tokens must not overlap. Each match is split into
  non-overlapping segments — step-minus-params as `function`, params as
  `parameter` — the same segmentation `step-highlight` already performs.

## Architecture

```
var-lsp (server)                     clients
┌───────────────────────────┐        ┌────────────────────────────────────────┐
│ semanticTokensProvider     │  LSP   │ VSCode: vscode-languageclient built-in  │
│  { legend, full: true }    │◄──────►│   semantic-tokens provider (auto)        │
│ textDocument/semanticTokens│ tokens │ Browser: @codemirror/lsp-client +       │
│   /full → encode(matches)  │        │   generic semanticTokens() extension     │
│ (var/matchRanges REMOVED)  │        │   → cm-token-function / cm-token-parameter│
└───────────────────────────┘        └────────────────────────────────────────┘
```

## Components

### `@oselvar/var-lsp` — semantic tokens provider

- **Legend** constant: `{ tokenTypes: ['function', 'parameter'], tokenModifiers: [] }`.
- **Capability:** add `semanticTokensProvider: { legend, full: true }` to the
  `onInitialize` capabilities.
- **Pure encoder** `encodeSemanticTokens(matches, varPath): number[]`:
  - For each match for `varPath`, split `matchSpan` into non-overlapping spans:
    the parts not covered by any `paramRange` → token type `function`; each
    `paramRange` → token type `parameter`.
  - Sort all token spans by (line, startChar); delta-encode to the LSP 5-tuple
    stream `[deltaLine, deltaStartChar, length, tokenTypeIndex, tokenModifiers=0]`.
    (Positions: convert var-language 1-based ranges to LSP 0-based.)
- **Handler:** `connection.onRequest('textDocument/semanticTokens/full', ({textDocument}) => ({ data: encodeSemanticTokens(store.index().matches, uriToPath(textDocument.uri)) }))`.
- **Remove:** the `var/matchRanges` `onRequest` handler, `handlers.matchRanges`,
  and the `MatchRangeEntry` type.

### Browser — generic `semanticTokens()` CodeMirror extension

A self-contained module (in the website now, written server-agnostic for later
extraction), exporting `semanticTokens(options?): LSPClientExtension`:
- `clientCapabilities`: `{ textDocument: { semanticTokens: { requests: { full: true }, formats: ['relative'], tokenTypes: [...], tokenModifiers: [] } } }` (token type names discovered from the server legend at runtime; the advertised list can be permissive).
- `editorExtension`: a `ViewPlugin<DecorationSet>` that:
  - requests `textDocument/semanticTokens/full` on first load, on document
    change (debounced), and when a `var/didIndex` notification arrives.
  - decodes the delta-encoded `data` using the **server's legend** (obtained from
    the initialize result / capabilities) into absolute tokens.
  - maps token positions to current doc coordinates via `client.withMapping()` /
    `WorkspaceMapping.mapPos()` (handles edits during the async request).
  - builds `Decoration.mark({ class: 'cm-token-' + tokenType })` (+ modifier
    classes) and exposes them as the plugin's `decorations`.
- A **theme facet** (or exported base theme) lets consumers style the classes.
- **Vár theme** (website): `.cm-token-function` → accent underline,
  `.cm-token-parameter` → hot-pink chip, matching `<FileEditor>`.
- Wired into the editor: `new LSPClient({ extensions: [...languageServerExtensions(), semanticTokens()] })` plus the Vár theme in the `EditorView` extensions.

### `var-vscode` — adopt built-in semantic tokens

- Remove `registerMatchDecorations` (the `var/matchRanges` request + the two
  `createTextEditorDecorationType`/`setDecorations` calls + the `var/didIndex`
  decoration refresh tied to them).
- `vscode-languageclient` auto-registers a `DocumentSemanticTokensProvider` once
  the server advertises `semanticTokensProvider`; VSCode renders via semantic
  highlighting (on by default). Optionally add `contributes` semantic token color
  defaults so `function`/`parameter` are clearly visible regardless of theme.

## Testing

- **Unit (pure):** `encodeSemanticTokens` — a match with one param yields the
  correct non-overlapping `function`/`parameter` tokens and delta encoding; a
  multi-line/multi-match case; empty matches → `[]`. Client **decode** — a
  delta-encoded `data` + legend round-trips to the expected absolute tokens; the
  encode/decode pair is each other's inverse on a sample.
- **Manual:** VSCode still highlights steps/params after the migration (semantic
  colors); the browser editor shows the underline/chip highlighting live and
  updates on edit.
- The existing `var-lsp`/`var`/website suites stay green; tests referencing
  `var/matchRanges`/`matchRanges`/`MatchRangeEntry` are removed or migrated.

## Build order (outside-in, small steps)

1. **Server semantic tokens** — legend + capability + pure `encodeSemanticTokens`
   + `textDocument/semanticTokens/full` handler (unit-tested). Keep
   `var/matchRanges` for now.
2. **Generic CM `semanticTokens()` extension** — capability + request + pure
   decode (unit-tested) + decorations.
3. **Wire into the browser editor** + Vár theme → live highlighting (manual proof).
4. **Migrate VSCode** to built-in semantic tokens; remove `registerMatchDecorations`.
5. **Remove `var/matchRanges`** everywhere (server handler, types, any client
   references, tests).

## Out of scope

- Param **type-aware** tokens ({int}→`number`, {string}→`string`) — future.
- `semanticTokens/full/delta` and `range` requests — `full` only for now.
- Hover/completion/etc. (already handled by the clients).
- Any change to `<FileEditor>` / the prerendered `step-highlight` helper.
