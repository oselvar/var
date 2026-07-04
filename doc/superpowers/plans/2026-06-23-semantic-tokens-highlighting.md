# Vár Semantic-Tokens Highlighting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate Vár step/parameter highlighting from the custom `var/matchRanges` request to standard LSP semantic tokens — emitted by `var-lsp`, consumed by the browser CodeMirror editor (a new generic extension) and VSCode (built-in) — with `var/matchRanges` removed.

**Architecture:** Outside-in (visible end first, drill inward): (1) the browser editor shows highlighting via a generic `@codemirror/lsp-client` semantic-tokens extension + Vár theme, fed by a **stub** server token response — proving the uncertain client glue end-to-end; (2) replace the stub with the real pure server encoder (unit-tested); (3) migrate VSCode to built-in semantic tokens; (4) remove `var/matchRanges`.

**Tech Stack:** `@codemirror/lsp-client` + `@codemirror/view`/`state`, `vscode-languageserver` (browser+node), `@oselvar/var-language` (`MatchRef`), `vscode-languageclient` (VSCode), vitest.

## Global Constraints

- **Outside-in:** build the visible client path first against a stub; the real server encoder comes second. Do not pull the encoder forward.
- **Legend:** `tokenTypes: ['function', 'parameter']`, `tokenModifiers: []` (index 0 = `function` = step span; index 1 = `parameter` = captured arg). Identical order on server and client — a mismatch swaps the colors.
- **Non-overlap / single-line:** semantic tokens must not overlap and must be single-line. Each match is split per line into non-overlapping spans: step-minus-params → `function`, each param → `parameter`.
- **Coordinates:** `MatchRef` `Range`s are 1-based (line+character), end-exclusive (`@oselvar/var-language`). LSP semantic tokens are 0-based; convert with `-1`. Delta encoding per token: `[deltaLine, deltaStartChar, length, tokenTypeIndex, 0]`, tokens sorted by (line, char); `deltaStartChar` is relative to the previous token only on the same line.
- **Generic client extension:** server-agnostic; renders `cm-token-<tokenType>` decorations; theming via a separate Vár theme. Self-contained for later upstreaming.
- **Do not touch** `<FileEditor>` or the `step-highlight` helper (they use `buildWorkspaceIndex` directly, not the LSP).
- **Library APIs unverified at plan time** (`@codemirror/lsp-client` internals): before using them, read the installed types at `packages/website/node_modules/@codemirror/lsp-client/dist/index.d.ts`. The pure `decodeSemanticTokens`/`semanticTokenData` functions are certain and unit-tested; editor/VSCode wiring is best-effort + build- and manual-verified.
- **Transient VSCode state:** once the server advertises `semanticTokensProvider` (Task 1), VSCode's language client will also start rendering semantic tokens *in addition to* its existing `var/matchRanges` decorations until Task 3/4. This double-highlight is a mid-branch dev artifact, never shipped; resolved by Tasks 3–4.

---

### Task 1: Browser highlighting end-to-end (generic CM extension + Vár theme) against a stub server

**Files:**
- Create: `packages/website/src/lib/cm-semantic-tokens.ts`
- Create: `packages/website/src/lib/cm-semantic-tokens.test.ts`
- Create: `packages/website/src/lib/var-token-theme.ts`
- Modify: `packages/website/src/scripts/editor-mount.ts`
- Modify: `packages/var-lsp/src/server.ts` (capability + **stub** handler — replaced in Task 2)

**Interfaces:**
- Produces: `decodeSemanticTokens(data: ReadonlyArray<number>, tokenTypes: ReadonlyArray<string>): Array<{ line: number; char: number; length: number; type: string }>` (0-based); `semanticTokens(options: { legend: { tokenTypes: string[] } }): LSPClientExtension`; `varTokenTheme`.
- Consumes: `@codemirror/lsp-client`, `@codemirror/view`/`state`; the editor wiring from Phase A.

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

