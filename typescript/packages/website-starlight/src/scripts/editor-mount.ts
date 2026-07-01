import { javascript } from '@codemirror/lang-javascript'
import { markdown } from '@codemirror/lang-markdown'
import { foldGutter } from '@codemirror/language'
import { LSPClient, languageServerExtensions } from '@codemirror/lsp-client'
import { Annotation, type Extension } from '@codemirror/state'
import { lineNumbers } from '@codemirror/view'
import { hashSource } from '@oselvar/var-core'
import { basicSetup, EditorView, minimalSetup } from 'codemirror'
import { flashExtension, type GenerateSnippet, stepGenAffordance } from '../lib/cm-generate-step.ts'
import { setRunResults, varRunExtension } from '../lib/cm-run.ts'
import { semanticTokens } from '../lib/cm-semantic-tokens.ts'
import { varEditorThemeExt } from '../lib/cm-var-theme.ts'
import { planReplay, type ReplayOp } from '../lib/replay-plan.ts'
import { runSpec } from '../lib/run-client.ts'
import { groupRunInputs } from '../lib/run-grouping.ts'
import { joinStepParamTokens } from '../lib/var-capsule-tokens.ts'
import { varTokenTheme } from '../lib/var-token-theme.ts'
import { workerTransport } from '../lib/worker-transport.ts'

// One shared LSP client (one worker) for the whole page.
let sharedClient: LSPClient | null = null
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

// Transactions produced by replay are tagged so the auto-run listener can tell
// them apart from genuine user edits (a real user edit cancels an active
// replay — the user always wins).
const replayTxn = Annotation.define<boolean>()
const REPLAY_MS = 35 // default per-keystroke delay (overridable via <Editor replayMs>)

type ReplayState = { token: number; timer?: ReturnType<typeof setTimeout> }
const replays = new WeakMap<EditorView, ReplayState>()

function cancelReplay(view: EditorView): void {
  const r = replays.get(view)
  if (r) {
    r.token += 1
    if (r.timer) clearTimeout(r.timer)
    r.timer = undefined
  }
}

// Animate the live document into `target`, one keystroke per `delayMs` tick.
// Always diffs from the *current* doc, so manual edits (before or mid-replay)
// are respected. `onSettled` re-renders the footer once the replay finishes.
function replayTo(view: EditorView, target: string, delayMs: number, onSettled: () => void): void {
  cancelReplay(view)
  // Clicking the footer button moved focus off the editor, which hides the
  // caret. Return focus so the moving cursor stays visible during replay.
  view.focus()
  const r = replays.get(view) ?? { token: 0 }
  replays.set(view, r)
  const token = r.token
  const ops = planReplay(view.state.doc.toString(), target)
  let i = 0
  const step = (): void => {
    const cur = replays.get(view)
    if (!cur || cur.token !== token) return // superseded or cancelled
    if (i >= ops.length) {
      onSettled()
      return
    }
    const op: ReplayOp = ops[i++] as ReplayOp
    if (op.kind === 'insert') {
      const caret = op.at + op.text.length
      view.dispatch({
        changes: { from: op.at, insert: op.text },
        selection: { anchor: caret },
        scrollIntoView: true,
        annotations: replayTxn.of(true),
      })
    } else {
      view.dispatch({
        changes: { from: op.at, to: op.at + 1 },
        selection: { anchor: op.at },
        scrollIntoView: true,
        annotations: replayTxn.of(true),
      })
    }
    cur.timer = setTimeout(step, delayMs)
  }
  step()
}

type FileState = { readonly name: string; readonly text: string }
type FileData = {
  readonly uri: string
  readonly doc: string
  readonly states?: ReadonlyArray<FileState>
}

// Reads this editor's own <File> children straight out of the live DOM —
// no more global group map keyed by a user-supplied string.
function readFiles(editorEl: HTMLElement): FileData[] {
  const out: FileData[] = []
  for (const fileEl of editorEl.querySelectorAll<HTMLElement>('[data-var-file]')) {
    const uri = fileEl.dataset.uri
    if (!uri) continue
    const doc = fileEl.dataset.doc ?? ''
    let states: FileData['states']
    if (fileEl.dataset.states) {
      try {
        states = JSON.parse(fileEl.dataset.states) as FileState[]
      } catch {
        states = undefined // malformed states — the file simply has no replay controls
      }
    }
    out.push({ uri, doc, states })
  }
  return out
}

