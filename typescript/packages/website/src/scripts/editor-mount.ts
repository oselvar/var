import { javascript } from '@codemirror/lang-javascript'
import { markdown } from '@codemirror/lang-markdown'
import { foldGutter } from '@codemirror/language'
import { LSPClient, languageServerExtensions } from '@codemirror/lsp-client'
import { Annotation, EditorSelection, type Extension } from '@codemirror/state'
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

// Collects every mounted <Editor>'s <File> children across the WHOLE page —
// not just the caller's own editor — so the LSP worker can cross-reference
// specs against step definitions even if they live in a different <Editor>
// instance. Called once, before the worker is created, so the full seed is
// known upfront.
function collectPageSeed(): Record<string, string> {
  const seed: Record<string, string> = {}
  for (const fileEl of document.querySelectorAll<HTMLElement>('[data-var-file]')) {
    const uri = fileEl.dataset.uri
    if (!uri) continue
    const path = uri.replace(/^file:\/\/\//, '/')
    // A versioned <File> keeps its document on the first <Version> child.
    const firstVersion = fileEl.querySelector<HTMLElement>('[data-var-version]')
    seed[path] = firstVersion?.dataset.doc ?? fileEl.dataset.doc ?? ''
  }
  return seed
}

function lspClient(): LSPClient {
  if (sharedClient) return sharedClient
  const worker = new Worker(new URL('../lib/var-worker.ts', import.meta.url), { type: 'module' })
  const channel = new MessageChannel()
  worker.postMessage({ seed: collectPageSeed() }, [channel.port2])
  // MessagePort queues are disabled until either the `onmessage` property is
  // assigned or `.start()` is called explicitly — unlike a Worker's default
  // channel, which is implicitly active. workerTransport() attaches via
  // addEventListener (not `.onmessage=`) so it works unchanged for a Worker,
  // but a raw MessagePort like channel.port1 needs this explicit kick or
  // every message queued on it (i.e. every LSP response) is silently
  // dropped and requests hang until they time out.
  channel.port1.start()
  sharedClient = new LSPClient({
    extensions: [
      ...languageServerExtensions(),
      semanticTokens({
        legend: { tokenTypes: ['function', 'parameter'] },
        transform: joinStepParamTokens,
      }),
    ],
  }).connect(workerTransport(channel.port1))
  return sharedClient
}

// Transactions produced by replay are tagged so the auto-run listener can tell
// them apart from genuine user edits (a real user edit cancels an active
// replay — the user always wins).
const replayTxn = Annotation.define<boolean>()
const REPLAY_MS = 35 // default per-keystroke delay (overridable via <Editor replayMs>)

type ReplayState = {
  token: number
  timer?: ReturnType<typeof setTimeout>
  // Resolves the pending replayTo() promise. Called on completion AND on
  // cancellation — callers only need to know the replay is over, not why.
  settle?: () => void
}
const replays = new WeakMap<EditorView, ReplayState>()

function cancelReplay(view: EditorView): void {
  const r = replays.get(view)
  if (r) {
    r.token += 1
    if (r.timer) clearTimeout(r.timer)
    r.timer = undefined
    r.settle?.()
    r.settle = undefined
  }
}

// One keyboard-sized caret step from `cur` toward `target`: vertical
// line-by-line with the column carried along and clamped (like holding ↓/↑),
// then word-boundary hops within the target line (like holding ⌥←/⌥→),
// clamped so the caret lands exactly on the target.
function nextCaretStep(view: EditorView, cur: number, target: number): number {
  const doc = view.state.doc
  const curLine = doc.lineAt(cur)
  const targetLine = doc.lineAt(target)
  if (curLine.number !== targetLine.number) {
    const next = doc.line(curLine.number + (targetLine.number > curLine.number ? 1 : -1))
    return Math.min(next.from + (cur - curLine.from), next.to)
  }
  const forward = target > cur
  const hopped = view.moveByGroup(EditorSelection.cursor(cur), forward).head
  if (hopped === cur) return target // at a document edge — don't stall
  return forward ? Math.min(hopped, target) : Math.max(hopped, target)
}

// Animate the live document into `target`, one keystroke per `delayMs` tick.
// Always diffs from the *current* doc, so manual edits (before or mid-replay)
// are respected. The returned promise settles when the replay reaches the
// target OR is cancelled/superseded — it never rejects.
function replayTo(view: EditorView, target: string, delayMs: number): Promise<void> {
  cancelReplay(view)
  // Clicking the version button moved focus off the editor, which hides the
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
      cur.settle?.()
      cur.settle = undefined
      return
    }
    const op: ReplayOp = ops[i] as ReplayOp
    // Walk the caret to the edit location first — a visible arrow-key travel
    // instead of a teleport when the next edit is far from where it sits.
    // (A backspace-style delete sits *after* the char it removes.)
    const editCaret = op.kind === 'insert' ? op.at : op.at + 1
    const head = view.state.selection.main.head
    if (head !== editCaret) {
      view.dispatch({
        selection: { anchor: nextCaretStep(view, head, editCaret) },
        scrollIntoView: true,
        annotations: replayTxn.of(true),
      })
      cur.timer = setTimeout(step, delayMs)
      return
    }
    i++
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
  return new Promise((resolve) => {
    r.settle = resolve
    step()
  })
}

