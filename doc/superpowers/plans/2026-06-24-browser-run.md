# Browser Run Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run a Vár `.var.md` spec against its `.steps.ts` definitions in the browser, showing pass/fail inline in the spec editor (example line backgrounds + clickable error gutter markers), with a "Run all" button now and per-example ▶ later.

**Architecture:** Outside-in: (1) the in-editor results UI ("Run all" panel + line backgrounds + error gutter + stack tooltip) against stubbed results; (2) a pure, node-tested run pipeline (`buildRegistry → parse → plan → executePlan → collecting sink → RunResults`); (3) a dedicated, timeout-guarded run worker that transpiles+evals the step files and calls the pipeline; (4) seed rewrite to `@oselvar/var-runtime` + `if/throw`; (5) per-example gutter ▶.

**Tech Stack:** `@oselvar/var` (`parse`/`plan`/`executePlan`), `@oselvar/var-runtime` (`step`/`buildRegistry`/`contextFactory`/`_resetBuilder`), `typescript` (`transpileModule`), CodeMirror 6 (`@codemirror/view`/`state`, panels/gutters/tooltips), vitest.

## Global Constraints

- **No `expect`** — handlers assert with `if (…) throw new Error(…)`; `executePlan` catches the throw and augments the error stack with a `<varPath>:line:col` frame.
- **Execution deps:** only `@oselvar/var` + `@oselvar/var-runtime` (both browser-safe). No vitest at runtime.
- **`PlannedStep.matchSpan.startLine` is 1-based**; CodeMirror `doc.line(n)` is 1-based too, so example lines map directly.
- **Run UI is markdown-only** — added only to editors whose `data-lang` is `markdown`; the `.steps.ts` editor has no run UI.
- **Dedicated run worker**, timeout-guarded (`terminate()` on hang); never blocks/kills the LSP worker.
- **Stale on edit:** results decorations + markers clear on `docChanged`.
- **`//# sourceURL=<path>`** is appended to each transpiled step file so `var-runtime`'s stack-based `callerLocation()` attributes steps to the real path.
- **Do not touch** `<FileEditor>`, `step-highlight`, or the LSP worker/semantic tokens.

---

### Task 1: In-editor run results UI against stubbed results (markdown only)

**Files:**
- Create: `packages/website/src/lib/run-types.ts`
- Create: `packages/website/src/lib/cm-run.ts`
- Modify: `packages/website/src/scripts/editor-mount.ts`

**Interfaces:**
- Produces: `RunResults`/`ExampleResult` types; `varRunExtension(): Extension` — a CodeMirror extension (top panel with "Run all", a results StateField, line-background decorations, an error gutter with clickable stack tooltip). For this task the "Run all" handler renders a hardcoded `RunResults`.
- Consumes: nothing yet (Task 3 swaps the stub for the real runner).

- [ ] **Step 1: Result types**

`packages/website/src/lib/run-types.ts`:
```ts
export type ExampleResult = {
  readonly name: string
  readonly status: 'passed' | 'failed'
  readonly lines: ReadonlyArray<number> // 1-based source lines of this example's steps
  readonly failure?: { readonly line: number; readonly message: string; readonly stack: string }
}
export type RunResults = { readonly examples: ReadonlyArray<ExampleResult> }
```

- [ ] **Step 2: The CodeMirror run extension (renders results; Run-all stubbed)**

Read the installed CodeMirror types first (`packages/website/node_modules/@codemirror/view/dist/index.d.ts`) to confirm `showPanel`, `gutter`, `GutterMarker`, `Decoration.line`, and `EditorView.theme`/`baseTheme` signatures; adjust the code to the real APIs.

