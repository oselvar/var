import { DEFAULT_SNIPPET_TEMPLATE } from '@varar/language'
import { registerHandlers } from '@varar/lsp'
import {
  BrowserMessageReader,
  BrowserMessageWriter,
  createConnection,
} from 'vscode-languageserver/browser'
import { createBrowserGrammarLoader } from './browser-grammar-loader.ts'
import { createMemoryFileSystem } from './memory-file-system.ts'
import { createTsDiagnostics } from './ts-diagnostics.ts'

const config = {
  docs: { include: ['**/*.md'], exclude: [] },
  steps: ['**/*.steps.ts'],
  snippets: { typescript: DEFAULT_SNIPPET_TEMPLATE },
}

// One-time handshake on the worker's default channel: the main thread sends
// { seed } plus a dedicated MessagePort (arrives as event.ports[0], not on
// event.data — the standard way a transferred port shows up) for all
// subsequent LSP traffic. BrowserMessageReader's constructor claims
// `port.onmessage` outright (a direct assignment, not addEventListener), so
// it can't share the worker's default channel with this handshake — every
// mounted <Editor>'s <File> children are collected into `seed` by
// editor-mount.ts before this worker is even created.
self.onmessage = (e: MessageEvent<{ seed: Record<string, string> }>) => {
  self.onmessage = null // done with the default channel
  const port = e.ports[0]
  if (!port) return

  const reader = new BrowserMessageReader(port as unknown as DedicatedWorkerGlobalScope)
  const writer = new BrowserMessageWriter(port as unknown as DedicatedWorkerGlobalScope)
  const connection = createConnection(reader, writer)

  const tsd = createTsDiagnostics()
  const timers = new Map<string, ReturnType<typeof setTimeout>>()

  function onDidChangeDocument(uri: string, text: string): void {
    // Every .ts doc feeds the TS service — plain .ts library tabs both get
    // their own diagnostics and make `./yahtzee`-style imports in .steps.ts
    // tabs resolve.
    if (!uri.endsWith('.ts')) return
    tsd.updateDoc(uri, text)
    clearTimeout(timers.get(uri))
    timers.set(
      uri,
      setTimeout(() => {
        const diagnostics = tsd.diagnostics(uri)
        void connection.sendDiagnostics({ uri, diagnostics })
      }, 250),
    )
  }

  registerHandlers(
    connection,
    async () => ({
      fs: createMemoryFileSystem(e.data.seed),
      config,
      grammarLoader: createBrowserGrammarLoader(),
    }),
    { onDidChangeDocument },
  )
  connection.listen()
}
