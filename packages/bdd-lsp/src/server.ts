import {
  type Connection,
  InsertTextFormat,
  type LocationLink,
  TextDocuments,
  TextDocumentSyncKind,
} from 'vscode-languageserver'
import { TextDocument } from 'vscode-languageserver-textdocument'
import { buildHandlers } from './handlers.js'
import { type Store, createStore } from './store.js'

// Keep these re-exports so knip continues to count the workspace deps as used
// in the build. T6 onward uses them directly.
export type { StepDef } from '@oselvar/bdd-language'
export { loadBddConfig } from '@oselvar/bdd'

export function registerHandlers(connection: Connection): void {
  const store = createStore()
  const handlers = buildHandlers(store)
  // Track in-memory document content so completion + future cursor-aware
  // features can read the current line without going back to disk.
  const documents = new TextDocuments(TextDocument)
  documents.listen(connection)

  connection.onInitialize((params) => {
    const root = params.workspaceFolders?.[0]?.uri
    if (root) {
      void store.reindex(root.replace(/^file:\/\//, '')).then(() => afterReindex())
    }
    return {
      capabilities: {
        textDocumentSync: TextDocumentSyncKind.Incremental,
        hoverProvider: true,
        definitionProvider: true,
        // No triggerCharacters — we want the suggestions to appear via the
        // user's invocation (Ctrl+Space) and as they type letters.
        completionProvider: { resolveProvider: false },
      },
    }
  })

  connection.onDidSaveTextDocument(async () => {
    await store.reindex(store.workspaceRoot())
    afterReindex()
  })

  function afterReindex(): void {
    pushDiagnostics(connection, store, handlers)
    // Wake the client so it can refresh editor decorations and any other
    // client-side projections of the workspace index.
    void connection.sendNotification('bdd/didIndex')
  }

  connection.onHover((params) => {
    const result = handlers.hover({
      uri: params.textDocument.uri,
      position: params.position,
    })
    return result === null ? null : { contents: result.contents }
  })

  connection.onDefinition((params) => {
    const links = handlers.definition({
      uri: params.textDocument.uri,
      position: params.position,
    })
    return links as LocationLink[]
  })

  // Custom request the client uses to drive editor decorations for matched
  // step ranges. Returns 0-based LSP ranges.
  connection.onRequest('bdd/matchRanges', (params: { uri: string }) =>
    handlers.matchRanges(params.uri),
  )

  // Custom request for selection-driven step-definition generation. The
  // client is responsible for source (the user's selection) and target
  // (the steps file to append to); the server only knows how to translate
  // text → snippet.
  connection.onRequest('bdd/generateSnippet', (params: { text: string }) =>
    handlers.generateSnippet(params.text),
  )

  connection.onRequest('bdd/stepGlobs', () => handlers.stepGlobs())

  // Resolve everything the Rename refactor needs from a single position —
  // the step def's expression + every matched .bdd.md site with its current
  // captured values. Returns null when the position isn't on a step.
  connection.onRequest(
    'bdd/stepAt',
    (params: { uri: string; position: { line: number; character: number } }) =>
      handlers.stepAt(params),
  )

  // Drive the cross-file rename. The server resolves the step, derives the
  // new expression, diffs, and returns ready-to-apply edits — or an error.
  // Phase 3 path: refuses when any parameter is added/removed/type-changed.
  connection.onRequest(
    'bdd/renameStep',
    (params: {
      uri: string
      position: { line: number; character: number }
      newName: string
    }) => handlers.renameStep(params),
  )

  // Phase 4 path: returns the rename plan (param fates + matches) so the
  // client can drive per-occurrence prompts for added / type-changed
  // parameters before applying anything.
  connection.onRequest(
    'bdd/planRename',
    (params: {
      uri: string
      position: { line: number; character: number }
      newName: string
    }) => handlers.planRename(params),
  )

  // Render a (new) expression with a list of values into a literal string
  // suitable for splicing into a .bdd.md document.
  connection.onRequest(
    'bdd/renderExpressionText',
    (params: { expression: string; values: ReadonlyArray<string> }) =>
      handlers.renderExpressionText(params),
  )

  connection.onCompletion((params) => {
    const doc = documents.get(params.textDocument.uri)
    const line = doc
      ? doc.getText({
          start: { line: params.position.line, character: 0 },
          end: { line: params.position.line, character: params.position.character },
        })
      : ''
    const items = handlers.completions({
      uri: params.textDocument.uri,
      position: params.position,
      linePrefix: line,
    })
    // Re-shape to the LSP CompletionItem types the SDK expects.
    return items.map((item) => ({
      label: item.label,
      kind: 15, // CompletionItemKind.Snippet
      insertTextFormat: InsertTextFormat.Snippet,
      filterText: item.filterText,
      textEdit: {
        range: item.range,
        newText: item.insertText,
      },
    }))
  })
}

function pushDiagnostics(
  connection: Connection,
  store: Store,
  handlers: ReturnType<typeof buildHandlers>,
): void {
  const seen = new Set<string>()
  for (const d of store.index().diagnostics) seen.add(`file://${d.bddPath}`)
  for (const uri of seen) {
    const diags = handlers.diagnosticsFor(uri)
    void connection.sendDiagnostics({
      uri,
      diagnostics: diags.map((d) => ({
        severity: d.severity === 'error' ? 1 : 2,
        message: d.message,
        range: {
          start: {
            line: d.range.start.line - 1,
            character: d.range.start.character - 1,
          },
          end: {
            line: d.range.end.line - 1,
            character: d.range.end.character - 1,
          },
        },
        code: d.code,
      })),
    })
  }
}