`packages/website/src/lib/cm-run.ts`:
```ts
import { RangeSetBuilder, StateEffect, StateField, type Extension } from '@codemirror/state'
import {
  Decoration,
  type DecorationSet,
  EditorView,
  GutterMarker,
  type Panel,
  gutter,
  showPanel,
} from '@codemirror/view'
import type { RunResults } from './run-types.ts'

// Effect carrying the latest run results (null clears them).
export const setRunResults = StateEffect.define<RunResults | null>()

const resultsField = StateField.define<RunResults | null>({
  create: () => null,
  update(value, tr) {
    if (tr.docChanged) return null // results go stale on edit
    for (const e of tr.effects) if (e.is(setRunResults)) return e.value
    return value
  },
})

// Line-background decorations derived from the results.
const decoField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    const results = tr.state.field(resultsField)
    if (!tr.docChanged && !tr.effects.some((e) => e.is(setRunResults))) return deco.map(tr.changes)
    if (!results) return Decoration.none
    const builder = new RangeSetBuilder<Decoration>()
    const cls = (s: 'passed' | 'failed') => (s === 'passed' ? 'cm-run-pass' : 'cm-run-fail')
    const lines = results.examples
      .flatMap((ex) => ex.lines.map((ln) => ({ ln, status: ex.status })))
      .sort((a, b) => a.ln - b.ln)
    for (const { ln, status } of lines) {
      if (ln >= 1 && ln <= tr.state.doc.lines) {
        builder.add(tr.state.doc.line(ln).from, tr.state.doc.line(ln).from, Decoration.line({ class: cls(status) }))
      }
    }
    return builder.finish()
  },
  provide: (f) => EditorView.decorations.from(f),
})

class ErrorMarker extends GutterMarker {
  constructor(readonly stack: string) {
    super()
  }
  toDOM() {
    const el = document.createElement('span')
    el.textContent = '✗'
    el.className = 'cm-run-errmark'
    el.title = 'Click to show the stack trace'
    el.onclick = () => {
      // Simple popover: a <pre> appended near the editor. (A CM tooltip is an
      // alternative — see note below.)
      const pop = document.createElement('pre')
      pop.className = 'cm-run-stack'
      pop.textContent = this.stack
      pop.onclick = () => pop.remove()
      el.closest('.cm-editor')?.appendChild(pop)
    }
    return el
  }
}

const errorGutter = gutter({
  class: 'cm-run-gutter',
  lineMarker(view, line) {
    const results = view.state.field(resultsField)
    if (!results) return null
    const lineNo = view.state.doc.lineAt(line.from).number
    for (const ex of results.examples) {
      if (ex.failure && ex.failure.line === lineNo) return new ErrorMarker(ex.failure.stack)
    }
    return null
  },
})

function runPanel(view: EditorView, onRunAll: (view: EditorView) => void): Panel {
  const dom = document.createElement('div')
  dom.className = 'cm-run-bar'
  const btn = document.createElement('button')
  btn.textContent = '▶ Run all'
  btn.onclick = () => onRunAll(view)
  dom.appendChild(btn)
  return { dom, top: true }
}

const runTheme = EditorView.baseTheme({
  '.cm-run-bar': { padding: '4px 8px', borderBottom: '2px solid var(--ink)', background: 'var(--yellow)' },
  '.cm-run-bar button': { font: 'inherit', cursor: 'pointer' },
  '.cm-run-pass': { background: 'rgba(40, 167, 69, 0.18)' },
  '.cm-run-fail': { background: 'rgba(255, 46, 136, 0.18)' },
  '.cm-run-errmark': { color: 'var(--accent)', cursor: 'pointer', fontWeight: '700' },
  '.cm-run-stack': {
    position: 'absolute', right: '8px', bottom: '8px', maxWidth: '90%', maxHeight: '40%',
    overflow: 'auto', background: 'var(--ink)', color: 'var(--cream)', padding: '8px',
    borderRadius: '6px', fontSize: '12px', zIndex: '5', whiteSpace: 'pre-wrap',
  },
})

// `onRunAll` is injected so Task 3 can swap the stub for the real runner.
export function varRunExtension(onRunAll: (view: EditorView) => void): Extension {
  return [
    resultsField,
    decoField,
    errorGutter,
    showPanel.of((view) => runPanel(view, onRunAll)),
    runTheme,
  ]
}
```

