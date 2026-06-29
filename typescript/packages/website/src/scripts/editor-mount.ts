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

// Transactions produced by replay are tagged so the auto-run listener can tell
// them apart from genuine user edits (a real user edit cancels an active replay
// — the user always wins).
const replayTxn = Annotation.define<boolean>()

const REPLAY_MS = 35 // default per-keystroke delay (overridable via `replayMs` prop)

type ReplayState = { token: number; timer?: ReturnType<typeof setTimeout> }
const replays = new WeakMap<EditorView, ReplayState>()

// Per-view UI for the active-state highlight: the ordered states and their
// buttons, so we can mark the button whose text equals the current document.
type StateUI = {
  readonly states: ReadonlyArray<{ name: string; text: string }>
  readonly buttons: ReadonlyArray<HTMLButtonElement>
}
const stateUIs = new WeakMap<EditorView, StateUI>()

function cancelReplay(view: EditorView): void {
  const r = replays.get(view)
  if (r) {
    r.token += 1
    if (r.timer) clearTimeout(r.timer)
    r.timer = undefined
  }
}

// Mark the button whose state text equals the current document; clear the rest.
function refreshActiveState(view: EditorView): void {
  const ui = stateUIs.get(view)
  if (!ui) return
  const current = view.state.doc.toString()
  ui.buttons.forEach((btn, i) => {
    btn.setAttribute('aria-pressed', String(ui.states[i]?.text === current))
  })
}

// Animate the live document into `target`, one keystroke per `delayMs` tick.
// Always diffs from the *current* doc, so manual edits (before or mid-replay)
// are respected.
function replayTo(view: EditorView, target: string, delayMs: number = REPLAY_MS): void {
  cancelReplay(view)
  // Clicking the chrome button moved focus off the editor, which hides the
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
      refreshActiveState(view)
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

// Re-run (debounced) only the group whose editor changed — no run buttons.
// A genuine user edit (not one of our replay transactions) cancels any active
// replay and refreshes the active-state highlight.
function autoRun(groupId: string) {
  return EditorView.updateListener.of((u) => {
    if (!u.docChanged) return
    const isReplay = u.transactions.some((tr) => tr.annotation(replayTxn))
    if (!isReplay) cancelReplay(u.view)
    refreshActiveState(u.view)
    scheduleRun(groupId)
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

  // Wire multi-state replay buttons, if this editor carries states. The buttons
  // were rendered server-side in the enclosing chrome figcaption; bind each to a
  // replay toward its state's text. Wiring is local to mount — no global view map.
  if (el.dataset.states) {
    try {
      const states = JSON.parse(el.dataset.states) as Array<{ name: string; text: string }>
      // Optional per-editor keystroke delay; fall back to the default for a
      // missing or non-positive value.
      const parsedMs = Number(el.dataset.replayMs)
      const delayMs = Number.isFinite(parsedMs) && parsedMs > 0 ? parsedMs : REPLAY_MS
      const figure = el.closest('figure.file-editor')
      const buttons = figure ? [...figure.querySelectorAll<HTMLButtonElement>('.fe-state-btn')] : []
      if (buttons.length === states.length && buttons.length > 0) {
        buttons.forEach((btn, i) => {
          btn.addEventListener('click', () => replayTo(view, states[i].text, delayMs))
        })
        stateUIs.set(view, { states, buttons })
        refreshActiveState(view)
      }
    } catch {
      // Malformed states — the editor simply renders without replay buttons.
    }
  }

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
