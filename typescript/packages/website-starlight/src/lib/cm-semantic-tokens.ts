import { type LSPClientExtension, LSPPlugin } from '@codemirror/lsp-client'
import { RangeSetBuilder, StateEffect, StateField } from '@codemirror/state'
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
} from '@codemirror/view'

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

// Effect carrying a freshly-built decoration set.
const setTokens = StateEffect.define<DecorationSet>()

// Holds the decorations, mapped through every edit so they survive typing,
// and replaced when a setTokens effect arrives.
const tokenField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    deco = deco.map(tr.changes)
    for (const e of tr.effects) if (e.is(setTokens)) deco = e.value
    return deco
  },
  provide: (f) => EditorView.decorations.from(f),
})

// Module-level registry so a single client-level `var/didIndex` notification
// can refresh every open editor.
const refreshers = new Set<() => void>()

// Generic, server-agnostic semantic-tokens extension for @codemirror/lsp-client.
// Renders `cm-token-<type>` mark decorations; theme the classes separately.
export function semanticTokens(options: {
  legend: { tokenTypes: string[] }
  transform?: (tokens: ReadonlyArray<DecodedToken>) => ReadonlyArray<DecodedToken>
}): LSPClientExtension {
  // The passed-in legend is the advertised capability list and also the fallback
  // when the server has not yet reported its own capabilities.
  const fallbackTokenTypes = options.legend.tokenTypes
  const transform = options.transform ?? ((tokens: ReadonlyArray<DecodedToken>) => tokens)

  const resolveTokenTypes = (view: EditorView): ReadonlyArray<string> => {
    // Fix 1: prefer the token-type list from the server's advertised capabilities
    // (LSPClient.serverCapabilities is typed as lsp.ServerCapabilities | null).
    const lsp = LSPPlugin.get(view)
    const serverTypes = (
      lsp?.client.serverCapabilities as
        | { semanticTokensProvider?: { legend?: { tokenTypes?: string[] } } }
        | null
        | undefined
    )?.semanticTokensProvider?.legend?.tokenTypes
    return serverTypes && serverTypes.length > 0 ? serverTypes : fallbackTokenTypes
  }

  const build = (view: EditorView, data: number[]): DecorationSet => {
    const doc = view.state.doc
    const builder = new RangeSetBuilder<Decoration>()
    const tokenTypes = resolveTokenTypes(view)
    for (const t of transform(decodeSemanticTokens(data, tokenTypes))) {
      if (t.line + 1 > doc.lines) continue
      // Fix 3: clamp token position to line bounds so a mismatched token
      // never bleeds into the next line.
      const lineObj = doc.line(t.line + 1)
      const from = Math.min(lineObj.to, lineObj.from + t.char)
      const to = Math.min(lineObj.to, from + t.length)
      if (from >= to) continue
      builder.add(from, to, Decoration.mark({ class: `cm-token-${t.type}` }))
    }
    return builder.finish()
  }

  const plugin = ViewPlugin.fromClass(
    class {
      readonly refresh: () => void
      // Fix 2: debounce timer for doc-change-driven refresh.
      private debounceTimer: ReturnType<typeof setTimeout> | null = null

      constructor(readonly view: EditorView) {
        this.refresh = () => {
          void this.run()
        }
        refreshers.add(this.refresh)
        this.refresh()
      }

      // Fix 2: schedule a debounced refresh on every doc change so the
      // extension works against any LSP server, not only ones that push
      // `var/didIndex`.
      update(u: ViewUpdate) {
        if (!u.docChanged) return
        if (this.debounceTimer !== null) clearTimeout(this.debounceTimer)
        this.debounceTimer = setTimeout(() => {
          this.debounceTimer = null
          void this.run()
        }, 150)
      }

      destroy() {
        refreshers.delete(this.refresh)
        if (this.debounceTimer !== null) {
          clearTimeout(this.debounceTimer)
          this.debounceTimer = null
        }
      }

      async run() {
        const lsp = LSPPlugin.get(this.view)
        if (!lsp) return
        const result = (await lsp.client.request('textDocument/semanticTokens/full', {
          textDocument: { uri: lsp.uri },
        })) as { data: number[] } | null
        if (!result) return
        this.view.dispatch({ effects: setTokens.of(build(this.view, result.data)) })
      }
    },
  )

  return {
    clientCapabilities: {
      textDocument: {
        semanticTokens: {
          dynamicRegistration: false,
          requests: { full: true },
          formats: ['relative'],
          // Advertise the caller-supplied legend to the server.
          tokenTypes: fallbackTokenTypes,
          tokenModifiers: [],
        },
      },
    },
    notificationHandlers: {
      'var/didIndex': (_client, _params) => {
        for (const r of refreshers) r()
        return true
      },
    },
    editorExtension: [tokenField, plugin],
  }
}
