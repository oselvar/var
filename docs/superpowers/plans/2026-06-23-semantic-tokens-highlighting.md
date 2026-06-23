# Vár Semantic-Tokens Highlighting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate Vár step/parameter highlighting from the custom `var/matchRanges` request to standard LSP semantic tokens — emitted by `var-lsp`, consumed by VSCode (built-in) and the browser CodeMirror editor (a new generic extension), with `var/matchRanges` removed.

**Architecture:** Outside-in: server emits `textDocument/semanticTokens/full` (pure encoder, unit-tested) → a generic `semanticTokens()` extension for `@codemirror/lsp-client` (pure decoder, unit-tested) → wire it + a Vár theme into the browser editor → switch VSCode to built-in semantic tokens → remove `var/matchRanges`.

**Tech Stack:** `vscode-languageserver` (browser+node), `@oselvar/var-language` (`MatchRef`), `@codemirror/lsp-client` + `@codemirror/view`/`state`, `vscode-languageclient` (VSCode), vitest.

## Global Constraints

- **Legend:** `tokenTypes: ['function', 'parameter']`, `tokenModifiers: []` (index 0 = `function` = step span; index 1 = `parameter` = captured arg).
- **Non-overlap:** semantic tokens must not overlap and must be single-line. Each match is split per line into non-overlapping spans: step-minus-params → `function`, each param → `parameter`.
- **Coordinates:** `MatchRef` `Range`s are 1-based (line+character), end-exclusive (from `@oselvar/var-language`). LSP semantic tokens are 0-based; convert with `-1`. Delta-encoding: `[deltaLine, deltaStartChar, length, tokenTypeIndex, 0]` per token, tokens sorted by (line, char); `deltaStartChar` is relative to the previous token only when on the same line.
- **Generic client extension:** server-agnostic; renders `cm-token-<tokenType>` decorations; theming via a separate Vár theme. Self-contained for later upstreaming.
- **Do not touch** `<FileEditor>` or the `step-highlight` helper (they use `buildWorkspaceIndex` directly, not the LSP).
- **Library APIs unverified at plan time** (`@codemirror/lsp-client` internals): before using them, read the installed types at `packages/website/node_modules/@codemirror/lsp-client/dist/index.d.ts`. The pure encode/decode functions are certain and unit-tested; the editor wiring is best-effort + build-verified.

---

### Task 1: Server emits `textDocument/semanticTokens/full`

**Files:**
- Create: `packages/var-lsp/src/semantic-tokens.ts`
- Create: `packages/var-lsp/src/semantic-tokens.test.ts`
- Modify: `packages/var-lsp/src/server.ts`

**Interfaces:**
- Produces: `SEMANTIC_LEGEND = { tokenTypes: ['function','parameter'], tokenModifiers: [] }`; `semanticTokenData(matches: ReadonlyArray<MatchRef>, varPath: string, source: string): number[]`.
- Consumes: `MatchRef` from `@oselvar/var-language`; `store.index().matches`, `documents`, `uriToPath` in `server.ts`.

- [ ] **Step 1: Write the failing test**