function filenameOf(uri: string): string {
  return uri.replace(/^file:\/\//, '').replace(/^.*\//, '')
}

function mountEditor(editorEl: HTMLElement): void {
  const files = readFiles(editorEl)
  if (files.length === 0) return

  const mount = editorEl.querySelector<HTMLElement>('.cm-mount')
  const tabsEl = editorEl.querySelector<HTMLElement>('.fe-tabs')
  const footerEl = editorEl.querySelector<HTMLElement>('.fe-footer')
  if (!mount || !tabsEl || !footerEl) return

  const wantLineNumbers = mount.dataset.lineNumbers !== 'false'
  const wantFolding = mount.dataset.folding !== 'false'
  const wantDefine = mount.dataset.define !== 'false'
  const parsedMs = Number(mount.dataset.replayMs)
  const delayMs = Number.isFinite(parsedMs) && parsedMs > 0 ? parsedMs : REPLAY_MS

  const client = lspClient()
  const views = new Map<string, EditorView>()
  const tabButtons = new Map<string, HTMLButtonElement>()
  let activeUri: string = files[0] ? files[0].uri : ''

  // Debounced run across this editor's own files — each <Editor> instance is
  // now its own run unit; no global group-id lookup.
  let runTimer: ReturnType<typeof setTimeout> | undefined
  const scheduleRun = (): void => {
    if (runTimer) clearTimeout(runTimer)
    runTimer = setTimeout(() => void runNow(), 300)
  }
  const runNow = async (): Promise<void> => {
    const mdEntry = [...views.entries()].find(([u]) => u.endsWith('.md'))
    if (!mdEntry) return
    const [, mdView] = mdEntry
    const editors = [...views.entries()].map(([uri, v]) => ({
      uri,
      group: 'editor', // constant within this one call — groupRunInputs only needs a consistent value per call, nothing persists across calls
      source: v.state.doc.toString(),
    }))
    const [input] = groupRunInputs(editors, new Map([['editor', []]]))
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

  function renderFooter(uri: string): void {
    const data = files.find((f) => f.uri === uri)
    footerEl.replaceChildren()
    if (!data?.states || data.states.length < 2) {
      footerEl.hidden = true
      return
    }
    footerEl.hidden = false
    const view = views.get(uri)
    if (!view) return
    const current = view.state.doc.toString()
    for (const state of data.states) {
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'fe-state-btn'
      btn.textContent = state.name
      btn.setAttribute('aria-pressed', String(state.text === current))
      btn.addEventListener('click', () => {
        replayTo(view, state.text, delayMs, () => renderFooter(uri))
      })
      footerEl.appendChild(btn)
    }
  }

  function showFile(uri: string): void {
    activeUri = uri
    for (const [u, view] of views) view.dom.style.display = u === uri ? '' : 'none'
    for (const [u, btn] of tabButtons) btn.setAttribute('aria-selected', String(u === uri))
    renderFooter(uri)
    views.get(uri)?.focus()
  }

  // Re-run (debounced) and refresh the footer on every genuine edit — shared
  // across every file in this editor, since editing *any* of them should
  // reschedule the run. A real user edit cancels an active replay for that
  // view (the user always wins); replay-produced edits don't.
  const autoRun = EditorView.updateListener.of((u) => {
    if (!u.docChanged) return
    const isReplay = u.transactions.some((tr) => tr.annotation(replayTxn))
    if (!isReplay) cancelReplay(u.view)
    if (activeUri) renderFooter(activeUri)
    scheduleRun()
  })

  for (const file of files) {
    const lang = file.uri.endsWith('.ts') ? 'typescript' : 'markdown'
    const language = lang === 'typescript' ? javascript({ typescript: true }) : markdown()
    // basicSetup bundles the line-number and fold gutters. When either is
    // turned off we can't subtract from it, so drop to minimalSetup and add
    // back only the gutters that are wanted.
    const setup: Extension =
      wantLineNumbers && wantFolding
        ? basicSetup
        : [minimalSetup, wantLineNumbers ? lineNumbers() : [], wantFolding ? foldGutter() : []]
    const ext = [
      setup,
      language,
      varEditorThemeExt(),
      varTokenTheme,
      client.plugin(file.uri),
      autoRun,
      flashExtension(),
    ]
    if (lang === 'markdown') {
      ext.push(varRunExtension())
      if (wantDefine) {
        const generate: GenerateSnippet = (text, position) =>
          client.request('var/generateSnippet', { text, uri: file.uri, position }) as Promise<{
            fullCode: string
            expression: string
          }>
        const stepsView = () =>
          [...views.entries()].find(([u]) => u.endsWith('.steps.ts'))?.[1] ?? null
        ext.push(stepGenAffordance({ generate, stepsView }))
      }
    }
    const view = new EditorView({ doc: file.doc, extensions: ext, parent: mount })
    view.dom.style.display = file.uri === activeUri ? '' : 'none'
    views.set(file.uri, view)

    const tabBtn = document.createElement('button')
    tabBtn.type = 'button'
    tabBtn.className = 'fe-tab'
    tabBtn.setAttribute('role', 'tab')
    tabBtn.setAttribute('aria-selected', String(file.uri === activeUri))
    tabBtn.textContent = filenameOf(file.uri)
    tabBtn.addEventListener('click', () => showFile(file.uri))
    tabButtons.set(file.uri, tabBtn)
    tabsEl.appendChild(tabBtn)
  }

  renderFooter(activeUri)
  scheduleRun()
}

function mountAll(): void {
  for (const el of document.querySelectorAll<HTMLElement>('.file-editor')) {
    if (el.dataset.mounted) continue
    el.dataset.mounted = 'true'
    mountEditor(el)
  }
}

mountAll()
