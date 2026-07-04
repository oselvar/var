# Run-result diagnostics — VSCode + web editor squiggles from one shared projection

Date: 2026-06-28
Status: design, pending implementation (TDD).

Sub-project #2 of the shared run-result work. Consumes the `.var/<spec>.json`
`SpecResults` format from sub-project #1
([run-result format](2026-06-28-run-result-format-design.md)).

## Why

Sub-project #1 made every run produce a span-anchored `SpecResults` (cell/doc
mismatch offsets + actual values, plus failing line + message, with a
`sourceHash` for staleness). #1 left two consumers banked: VSCode red+hover, and
a future browser overlay.

This sub-project surfaces those failures **as diagnostics** — a red squiggle on
the exact failing span, the value on hover, and (in VSCode) a Problems-panel
entry. The same treatment lands in the **web editor**, replacing its bespoke
run-render layer (the `✓`/`✗` gutter, the click-to-open stack dialog, the
red-text cell marks) with one `@codemirror/lint` source. Both editors render the
**identical** model — the "unify below the LSP" decoration layer #1's spec
described, now earning its keep with two renderers.

## Resolved decisions

- **Diagnostics, not recolored text.** A mismatch is an LSP `Diagnostic`
  (VSCode) / CodeMirror lint `Diagnostic` (web): red squiggle on the span, value
  on hover. Idiomatic, near-free server-side, and consistent across editors.
- **All failures surface.** Cell/doc mismatches squiggle their exact span; a
  plain thrown-error failure (no span) squiggles the example's failing line with
  its error message. Passing examples produce nothing (no squiggle = passing).
- **Web editor keeps the line wash.** The green/red pass/fail line background
  stays as at-a-glance context; the gutter icons, stack dialog, and red-text
  marks are removed in favour of the squiggle + lint gutter.
- **VSCode learns of `.var/` via LSP `workspace/didChangeWatchedFiles`** (the
  client owns file-watching), not a server-side `fs.watch`.

## Architecture

```
@oselvar/var (core, pure)
  runResultDiagnostics(results, source) → RunDiagnostic[]   ← THE shared model

var-lsp (Node shell)                         website (browser)
  run-results Map<specUri, SpecResults>        cm-run.ts lint source
  onDidChangeWatchedFiles → re-read + publish  linter() → CM Diagnostic[]
  merge into sendDiagnostics (offset→pos)      lintGutter(); keep line wash

var-vscode (extension)
  clientOptions.synchronize.fileEvents = **/.var/**/*.json
```

## The shared projection (core, pure)

`packages/var/src/run-diagnostics.ts`:

```ts
// Offset-based, renderer-agnostic, hash-staleness-aware. The single source of
// truth both the LSP and the web editor project into their own diagnostic types.
export type RunDiagnostic = {
  readonly from: number    // source offset (== CodeMirror position)
  readonly to: number      // source offset, exclusive
  readonly message: string // e.g. "expected 6 but was 50"
}

export function runResultDiagnostics(
  results: SpecResults,
  source: string,
): ReadonlyArray<RunDiagnostic>
```

Behavior:

- **Staleness:** if `hashSource(source) !== results.sourceHash` → `[]`. The run
  was computed against different text; its offsets no longer apply.
- For each `ex` of `results.examples` with `status === 'failed'` and a
  `failure`:
  - **cells present** → one `RunDiagnostic` per `failure.cells[i]`:
    `{ from, to, message: \`expected ${source.slice(from, to)} but was ${cell.actual}\` }`.
  - **else doc present** → one at `failure.doc`:
    `{ from, to, message: \`expected ${source.slice(from, to)} but was ${doc.actual}\` }`.
  - **else (plain throw)** → one spanning the failing line: `from`/`to` are the
    offsets of `failure.line` (1-based) in `source` (line start → line end,
    excluding the trailing newline), `message: failure.message`.
- `status === 'passed'` examples contribute nothing.

All output is **offsets** — uniform, so every renderer treats the three cases
identically. The web editor uses the offsets directly (CodeMirror diagnostics
are offset-based); only the LSP converts to `{line, character}`.

Severity is implicitly **error** in both renderers (the red squiggle); it is not
carried in `RunDiagnostic` because every entry is a failure (YAGNI).