- [ ] **Step 3: Wire into markdown editors with a STUB Run-all**

In `packages/website/src/scripts/editor-mount.ts`:
- import `{ varRunExtension, setRunResults } from '../lib/cm-run.ts'` and `import type { RunResults } from '../lib/run-types.ts'`.
- In `mountEditor`, when `lang === 'markdown'`, add `varRunExtension(stubRunAll)` to the extensions. Define a temporary stub that dispatches canned results (Task 3 replaces it):
```ts
function stubRunAll(view: EditorView): void {
  const results: RunResults = {
    examples: [
      { name: 'first', status: 'passed', lines: [3] },
      { name: 'second', status: 'failed', lines: [5], failure: { line: 5, message: 'boom', stack: 'Error: boom\n    at second (/hello.var.md:5:1)' } },
    ],
  }
  view.dispatch({ effects: setRunResults.of(results) })
}
```
- Only markdown editors get the extension:
```ts
const ext = [basicSetup, language, varTokenTheme, client.plugin(uri)]
if (lang === 'markdown') ext.push(varRunExtension(stubRunAll))
return new EditorView({ doc, extensions: ext, parent: el })
```

- [ ] **Step 4: Build + manual proof**

Run: `pnpm --filter @oselvar/website build`
Expected: succeeds; `find packages/website/dist -name '*.js' | xargs grep -l 'cm-run-fail' 2>/dev/null` → ≥1.
Manual (record in report): `dev`, open `/var/playground`, click **Run all** on the spec editor — line 3 turns green, line 5 pink with a ✗ gutter marker; clicking ✗ shows the stack; editing clears it. (Stub data — real data is Task 3.)

- [ ] **Step 5: Commit**
```bash
git add packages/website/src/lib/run-types.ts packages/website/src/lib/cm-run.ts packages/website/src/scripts/editor-mount.ts
git commit -m "feat(website): in-editor run-results UI (Run all panel, line bg, error gutter) — stubbed"
```

---

### Task 2: Pure run pipeline + node unit test

**Files:**
- Create: `packages/website/src/lib/run-spec.ts`
- Create: `packages/website/src/lib/run-spec.test.ts`

**Interfaces:**
- Consumes: `@oselvar/var` (`parse`, `plan`, `executePlan`, `TestSink`), `@oselvar/var-runtime` (`buildRegistry`, `contextFactory`); `RunResults` from `./run-types.ts`.
- Produces: `runRegisteredSpec(varPath: string, varSource: string, exampleIndex?: number): Promise<RunResults>` — assumes step handlers are already registered in `var-runtime` (the worker evals files to register; tests register directly).

- [ ] **Step 1: Write the failing test**

`packages/website/src/lib/run-spec.test.ts`:
```ts
import { _resetBuilder, defineContext } from '@oselvar/var-runtime'
import { afterEach, describe, expect, it } from 'vitest'
import { runRegisteredSpec } from './run-spec.js'

afterEach(() => _resetBuilder())

const SPEC = `# Greeting\n\nFirst I greet "world" okay? I think the greeting should be "Hello, world!"\n`

