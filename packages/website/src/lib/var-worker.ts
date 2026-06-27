import { DEFAULT_SNIPPET_TEMPLATE } from '@oselvar/var'
import { registerHandlers } from '@oselvar/var-lsp'
import {
  BrowserMessageReader,
  BrowserMessageWriter,
  createConnection,
} from 'vscode-languageserver/browser.js'
import yahtzeeSpec from '../../../../docs/tutorial/04-yahtzee.var.md?raw'
import yahtzeeSteps from '../../../../docs/tutorial/steps/04-yahtzee.steps.ts?raw'
import { createIdbFileSystem } from './idb-file-system.ts'
import { createTsDiagnostics } from './ts-diagnostics.ts'

// Seed the in-browser filesystem from the canonical dogfood files so the
// language server can cross-reference the spec against its step definitions.
const SEED_FILES: Record<string, string> = {
  '/yahtzee.var.md': yahtzeeSpec,
  '/yahtzee.steps.ts': yahtzeeSteps,
}

const reader = new BrowserMessageReader(self as DedicatedWorkerGlobalScope)
const writer = new BrowserMessageWriter(self as DedicatedWorkerGlobalScope)
const connection = createConnection(reader, writer)

const config = {
  vars: ['**/*.var.md'],
  steps: ['**/*.steps.ts'],
  snippet: { template: DEFAULT_SNIPPET_TEMPLATE },
  scannerPlugins: [],
}

const tsd = createTsDiagnostics()
const timers = new Map<string, ReturnType<typeof setTimeout>>()

function onDidChangeDocument(uri: string, text: string): void {
  if (!uri.endsWith('.steps.ts')) return
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

registerHandlers(connection, async () => ({ fs: await createIdbFileSystem(SEED_FILES), config }), {
  onDidChangeDocument,
})
connection.listen()