## VSCode path (`var-lsp` + `var-vscode`)

### Run-results store — `packages/var-lsp/src/run-results.ts`

A small map, separate from the workspace index `Store`:

```ts
export type RunResultsStore = {
  // Read & parse a .var/<spec>.json, key it by its spec's file:// URI, store it.
  ingest(varJsonPath: string, content: string): string | null // returns the specUri, or null if unparseable
  get(specUri: string): SpecResults | undefined
  specUris(): ReadonlyArray<string>
}
export function createRunResultsStore(rootUri: string): RunResultsStore
```

- `ingest` parses the JSON to `SpecResults`, rejects a wrong `version` or
  malformed content (returns `null`, logs nothing user-facing), and computes the
  spec URI from the authoritative `results.specPath` (POSIX, relative to cwd) +
  `rootUri`: `\`${rootUri}/${specPath}\`` (URI-joined).
- The store holds only the latest `SpecResults` per spec; a new run for the same
  spec replaces it.

### Wiring — `packages/var-lsp/src/server.ts`

- **Init:** after `store.reindex()`, glob `**/.var/**/*.json` via the
  `FileSystem` port and `ingest` each, so diagnostics appear immediately on
  opening a project that already ran.
- **`workspace/didChangeWatchedFiles`:** for each change whose path is under
  `.var/` and ends `.json`: on create/change, read via `FileSystem` and
  `ingest`; on delete, drop it from the store. Then `publishFor(specUri)`.
- **Diagnostics merge:** refactor `pushDiagnostics` into a `publishFor(uri)` that
  builds **parse diagnostics ∪ run diagnostics** and sends them in one
  `sendDiagnostics` (which replaces all diagnostics for a URI — so both kinds
  must go together). Run diagnostics come from
  `runResultDiagnostics(runResults.get(uri), currentSource)` where
  `currentSource` is the open document (`documents.get(uri)`) if open, else
  `FileSystem.read(path)`. Offsets → LSP positions via the core's
  `spanFromOffsets(source, from, to)` (1-based span → 0-based LSP, matching the
  existing parse-diagnostic mapping). Run diagnostics carry `severity: 1`
  (Error) and `source: 'var'`.
- **Staleness on edit:** `onDidChangeContent` already reindexes and republishes;
  with the new source the run results' `sourceHash` no longer matches →
  `runResultDiagnostics` returns `[]` → the squiggles clear until the next run.
  No extra invalidation.
- `publishFor` is called for the union of parse-diagnostic URIs and
  run-results URIs.

### Extension — `packages/var-vscode/src/extension.ts`

Add a watched-files registration so `didChangeWatchedFiles` fires:

```ts
const clientOptions: LanguageClientOptions = {
  documentSelector: [/* unchanged */],
  synchronize: {
    fileEvents: workspace.createFileSystemWatcher('**/.var/**/*.json'),
  },
}
```

No other extension change — diagnostics render natively.

## Web editor path (`packages/website/src/lib/cm-run.ts`)

`varRunExtension()` today returns
`[resultsField, decoField, cellMarkField, errorGutter, cellHover, runTheme]`.
After this:

- **Keep:** `resultsField` (holds `SpecResults` via the `setRunResults` effect;
  already clears on `docChanged`) and `decoField` (pass/fail line wash) + its
  wash theme (`.cm-run-pass`/`.cm-run-fail`).
- **Remove:** `cellMarkField`, `cellHover`, `errorGutter` (+ `ErrorMarker`,
  `PassMarker`, the `<dialog>` stack viewer), the helpers `cellFailRanges` and
  `actualAt`, and their theme blocks (`.cm-run-cell-fail`, `.cm-run-cell-tip`,
  `.cm-run-gutter`, `.cm-run-errmark`, `.cm-run-passmark`, `.cm-run-dialog`,
  `.cm-run-stack`).
- **Add:** a `@codemirror/lint` linter source + `lintGutter()`:

```ts
import { linter, lintGutter, type Diagnostic } from '@codemirror/lint'
import { runResultDiagnostics } from '@oselvar/var'

// Pure, testable mapping.
export function varDiagnostics(results: SpecResults | null, docText: string): Diagnostic[] {
  if (!results) return []
  return runResultDiagnostics(results, docText).map((d) => ({
    from: d.from, to: d.to, severity: 'error', message: d.message,
  }))
}

const runLinter = linter(
  (view) => varDiagnostics(view.state.field(resultsField), view.state.doc.toString()),
  // Re-lint when results arrive via the effect (not a doc change).
  { needsRefresh: (u) => u.transactions.some((t) => t.effects.some((e) => e.is(setRunResults))) },
)
```

