import { javascript } from '@codemirror/lang-javascript'
import { markdown } from '@codemirror/lang-markdown'
import { foldGutter } from '@codemirror/language'
import { LSPClient, languageServerExtensions } from '@codemirror/lsp-client'
import type { Extension } from '@codemirror/state'
import { lineNumbers } from '@codemirror/view'
import { hashSource } from '@oselvar/var-core'
import { basicSetup, EditorView, minimalSetup } from 'codemirror'
import { flashExtension, type GenerateSnippet, stepGenAffordance } from '../lib/cm-generate-step.ts'
import { setRunResults, varRunExtension } from '../lib/cm-run.ts'
import { semanticTokens } from '../lib/cm-semantic-tokens.ts'
import { varEditorThemeExt } from '../lib/cm-var-theme.ts'
import { runSpec } from '../lib/run-client.ts'
import type { StepFile } from '../lib/run-grouping.ts'
import { groupRunInputs } from '../lib/run-grouping.ts'
import { joinStepParamTokens } from '../lib/var-capsule-tokens.ts'
import { varTokenTheme } from '../lib/var-token-theme.ts'
import { workerTransport } from '../lib/worker-transport.ts'

// One shared LSP client (one worker) for the page. Phase C generalises this to
// a registry keyed by an `lsp=` attribute.
let sharedClient: LSPClient | null = null

const DEFAULT_GROUP = 'default'

type Group = {
  readonly views: Map<string, EditorView> // uri -> view (visible editors)
  readonly hiddenSteps: StepFile[] // carried step sources, no visible editor
}

const groups = new Map<string, Group>()

function getGroup(id: string): Group {
  let g = groups.get(id)
  if (!g) {
    g = { views: new Map(), hiddenSteps: [] }
    groups.set(id, g)
  }
  return g
}

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

// Run one group's spec against its step files and paint the result into the
// group's markdown view.
async function runSpecNow(groupId: string): Promise<void> {
  const group = groups.get(groupId)
  if (!group) return
  const mdEntry = [...group.views.entries()].find(([u]) => u.endsWith('.md'))
  if (!mdEntry) return
  const mdView = mdEntry[1]

  const editors = [...group.views.entries()].map(([uri, v]) => ({
    uri,
    group: groupId,
    source: v.state.doc.toString(),
  }))
  const [input] = groupRunInputs(editors, new Map([[groupId, group.hiddenSteps]]))
  if (!input) return

  try {
    const results = await runSpec({
      varPath: input.varPath,
      varSource: input.varSource,
      stepFiles: input.stepFiles,
    })
    mdView.dispatch({ effects: setRunResults.of(results) })
  } catch (err) {
    mdView.dispatch({
      effects: setRunResults.of({
        version: 1,
        specPath: input.varPath,
        sourceHash: hashSource(input.varSource),
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

const runTimers = new Map<string, ReturnType<typeof setTimeout>>()
function scheduleRun(groupId: string): void {
  const existing = runTimers.get(groupId)
  if (existing) clearTimeout(existing)
  runTimers.set(
    groupId,
    setTimeout(() => void runSpecNow(groupId), 300),
  )
}

// Re-run (debounced) only the group whose editor changed — no run buttons.
function autoRun(groupId: string) {
  return EditorView.updateListener.of((u) => {
    if (u.docChanged) scheduleRun(groupId)
  })
}

function mountEditor(el: HTMLElement): EditorView {
  const doc = el.dataset.doc ?? ''
  const uri = el.dataset.uri ?? 'file:///untitled.md'
  const lang = el.dataset.lang ?? 'markdown'
  const groupId = el.dataset.group ?? DEFAULT_GROUP
  const group = getGroup(groupId)

  // Hidden companion step sources carried by this mount (docs samples that show
  // only the spec). The browser decodes the data attribute for us, so the JSON
  // is ready to parse.
  if (el.dataset.steps) {
    try {
      const parsed = JSON.parse(el.dataset.steps) as StepFile[]
      group.hiddenSteps.push(...parsed)
    } catch {
      // Ignore malformed carried steps — the spec simply runs without them.
    }
  }

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
    autoRun(groupId),
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
        [...group.views.entries()].find(([u]) => u.endsWith('.steps.ts'))?.[1] ?? null
      ext.push(stepGenAffordance({ generate, stepsView }))
    }
  }
  const view = new EditorView({ doc, extensions: ext, parent: el })
  group.views.set(uri, view)
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
// Initial run once all editors in each group are mounted.
for (const groupId of groups.keys()) scheduleRun(groupId)
