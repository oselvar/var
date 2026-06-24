import { javascript } from '@codemirror/lang-javascript'
import { markdown } from '@codemirror/lang-markdown'
import { LSPClient, languageServerExtensions } from '@codemirror/lsp-client'
import { EditorView, basicSetup } from 'codemirror'
import { setRunResults, varRunExtension } from '../lib/cm-run.ts'
import { semanticTokens } from '../lib/cm-semantic-tokens.ts'
import type { RunResults } from '../lib/run-types.ts'
import { varTokenTheme } from '../lib/var-token-theme.ts'
import { workerTransport } from '../lib/worker-transport.ts'

// One shared LSP client (one worker) for the page. Phase C generalises this to
// a registry keyed by an `lsp=` attribute.
let sharedClient: LSPClient | null = null

function lspClient(): LSPClient {
  if (sharedClient) return sharedClient
  const worker = new Worker(new URL('../lib/var-worker.ts', import.meta.url), { type: 'module' })
  sharedClient = new LSPClient({
    extensions: [
      ...languageServerExtensions(),
      semanticTokens({ legend: { tokenTypes: ['function', 'parameter'] } }),
    ],
  }).connect(workerTransport(worker))
  return sharedClient
}

function stubRunAll(view: EditorView): void {
  const results: RunResults = {
    examples: [
      { name: 'first', status: 'passed', lines: [3] },
      {
        name: 'second',
        status: 'failed',
        lines: [5],
        failure: { line: 5, message: 'boom', stack: 'Error: boom\n    at second (/hello.var.md:5:1)' },
      },
    ],
  }
  view.dispatch({ effects: setRunResults.of(results) })
}

export function mountEditor(el: HTMLElement): EditorView {
  const doc = el.dataset.doc ?? ''
  const uri = el.dataset.uri ?? 'file:///untitled.var.md'
  const lang = el.dataset.lang ?? 'markdown'
  const language = lang === 'typescript' ? javascript({ typescript: true }) : markdown()
  const client = lspClient()
  const ext = [basicSetup, language, varTokenTheme, client.plugin(uri)]
  if (lang === 'markdown') ext.push(varRunExtension(stubRunAll))
  return new EditorView({ doc, extensions: ext, parent: el })
}

function mountAll(): void {
  for (const el of document.querySelectorAll<HTMLElement>('.cm-mount')) {
    if (el.dataset.mounted) continue
    el.dataset.mounted = 'true'
    mountEditor(el)
  }
}

mountAll()
