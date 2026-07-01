import {
  type Connection,
  type Diagnostic,
  InsertTextFormat,
  type LocationLink,
  TextDocumentSyncKind,
  TextDocuments,
} from 'vscode-languageserver'
import { TextDocument } from 'vscode-languageserver-textdocument'
import { buildHandlers } from './handlers.js'
import { createRunResultsStore, type LspDiagnostic, runLspDiagnostics } from './run-results.js'
import { SEMANTIC_LEGEND, semanticTokenData } from './semantic-tokens.js'
import { createStore, type Store, type StoreDeps } from './store.js'
import { uriToPath } from './uri.js'

// Keep these re-exports so knip continues to count the workspace deps as used
// in the build. T6 onward uses them directly.
export type { StepDef } from '@oselvar/var-language'
// FileSystem is the port external adapters implement (node-file-system.ts
// internally, idb-file-system.ts in the website packages) — it must be
// public for those adapters to type against it.
export type { FileSystem } from './file-system.js'

// vscode-languageserver 10's `onRequest(method, handler)` overload mis-infers the
// result generic from a discriminated `{ ok: true } | { ok: false }` union (it
// drops the failure arm). Pin the generic explicitly from each handler's own
// return type so the result type round-trips correctly.
type LspHandlers = NonNullable<ReturnType<typeof buildHandlers>>

