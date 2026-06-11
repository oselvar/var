import { realpathSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  type ExtensionContext,
  Range,
  type TextEditor,
  type TextEditorDecorationType,
  window,
  workspace,
} from 'vscode'
import {
  type LanguageClientOptions,
  type ServerOptions,
  TransportKind,
} from 'vscode-languageclient/node.js'
import { LanguageClient } from 'vscode-languageclient/node.js'

let client: LanguageClient | undefined

export function activate(context: ExtensionContext): void {
  // The symlink installer (T8) mirrors `packages/bdd-vscode/` into
  // ~/.vscode/extensions/. Resolve the symlink before walking `..` so we land
  // at the real `packages/` directory; otherwise we'd point at
  // `~/.vscode/extensions/bdd-lsp/dist/bin.js`, which doesn't exist.
  const extReal = realpathSync(context.extensionPath)
  const serverModule = resolve(extReal, '..', 'bdd-lsp', 'dist', 'bin.js')
  // `@oselvar/bdd`'s `exports.import` points at `src/index.ts` so we can run
  // tests without a build step. The LSP server reaches the core through that
  // same entry, so we need tsx to load `.ts` files at runtime.
  const tsxLoader = resolve(extReal, '..', '..', 'node_modules', 'tsx', 'dist', 'loader.mjs')
  const execArgv = ['--import', pathToFileURL(tsxLoader).href]
  const serverOptions: ServerOptions = {
    run: { module: serverModule, transport: TransportKind.stdio, options: { execArgv } },
    debug: { module: serverModule, transport: TransportKind.stdio, options: { execArgv } },
  }
  const clientOptions: LanguageClientOptions = {
    documentSelector: [
      { scheme: 'file', pattern: '**/*.bdd.md' },
      { scheme: 'file', pattern: '**/*.steps.ts' },
    ],
  }
  client = new LanguageClient('oselvar-bdd', 'oselvar BDD', serverOptions, clientOptions)
  const started = client.start()
  registerMatchDecorations(context, client, started)
}

type LspRange = {
  readonly start: { readonly line: number; readonly character: number }
  readonly end: { readonly line: number; readonly character: number }
}

type MatchRangeEntry = { readonly range: LspRange; readonly params: ReadonlyArray<LspRange> }

function toVscodeRange(r: LspRange): Range {
  return new Range(r.start.line, r.start.character, r.end.line, r.end.character)
}

function registerMatchDecorations(
  context: ExtensionContext,
  lspClient: LanguageClient,
  started: Promise<void>,
): void {
  // Greenish wash for the whole matched substring — clearly visible against
  // both light and dark themes without competing with selection or search.
  const matchDecoration: TextEditorDecorationType = window.createTextEditorDecorationType({
    backgroundColor: 'rgba(80, 200, 120, 0.18)',
  })
  // Stronger green + bold weight on the parameter spans (e.g. the `"world"`
  // captured by `{string}`).
  const paramDecoration: TextEditorDecorationType = window.createTextEditorDecorationType({
    backgroundColor: 'rgba(80, 200, 120, 0.42)',
    fontWeight: 'bold',
  })
  context.subscriptions.push(matchDecoration, paramDecoration)

  const refresh = async (editor: TextEditor | undefined): Promise<void> => {
    if (!editor) return
    if (!editor.document.fileName.endsWith('.bdd.md')) return
    try {
      const entries = await lspClient.sendRequest<ReadonlyArray<MatchRangeEntry>>(
        'bdd/matchRanges',
        { uri: editor.document.uri.toString() },
      )
      editor.setDecorations(
        matchDecoration,
        entries.map((e) => toVscodeRange(e.range)),
      )
      editor.setDecorations(
        paramDecoration,
        entries.flatMap((e) => e.params.map(toVscodeRange)),
      )
    } catch {
      // Server may be initializing; the next 'bdd/didIndex' will retry.
    }
  }

  const refreshAll = (): void => {
    for (const ed of window.visibleTextEditors) void refresh(ed)
  }

  context.subscriptions.push(
    window.onDidChangeActiveTextEditor((ed) => void refresh(ed)),
    window.onDidChangeVisibleTextEditors(refreshAll),
    workspace.onDidChangeTextDocument((e) => {
      for (const ed of window.visibleTextEditors) {
        if (ed.document === e.document) void refresh(ed)
      }
    }),
  )

  // `onNotification` requires the client to be started; wait, then register
  // the handler and do an initial paint.
  started
    .then(() => {
      lspClient.onNotification('bdd/didIndex', refreshAll)
      refreshAll()
    })
    .catch(() => {
      // start failure is already surfaced by the language client itself.
    })
}

export async function deactivate(): Promise<void> {
  if (client) await client.stop()
}