- [ ] **Step 3: Implement decode + the generic extension**

First read `packages/website/node_modules/@codemirror/lsp-client/dist/index.d.ts` to confirm the `LSPClientExtension` shape and how a `ViewPlugin` obtains the document `uri` + `client` (e.g. `LSPPlugin.get(view)`), the `client.request` signature, and whether a manual redraw is needed. Adjust the wiring to the real signatures; keep `decodeSemanticTokens` exactly as tested.

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
        const result = (await lsp.client.request('textDocument/semanticTokens/full', {
          textDocument: { uri: lsp.uri },
        })) as { data: number[] } | null
        if (!result) return
        const doc = this.view.state.doc
        const builder = new RangeSetBuilder<Decoration>()
        for (const t of decodeSemanticTokens(result.data, tokenTypes)) {
          if (t.line + 1 > doc.lines) continue
          const from = doc.line(t.line + 1).from + t.char
          const to = from + t.length
          if (to <= doc.length) builder.add(from, to, Decoration.mark({ class: `cm-token-${t.type}` }))
        }
        this.decorations = builder.finish()
        this.view.update([]) // nudge a redraw of the new decorations
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
If `LSPPlugin.get` exposes `uri`/`client` under different names, or redraw is automatic, adjust per the installed types. Refreshing on the `var/didIndex` notification can be added via the extension's `notificationHandlers` later; doc-change refresh suffices for the proof.

- [ ] **Step 4: Run decode test to pass**

Run: `NODE_OPTIONS="--import tsx" pnpm vitest run packages/website/src/lib/cm-semantic-tokens.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Vár token theme**

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

- [ ] **Step 6: Wire the extension + theme into the editor**

In `packages/website/src/scripts/editor-mount.ts`:
- import `{ semanticTokens } from '../lib/cm-semantic-tokens.ts'` and `{ varTokenTheme } from '../lib/var-token-theme.ts'`.
- Change the client construction to add the extension: `new LSPClient({ extensions: [...languageServerExtensions(), semanticTokens({ legend: { tokenTypes: ['function', 'parameter'] } })] })`.
- Add `varTokenTheme` to the `EditorView` extensions array (with `basicSetup, markdown(), client.plugin(uri)`).

- [ ] **Step 7: Add the server capability + a STUB token handler**

In `packages/var-lsp/src/server.ts`:
- In the `onInitialize` `capabilities` object, add:
```ts
        semanticTokensProvider: {
          legend: { tokenTypes: ['function', 'parameter'], tokenModifiers: [] },
          full: true,
        },
```
- Register a TEMPORARY stub handler (replaced by the real encoder in Task 2) near the other `connection.onRequest` calls:
```ts
  // STUB (Task 2 replaces this with the real encoder): one function token over
  // the first 5 chars of the first line, just to prove the client renders.
  connection.onRequest('textDocument/semanticTokens/full', () => ({ data: [0, 0, 5, 0, 0] }))
```

- [ ] **Step 8: Build + manual proof (record in report)**

Run: `pnpm --filter @oselvar/website build`
Expected: succeeds; `find packages/website/dist -name '*.js' | xargs grep -l 'cm-token-parameter' 2>/dev/null` → ≥ 1.
Manual: `pnpm --filter @oselvar/website dev`, open `/var/playground` — the first 5 characters of the first line should render with the `function` underline (the stub). This proves request → decode → decoration → theme works end-to-end. Record the result + any console errors.

- [ ] **Step 9: Commit**
```bash
git add packages/website/src/lib/cm-semantic-tokens.ts packages/website/src/lib/cm-semantic-tokens.test.ts packages/website/src/lib/var-token-theme.ts packages/website/src/scripts/editor-mount.ts packages/var-lsp/src/server.ts
git commit -m "feat(website): browser semantic-token highlighting via generic CM extension (stub server)"
```

---

### Task 2: Real server encoder (replace the stub)

**Files:**
- Create: `packages/var-lsp/src/semantic-tokens.ts`
- Create: `packages/var-lsp/src/semantic-tokens.test.ts`
- Modify: `packages/var-lsp/src/server.ts` (swap stub → real encoder)

**Interfaces:**
- Produces: `SEMANTIC_LEGEND = { tokenTypes: ['function','parameter'], tokenModifiers: [] }`; `semanticTokenData(matches: ReadonlyArray<MatchRef>, varPath: string, source: string): number[]`.
- Consumes: `MatchRef` from `@oselvar/var-language`; `store.index().matches`, `documents`, `uriToPath` in `server.ts`.

- [ ] **Step 1: Write the failing encoder test**

`packages/var-lsp/src/semantic-tokens.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import type { MatchRef } from '@oselvar/var-language'
import { SEMANTIC_LEGEND, semanticTokenData } from './semantic-tokens.js'

