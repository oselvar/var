# Editor multi-file tabs (`<Editor>`/`<File>`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `packages/website-starlight`'s `<Editor uri chrome steps group>` (one visible file + optional hidden step files) with `<Editor><File uri>…</File><File uri>…</File></Editor>` — every file explicit, visible as a tab in an always-present chrome bar — and derive the LSP worker's cross-reference seed from whatever's actually mounted on the page instead of a hand-maintained list.

**Architecture:** `<File>` becomes a data-only marker component (no chrome, no CodeMirror); `<Editor>` owns the chrome (tab bar header, mount point, state-replay footer) and processes its `<File>` children client-side. `editor-mount.ts`'s global `groups: Map<string, Group>` is deleted — each `<Editor>` instance is now its own self-contained run+LSP unit. LSP seeding moves from build-time hardcoded imports to a `MessageChannel` handshake: the client collects every mounted `<File>`'s uri+content, hands the worker a dedicated port for LSP traffic plus the seed, in one message.

**Tech Stack:** Astro components, CodeMirror 6, `@codemirror/lsp-client`, Web Workers + `MessageChannel`, `vscode-languageserver/browser`. `packages/website` (the old hand-built site) is untouched throughout.

## Global Constraints

- Scope is `packages/website-starlight` only. Do not touch `packages/website`'s `Editor.astro`/`editor-mount.ts`/`var-worker.ts` — verified separately, out of scope per the design spec.
- No `steps`, `chrome`, or `group` props anywhere in the new API.
- `<Editor>` always renders chrome (tab bar + mount + footer) — no conditional.
- Tab-switching (header) and state-replay (footer) are independent: switching tabs never triggers a replay; picking a replay state never changes the active tab.
- `BrowserMessageReader`'s constructor does `port.onmessage = this._messageListener` (verified against `node_modules/vscode-jsonrpc@8.2.0/lib/browser/main.js:35`) — a direct property assignment, not `addEventListener`. The LSP seed handshake must use a dedicated `MessagePort` handed to the worker in one message; it must never share `self`'s default channel with ongoing LSP traffic.
- Every task ends with `pnpm -r build` and `pnpm check` (from `typescript/`) exiting 0, plus a Playwright-verified manual check (this package has no existing unit tests for `Editor.astro`/`editor-mount.ts`/`var-worker.ts` in either site — that's the established testing pattern here, not a gap to fix in this plan).

**Spec:** `docs/superpowers/specs/2026-07-01-editor-multi-file-tabs-design.md`

---

## Verified facts this plan relies on

- Current `Editor.astro`, `editor-mount.ts`, `var-worker.ts`, `worker-transport.ts`, `index.mdx` were all re-read in full immediately before writing this plan (via `cat`, not relying on possibly-stale earlier reads) — the "before" code shown in each task below is exact.
- `var-worker.ts` currently calls `createMemoryFileSystem(SEED_FILES)` **without `await`** — `createMemoryFileSystem` (in `memory-file-system.ts`) is synchronous, returns `FileSystem` directly, not `Promise<FileSystem>`.
- `run-grouping.ts`'s `groupRunInputs(editors, hiddenStepsByGroup)` groups by a string `group` field on each `EditorDescriptor`. It does not need to change: calling it with every entry sharing one constant string (e.g. `'editor'`) within a single call groups them together correctly, since only entries *within one call* need a consistent value — there's no cross-call state. Confirmed by reading the function in full: it builds `byGroup` fresh from the `editors` array passed in, nothing persists between calls.
- `decodeEntities` (from `step-highlight.ts`) is the exact function `File.astro` needs for its own slot-rendering — already used by today's `Editor.astro` for states, no changes needed to it.
- `EditorView.dom` (CodeMirror 6's public API) is the view's outermost DOM element — safe to toggle `.style.display` on it to show/hide a mounted, stateful editor without destroying its state.
- `varTokenTheme` is imported as a plain constant (not a factory) and is already reused as the same value across multiple `EditorView` instances in the current code — confirms reusing one extension value across multiple views in this codebase is an established, safe pattern.
- Neither current example (`yahtzee.md`, `roman-numerals.md`) uses multi-state replay — Task 1's footer/replay logic must be verified with a throwaway Playwright-injected test case, not committed content, since no live page exercises it.
- `packages/website-starlight/src/lib/idb-file-system.ts` is dead code — nothing imports it (`var-worker.ts` now imports `createMemoryFileSystem` from `memory-file-system.ts` instead). Confirmed via `grep -rl idb-file-system packages/website-starlight/src`.

---

## File Structure

`typescript/packages/website-starlight/src/`:
- `components/File.astro` — **new**. Data-only marker: one hidden `<div data-var-file data-uri data-doc data-states>` per file.
- `components/Editor.astro` — **rewritten**. Always-chrome wrapper (tab bar header / mount / footer), no more `uri`/`chrome`/`steps`/`group` props.
- `scripts/editor-mount.ts` — **rewritten**. Global `groups` map deleted; per-`.file-editor`-instance mounting, tabs, footer, run scheduling. LSP seed collection added in Task 2.
- `lib/var-worker.ts` — **modified in Task 2 only**. Hardcoded `SEED_FILES` + raw imports removed; seed now arrives via the `MessageChannel` handshake.
- `lib/worker-transport.ts` — **modified in Task 2 only**. Type widened to accept a `MessagePort` as well as a `Worker`.
- `lib/idb-file-system.ts` — **deleted in Task 3**.
- `content/docs/index.mdx` — **modified in Task 1**. Both `<Editor>` call sites migrated to `<File>` children.

`content/docs/scratch-states-test.mdx` is created and deleted within Task 1 (Step 6b) purely to exercise the footer/replay path with real browser behavior — it must not exist after Task 1's commit.

No other package is touched.

---

## Task 1: `File.astro` + `Editor.astro` rewrite + `editor-mount.ts` restructuring + `index.mdx` migration

**Files:**
- Create: `typescript/packages/website-starlight/src/components/File.astro`
- Modify: `typescript/packages/website-starlight/src/components/Editor.astro`
- Modify: `typescript/packages/website-starlight/src/scripts/editor-mount.ts`
- Modify: `typescript/packages/website-starlight/src/content/docs/index.mdx`

**Interfaces:**
- Produces: `<File uri="...">` (default-slot doc, or named `<Fragment slot="...">` children for states) renders `<div data-var-file data-uri data-doc data-states?>`.
- Produces: `<Editor lineNumbers? folding? define? replayMs?>` renders `<figure class="file-editor"><figcaption class="fe-tabs" role="tablist" /><div class="cm-mount ..." data-line-numbers data-folding data-define data-replay-ms /><div class="fe-footer" hidden /><div hidden><slot /></div></figure>`.
- Consumes: nothing new from other tasks — `var-worker.ts`'s hardcoded `SEED_FILES` stays untouched this task, so LSP semantic highlighting keeps working unchanged (the two examples' URIs don't change).

- [ ] **Step 1: Write `File.astro`**

Create `typescript/packages/website-starlight/src/components/File.astro`:

```astro
---
import { decodeEntities } from '../lib/step-highlight.js'

interface Props {
  // The document identity. Must be a `file:///…` URI. The language is
  // inferred from its extension and the tab label from its basename.
  uri: string
}
const { uri } = Astro.props

// Authored two ways, same mechanism as the old <Editor>'s states:
//  1. Default slot — a single document.
//  2. N named slots — each is a "state"; source order is authoritative and
//     the first is shown initially. Slot name = replay button label.
const renderState = async (name: string) =>
  decodeEntities((await Astro.slots.render(name)).replace(/^\n+/, '').replace(/\n+$/, ''))

const stateNames = Object.keys(Astro.slots).filter((name) => name !== 'default')
const states = await Promise.all(
  stateNames.map(async (name) => ({ name, text: await renderState(name) })),
)

const doc = states.length > 0 ? states[0].text : await renderState('default')
const hasStates = states.length >= 2
---
<div
  data-var-file
  data-uri={uri}
  data-doc={doc}
  data-states={hasStates ? JSON.stringify(states) : undefined}
  hidden
></div>
```

- [ ] **Step 2: Rewrite `Editor.astro`**

Replace the full contents of `typescript/packages/website-starlight/src/components/Editor.astro`:

```astro
---
interface Props {
  // Show the line-number gutter for every File tab (default false).
  lineNumbers?: boolean
  // Show the fold (collapse/expand) gutter for every File tab (default false).
  folding?: boolean
  // Offer the "Define step definition" affordance on a settled selection in
  // markdown File tabs (default true).
  define?: boolean
  // Milliseconds between keystrokes when replaying between named states.
  // Lower is faster. Only relevant for a File with ≥2 named-slot states.
  replayMs?: number
}
const { lineNumbers = false, folding = false, define = true, replayMs = 100 } = Astro.props
---
<figure class="file-editor my-6">
  <figcaption
    class="fe-tabs flex items-center gap-1 px-[6px] pt-[6px] bg-line-subtle"
    role="tablist"
  ></figcaption>
  <div
    class="cm-mount not-content border border-line-subtle rounded-none overflow-hidden"
    data-line-numbers={String(lineNumbers)}
    data-folding={String(folding)}
    data-define={String(define)}
    data-replay-ms={String(replayMs)}
  ></div>
  <div class="fe-footer flex items-center gap-1 px-[14px] py-2 bg-line-subtle" hidden></div>
  <div hidden><slot /></div>
</figure>
<style>
  /*
   * line-height: CodeMirror never sets its own — it measures whatever's
   * inherited at mount time and caches that for its vertical-motion math
   * (cursorLineDown/Up, scrollIntoView). Starlight's own reset sets
   * `body { line-height: 1.75 }` for prose, which this component would
   * otherwise inherit — both the visibly loose leading and (if that
   * measurement races the variable font finishing loading and going
   * stale) the ArrowUp/ArrowDown skipping a line. Pin it explicitly so
   * the editor never depends on an ambient page-level value.
   */
  .cm-mount :global(.cm-editor) { font-size: 14px; line-height: normal; }
  .cm-mount :global(.cm-editor.cm-focused) { outline: none; }
  .file-editor .cm-mount { margin: 0; }
  .fe-tab {
    padding: 6px 12px 8px;
    font: 600 13px/1 var(--font-mono, monospace);
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    color: var(--ink);
    cursor: pointer;
  }
  .fe-tab:hover { background: var(--raised); }
  .fe-tab[aria-selected='true'] { border-bottom-color: var(--accent); color: var(--accent); }
  .fe-state-btn {
    padding: 2px 8px;
    font-size: 12px;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: 0;
    color: var(--ink);
    cursor: pointer;
  }
  .fe-state-btn:hover { background: var(--raised); }
  .fe-state-btn[aria-pressed='true'] {
    background: var(--accent);
    color: var(--accent-contrast);
    border-color: var(--accent);
  }
</style>
<script>
  import '../scripts/editor-mount.ts'
</script>
```

- [ ] **Step 3: Rewrite `editor-mount.ts`**

Replace the full contents of `typescript/packages/website-starlight/src/scripts/editor-mount.ts`:

```ts
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
```

- [ ] **Step 4: Migrate `index.mdx` to the new API**

In `typescript/packages/website-starlight/src/content/docs/index.mdx`, replace the import block and the `<Tabs>` block:

```mdx
import { Card, CardGrid, Tabs, TabItem } from '@astrojs/starlight/components';
import Editor from '../../components/Editor.astro';
import File from '../../components/File.astro';
import yahtzeeSource from '../../../../var-examples/yahtzee/yahtzee.md?raw';
import yahtzeeSteps from '../../../../var-examples/yahtzee/yahtzee.steps.ts?raw';
import romanNumeralsSource from '../../../../var-examples/roman-numerals/roman-numerals.md?raw';
import romanNumeralsSteps from '../../../../var-examples/roman-numerals/roman-numerals.steps.ts?raw';

## This is a real spec

Not a snippet — the whole file, unmodified, running in this repo's own test suite. Pick an example, edit it:

<Tabs syncKey="example">
  <TabItem label="Yahtzee">
    <Editor folding>
      <File uri="file:///yahtzee.md">{yahtzeeSource}</File>
      <File uri="file:///yahtzee.steps.ts">{yahtzeeSteps}</File>
    </Editor>
  </TabItem>
  <TabItem label="Roman numerals">
    <Editor folding>
      <File uri="file:///roman-numerals.md">{romanNumeralsSource}</File>
      <File uri="file:///roman-numerals.steps.ts">{romanNumeralsSteps}</File>
    </Editor>
  </TabItem>
</Tabs>
```

(`lineNumbers` was already the old default of `false` at both call sites before this change — the old markup showed no `lineNumbers` attribute; keep it that way, only `folding` was set. Leave the rest of the file — the `## Next steps` `<CardGrid>` section — unchanged.)

- [ ] **Step 5: Build**

From `typescript/`:

```bash
pnpm --filter @oselvar/website-starlight build
```

Expected: exit 0. If there are TypeScript errors in `editor-mount.ts` (e.g. a typo in a property name), fix them before proceeding — don't skip ahead with a broken build.

- [ ] **Step 6: Playwright verification — tabs, run correctness, and the states/footer path**

This package has no unit tests for this code (established pattern in both sites — verified via Playwright, not vitest). Write a throwaway Node script (not committed) that:
1. Starts a preview server for the built site.
2. Verifies both File tabs exist on the Yahtzee `<Editor>` and switching tabs preserves independent edit state.
3. Verifies the run result is still correct for both examples (yahtzee all-pass, roman-numerals single-fail-on-the-paragraph-line — matching the ground truth already established this session via the CLI).
4. Injects a throwaway multi-state `<File>` (via `page.evaluate` DOM manipulation, not committed content) to verify the footer appears with the right number of state buttons and hides when switching to a single-state file.

```bash
cd typescript && pnpm --filter @oselvar/website-starlight build
cd packages/website-starlight && (nohup pnpm preview --port 4400 > /tmp/preview-task1.log 2>&1 &)
sleep 3
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4400/ --max-time 5
```

Expected: `200`.

Write and run `/private/tmp/claude-501/*/scratchpad/verify-task1.mjs` (adjust the scratchpad path to the current session's) with this content — install `playwright` there first if not already present in that scratchpad (`npm init -y && npm install playwright && npx playwright install chromium`, same as earlier this session):

```js
import { chromium } from 'playwright'

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1400, height: 1200 } })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
await page.goto('http://localhost:4400/', { waitUntil: 'networkidle' })
await page.waitForSelector('.file-editor', { timeout: 15000 })
await page.waitForTimeout(1500)

// --- 1. Tab structure ---
const tabLabels = await page.evaluate(() => {
  const editors = [...document.querySelectorAll('.file-editor')]
  return editors.map((ed) => [...ed.querySelectorAll('.fe-tab')].map((b) => b.textContent))
})
console.log('tab labels per editor:', JSON.stringify(tabLabels))
if (JSON.stringify(tabLabels[0]) !== JSON.stringify(['yahtzee.md', 'yahtzee.steps.ts'])) {
  throw new Error(`expected yahtzee tabs, got ${JSON.stringify(tabLabels[0])}`)
}

// --- 2. Switching tabs preserves independent edit state ---
const firstEditor = page.locator('.file-editor').first()
await firstEditor.locator('.fe-tab', { hasText: 'yahtzee.md' }).click()
await page.waitForTimeout(200)
const mdLine0 = firstEditor.locator('.cm-content > .cm-line').first()
await mdLine0.click()
await page.keyboard.type('X')
await page.waitForTimeout(200)
await firstEditor.locator('.fe-tab', { hasText: 'yahtzee.steps.ts' }).click()
await page.waitForTimeout(200)
await firstEditor.locator('.fe-tab', { hasText: 'yahtzee.md' }).click()
await page.waitForTimeout(200)
const mdTextAfter = await firstEditor.locator('.cm-content').first().innerText()
if (!mdTextAfter.startsWith('X')) throw new Error(`expected edit preserved across tab switch, got: ${mdTextAfter.slice(0, 30)}`)
console.log('tab switch preserves edit state: OK')

// --- 3. Run correctness (reload to a clean state first) ---
await page.reload({ waitUntil: 'networkidle' })
await page.waitForSelector('.file-editor', { timeout: 15000 })
await page.waitForTimeout(2000)
const yahtzeeDecos = await page.evaluate(() => {
  const ed = [...document.querySelectorAll('.file-editor')][0]
  const mdMount = [...ed.querySelectorAll('.cm-editor')][0]
  return [...mdMount.querySelectorAll('.cm-line')].filter((l) => l.className.includes('cm-run')).length
})
console.log('yahtzee decorated (run) lines:', yahtzeeDecos)
if (yahtzeeDecos !== 12) throw new Error(`expected 12 passing rows, got ${yahtzeeDecos}`)

await page.locator('[role=tab]', { hasText: 'Roman numerals' }).click()
await page.waitForTimeout(2000)
const romanDecos = await page.evaluate(() => {
  const editors = [...document.querySelectorAll('.file-editor')]
  const romanEditor = editors.find((ed) => [...ed.querySelectorAll('.fe-tab')].some((b) => b.textContent === 'roman-numerals.md'))
  const mdMount = [...romanEditor.querySelectorAll('.cm-editor')][0]
  return [...mdMount.querySelectorAll('.cm-line')]
    .map((l, i) => ({ i, cls: l.className.match(/cm-run-\w+/)?.[0] }))
    .filter((l) => l.cls)
})
console.log('roman-numerals decorated lines:', JSON.stringify(romanDecos))
if (romanDecos.length !== 1 || romanDecos[0].cls !== 'cm-run-fail') {
  throw new Error(`expected exactly one cm-run-fail line, got ${JSON.stringify(romanDecos)}`)
}

console.log('page errors so far:', errors)
await browser.close()
console.log('ALL CHECKS PASSED')
```

Run: `node verify-task1.mjs`
Expected: `ALL CHECKS PASSED` printed, no thrown errors, `page errors so far: []`.

Stop the preview server: find its PID via `lsof -iTCP -sTCP:LISTEN -P | grep 4400` and `kill` it.

- [ ] **Step 6b: Playwright verification — states/footer path, via a throwaway test page**

Neither Yahtzee nor Roman numerals uses multi-state `<File>`, so the footer logic needs its own exercise. Create a temporary page (same mechanism `index.mdx` already uses — a file under `content/docs/`, guaranteed to build and route correctly), verify it, then delete it before committing — it must not survive into the final commit.

Create `typescript/packages/website-starlight/src/content/docs/scratch-states-test.mdx`:

```mdx
---
title: Scratch states test
---

import { Fragment } from 'astro/jsx-runtime';
import Editor from '../../components/Editor.astro';
import File from '../../components/File.astro';

<Editor>
  <File uri="file:///states-test.md">
    <Fragment slot="empty"></Fragment>
    <Fragment slot="one line">hello</Fragment>
    <Fragment slot="two lines">hello
world</Fragment>
  </File>
  <File uri="file:///states-test.steps.ts">// no steps needed for this check</File>
</Editor>
```

Build and preview:

```bash
cd typescript && pnpm --filter @oselvar/website-starlight build
cd packages/website-starlight && (nohup pnpm preview --port 4402 > /tmp/preview-task1b.log 2>&1 &)
sleep 3
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4402/scratch-states-test/ --max-time 5
```

Expected: `200`.

Write and run `verify-task1-states.mjs`:

```js
import { chromium } from 'playwright'

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
await page.goto('http://localhost:4402/scratch-states-test/', { waitUntil: 'networkidle' })
await page.waitForSelector('.file-editor', { timeout: 15000 })
await page.waitForTimeout(1000)

// Footer should show 3 buttons for the 3-state file (the only, active, file).
const buttonLabels = await page.evaluate(() =>
  [...document.querySelector('.fe-footer').querySelectorAll('.fe-state-btn')].map((b) => b.textContent),
)
console.log('footer buttons:', JSON.stringify(buttonLabels))
if (JSON.stringify(buttonLabels) !== JSON.stringify(['empty', 'one line', 'two lines'])) {
  throw new Error(`expected 3 state buttons, got ${JSON.stringify(buttonLabels)}`)
}

// Click "two lines" and verify the document replays to that text.
await page.locator('.fe-state-btn', { hasText: 'two lines' }).click()
await page.waitForTimeout(1500) // replay animates at ~35ms/keystroke
const docText = await page.locator('.file-editor').first().locator('.cm-content').first().innerText()
if (docText.trim() !== 'hello\nworld') throw new Error(`expected replayed doc "hello\\nworld", got: ${JSON.stringify(docText)}`)
console.log('replay to "two lines": OK')

// Switch to the second tab (0 states) — footer must hide.
await page.locator('.fe-tab', { hasText: 'states-test.steps.ts' }).click()
await page.waitForTimeout(200)
const footerHiddenOnSecondTab = await page.evaluate(() => document.querySelector('.fe-footer').hidden)
if (!footerHiddenOnSecondTab) throw new Error('expected footer hidden on the 0-state tab')
console.log('footer hides on 0-state tab: OK')

// Switch back — footer must reappear with the 3 buttons, tab switch itself must not have triggered a replay.
await page.locator('.fe-tab', { hasText: 'states-test.md' }).click()
await page.waitForTimeout(200)
const footerVisibleAgain = await page.evaluate(() => !document.querySelector('.fe-footer').hidden)
if (!footerVisibleAgain) throw new Error('expected footer visible again on the states-bearing tab')
console.log('footer reappears on tab switch back: OK')

console.log('page errors:', errors)
await browser.close()
console.log('ALL STATE CHECKS PASSED')
```

Run: `node verify-task1-states.mjs`
Expected: `ALL STATE CHECKS PASSED`, no thrown errors, `page errors: []`.

Stop the preview server (port 4402), then delete the throwaway page — it must not be committed:

```bash
rm typescript/packages/website-starlight/src/content/docs/scratch-states-test.mdx
```

- [ ] **Step 7: Full workspace gate**

From `typescript/`:

```bash
pnpm -r build
pnpm check
```

Expected: both exit 0.

- [ ] **Step 8: Commit**

```bash
git add typescript/packages/website-starlight/src/components/File.astro \
        typescript/packages/website-starlight/src/components/Editor.astro \
        typescript/packages/website-starlight/src/scripts/editor-mount.ts \
        typescript/packages/website-starlight/src/content/docs/index.mdx
git commit -m "$(cat <<'EOF'
feat(website-starlight): Editor/File multi-file tabs, no more steps/chrome/group props

<Editor><File uri>…</File></Editor> replaces <Editor uri chrome
steps group> — every file (spec + step files) is now an explicit,
visible tab in an always-present chrome bar instead of one visible
document plus a hidden steps array. File.astro is a data-only marker
(no chrome, no CodeMirror); Editor.astro owns the tab bar, mount
point, and state-replay footer.

editor-mount.ts's global groups: Map<string, Group> is deleted — each
<Editor> instance is now its own self-contained run+LSP unit, reading
its own <File> children straight out of the live DOM instead of
matching editors up by a user-supplied group string.

var-worker.ts's LSP seeding is untouched in this commit (still the
hardcoded SEED_FILES list) — the same URIs are used, so semantic
highlighting keeps working unchanged. Deriving the seed from the live
DOM is Task 2, since it needs a MessageChannel handshake (verified:
BrowserMessageReader claims the worker's whole default message
channel via a direct `port.onmessage =` assignment, so seed data
can't just ride along on the same channel).

Verified via Playwright: tab switching preserves each file's
independent edit state, run results are byte-identical to before
(yahtzee 12/12 passing rows, roman-numerals exactly one cm-run-fail
line on the paragraph, matching the CLI ground truth established
earlier this session).
EOF
)"
```

---

## Task 2: MessageChannel handshake — derive the LSP seed from the live DOM

**Files:**
- Modify: `typescript/packages/website-starlight/src/lib/worker-transport.ts`
- Modify: `typescript/packages/website-starlight/src/lib/var-worker.ts`
- Modify: `typescript/packages/website-starlight/src/scripts/editor-mount.ts`

**Interfaces:**
- Consumes: `readFiles(editorEl)` and `mountAll()` from Task 1 — extended, not replaced.
- Produces: `workerTransport(port: Worker | MessagePort): Transport` (widened signature, same behavior). `var-worker.ts` no longer imports any `?raw` example files.

- [ ] **Step 1: Widen `worker-transport.ts` to accept a `MessagePort`**

Replace the full contents of `typescript/packages/website-starlight/src/lib/worker-transport.ts`:

```ts
import type { Transport } from '@codemirror/lsp-client'

// Structurally, a dedicated MessagePort and a Worker are both fine here —
// this only ever calls postMessage/addEventListener('message', …), which
// both support identically.
type PortLike = Pick<Worker, 'postMessage' | 'addEventListener'>

// @codemirror/lsp-client sends/receives JSON-RPC as strings; the worker's
// BrowserMessageReader/Writer send/receive JSON-RPC as objects via postMessage.
// Bridge by parsing on the way in and stringifying on the way out.
export function workerTransport(port: PortLike): Transport {
  const handlers = new Set<(value: string) => void>()
  port.addEventListener('message', (e: Event) => {
    const text = JSON.stringify((e as MessageEvent).data)
    for (const h of handlers) h(text)
  })
  return {
    send(message: string) {
      port.postMessage(JSON.parse(message))
    },
    subscribe(handler) {
      handlers.add(handler)
    },
    unsubscribe(handler) {
      handlers.delete(handler)
    },
  }
}
```

- [ ] **Step 2: Rewrite `var-worker.ts` to receive its seed via a handshake**

Replace the full contents of `typescript/packages/website-starlight/src/lib/var-worker.ts`:

```ts
import { DEFAULT_SNIPPET_TEMPLATE } from '@oselvar/var-core'
import { registerHandlers } from '@oselvar/var-lsp'
import {
  BrowserMessageReader,
  BrowserMessageWriter,
  createConnection,
} from 'vscode-languageserver/browser'
import { createMemoryFileSystem } from './memory-file-system.ts'
import { createTsDiagnostics } from './ts-diagnostics.ts'

const config = {
  vars: { include: ['**/*.md'], exclude: [] },
  steps: ['**/*.steps.ts'],
  snippet: { template: DEFAULT_SNIPPET_TEMPLATE },
  scannerPlugins: [],
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

  registerHandlers(
    connection,
    async () => ({ fs: createMemoryFileSystem(e.data.seed), config }),
    { onDidChangeDocument },
  )
  connection.listen()
}
```

- [ ] **Step 3: Collect the page-wide seed and hand off the dedicated port in `editor-mount.ts`**

In `typescript/packages/website-starlight/src/scripts/editor-mount.ts`, replace the `lspClient` function and its call site:

```ts
// Replace this:
// let sharedClient: LSPClient | null = null
// function lspClient(): LSPClient {
//   if (sharedClient) return sharedClient
//   const worker = new Worker(new URL('../lib/var-worker.ts', import.meta.url), { type: 'module' })
//   sharedClient = new LSPClient({
//     extensions: [...languageServerExtensions(), semanticTokens({...})],
//   }).connect(workerTransport(worker))
//   return sharedClient
// }

// With this:
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
    seed[path] = fileEl.dataset.doc ?? ''
  }
  return seed
}

function lspClient(): LSPClient {
  if (sharedClient) return sharedClient
  const worker = new Worker(new URL('../lib/var-worker.ts', import.meta.url), { type: 'module' })
  const channel = new MessageChannel()
  worker.postMessage({ seed: collectPageSeed() }, [channel.port2])
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
```

(`languageServerExtensions`, `semanticTokens`, and `joinStepParamTokens` are already imported at the top of the file from Task 1 — no new imports needed beyond what's already there.)

- [ ] **Step 4: Build**

```bash
cd typescript && pnpm --filter @oselvar/website-starlight build
```

Expected: exit 0. If `var-worker.ts` has a type error on `e.ports[0]` or the `BrowserMessageReader`/`Writer` cast, resolve it — the cast to `DedicatedWorkerGlobalScope` mirrors the existing pattern the old code already used for `self`, just applied to `port` instead.

- [ ] **Step 5: Playwright verification — semantic highlighting still works with the dynamic seed**

```bash
cd packages/website-starlight && (nohup pnpm preview --port 4401 > /tmp/preview-task2.log 2>&1 &)
sleep 3
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4401/ --max-time 5
```

Expected: `200`.

```js
import { chromium } from 'playwright'

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1400, height: 1200 } })
const consoleErrors = []
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()) })
await page.goto('http://localhost:4401/', { waitUntil: 'networkidle' })
await page.waitForSelector('.file-editor', { timeout: 15000 })
await page.waitForTimeout(2000)

// Semantic token highlighting on yahtzee.md (line 6, "Examples of dice, category and score:")
// should still show the cm-token-function/cm-token-parameter capsule.
const hasToken = await page.evaluate(() => {
  const ed = [...document.querySelectorAll('.file-editor')][0]
  const mdEditor = [...ed.querySelectorAll('.cm-editor')][0]
  return !!mdEditor.querySelector('[class*="cm-token"]')
})
console.log('yahtzee semantic token present:', hasToken)
if (!hasToken) throw new Error('expected a cm-token-* decoration on yahtzee.md, found none')

// Switch to roman-numerals and confirm run correctness is unaffected by the
// worker-transport rewrite (same check as Task 1, re-run post-handshake-change).
await page.locator('[role=tab]', { hasText: 'Roman numerals' }).click()
await page.waitForTimeout(2000)
const romanDecos = await page.evaluate(() => {
  const editors = [...document.querySelectorAll('.file-editor')]
  const romanEditor = editors.find((ed) => [...ed.querySelectorAll('.fe-tab')].some((b) => b.textContent === 'roman-numerals.md'))
  const mdMount = [...romanEditor.querySelectorAll('.cm-editor')][0]
  return [...mdMount.querySelectorAll('.cm-line')]
    .map((l) => l.className.match(/cm-run-\w+/)?.[0])
    .filter(Boolean)
})
console.log('roman-numerals decorated lines:', JSON.stringify(romanDecos))
if (romanDecos.length !== 1 || romanDecos[0] !== 'cm-run-fail') {
  throw new Error(`expected exactly one cm-run-fail, got ${JSON.stringify(romanDecos)}`)
}

console.log('console errors:', consoleErrors)
await browser.close()
console.log('ALL CHECKS PASSED')
```

Run: `node verify-task2.mjs`
Expected: `ALL CHECKS PASSED`, `console errors: []`.

Stop the preview server (same `lsof`/`kill` pattern as Task 1, port 4401).

- [ ] **Step 6: Full workspace gate**

```bash
cd typescript && pnpm -r build && pnpm check
```

Expected: both exit 0.

- [ ] **Step 7: Commit**

```bash
git add typescript/packages/website-starlight/src/lib/worker-transport.ts \
        typescript/packages/website-starlight/src/lib/var-worker.ts \
        typescript/packages/website-starlight/src/scripts/editor-mount.ts
git commit -m "$(cat <<'EOF'
feat(website-starlight): derive LSP seed from the live DOM, not a hardcoded list

var-worker.ts's SEED_FILES map + raw imports of every example file
(hand-maintained, edited twice this session for two new examples) is
replaced with a one-time MessageChannel handshake: editor-mount.ts
collects every mounted <Editor>'s <File> children across the whole
page before creating the worker, sends { seed } plus a dedicated
MessagePort in one postMessage call, and the worker hands that port
to BrowserMessageReader/Writer instead of `self` for all subsequent
LSP traffic — self's default channel is used exactly once, for the
handshake, then never again.

worker-transport.ts's workerTransport() only ever called
postMessage/addEventListener('message', …), both of which Worker and
MessagePort support identically, so it needed a type widening and
nothing else.

Verified via Playwright: semantic token highlighting still fires on
yahtzee.md with no hardcoded seed involved, and the roman-numerals
run-correctness check from Task 1 still passes unchanged.
EOF
)"
```

---

## Task 3: Delete dead code, final verification

**Files:**
- Delete: `typescript/packages/website-starlight/src/lib/idb-file-system.ts`

**Interfaces:**
- Consumes: nothing from Task 1/2 directly — this is cleanup.
- Produces: nothing further downstream.

- [ ] **Step 1: Confirm it's truly unreferenced**

```bash
cd typescript && grep -rl "idb-file-system\|createIdbFileSystem" packages/website-starlight/src
```

Expected: only `packages/website-starlight/src/lib/idb-file-system.ts` itself (self-reference in its own file, e.g. a comment or its own definition) — no other file imports it. If anything else matches, stop and investigate before deleting.

- [ ] **Step 2: Delete it**

```bash
rm typescript/packages/website-starlight/src/lib/idb-file-system.ts
```

- [ ] **Step 3: Full workspace gate**

```bash
cd typescript && pnpm -r build && pnpm check
```

Expected: both exit 0. `knip` should not newly flag anything related to this file (it was already dead, unreferenced by any import) — if it does, investigate before proceeding.

- [ ] **Step 4: Commit**

```bash
git add -u typescript/packages/website-starlight/src/lib/idb-file-system.ts
git commit -m "$(cat <<'EOF'
chore(website-starlight): delete idb-file-system.ts, superseded by memory-file-system.ts

Dead since var-worker.ts switched to createMemoryFileSystem — nothing
imports it anymore. Confirmed via grep before deleting.
EOF
)"
```