type VersionData = { readonly label: string; readonly doc: string }
type FileData = {
  readonly uri: string
  readonly doc: string
  // ≥2 entries when authored with <Version> children; undefined otherwise.
  readonly versions?: ReadonlyArray<VersionData>
}

// Reads this editor's own <File> children straight out of the live DOM —
// no more global group map keyed by a user-supplied string.
function readFiles(editorEl: HTMLElement): FileData[] {
  const out: FileData[] = []
  for (const fileEl of editorEl.querySelectorAll<HTMLElement>('[data-var-file]')) {
    const uri = fileEl.dataset.uri
    if (!uri) continue
    const versions = [...fileEl.querySelectorAll<HTMLElement>('[data-var-version]')].map((v) => ({
      label: v.dataset.label ?? '',
      doc: v.dataset.doc ?? '',
    }))
    const doc = versions.length > 0 ? (versions[0]?.doc ?? '') : (fileEl.dataset.doc ?? '')
    out.push({ uri, doc, versions: versions.length >= 2 ? versions : undefined })
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
  if (!mount || !tabsEl) return

  const wantLineNumbers = mount.dataset.lineNumbers !== 'false'
  const wantFolding = mount.dataset.folding !== 'false'
  const wantDefine = mount.dataset.define !== 'false'
  const parsedMs = Number(mount.dataset.replayMs)
  const delayMs = Number.isFinite(parsedMs) && parsedMs > 0 ? parsedMs : REPLAY_MS

  const client = lspClient()
  const views = new Map<string, EditorView>()
  const panes = new Map<string, HTMLElement>() // uri -> wrapper div hosting that file's view
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

  // Cycling version button — one per editor, floating in the mount's top-right
  // corner. It always advertises the *next* version of the active file
  // (wrapping), and clicking it types that version into the view via replay.
  // While the replay runs the button is disabled and keeps the clicked label
  // with a spinner to its left; it only advances to advertise the following
  // version once the replay settles (finished or cancelled by a user edit).
  const versionIndex = new Map<string, number>() // uri -> last applied version
  let busyUri: string | null = null // uri whose replay is in flight, if any
  const versionBtn = document.createElement('button')
  versionBtn.type = 'button'
  versionBtn.className =
    'fe-version-btn absolute top-2 right-2 z-10 px-2 py-0.5 font-mono text-[12px] rounded-none border border-line bg-surface text-ink cursor-pointer hover:bg-raised disabled:opacity-60 disabled:cursor-default disabled:hover:bg-surface'
  const activeVersions = (): ReadonlyArray<VersionData> | undefined =>
    files.find((f) => f.uri === activeUri)?.versions

  function renderVersionBtn(): void {
    const versions = activeVersions()
    if (!versions) {
      versionBtn.style.display = 'none'
      return
    }
    versionBtn.style.display = ''
    const busy = busyUri === activeUri
    versionBtn.disabled = busy
    const cur = versionIndex.get(activeUri) ?? 0
    // Busy: the version being typed (already stored in versionIndex).
    // Idle: the next one, wrapping.
    const label = versions[busy ? cur : (cur + 1) % versions.length]?.label ?? ''
    const children: Node[] = []
    if (busy) {
      const spinner = document.createElement('span')
      spinner.className =
        'inline-block w-3 h-3 mr-1.5 align-[-1px] rounded-full border-2 border-current border-t-transparent animate-spin'
      spinner.setAttribute('aria-hidden', 'true')
      children.push(spinner)
    }
    children.push(document.createTextNode(label))
    versionBtn.replaceChildren(...children)
  }

  versionBtn.addEventListener('click', () => {
    const versions = activeVersions()
    const view = views.get(activeUri)
    if (!versions || !view || busyUri === activeUri) return
    const uri = activeUri
    const next = ((versionIndex.get(uri) ?? 0) + 1) % versions.length
    versionIndex.set(uri, next)
    busyUri = uri
    renderVersionBtn()
    void replayTo(view, versions[next]?.doc ?? '', delayMs).then(() => {
      // Another file's replay may have taken over the flag in the meantime.
      if (busyUri === uri) busyUri = null
      renderVersionBtn()
    })
  })

  function showFile(uri: string): void {
    activeUri = uri
    for (const [u, pane] of panes) pane.style.display = u === uri ? '' : 'none'
    for (const [u, btn] of tabButtons) btn.setAttribute('aria-selected', String(u === uri))
    renderVersionBtn()
    views.get(uri)?.focus()
  }

  // Re-run (debounced) on every edit — shared across every file in this
  // editor, since editing *any* of them should reschedule the run. A real
  // user edit cancels an active replay for that view (the user always wins);
  // replay-produced edits don't.
  const autoRun = EditorView.updateListener.of((u) => {
    if (!u.docChanged) return
    const isReplay = u.transactions.some((tr) => tr.annotation(replayTxn))
    if (!isReplay) cancelReplay(u.view)
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
    // CodeMirror's own base theme sets `.cm-editor { display: flex !important }`
    // (to protect its internal layout from outer CSS), which beats a plain
    // (non-!important) inline `display: none` on view.dom directly — so hide a
    // wrapper pane around the view instead of the view's own root element.
    const pane = document.createElement('div')
    pane.style.display = file.uri === activeUri ? '' : 'none'
    mount.appendChild(pane)
    const view = new EditorView({ doc: file.doc, extensions: ext, parent: pane })
    views.set(file.uri, view)
    panes.set(file.uri, pane)

    const tabBtn = document.createElement('button')
    tabBtn.type = 'button'
    tabBtn.className =
      'fe-tab relative top-px -mb-px px-[14px] py-[7px] font-mono font-semibold text-[13px] leading-none bg-transparent border border-line-subtle rounded-none text-ink opacity-60 cursor-pointer hover:opacity-100 hover:bg-raised aria-selected:opacity-100 aria-selected:bg-[var(--ed-bg)] aria-selected:border-b-[var(--ed-bg)]'
    tabBtn.setAttribute('role', 'tab')
    tabBtn.setAttribute('aria-selected', String(file.uri === activeUri))
    tabBtn.textContent = filenameOf(file.uri)
    tabBtn.addEventListener('click', () => showFile(file.uri))
    tabButtons.set(file.uri, tabBtn)
    tabsEl.appendChild(tabBtn)
  }

  mount.appendChild(versionBtn)
  renderVersionBtn()
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