export function registerHandlers(
  connection: Connection,
  makeDeps: (rootUri?: string) => Promise<StoreDeps>,
  opts?: { onDidChangeDocument?: (uri: string, text: string) => void | Promise<void> },
): void {
  let store: Store | null = null
  let handlers: ReturnType<typeof buildHandlers> | null = null
  let runResults: ReturnType<typeof createRunResultsStore> | null = null
  // Track in-memory document content so completion + future cursor-aware
  // features can read the current line without going back to disk.
  const documents = new TextDocuments(TextDocument)
  documents.listen(connection)

  connection.onInitialize(async (params) => {
    const root = params.workspaceFolders?.[0]?.uri
    store = createStore(await makeDeps(root))
    handlers = buildHandlers(store)
    await store.reindex()
    runResults = createRunResultsStore(root ?? '')
    const varJsonPaths = await store.fs().list({ include: ['**/.var/**/*.json'], exclude: [] })
    for (const p of varJsonPaths) {
      try {
        runResults.ingest(p, await store.fs().read(p))
      } catch {
        // a .var file that vanished between list and read — ignore
      }
    }
    afterReindex()
    return {
      capabilities: {
        textDocumentSync: TextDocumentSyncKind.Incremental,
        hoverProvider: true,
        definitionProvider: true,
        // No triggerCharacters — we want the suggestions to appear via the
        // user's invocation (Ctrl+Space) and as they type letters.
        completionProvider: { resolveProvider: false },
        semanticTokensProvider: {
          legend: {
            tokenTypes: [...SEMANTIC_LEGEND.tokenTypes],
            tokenModifiers: [...SEMANTIC_LEGEND.tokenModifiers],
          },
          full: true,
        },
      },
    }
  })

  // Write-through: persist edited docs to the FileSystem, then reindex.
  documents.onDidChangeContent(async (e) => {
    await opts?.onDidChangeDocument?.(e.document.uri, e.document.getText())
    if (!store) return
    await store.fs().write(uriToPath(e.document.uri), e.document.getText())
    await store.reindex()
    afterReindex()
  })

  connection.onDidChangeWatchedFiles(async (params) => {
    if (!runResults) return
    for (const change of params.changes) {
      const path = uriToPath(change.uri)
      if (!path.includes('/.var/') || !path.endsWith('.json')) continue
      // FileChangeType: 1 Created, 2 Changed, 3 Deleted
      const specUri = change.type === 3 ? runResults.remove(path) : await ingestWatched(path)
      if (specUri) await publishFor(specUri)
    }
  })

  async function ingestWatched(path: string): Promise<string | null> {
    if (!store || !runResults) return null
    try {
      return runResults.ingest(path, await store.fs().read(path))
    } catch {
      return null
    }
  }

  function toParseDiagnostics(uri: string): LspDiagnostic[] {
    if (!handlers) return []
    return handlers.diagnosticsFor(uri).map((d) => ({
      severity: d.severity === 'error' ? 1 : 2,
      source: 'var',
      message: d.message,
      range: {
        start: { line: d.range.start.line - 1, character: d.range.start.character - 1 },
        end: { line: d.range.end.line - 1, character: d.range.end.character - 1 },
      },
      code: d.code,
    }))
  }

  async function publishFor(uri: string): Promise<void> {
    if (!store) return
    const parse = toParseDiagnostics(uri)
    let run: LspDiagnostic[] = []
    const results = runResults?.get(uri)
    if (results) {
      let source = documents.get(uri)?.getText()
      if (source === undefined) {
        try {
          source = await store.fs().read(uriToPath(uri))
        } catch {
          source = undefined
        }
      }
      if (source !== undefined) run = runLspDiagnostics(results, source)
    }
    void connection.sendDiagnostics({ uri, diagnostics: [...parse, ...run] as Diagnostic[] })
  }

  function publishAll(): void {
    if (!store) return
    const uris = new Set<string>()
    for (const d of store.index().diagnostics) uris.add(`file://${d.varPath}`)
    if (runResults) for (const u of runResults.specUris()) uris.add(u)
    for (const u of uris) void publishFor(u)
  }

  function afterReindex(): void {
    if (!store || !handlers) return
    publishAll()
    // Wake the client so it can refresh editor decorations and any other
    // client-side projections of the workspace index.
    void connection.sendNotification('var/didIndex')
  }

  connection.onHover((params) => {
    if (!handlers) return null
    const result = handlers.hover({
      uri: params.textDocument.uri,
      position: params.position,
    })
    return result === null ? null : { contents: result.contents }
  })

  connection.onDefinition((params) => {
    if (!handlers) return []
    const links = handlers.definition({
      uri: params.textDocument.uri,
      position: params.position,
    })
    return links as LocationLink[]
  })

  // Custom request for selection-driven step-definition generation. The
  // client is responsible for source (the user's selection) and target
  // (the steps file to append to); the server only knows how to translate
  // text → snippet.
  connection.onRequest(
    'var/generateSnippet',
    (params: { text: string; uri?: string; position?: { line: number; character: number } }) => {
      if (!handlers) return null
      return handlers.generateSnippet({
        text: params.text,
        ...(params.uri !== undefined ? { uri: params.uri } : {}),
        ...(params.position !== undefined ? { position: params.position } : {}),
      })
    },
  )

  connection.onRequest('var/stepGlobs', () => {
    if (!handlers) return []
    return handlers.stepGlobs()
  })

  // Resolve everything the Rename refactor needs from a single position —
  // the step def's expression + every matched .md site with its current
  // captured values. Returns null when the position isn't on a step.
  connection.onRequest(
    'var/stepAt',
    (params: { uri: string; position: { line: number; character: number } }) => {
      if (!handlers) return null
      return handlers.stepAt(params)
    },
  )

  // Drive the cross-file rename. The server resolves the step, derives the
  // new expression, diffs, and returns ready-to-apply edits — or an error.
  // Phase 3 path: refuses when any parameter is added/removed/type-changed.
  connection.onRequest<ReturnType<LspHandlers['renameStep']> | null, void>(
    'var/renameStep',
    (params: { uri: string; position: { line: number; character: number }; newName: string }) => {
      if (!handlers) return null
      return handlers.renameStep(params)
    },
  )

  // Phase 4 path: returns the rename plan (param fates + matches) so the
  // client can drive per-occurrence prompts for added / type-changed
  // parameters before applying anything.
  connection.onRequest<ReturnType<LspHandlers['planRename']> | null, void>(
    'var/planRename',
    (params: { uri: string; position: { line: number; character: number }; newName: string }) => {
      if (!handlers) return null
      return handlers.planRename(params)
    },
  )

  // Render a (new) expression with a list of values into a literal string
  // suitable for splicing into a .md document.
  connection.onRequest<ReturnType<LspHandlers['renderExpressionText']> | null, void>(
    'var/renderExpressionText',
    (params: { expression: string; values: ReadonlyArray<string> }) => {
      if (!handlers) return null
      return handlers.renderExpressionText(params)
    },
  )

  connection.onRequest(
    'textDocument/semanticTokens/full',
    (params: { textDocument: { uri: string } }) => {
      if (!store) return { data: [] }
      const uri = params.textDocument.uri
      const source = documents.get(uri)?.getText() ?? ''
      return { data: semanticTokenData(store.index().matches, uriToPath(uri), source) }
    },
  )

  connection.onCompletion((params) => {
    if (!handlers) return []
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