describe('runRegisteredSpec', () => {
  it('passes when the handler does not throw', async () => {
    _resetBuilder()
    const { step } = defineContext(() => ({ greeting: '' }))
    step('I greet {string}', (ctx: { greeting: string }, name: string) => {
      ctx.greeting = `Hello, ${name}!`
    })
    step('the greeting should be {string}', (ctx: { greeting: string }, expected: string) => {
      if (ctx.greeting !== expected) throw new Error(`expected "${expected}" but was "${ctx.greeting}"`)
    })
    const results = await runRegisteredSpec('/spec.var.md', SPEC)
    expect(results.examples).toHaveLength(1)
    expect(results.examples[0]?.status).toBe('passed')
    expect(results.examples[0]?.lines).toContain(3)
  })

  it('fails with the message and the failing .var.md line on a throw', async () => {
    _resetBuilder()
    const { step } = defineContext(() => ({ greeting: '' }))
    step('I greet {string}', (ctx: { greeting: string }, name: string) => {
      ctx.greeting = `Hi ${name}`
    })
    step('the greeting should be {string}', (ctx: { greeting: string }, expected: string) => {
      if (ctx.greeting !== expected) throw new Error(`expected "${expected}" but was "${ctx.greeting}"`)
    })
    const results = await runRegisteredSpec('/spec.var.md', SPEC)
    expect(results.examples[0]?.status).toBe('failed')
    expect(results.examples[0]?.failure?.message).toContain('expected "Hello, world!"')
    expect(results.examples[0]?.failure?.line).toBe(3)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `NODE_OPTIONS="--import tsx" pnpm vitest run packages/website/src/lib/run-spec.test.ts`
Expected: FAIL — module/export missing.

- [ ] **Step 3: Implement the pipeline**

`packages/website/src/lib/run-spec.ts`:
```ts
import { type TestSink, executePlan, parse, plan } from '@oselvar/var'
import { buildRegistry, contextFactory } from '@oselvar/var-runtime'
import type { ExampleResult, RunResults } from './run-types.ts'

// Parse the `<varPath>:line:col` frame `executePlan` injects to find the failing line.
function failingLine(stack: string, varPath: string): number | undefined {
  const re = new RegExp(`${varPath.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}:(\\d+):\\d+`)
  const m = re.exec(stack)
  return m ? Number(m[1]) : undefined
}

export async function runRegisteredSpec(
  varPath: string,
  varSource: string,
  exampleIndex?: number,
): Promise<RunResults> {
  const registry = buildRegistry()
  const varDoc = parse(varPath, varSource, [])
  const full = plan(varDoc, registry)
  const examples =
    exampleIndex == null ? full.examples : full.examples.filter((_, i) => i === exampleIndex)
  const toRun = { ...full, examples }

  const out: ExampleResult[] = new Array(examples.length)
  const pending: Promise<void>[] = []
  let i = 0
  const createContext = contextFactory()
  const sink: TestSink = {
    example(name, run) {
      const idx = i++
      const ex = examples[idx]!
      const lines = [...new Set(ex.steps.map((s) => s.matchSpan.startLine))]
      pending.push(
        (async () => {
          try {
            await run()
            out[idx] = { name, status: 'passed', lines }
          } catch (err) {
            const e = err as Error
            const stack = e?.stack ?? String(err)
            out[idx] = {
              name,
              status: 'failed',
              lines,
              failure: {
                line: failingLine(stack, varPath) ?? lines[0] ?? 0,
                message: e?.message ?? String(err),
                stack,
              },
            }
          }
        })(),
      )
    },
  }

  executePlan(toRun, { sink, reporter: { diagnostic() {} }, createContext })
  await Promise.all(pending)
  return { examples: out }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `NODE_OPTIONS="--import tsx" pnpm vitest run packages/website/src/lib/run-spec.test.ts`
Expected: PASS (2 tests). If `failingLine` doesn't match, log the caught `stack` and align the regex to the actual injected frame format (`at <text> (<varPath>:<line>:<col>)`).

- [ ] **Step 5: Commit**
```bash
git add packages/website/src/lib/run-spec.ts packages/website/src/lib/run-spec.test.ts
git commit -m "feat(website): pure run pipeline (executePlan → RunResults), node-tested"
```

---

### Task 3: Run worker + run client; wire Run-all to real results

**Files:**
- Create: `packages/website/src/lib/run-worker.ts`
- Create: `packages/website/src/lib/run-client.ts`
- Modify: `packages/website/src/scripts/editor-mount.ts`

**Interfaces:**
- Consumes: `runRegisteredSpec` (Task 2); `@oselvar/var-runtime` (`_resetBuilder`), `@oselvar/var`, `typescript`; `RunResults`.
- Produces: `runSpec(input: RunInput): Promise<RunResults>` where `RunInput = { varPath: string; varSource: string; stepFiles: ReadonlyArray<{ path: string; source: string }>; exampleIndex?: number }`.

- [ ] **Step 1: The run worker**

`packages/website/src/lib/run-worker.ts`:
```ts
import * as varCore from '@oselvar/var'
import * as varRuntime from '@oselvar/var-runtime'
import * as ts from 'typescript'
import { runRegisteredSpec } from './run-spec.ts'
import type { RunResults } from './run-types.ts'

type RunInput = {
  varPath: string
  varSource: string
  stepFiles: ReadonlyArray<{ path: string; source: string }>
  exampleIndex?: number
}

function evalStepFile(path: string, source: string): void {
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    fileName: path,
  }).outputText
  const require = (spec: string): unknown => {
    if (spec === '@oselvar/var-runtime' || spec === '@oselvar/var-vitest') return varRuntime
    if (spec === '@oselvar/var') return varCore
    throw new Error(`Cannot import "${spec}" in the browser runner — import step()/defineContext from "@oselvar/var-runtime".`)
  }
  const module = { exports: {} as Record<string, unknown> }
  // `//# sourceURL` makes var-runtime's stack-based callerLocation see the real path.
  // eslint-disable-next-line no-new-func
  new Function('require', 'exports', 'module', `${js}\n//# sourceURL=${path}`)(require, module.exports, module)
}

self.onmessage = async (e: MessageEvent<RunInput>) => {
  const input = e.data
  let results: RunResults
  try {
    varRuntime._resetBuilder()
    for (const f of input.stepFiles) evalStepFile(f.path, f.source)
    results = await runRegisteredSpec(input.varPath, input.varSource, input.exampleIndex)
  } catch (err) {
    const e2 = err as Error
    results = { examples: [{ name: 'run error', status: 'failed', lines: [1], failure: { line: 1, message: e2?.message ?? String(err), stack: e2?.stack ?? String(err) } }] }
  }
  ;(self as unknown as Worker).postMessage(results)
}
```

- [ ] **Step 2: The run client (lazy worker + timeout)**

`packages/website/src/lib/run-client.ts`:
```ts
import type { RunResults } from './run-types.ts'

export type RunInput = {
  varPath: string
  varSource: string
  stepFiles: ReadonlyArray<{ path: string; source: string }>
  exampleIndex?: number
}

let worker: Worker | null = null

function spawn(): Worker {
  worker = new Worker(new URL('./run-worker.ts', import.meta.url), { type: 'module' })
  return worker
}

export function runSpec(input: RunInput, timeoutMs = 5000): Promise<RunResults> {
  const w = worker ?? spawn()
  return new Promise<RunResults>((resolve, reject) => {
    const timer = setTimeout(() => {
      w.terminate()
      worker = null
      reject(new Error(`run timed out after ${timeoutMs}ms`))
    }, timeoutMs)
    w.onmessage = (e: MessageEvent<RunResults>) => {
      clearTimeout(timer)
      resolve(e.data)
    }
    w.onerror = (e) => {
      clearTimeout(timer)
      w.terminate()
      worker = null
      reject(new Error(e.message))
    }
    w.postMessage(input)
  })
}
```

- [ ] **Step 3: Replace the stub Run-all with the real runner**

In `packages/website/src/scripts/editor-mount.ts`:
- import `{ runSpec } from '../lib/run-client.ts'`.
- Replace `stubRunAll` with a real handler that gathers BOTH editors' current content. The mounted editors expose their views; collect them in a module map keyed by uri at mount time, then:
```ts
const views = new Map<string, EditorView>() // populate in mountEditor: views.set(uri, view)

async function runAll(view: EditorView): Promise<void> {
  const varPath = '/hello.var.md'
  const varSource = view.state.doc.toString()
  const stepFiles = [...views.entries()]
    .filter(([u]) => u.endsWith('.steps.ts'))
    .map(([u, v]) => ({ path: u.replace(/^file:\/\//, ''), source: v.state.doc.toString() }))
  try {
    const results = await runSpec({ varPath, varSource, stepFiles })
    view.dispatch({ effects: setRunResults.of(results) })
  } catch (err) {
    view.dispatch({ effects: setRunResults.of({ examples: [{ name: 'error', status: 'failed', lines: [1], failure: { line: 1, message: String(err), stack: String(err) } }] }) })
  }
}
```
- Pass `runAll` to `varRunExtension(runAll)`; ensure `mountEditor` stores each view in `views` (`views.set(uri, view)` before returning).

- [ ] **Step 4: Build + verify**

Run: `pnpm --filter @oselvar/website build`
Expected: succeeds (the run worker bundles `typescript` + `@oselvar/var-runtime`). Confirm the run worker emitted: `find packages/website/dist -name '*.js' | xargs grep -l 'transpileModule' 2>/dev/null` → ≥1.

- [ ] **Step 5: Manual proof (record in report)**

`dev`, open `/var/playground`, click **Run all**: the example passes (green) with the current seed; edit the spec's `"Hello, world!"` to something else and Run → that example goes pink with a ✗ marker → click shows the stack with the `.var.md` line. (Requires the seed to import from `@oselvar/var-runtime`, which is Task 4 — until then the steps import `@oselvar/var-vitest`, which the worker aliases to var-runtime, so it still runs; the `expect`-based seed would fail to run, so do Task 4 to see a clean pass.)

- [ ] **Step 6: Commit**
```bash
git add packages/website/src/lib/run-worker.ts packages/website/src/lib/run-client.ts packages/website/src/scripts/editor-mount.ts
git commit -m "feat(website): dedicated run worker + timeout client; Run all executes the spec"
```

---

### Task 4: Seed rewrite to `@oselvar/var-runtime` + `if/throw`

**Files:**
- Modify: `packages/website/src/lib/seed-files.ts`

- [ ] **Step 1: Rewrite the seed step file**

In `packages/website/src/lib/seed-files.ts`, replace the `/01-hello.steps.ts` value so it imports from `@oselvar/var-runtime` and asserts with `if/throw`:
```ts
  '/01-hello.steps.ts': `import { defineContext } from '@oselvar/var-runtime'

const { step } = defineContext(() => ({ greeting: '' }))

step('I greet {string}', (ctx, name) => {
  ctx.greeting = \`Hello, \${name}!\`
})

step('the greeting should be {string}', (ctx, expected) => {
  if (ctx.greeting !== expected) {
    throw new Error(\`expected the greeting to be "\${expected}" but it was "\${ctx.greeting}"\`)
  }
})
`,
```
(The `/hello.var.md` seed already contains the matching sentences. The LSP highlighting still works — `discoverStepDefs` parses `step()` calls regardless of import source.)

- [ ] **Step 2: Build + manual proof**

Run: `pnpm --filter @oselvar/website build` → succeeds.
Manual (record): `dev`, `/var/playground`, **Run all** → the example is green; change the spec so the greeting won't match (e.g. `should be "Goodbye"`) and Run → pink + ✗ + stack. Editing the **steps** editor (e.g. break the greeting logic) and Run also flips it. Confirm.

- [ ] **Step 3: Commit**
```bash
git add packages/website/src/lib/seed-files.ts
git commit -m "feat(website): seed step file uses @oselvar/var-runtime + if/throw (runnable in browser)"
```

---

### Task 5: Phase 2 — per-example ▶ in the gutter

**Files:**
- Modify: `packages/website/src/lib/cm-run.ts`
- Modify: `packages/website/src/scripts/editor-mount.ts`

**Interfaces:**
- Consumes: `runSpec` with `exampleIndex` (Task 3); the doc's example line ranges.
- Produces: a run ▶ gutter marker on each example's first line; clicking runs only that example.

- [ ] **Step 1: Compute example first-lines on the client**

The gutter needs each example's first line + its index. Parse the current doc on the main thread with `@oselvar/var` (`parse` + `plan` with an empty registry is enough to get example step spans). Add to `cm-run.ts` a small helper used by the gutter:
```ts
import { parse, plan, createRegistry } from '@oselvar/var'
// returns Map<firstLine(1-based), exampleIndex>
export function exampleFirstLines(source: string): Map<number, number> {
  const doc = parse('/spec.var.md', source, [])
  const planned = plan(doc, createRegistry())
  const map = new Map<number, number>()
  planned.examples.forEach((ex, i) => {
    const first = Math.min(...ex.steps.map((s) => s.matchSpan.startLine))
    if (Number.isFinite(first)) map.set(first, i)
  })
  return map
}
```
(An example with no matched steps has no run marker — acceptable; it can't run anyway.)

- [ ] **Step 2: Add the run gutter**

In `cm-run.ts`, add a `RunMarker extends GutterMarker` rendering a ▶ whose `onclick` calls an injected `onRunExample(view, exampleIndex)`, and a second `gutter({ class: 'cm-run-rungutter', lineMarker })` that looks up `exampleFirstLines(view.state.doc.toString())` and returns a `RunMarker` on matching lines. Include both gutters in `varRunExtension`. Extend `varRunExtension` signature to `varRunExtension(onRunAll, onRunExample)`.
```ts
class RunMarker extends GutterMarker {
  constructor(readonly index: number, readonly run: (i: number) => void) { super() }
  toDOM() {
    const el = document.createElement('span')
    el.textContent = '▶'
    el.className = 'cm-run-runmark'
    el.title = 'Run this example'
    el.onclick = () => this.run(this.index)
    return el
  }
}
```
Theme: `.cm-run-runmark { color: var(--ink); cursor: pointer }`.

- [ ] **Step 3: Wire per-example run in editor-mount**

In `editor-mount.ts`, add `runExample`:
```ts
async function runExample(view: EditorView, exampleIndex: number): Promise<void> {
  const varSource = view.state.doc.toString()
  const stepFiles = [...views.entries()].filter(([u]) => u.endsWith('.steps.ts')).map(([u, v]) => ({ path: u.replace(/^file:\/\//, ''), source: v.state.doc.toString() }))
  const results = await runSpec({ varPath: '/hello.var.md', varSource, stepFiles, exampleIndex })
  view.dispatch({ effects: setRunResults.of(results) })
}
```
Pass it: `varRunExtension(runAll, runExample)`.

- [ ] **Step 4: Build + manual proof**

Run: `pnpm --filter @oselvar/website build` → succeeds.
Manual (record): a ▶ appears in the gutter next to each example; clicking it runs only that example and colors just its lines; "Run all" still runs everything.

- [ ] **Step 5: Commit**
```bash
git add packages/website/src/lib/cm-run.ts packages/website/src/scripts/editor-mount.ts
git commit -m "feat(website): per-example run ▶ in the gutter"
```

---

## Notes for the implementer

- Outside-in order: Task 1 proves the in-editor rendering against stub data; Task 2 is the only node-unit-tested logic (the run pipeline) — keep it exactly as tested; Task 3 adds the worker/transpile/eval and makes Run real; Task 4 makes the seed runnable; Task 5 adds per-example runs.
- The fragile spots: (a) `@codemirror/view` panel/gutter/marker APIs — read the installed `.d.ts` and adjust Task 1's code; (b) `failingLine`'s regex must match the frame `executePlan` injects (`at <text> (<varPath>:<line>:<col>)`) — verify against a real caught stack in Task 2.
- The run worker bundles `typescript` (a second lazy bundle, like the LSP worker) — expected; a lighter transpiler is a later optimization.
- Do not touch `<FileEditor>`, `step-highlight`, the LSP worker, or the semantic-tokens code.
```