function r(sl: number, sc: number, el: number, ec: number) {
  return { start: { line: sl, character: sc }, end: { line: el, character: ec } }
}

describe('semanticTokenData', () => {
  it('emits non-overlapping function/parameter tokens, delta-encoded', () => {
    // source: `I greet "x"` ; whole span = function, inner x = parameter
    const source = 'I greet "x"'
    const matches = [
      {
        varPath: '/a.var.md',
        range: r(1, 1, 1, 12), // 0-based 0..11
        paramRanges: [r(1, 10, 1, 11)], // 0-based char 9
        paramValues: ['x'],
      } as unknown as MatchRef,
    ]
    const data = semanticTokenData(matches, '/a.var.md', source)
    expect(data).toEqual([
      0, 0, 9, 0, 0, // function "I greet \"" (0..9)
      0, 9, 1, 1, 0, // parameter "x" (9..10)
      0, 1, 1, 0, 0, // function "\"" (10..11)
    ])
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

export function semanticTokenData(
  matches: ReadonlyArray<MatchRef>,
  varPath: string,
  source: string,
): number[] {
  const lines = source.split('\n')
  // per-char kind per line: 0 none, 1 function (step), 2 parameter (wins)
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
      const deltaLine = li - prevLine
      const deltaChar = deltaLine === 0 ? c - prevChar : c
      data.push(deltaLine, deltaChar, end - c, k === 1 ? FUNCTION : PARAMETER, 0)
      prevLine = li
      prevChar = c
      c = end
    }
  }
  return data
}
```

- [ ] **Step 4: Run encoder test to pass**

Run: `NODE_OPTIONS="--import tsx" pnpm vitest run packages/var-lsp/src/semantic-tokens.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Replace the stub handler with the real encoder**

In `packages/var-lsp/src/server.ts`:
- Add `import { SEMANTIC_LEGEND, semanticTokenData } from './semantic-tokens.js'`.
- Replace the Task-1 stub `connection.onRequest('textDocument/semanticTokens/full', ...)` with:
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
- Update the `semanticTokensProvider.legend` in `onInitialize` to use the shared constant: `legend: { tokenTypes: [...SEMANTIC_LEGEND.tokenTypes], tokenModifiers: [...SEMANTIC_LEGEND.tokenModifiers] }`.

- [ ] **Step 6: Build + var-lsp suite + manual proof**

Run: `pnpm --filter @oselvar/var-lsp build && NODE_OPTIONS="--import tsx" pnpm vitest run packages/var-lsp`
Expected: build + all var-lsp tests pass (incl. the encoder test).
Manual (record in report): rebuild the website (`pnpm --filter @oselvar/website build`), `dev`, open `/var/playground` — the seeded `hello.var.md` now shows the real matched steps underlined and `"world"`/`"Hello, world!"` params as chips; editing updates live.

- [ ] **Step 7: Commit**
```bash
git add packages/var-lsp/src/semantic-tokens.ts packages/var-lsp/src/semantic-tokens.test.ts packages/var-lsp/src/server.ts
git commit -m "feat(var-lsp): real semantic-token encoder (function/parameter); replace stub"
```

---

### Task 3: Migrate VSCode to built-in semantic tokens

**Files:**
- Modify: `packages/var-vscode/src/extension.ts`
- Modify (only if needed): `packages/var-vscode/package.json`

**Interfaces:**
- Consumes: the server's `semanticTokensProvider` capability (Tasks 1–2).

- [ ] **Step 1: Remove the custom decoration code**

In `packages/var-vscode/src/extension.ts`:
- Delete the `registerMatchDecorations(context, client, started)` call (~line 56) and the whole `registerMatchDecorations` function (~line 73 onward): the two `createTextEditorDecorationType`, the `var/matchRanges` request, the `setDecorations` calls, and the `var/didIndex` listener that refreshes those decorations.
- Remove now-unused imports (`TextEditorDecorationType`, etc.) only that function used.
- `vscode-languageclient` auto-registers a semantic-tokens provider from the server capability (its `SemanticTokensFeature`, present in ^8/^9) — no extra client code needed.

- [ ] **Step 2: Ensure token colors are visible (only if Step 3 shows none)**

If `function`/`parameter` aren't visibly themed, add to `packages/var-vscode/package.json` `contributes`:
```json
    "semanticTokenScopes": [
      { "scopes": { "function": ["entity.name.function"], "parameter": ["variable.parameter"] } }
    ]
```

- [ ] **Step 3: Build + manual check (record in report)**

Run: `pnpm --filter oselvar-var build` (the VSCode package's build).
Expected: builds; no remaining `var/matchRanges`/`setDecorations` references. Manual VSCode check is pending — record it.

- [ ] **Step 4: Commit**
```bash
git add packages/var-vscode/src/extension.ts packages/var-vscode/package.json
git commit -m "feat(var-vscode): use built-in LSP semantic tokens; drop custom match decorations"
```

---

### Task 4: Remove `var/matchRanges` everywhere

**Files:**
- Modify: `packages/var-lsp/src/server.ts`, `packages/var-lsp/src/handlers.ts`, plus any remaining test references.

- [ ] **Step 1: Find all references**

Run: `grep -rn "matchRanges\|MatchRangeEntry" packages --include='*.ts' | grep -v '/dist/'`
Note every hit; each is removed below.

- [ ] **Step 2: Remove the server handler**

In `packages/var-lsp/src/server.ts`, delete the `connection.onRequest('var/matchRanges', ...)` block (~line 82).

- [ ] **Step 3: Remove from handlers**

In `packages/var-lsp/src/handlers.ts`: delete the `MatchRangeEntry` type (~line 33), the `matchRanges(uri): ReadonlyArray<MatchRangeEntry>` interface member (~line 132), and the `matchRanges(uri) { ... }` implementation (~line 180). Leave `toLspRange` and the definition/hover code that also use it intact.

- [ ] **Step 4: Remove any matchRanges tests**

If `packages/var-lsp/tests/handlers.test.ts` (or others) test `matchRanges`, delete those blocks (the feature is gone). Don't weaken unrelated assertions.

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

- Run tasks in order — outside-in. Task 1 is the visible client path proven against a server stub; Task 2 swaps in the real encoder; Tasks 3–4 propagate to VSCode and remove the old path.
- The pure functions (`decodeSemanticTokens` in Task 1, `semanticTokenData` in Task 2) are certain and unit-tested — keep them exactly as tested. The riskiest part is the Task 1 `@codemirror/lsp-client` ViewPlugin glue; read the installed `dist/index.d.ts` first and adjust the `LSPPlugin.get`/redraw details.
- Keep the legend order identical on both sides: `['function','parameter']`.
- Between Tasks 1–3, VSCode may briefly show both semantic-token and `matchRanges` highlighting (dev-only); Tasks 3–4 resolve it.
- Do not modify `<FileEditor>` or `step-highlight`.