`varRunExtension()` returns `[resultsField, decoField, runLinter, lintGutter(), runTheme]`.
`@codemirror/lint` becomes a direct website dependency (it is already transitive
via the TS-diagnostics path). The stack trace for a plain throw is now the
diagnostic message on hover; the full trace remains in the test-runner output.

## Architecture / hexagonal check

| Piece | Package | Pure? | Notes |
|-------|---------|-------|-------|
| `runResultDiagnostics` / `RunDiagnostic` | `@oselvar/var` | ✅ | offset-based, hash-aware, no `node:*` |
| `RunResultsStore` | `@oselvar/var-lsp` | ✅ data | in-memory map; parsing is pure |
| `.var/` read + glob + watch handling | `@oselvar/var-lsp` | ❌ (shell) | via the `FileSystem` port |
| offset→LSP position | `@oselvar/var-lsp` | ✅ | reuses core `spanFromOffsets` |
| file-watcher registration | `@oselvar/var-vscode` | n/a | one `clientOptions` line |
| lint source + mapping | `@oselvar/website` | ✅ mapping | `linter()` shell + pure `varDiagnostics` |

The core gains no `node:*` and no I/O. All `.var/` reading is via the existing
`var-lsp` `FileSystem` port.

## Testing (TDD order)

1. **`runResultDiagnostics`** (core unit): a cell mismatch → one diagnostic at
   the cell `{from,to}` with `expected <slice> but was <actual>`; multiple cells
   → multiple; a doc mismatch → one at the body span; a plain throw → one
   spanning the failing line (offsets line-start→line-end-excluding-newline) with
   `failure.message`; a stale `sourceHash` → `[]`; an all-passed `SpecResults` →
   `[]`.
2. **`RunResultsStore`** (var-lsp unit): `ingest` of a valid `.var/` JSON keys it
   by the right `file://…/<specPath>` URI; a wrong `version` / malformed JSON →
   `null`, nothing stored; a second ingest for the same spec replaces.
3. **publish merge** (var-lsp unit, `store.test.ts` style): given a fake
   `FileSystem` and a capturing connection, a spec with both a parse diagnostic
   and a run-result mismatch publishes both in one `sendDiagnostics`, run ones
   at the correct 0-based positions with `source: 'var'`; when the open-document
   source no longer hash-matches, the run diagnostics are absent (parse ones
   remain).
4. **`varDiagnostics`** (website unit): a `SpecResults` with a cell mismatch →
   CM `Diagnostic[]` with the matching `from`/`to`/`severity: 'error'`/message;
   `null` results → `[]`. Remove the obsolete `cellFailRanges`/`actualAt` tests.
5. **Builds:** `pnpm -r build` (core + var-lsp + var-vscode tsc) and
   `pnpm --filter @oselvar/website build` green.
6. **Manual end-to-end:** run the tutorial (`NODE_OPTIONS="--import tsx" npx
   vitest run`) → `.var/` written. In VSCode: open `04-yahtzee.var.md`, break a
   score cell, re-run → squiggle on the cell, `actual:` on hover, a Problems
   entry; edit the cell → squiggle clears; re-run → returns. In the web
   playground: a broken cell shows the red wash + squiggle + hover together.

## Build gate

`pnpm -r build` after the core export (`run-diagnostics.ts` → `index.ts`) and the
var-lsp changes; `pnpm --filter @oselvar/website build` after the cm-run
refactor. vitest does not type-check.

## Out of scope / non-goals

- **No recolored text / decorations** — diagnostics only (the web editor keeps
  its existing line wash, nothing new painted).
- **No pass indicator in VSCode** — diagnostics can't signal success; that's by
  design.
- **No `var.js` HTML overlay** — that's sub-project #3, which will project the
  same `runResultDiagnostics` model into `ins`/`del`.
- **No drift detection** — sub-project #4.
- **No new run-result fields** — consumes `SpecResults` exactly as shipped.