`packages/var-lsp/src/semantic-tokens.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import type { MatchRef } from '@oselvar/var-language'
import { SEMANTIC_LEGEND, semanticTokenData } from './semantic-tokens.js'

// 1-based, end-exclusive ranges, matching @oselvar/var-language.
function r(sl: number, sc: number, el: number, ec: number) {
  return { start: { line: sl, character: sc }, end: { line: el, character: ec } }
}

describe('semanticTokenData', () => {
  it('emits non-overlapping function/parameter tokens, delta-encoded', () => {
    // Source line 1 (1-based): `I greet "x"`  → cols 1..11
    //   step  "I greet "  = chars 0..7  (function)
    //   param "x"         = chars 8..9  (parameter, inside the quotes)
    //   step  '"'+'"'      = the quotes stay function
    const source = 'I greet "x"'
    const matches: MatchRef[] = [
      {
        varPath: '/a.var.md',
        range: r(1, 1, 1, 12), // whole "I greet \"x\"" (1-based, end-exclusive => char 0..11)
        paramRanges: [r(1, 10, 1, 11)], // the inner x at 0-based char 9..10
        paramValues: ['x'],
        // stepDef is unused by the encoder; cast keeps the test focused.
      } as unknown as MatchRef,
    ]
    const data = semanticTokenData(matches, '/a.var.md', source)
    // Expect 3 tokens (5 ints each): function[0..9], parameter[9..10], function[10..11]
    expect(data.length).toBe(15)
    // first token: line 0, char 0, len 9, type 0 (function), mod 0
    expect(data.slice(0, 5)).toEqual([0, 0, 9, 0, 0])
    // second token: same line (deltaLine 0), deltaChar 9, len 1, type 1 (parameter)
    expect(data.slice(5, 10)).toEqual([0, 9, 1, 1, 0])
    // third token: deltaChar 1, len 1, type 0 (function)
    expect(data.slice(10, 15)).toEqual([0, 1, 1, 0, 0])
  })

  it('returns [] when there are no matches for the file', () => {
    expect(semanticTokenData([], '/a.var.md', 'hello')).toEqual([])
  })

  it('legend lists function then parameter', () => {
    expect(SEMANTIC_LEGEND.tokenTypes).toEqual(['function', 'parameter'])
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `NODE_OPTIONS="--import tsx" pnpm vitest run packages/var-lsp/src/semantic-tokens.test.ts`
Expected: FAIL — module/exports missing.

- [ ] **Step 3: Implement the encoder**

`packages/var-lsp/src/semantic-tokens.ts`:
```ts
import type { MatchRef } from '@oselvar/var-language'

export const SEMANTIC_LEGEND = {
  tokenTypes: ['function', 'parameter'] as const,
  tokenModifiers: [] as const,
}
const FUNCTION = 0
const PARAMETER = 1

type Range = { start: { line: number; character: number }; end: { line: number; character: number } }

