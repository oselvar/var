import { DEFAULT_SNIPPET_TEMPLATE } from '@oselvar/var-core'
import { registerHandlers } from '@oselvar/var-lsp'
import {
  BrowserMessageReader,
  BrowserMessageWriter,
  createConnection,
} from 'vscode-languageserver/browser'
import helloSteps from '../../../var-examples/hello-var/hello-var.steps.ts?raw'
import romanNumeralsSpec from '../../../var-examples/roman-numerals/roman-numerals.md?raw'
import romanNumeralsSteps from '../../../var-examples/roman-numerals/roman-numerals.steps.ts?raw'
import yahtzeeSpec from '../../../var-examples/yahtzee/yahtzee.md?raw'
import yahtzeeSteps from '../../../var-examples/yahtzee/yahtzee.steps.ts?raw'
import { createMemoryFileSystem } from './memory-file-system.ts'
import { createTsDiagnostics } from './ts-diagnostics.ts'

// Seed the in-browser filesystem from the canonical dogfood files so the
// language server can cross-reference each spec against its step definitions.
// Re-seeded fresh on every worker start (i.e. every page load) — see
// memory-file-system.ts.
//
// NOTE — two separate workers: this LSP worker produces the semantic-token
// highlighting (green step / orange param chips) from THIS index, while the
// run-worker (run-client.ts -> run-worker.ts) executes specs from stepFiles
// passed directly to it. A doc's hidden `steps` prop (Editor's data-steps)
// reaches only the run-worker, so any step file a doc spec must HIGHLIGHT
// against has to be seeded here too. The docs use hello + yahtzee + roman-
// numerals steps.
const SEED_FILES: Record<string, string> = {
  '/yahtzee.md': yahtzeeSpec,
  '/yahtzee.steps.ts': yahtzeeSteps,
  '/01-hello.steps.ts': helloSteps,
  '/roman-numerals.md': romanNumeralsSpec,
  '/roman-numerals.steps.ts': romanNumeralsSteps,
}

const reader = new BrowserMessageReader(self as DedicatedWorkerGlobalScope)
const writer = new BrowserMessageWriter(self as DedicatedWorkerGlobalScope)
const connection = createConnection(reader, writer)

const config = {
  vars: { include: ['**/*.md'], exclude: [] },
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

registerHandlers(connection, async () => ({ fs: createMemoryFileSystem(SEED_FILES), config }), {
  onDidChangeDocument,
})
connection.listen()
