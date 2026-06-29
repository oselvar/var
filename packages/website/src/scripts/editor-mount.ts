import { javascript } from '@codemirror/lang-javascript'
import { markdown } from '@codemirror/lang-markdown'
import { foldGutter } from '@codemirror/language'
import { LSPClient, languageServerExtensions } from '@codemirror/lsp-client'
import type { Extension } from '@codemirror/state'
import { lineNumbers } from '@codemirror/view'
import { hashSource } from '@oselvar/var'
import { basicSetup, EditorView, minimalSetup } from 'codemirror'
import { flashExtension, type GenerateSnippet, stepGenAffordance } from '../lib/cm-generate-step.ts'
import { setRunResults, varRunExtension } from '../lib/cm-run.ts'
import { semanticTokens } from '../lib/cm-semantic-tokens.ts'
import { varEditorThemeExt } from '../lib/cm-var-theme.ts'
import { runSpec } from '../lib/run-client.ts'
import { joinStepParamTokens } from '../lib/var-capsule-tokens.ts'
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
      semanticTokens({
        legend: { tokenTypes: ['function', 'parameter'] },
        transform: joinStepParamTokens,
      }),
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
  const varPath = md[0].replace(/^file:\/\//, '')
  const varSource = mdView.state.doc.toString()
  const stepFiles = [...views.entries()]
    .filter(([u]) => u.endsWith('.steps.ts'))
    .map(([u, v]) => ({ path: u.replace(/^file:\/\//, ''), source: v.state.doc.toString() }))
  try {
    const results = await runSpec({ varPath, varSource, stepFiles })
    mdView.dispatch({ effects: setRunResults.of(results) })
  } catch (err) {
    mdView.dispatch({
      effects: setRunResults.of({
        version: 1,
        specPath: varPath,
        sourceHash: hashSource(varSource),
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

function mountEditor(el: HTMLElement): EditorView {
  const doc = el.dataset.doc ?? ''
  const uri = el.dataset.uri ?? 'file:///untitled.var.md'
  const lang = el.dataset.lang ?? 'markdown'
  const language = lang === 'typescript' ? javascript({ typescript: true }) : markdown()
  const client = lspClient()
  // basicSetup bundles the line-number and fold gutters. When either is turned
  // off we can't subtract from it, so drop to minimalSetup and add back only the
  // gutters that are wanted. (The run-result gutter is added separately below.)
  const wantLineNumbers = el.dataset.lineNumbers !== 'false'
  const wantFolding = el.dataset.folding !== 'false'
  const setup: Extension =
    wantLineNumbers && wantFolding
      ? basicSetup
      : [minimalSetup, wantLineNumbers ? lineNumbers() : [], wantFolding ? foldGutter() : []]
  const ext = [
    setup,
    language,
    varEditorThemeExt(),
    varTokenTheme,
    client.plugin(uri),
    autoRun,
    flashExtension(),
  ]
  if (lang === 'markdown') {
    ext.push(varRunExtension())
    if (el.dataset.define !== 'false') {
      const generate: GenerateSnippet = (text, position) =>
        client.request('var/generateSnippet', { text, uri, position }) as Promise<{
          fullCode: string
          expression: string
        }>
      const stepsView = () =>
        [...views.entries()].find(([u]) => u.endsWith('.steps.ts'))?.[1] ?? null
      ext.push(stepGenAffordance({ generate, stepsView }))
    }
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
