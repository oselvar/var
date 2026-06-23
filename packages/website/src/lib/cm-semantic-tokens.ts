import { RangeSetBuilder, StateEffect, StateField } from '@codemirror/state'
import { Decoration, type DecorationSet, EditorView, ViewPlugin } from '@codemirror/view'
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
export function semanticTokens(options: { legend: { tokenTypes: string[] } }): LSPClientExtension {
  const tokenTypes = options.legend.tokenTypes

  const build = (view: EditorView, data: number[]): DecorationSet => {
    const doc = view.state.doc
    const builder = new RangeSetBuilder<Decoration>()
    for (const t of decodeSemanticTokens(data, tokenTypes)) {
      if (t.line + 1 > doc.lines) continue
      const from = doc.line(t.line + 1).from + t.char
      const to = from + t.length
      if (to <= doc.length) builder.add(from, to, Decoration.mark({ class: `cm-token-${t.type}` }))
    }
    return builder.finish()
  }

  const plugin = ViewPlugin.fromClass(
    class {
      readonly refresh: () => void
      constructor(readonly view: EditorView) {
        this.refresh = () => {
          void this.run()
        }
        refreshers.add(this.refresh)
        this.refresh()
      }
      destroy() {
        refreshers.delete(this.refresh)
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
          tokenTypes,
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
