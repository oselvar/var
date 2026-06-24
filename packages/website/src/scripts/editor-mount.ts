import { javascript } from '@codemirror/lang-javascript'
import { markdown } from '@codemirror/lang-markdown'
import { LSPClient, languageServerExtensions } from '@codemirror/lsp-client'
import { basicSetup, EditorView } from 'codemirror'
import { flashExtension, type GenerateSnippet, stepGenAffordance } from '../lib/cm-generate-step.ts'
import { setRunResults, varRunExtension } from '../lib/cm-run.ts'
import { semanticTokens } from '../lib/cm-semantic-tokens.ts'
import { runSpec } from '../lib/run-client.ts'
import { varTokenTheme } from '../lib/var-token-theme.ts'
import { workerTransport } from '../lib/worker-transport.ts'

// One shared LSP client (one worker) for the page. Phase C generalises this to
// a registry keyed by an `lsp=` attribute.
let sharedClient: LSPClient | null = null

// Module-level map of all mounted editors, keyed by uri.
const views = new Map<string, EditorView>()

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

// Run the spec (from the current contents of both editors) and paint the
// results into the markdown editor.
async function runSpecNow(): Promise<void> {
  const md = [...views.entries()].find(([u]) => u.endsWith('.var.md'))
  if (!md) return
  const mdView = md[1]
  const varSource = mdView.state.doc.toString()
  const stepFiles = [...views.entries()]
    .filter(([u]) => u.endsWith('.steps.ts'))
    .map(([u, v]) => ({ path: u.replace(/^file:\/\//, ''), source: v.state.doc.toString() }))
  try {
    const results = await runSpec({ varPath: '/hello.var.md', varSource, stepFiles })
    mdView.dispatch({ effects: setRunResults.of(results) })
  } catch (err) {
    mdView.dispatch({
      effects: setRunResults.of({
        examples: [
          {
            name: 'error',
            status: 'failed',
            lines: [1],
            failure: { line: 1, message: String(err), stack: String(err) },
          },
        ],
      }),
    })
  }
}

let runTimer: ReturnType<typeof setTimeout> | undefined
function scheduleRun(): void {
  clearTimeout(runTimer)
  runTimer = setTimeout(() => void runSpecNow(), 300)
}

// Re-run (debounced) whenever any editor's document changes — no run buttons.
const autoRun = EditorView.updateListener.of((u) => {
  if (u.docChanged) scheduleRun()
})

export function mountEditor(el: HTMLElement): EditorView {
  const doc = el.dataset.doc ?? ''
  const uri = el.dataset.uri ?? 'file:///untitled.var.md'
  const lang = el.dataset.lang ?? 'markdown'
  const language = lang === 'typescript' ? javascript({ typescript: true }) : markdown()
  const client = lspClient()
  const ext = [basicSetup, language, varTokenTheme, client.plugin(uri), autoRun, flashExtension()]
  if (lang === 'markdown') {
    ext.push(varRunExtension())
    const generate: GenerateSnippet = (text) =>
      client.request('var/generateSnippet', { text }) as Promise<{
        fullCode: string
        expression: string
      }>
    const stepsView = () => [...views.entries()].find(([u]) => u.endsWith('.steps.ts'))?.[1] ?? null
    ext.push(stepGenAffordance({ generate, stepsView }))
  }
  const view = new EditorView({ doc, extensions: ext, parent: el })
  views.set(uri, view)
  return view
}

function mountAll(): void {
  for (const el of document.querySelectorAll<HTMLElement>('.cm-mount')) {
    if (el.dataset.mounted) continue
    el.dataset.mounted = 'true'
    mountEditor(el)
  }
}

mountAll()
// Initial run once both editors are mounted.
scheduleRun()