// 0 = none, 1 = function (step), 2 = parameter. Params override step.
export function semanticTokenData(
  matches: ReadonlyArray<MatchRef>,
  varPath: string,
  source: string,
): number[] {
  const lines = source.split('\n')
  const kinds: number[][] = lines.map((l) => new Array<number>(l.length).fill(0))

  const paint = (range: Range, kind: number): void => {
    for (let line = range.start.line; line <= range.end.line; line++) {
      const row = kinds[line - 1]
      if (!row) continue
      const from = line === range.start.line ? range.start.character - 1 : 0
      const to = line === range.end.line ? range.end.character - 1 : row.length
      for (let c = Math.max(0, from); c < Math.min(row.length, to); c++) {
        if (kind >= (row[c] as number)) row[c] = kind
      }
    }
  }

  for (const m of matches) {
    if (m.varPath !== varPath) continue
    paint(m.range, 1)
    for (const p of m.paramRanges) paint(p, 2)
  }

  // Coalesce each line into tokens, then delta-encode (line/char ascending).
  const data: number[] = []
  let prevLine = 0
  let prevChar = 0
  for (let li = 0; li < lines.length; li++) {
    const row = kinds[li] as number[]
    let c = 0
    while (c < row.length) {
      const k = row[c] as number
      if (k === 0) {
        c++
        continue
      }
      let end = c + 1
      while (end < row.length && row[end] === k) end++
      const type = k === 1 ? FUNCTION : PARAMETER
      const deltaLine = li - prevLine
      const deltaChar = deltaLine === 0 ? c - prevChar : c
      data.push(deltaLine, deltaChar, end - c, type, 0)
      prevLine = li
      prevChar = c
      c = end
    }
  }
  return data
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `NODE_OPTIONS="--import tsx" pnpm vitest run packages/var-lsp/src/semantic-tokens.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Advertise the capability + register the handler**

In `packages/var-lsp/src/server.ts`:
- Add imports: `import { SEMANTIC_LEGEND, semanticTokenData } from './semantic-tokens.js'`.
- In the `onInitialize` `capabilities` object (around line 36), add:
```ts
        semanticTokensProvider: {
          legend: { tokenTypes: [...SEMANTIC_LEGEND.tokenTypes], tokenModifiers: [...SEMANTIC_LEGEND.tokenModifiers] },
          full: true,
        },
```
- Register the request handler (near the other `connection.onRequest` calls). It must early-return when not yet initialized (consistent with the other guarded handlers):
```ts
  connection.onRequest(
    'textDocument/semanticTokens/full',
    (params: { textDocument: { uri: string } }) => {
      if (!store) return { data: [] }
      const uri = params.textDocument.uri
      const source = documents.get(uri)?.getText() ?? ''
      return { data: semanticTokenData(store.index().matches, uriToPath(uri), source) }
    },
  )
```
(Keep the existing `var/matchRanges` handler for now — removed in Task 5.)

- [ ] **Step 6: Build + full var-lsp suite**

Run: `pnpm --filter @oselvar/var-lsp build && NODE_OPTIONS="--import tsx" pnpm vitest run packages/var-lsp`
Expected: build succeeds; all var-lsp tests pass (incl. the new encoder test).

- [ ] **Step 7: Commit**
```bash
git add packages/var-lsp/src/semantic-tokens.ts packages/var-lsp/src/semantic-tokens.test.ts packages/var-lsp/src/server.ts
git commit -m "feat(var-lsp): emit standard LSP semantic tokens (function/parameter)"
```

---

### Task 2: Generic `semanticTokens()` CodeMirror extension (pure decode + extension)

**Files:**
- Create: `packages/website/src/lib/cm-semantic-tokens.ts`
- Create: `packages/website/src/lib/cm-semantic-tokens.test.ts`

**Interfaces:**
- Produces: `decodeSemanticTokens(data: ReadonlyArray<number>, tokenTypes: ReadonlyArray<string>): Array<{ line: number; char: number; length: number; type: string }>` (0-based line/char); `semanticTokens(options: { legend: { tokenTypes: string[] } }): LSPClientExtension`.
- Consumes: `@codemirror/lsp-client` (`LSPClientExtension`, `LSPPlugin`), `@codemirror/view`, `@codemirror/state`.

- [ ] **Step 1: Write the failing decode test**

`packages/website/src/lib/cm-semantic-tokens.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { decodeSemanticTokens } from './cm-semantic-tokens.js'

describe('decodeSemanticTokens', () => {
  it('reverses LSP delta-encoding using the legend', () => {
    const legend = ['function', 'parameter']
    // function[L0 C0 len9], parameter[L0 C9 len1], function[L0 C10 len1]
    const data = [0, 0, 9, 0, 0, 0, 9, 1, 1, 0, 0, 1, 1, 0, 0]
    expect(decodeSemanticTokens(data, legend)).toEqual([
      { line: 0, char: 0, length: 9, type: 'function' },
      { line: 0, char: 9, length: 1, type: 'parameter' },
      { line: 0, char: 10, length: 1, type: 'function' },
    ])
  })

  it('handles line deltas (resets char to absolute on a new line)', () => {
    const data = [2, 4, 3, 0, 0, 1, 2, 2, 1, 0]
    expect(decodeSemanticTokens(data, ['function', 'parameter'])).toEqual([
      { line: 2, char: 4, length: 3, type: 'function' },
      { line: 3, char: 2, length: 2, type: 'parameter' },
    ])
  })

  it('returns [] for empty data', () => {
    expect(decodeSemanticTokens([], ['function'])).toEqual([])
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `NODE_OPTIONS="--import tsx" pnpm vitest run packages/website/src/lib/cm-semantic-tokens.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement decode + the extension**

First read `packages/website/node_modules/@codemirror/lsp-client/dist/index.d.ts` to confirm: the exact `LSPClientExtension` shape, how to obtain the `LSPPlugin`/`LSPClient`/document `uri` inside a `ViewPlugin`, the `client.request` signature, and `withMapping`/`WorkspaceMapping.mapPos`. Adjust the wiring below to the real signatures (the `decodeSemanticTokens` function is independent of the library and must match the test exactly).

`packages/website/src/lib/cm-semantic-tokens.ts`:
```ts
import { RangeSetBuilder } from '@codemirror/state'
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view'
import { type LSPClientExtension, LSPPlugin } from '@codemirror/lsp-client'

export type DecodedToken = { line: number; char: number; length: number; type: string }

// Pure inverse of the LSP relative semantic-token encoding.
export function decodeSemanticTokens(
  data: ReadonlyArray<number>,
  tokenTypes: ReadonlyArray<string>,
): DecodedToken[] {
  const out: DecodedToken[] = []
  let line = 0
  let char = 0
  for (let i = 0; i + 4 < data.length; i += 5) {
    const deltaLine = data[i] as number
    const deltaChar = data[i + 1] as number
    const length = data[i + 2] as number
    const typeIndex = data[i + 3] as number
    line += deltaLine
    char = deltaLine === 0 ? char + deltaChar : deltaChar
    out.push({ line, char, length, type: tokenTypes[typeIndex] ?? String(typeIndex) })
  }
  return out
}

// Generic, server-agnostic semantic-tokens extension for @codemirror/lsp-client.
// Renders `cm-token-<type>` mark decorations; theme the classes separately.
export function semanticTokens(options: { legend: { tokenTypes: string[] } }): LSPClientExtension {
  const tokenTypes = options.legend.tokenTypes
  const plugin = ViewPlugin.fromClass(
    class {
      decorations: DecorationSet = Decoration.none
      constructor(readonly view: EditorView) {
        void this.refresh()
      }
      update(u: ViewUpdate) {
        if (u.docChanged) void this.refresh()
      }
      async refresh() {
        const lsp = LSPPlugin.get(this.view)
        if (!lsp) return
        const uri = lsp.uri
        const result = (await lsp.client.request('textDocument/semanticTokens/full', {
          textDocument: { uri },
        })) as { data: number[] } | null
        if (!result) return
        const doc = this.view.state.doc
        const builder = new RangeSetBuilder<Decoration>()
        for (const t of decodeSemanticTokens(result.data, tokenTypes)) {
          if (t.line >= doc.lines) continue
          const lineStart = doc.line(t.line + 1).from
          const from = lineStart + t.char
          const to = from + t.length
          if (to <= doc.length) {
            builder.add(from, to, Decoration.mark({ class: `cm-token-${t.type}` }))
          }
        }
        this.decorations = builder.finish()
        this.view.update([]) // request a redraw of the new decorations
      }
    },
    { decorations: (v) => v.decorations },
  )
  return {
    clientCapabilities: {
      textDocument: {
        semanticTokens: {
          dynamicRegistration: false,
          requests: { full: true },
          formats: ['relative'],
          tokenTypes,
          tokenModifiers: [],
        },
      },
    },
    editorExtension: plugin,
  }
}
```
Notes for the implementer: if `LSPPlugin.get(view)` exposes the document uri/client under different names, or if redraw is automatic (no `view.update([])` needed), adjust accordingly — the build + the Task 3 manual check will confirm. Refreshing on `var/didIndex` can be added via the extension's `notificationHandlers` once the wiring is confirmed; doc-change refresh is sufficient for the Phase B proof.

- [ ] **Step 4: Run decode test to pass**

Run: `NODE_OPTIONS="--import tsx" pnpm vitest run packages/website/src/lib/cm-semantic-tokens.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Typecheck via website build**

Run: `pnpm --filter @oselvar/website build`
Expected: builds (confirms the extension typechecks against the installed `@codemirror/lsp-client`/view types).

- [ ] **Step 6: Commit**
```bash
git add packages/website/src/lib/cm-semantic-tokens.ts packages/website/src/lib/cm-semantic-tokens.test.ts
git commit -m "feat(website): generic semanticTokens() extension for @codemirror/lsp-client"
```

---

### Task 3: Wire semantic tokens + Vár theme into the browser editor

**Files:**
- Modify: `packages/website/src/scripts/editor-mount.ts`
- Create: `packages/website/src/lib/var-token-theme.ts`

**Interfaces:**
- Consumes: `semanticTokens` from `./cm-semantic-tokens.ts`; the server legend `['function','parameter']`.
- Produces: the editor now shows `cm-token-function` (step underline) + `cm-token-parameter` (chip).

- [ ] **Step 1: Vár token theme**

`packages/website/src/lib/var-token-theme.ts`:
```ts
import { EditorView } from '@codemirror/view'

// Mirrors <FileEditor>: matched step text underlined in accent, params as chips.
export const varTokenTheme = EditorView.baseTheme({
  '.cm-token-function': {
    textDecoration: 'underline',
    textDecorationColor: 'var(--accent)',
    textDecorationThickness: '2px',
    textUnderlineOffset: '3px',
  },
  '.cm-token-parameter': {
    background: 'var(--accent)',
    color: 'var(--ink)',
    borderRadius: '4px',
    padding: '0 2px',
  },
})
```

- [ ] **Step 2: Add the extension + theme to the client/editor**

In `packages/website/src/scripts/editor-mount.ts`:
- import `{ semanticTokens } from '../lib/cm-semantic-tokens.ts'` and `{ varTokenTheme } from '../lib/var-token-theme.ts'`.
- Add the extension to the shared client: change `new LSPClient({ extensions: languageServerExtensions() })` to `new LSPClient({ extensions: [...languageServerExtensions(), semanticTokens({ legend: { tokenTypes: ['function', 'parameter'] } })] })`.
- Add `varTokenTheme` to the `EditorView` extensions array (alongside `basicSetup, markdown(), client.plugin(uri)`).

- [ ] **Step 3: Build + verify**

Run: `pnpm --filter @oselvar/website build`
Expected: succeeds. Confirm the worker still emits the handler and the theme classes are present in the bundle:
`find packages/website/dist -name '*.js' | xargs grep -l 'cm-token-parameter' 2>/dev/null` → ≥ 1.

- [ ] **Step 4: Manual proof (record in report)**

`pnpm --filter @oselvar/website dev`, open `/var/playground`: the seeded `hello.var.md` shows matched steps underlined and the `"world"`/`"Hello, world!"` params as chips; editing updates them live. Record the result + any console errors.

- [ ] **Step 5: Commit**
```bash
git add packages/website/src/scripts/editor-mount.ts packages/website/src/lib/var-token-theme.ts
git commit -m "feat(website): semantic-token highlighting in the browser editor (Vár theme)"
```

---

### Task 4: Migrate VSCode to built-in semantic tokens

**Files:**
- Modify: `packages/var-vscode/src/extension.ts`
- Modify (if needed): `packages/var-vscode/package.json`

**Interfaces:**
- Consumes: the server's `semanticTokensProvider` capability (Task 1).

- [ ] **Step 1: Remove the custom decoration code**

In `packages/var-vscode/src/extension.ts`:
- Delete the `registerMatchDecorations(context, client, started)` call (~line 56) and the entire `registerMatchDecorations` function (~line 73 onward: the two `createTextEditorDecorationType`, the `var/matchRanges` request, the `setDecorations` calls, and the `var/didIndex` listener that refreshes those decorations).
- Remove now-unused imports (`TextEditorDecorationType`, `window.createTextEditorDecorationType`, etc.) that only that function used.
- `vscode-languageclient` auto-registers a semantic-tokens provider from the server capability; no extra client code is needed. (Verify the installed `vscode-languageclient` major ≥ 7 includes `SemanticTokensFeature` — it does for ^8/^9.)

- [ ] **Step 2: Ensure the token colors are visible (only if needed)**

If `function`/`parameter` are not visibly themed by default, add to `packages/var-vscode/package.json` `contributes`:
```json
    "semanticTokenScopes": [
      { "scopes": { "function": ["entity.name.function"], "parameter": ["variable.parameter"] } }
    ]
```
(Standard types are usually themed already; include this only if Step 3 shows no coloring.)

- [ ] **Step 3: Build + manual check (record in report)**

Run: `pnpm --filter oselvar-var build` (or the VSCode package's build script).
Expected: builds. Manual: launch the extension (or note the manual VSCode check is pending), confirm steps/params are highlighted via semantic colors and there are no references to the removed decorations.

- [ ] **Step 4: Commit**
```bash
git add packages/var-vscode/src/extension.ts packages/var-vscode/package.json
git commit -m "feat(var-vscode): use built-in LSP semantic tokens; drop custom match decorations"
```

---

### Task 5: Remove `var/matchRanges` everywhere

**Files:**
- Modify: `packages/var-lsp/src/server.ts`, `packages/var-lsp/src/handlers.ts`
- Modify: any remaining client/test references

- [ ] **Step 1: Find all references**

Run: `grep -rn "matchRanges\|MatchRangeEntry" packages --include='*.ts' | grep -v '/dist/'`
Note every hit; each is removed or migrated below.

- [ ] **Step 2: Remove the server handler**

In `packages/var-lsp/src/server.ts`, delete the `connection.onRequest('var/matchRanges', ...)` block (~line 82).

- [ ] **Step 3: Remove from handlers**

In `packages/var-lsp/src/handlers.ts`: delete the `MatchRangeEntry` type (~line 33), the `matchRanges(uri): ReadonlyArray<MatchRangeEntry>` interface member (~line 132), and the `matchRanges(uri) { ... }` implementation (~line 180). Leave `toLspRange` and the definition/hover code that also use it intact.

- [ ] **Step 4: Remove any tests for matchRanges**

If `packages/var-lsp/tests/handlers.test.ts` (or others) test `matchRanges`, delete those test blocks (the feature is gone). Do not weaken unrelated assertions.

- [ ] **Step 5: Verify nothing references it**

Run: `grep -rn "matchRanges\|MatchRangeEntry" packages --include='*.ts' | grep -v '/dist/' || echo "CLEAN"`
Expected: `CLEAN`.

- [ ] **Step 6: Full build + test**

Run: `pnpm -r build && NODE_OPTIONS="--import tsx" pnpm vitest run`
Expected: all packages build; full suite green.

- [ ] **Step 7: Commit**
```bash
git add -A
git commit -m "refactor: remove custom var/matchRanges — superseded by LSP semantic tokens"
```

---

## Notes for the implementer

- Run tasks in order. Tasks 1, 2 are pure + unit-tested (certain). Tasks 3, 4 are editor/VSCode integration verified by build + a manual run (record observations). Task 5 is dead-code removal gated by the full suite.
- The single biggest uncertainty is the `@codemirror/lsp-client` ViewPlugin wiring in Task 2 (how to get `uri`/`client` from `LSPPlugin.get(view)`, and whether a manual redraw is needed). Read the installed `dist/index.d.ts` first and adjust; the pure `decodeSemanticTokens` must remain exactly as tested.
- Keep the legend order identical on both sides: `['function','parameter']` (server `SEMANTIC_LEGEND`, client `semanticTokens({legend})`). A mismatch swaps the colors.
- Do not modify `<FileEditor>` or `step-highlight`.
