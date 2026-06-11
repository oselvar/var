import { type Connection, type LocationLink, TextDocumentSyncKind } from 'vscode-languageserver'
import { buildHandlers } from './handlers.js'
import { type Store, createStore } from './store.js'

// Keep these re-exports so knip continues to count the workspace deps as used
// in the build. T6 onward uses them directly.
export type { StepDef } from '@oselvar/bdd-language'
export { loadBddConfig } from '@oselvar/bdd'

export function registerHandlers(connection: Connection): void {
  const store = createStore()
  const handlers = buildHandlers(store)

  connection.onInitialize((params) => {
    const root = params.workspaceFolders?.[0]?.uri
    if (root) {
      void store.reindex(root.replace(/^file:\/\//, '')).then(() => afterReindex())
    }
    return {
      capabilities: {
        textDocumentSync: TextDocumentSyncKind.Full,
        hoverProvider: true,
        definitionProvider: true,
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
