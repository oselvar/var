# Unify on `Editor.astro` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Retire the static `FileEditor.astro` and make the docs use the live `Editor.astro` everywhere — doc code samples become live, editable, runnable CodeMirror instances, with an optional filename window chrome and a per-sample run group.

**Architecture:** A new pure function `groupRunInputs` (functional core, unit-tested) decides which spec runs against which step files per group. The imperative shell `scripts/editor-mount.ts` reads the DOM into descriptors, calls `groupRunInputs`, and paints results per group. `Editor.astro` grows three optional props (`filename`, `group`, `steps`); the three docs/tutorial MDX pages migrate to it; `FileEditor.astro` and the now-dead `highlightSteps` are deleted.

**Tech Stack:** Astro · CodeMirror 6 · TypeScript (ESM, Node ≥ 22) · vitest · biome · knip.

## Global Constraints

- **Immutable types.** All new data types are `readonly`; use `ReadonlyArray<T>` / `ReadonlyMap<K, V>`. (CLAUDE.md)
- **Functional core, imperative shell.** New logic that can be pure (`groupRunInputs`) lives in a `lib/` module with no DOM/Worker access. `scripts/editor-mount.ts` remains the only place that touches the DOM, `EditorView`, and the worker. (CLAUDE.md)
- **Build gate is separate from tests.** A green vitest run can still fail type-checking. After touching shared types or a package's public exports, run the build. (CLAUDE.md)
- **Trunk-based.** Commit small, green increments straight to `main`. Each task ends green (build + tests pass).
- **Commit message footer:** end every commit message with
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

### Verification commands (exact)

- Website build (type-checks `src/` via Astro): `pnpm --filter @oselvar/website build`
- Run specific vitest files: `NODE_OPTIONS="--import tsx" npx vitest run <path...>`
- Dead-code check: `pnpm knip`
- Lint: `pnpm biome check <path>` (or `pnpm lint` for all)

---

## File Structure

- **Create** `packages/website/src/lib/run-grouping.ts` — pure: group editor descriptors into per-group run inputs.
- **Create** `packages/website/src/lib/run-grouping.test.ts` — unit tests for the above.
- **Modify** `packages/website/src/scripts/editor-mount.ts` — group-scoped mounting + runs; consume `groupRunInputs`; parse carried hidden steps.
- **Modify** `packages/website/src/components/Editor.astro` — add `filename` (window chrome), `group`, `steps` props; emit `data-group` / `data-steps`.
- **Modify** the 3 MDX docs — `FileEditor` → `Editor`.
- **Delete** `packages/website/src/components/FileEditor.astro`.
- **Modify** `packages/website/src/lib/step-highlight.ts` — remove `highlightSteps` (+ private helpers/types); keep `decodeEntities`.
- **Modify** `packages/website/src/lib/step-highlight.test.ts` — drop the `highlightSteps` suite.
- **Modify** `packages/website/src/components/CopyButton.astro` — drop the `.file-editor` skip; fix comments.
- **Modify** `packages/website/src/styles/global.css` — fix the legacy-brand comment.

---

## Task 1: Pure run-grouping core

**Files:**
- Create: `packages/website/src/lib/run-grouping.ts`
- Test: `packages/website/src/lib/run-grouping.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type StepFile = { readonly path: string; readonly source: string }`
  - `type EditorDescriptor = { readonly uri: string; readonly group: string; readonly source: string }`
  - `type RunInput = { readonly group: string; readonly varPath: string; readonly varSource: string; readonly stepFiles: ReadonlyArray<StepFile> }`
  - `function groupRunInputs(editors: ReadonlyArray<EditorDescriptor>, hiddenStepsByGroup: ReadonlyMap<string, ReadonlyArray<StepFile>>): ReadonlyArray<RunInput>`

Behaviour: group `editors` by `group`. For each group containing at least one `.var.md` editor (first one wins, in input order), produce one `RunInput`:
- `varPath` = that editor's `uri` with a leading `file://` stripped.
- `varSource` = that editor's `source`.
- `stepFiles` = every `.steps.ts` editor in the group (mapped to `{ path: uri-without-file://, source }`, in input order) followed by all hidden steps registered for the group via `hiddenStepsByGroup`.
Groups with no `.var.md` editor produce no `RunInput`. Output order follows first appearance of each group in `editors`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/website/src/lib/run-grouping.test.ts
import { describe, expect, it } from 'vitest'
import { groupRunInputs } from './run-grouping.js'

const noHidden = new Map()

describe('groupRunInputs', () => {
  it('pairs a spec with the visible step files in its group', () => {
    const inputs = groupRunInputs(
      [
        { uri: 'file:///a.var.md', group: 'g1', source: '# spec' },
        { uri: 'file:///a.steps.ts', group: 'g1', source: 'action()' },
      ],
      noHidden,
    )
    expect(inputs).toEqual([
      {
        group: 'g1',
        varPath: 'a.var.md',
        varSource: '# spec',
        stepFiles: [{ path: 'a.steps.ts', source: 'action()' }],
      },
    ])
  })

  it('appends hidden carried steps after visible ones', () => {
    const inputs = groupRunInputs(
      [{ uri: 'file:///a.var.md', group: 'g1', source: '# spec' }],
      new Map([['g1', [{ path: 'hidden.steps.ts', source: 'hidden()' }]]]),
    )
    expect(inputs[0]?.stepFiles).toEqual([{ path: 'hidden.steps.ts', source: 'hidden()' }])
  })

  it('keeps groups isolated from each other', () => {
    const inputs = groupRunInputs(
      [
        { uri: 'file:///a.var.md', group: 'g1', source: 'A' },
        { uri: 'file:///a.steps.ts', group: 'g1', source: 'sa' },
        { uri: 'file:///b.var.md', group: 'g2', source: 'B' },
        { uri: 'file:///b.steps.ts', group: 'g2', source: 'sb' },
      ],
      noHidden,
    )
    expect(inputs.map((i) => i.group)).toEqual(['g1', 'g2'])
    expect(inputs[0]?.stepFiles).toEqual([{ path: 'a.steps.ts', source: 'sa' }])
    expect(inputs[1]?.stepFiles).toEqual([{ path: 'b.steps.ts', source: 'sb' }])
  })

  it('skips a group with no .var.md', () => {
    const inputs = groupRunInputs(
      [{ uri: 'file:///only.steps.ts', group: 'g1', source: 's' }],
      noHidden,
    )
    expect(inputs).toEqual([])
  })

  it('uses the first .var.md when a group has several', () => {
    const inputs = groupRunInputs(
      [
        { uri: 'file:///first.var.md', group: 'g', source: 'F' },
        { uri: 'file:///second.var.md', group: 'g', source: 'S' },
      ],
      noHidden,
    )
    expect(inputs).toHaveLength(1)
    expect(inputs[0]?.varPath).toBe('first.var.md')
  })
})
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `NODE_OPTIONS="--import tsx" npx vitest run packages/website/src/lib/run-grouping.test.ts`
Expected: FAIL — `Failed to resolve import "./run-grouping.js"` / `groupRunInputs is not a function`.

- [ ] **Step 3: Write the implementation**

```ts
// packages/website/src/lib/run-grouping.ts

export type StepFile = { readonly path: string; readonly source: string }

export type EditorDescriptor = {
  readonly uri: string
  readonly group: string
  readonly source: string
}

export type RunInput = {
  readonly group: string
  readonly varPath: string
  readonly varSource: string
  readonly stepFiles: ReadonlyArray<StepFile>
}

const stripFileScheme = (uri: string): string => uri.replace(/^file:\/\//, '')

// Group editor descriptors and pair each group's spec (.var.md) with the step
// files in that same group — visible .steps.ts editors first, then any hidden
// carried steps. Pure: no DOM, no editor instances. Order follows first
// appearance of each group.
export function groupRunInputs(
  editors: ReadonlyArray<EditorDescriptor>,
  hiddenStepsByGroup: ReadonlyMap<string, ReadonlyArray<StepFile>>,
): ReadonlyArray<RunInput> {
  const order: string[] = []
  const byGroup = new Map<string, EditorDescriptor[]>()
  for (const ed of editors) {
    let bucket = byGroup.get(ed.group)
    if (!bucket) {
      bucket = []
      byGroup.set(ed.group, bucket)
      order.push(ed.group)
    }
    bucket.push(ed)
  }

  const inputs: RunInput[] = []
  for (const group of order) {
    const bucket = byGroup.get(group) ?? []
    const spec = bucket.find((e) => e.uri.endsWith('.var.md'))
    if (!spec) continue
    const visibleSteps: StepFile[] = bucket
      .filter((e) => e.uri.endsWith('.steps.ts'))
      .map((e) => ({ path: stripFileScheme(e.uri), source: e.source }))
    const hidden = hiddenStepsByGroup.get(group) ?? []
    inputs.push({
      group,
      varPath: stripFileScheme(spec.uri),
      varSource: spec.source,
      stepFiles: [...visibleSteps, ...hidden],
    })
  }
  return inputs
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `NODE_OPTIONS="--import tsx" npx vitest run packages/website/src/lib/run-grouping.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Lint**

Run: `pnpm biome check packages/website/src/lib/run-grouping.ts packages/website/src/lib/run-grouping.test.ts`
Expected: no errors (auto-fix with `--write` if biome reports formatting).

- [ ] **Step 6: Commit**

```bash
git add packages/website/src/lib/run-grouping.ts packages/website/src/lib/run-grouping.test.ts
git commit -m "feat(website): pure run-grouping core for grouped editor runs

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Group-scoped run model in `editor-mount.ts`

**Files:**
- Modify: `packages/website/src/scripts/editor-mount.ts`

**Interfaces:**
- Consumes: `groupRunInputs`, `EditorDescriptor`, `StepFile` from Task 1.
- Produces: editors now read `data-group` (default `'default'`) and `data-steps` (JSON array of `{ path, source }`); runs are scoped per group. No exported API change.

This is imperative-shell code (DOM + `EditorView` + worker); it has no unit tests in this repo — verification is the website build plus the manual checks in Task 6. Keep the pure decision in `groupRunInputs`; this task only wires DOM ↔ that function.

- [ ] **Step 1: Replace the global `views` map and run functions with group-scoped ones**

Replace the current block (the `const views = new Map…` declaration on line ~23 through the end of `scheduleRun` on line ~77) with:

```ts
import type { StepFile } from '../lib/run-grouping.ts'
import { groupRunInputs } from '../lib/run-grouping.ts'

// ... keep existing imports above ...

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

// Run one group's spec against its step files and paint the result into the
// group's markdown view.
async function runSpecNow(groupId: string): Promise<void> {
  const group = groups.get(groupId)
  if (!group) return
  const mdEntry = [...group.views.entries()].find(([u]) => u.endsWith('.var.md'))
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
```

- [ ] **Step 2: Update `mountEditor` to be group-aware and parse carried steps**

Replace the existing `mountEditor` (lines ~84-124) with:

```ts
function mountEditor(el: HTMLElement): EditorView {
  const doc = el.dataset.doc ?? ''
  const uri = el.dataset.uri ?? 'file:///untitled.var.md'
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
```

- [ ] **Step 3: Update the bottom-of-file bootstrap to run every group once**

Replace the final lines (`mountAll()` … `scheduleRun()`) with:

```ts
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
```

- [ ] **Step 4: Build the website (type-checks the script)**

Run: `pnpm --filter @oselvar/website build`
Expected: exit 0, no type errors. (If `StepFile` is reported unused because only the type is referenced, confirm the `import type { StepFile }` line is present and used in the `Group` type and the `JSON.parse` cast.)

- [ ] **Step 5: Lint**

Run: `pnpm biome check packages/website/src/scripts/editor-mount.ts`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add packages/website/src/scripts/editor-mount.ts
git commit -m "feat(website): group-scoped editor runs with carried hidden steps

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Extend `Editor.astro` with chrome + group + steps props

**Files:**
- Modify: `packages/website/src/components/Editor.astro`

**Interfaces:**
- Consumes: the `data-group` / `data-steps` reading added in Task 2.
- Produces: `Editor` accepts `filename?: string`, `group?: string`, `steps?: ReadonlyArray<{ path: string; source: string }>`. When `filename` is set, the `.cm-mount` is wrapped in a `figure.file-editor` window chrome (titlebar + traffic-light dots + name/extension). When `group`/`steps` are set, they are emitted as `data-group` / `data-steps` (JSON).

- [ ] **Step 1: Replace the component frontmatter + markup**

Replace the frontmatter (lines 1-24) and the markup (lines 25-33) with:

```astro
---
import { decodeEntities } from '../lib/step-highlight.js'

interface Props {
  uri: string
  lang?: 'markdown' | 'typescript'
  // Show the line-number gutter (default true).
  lineNumbers?: boolean
  // Show the fold (collapse/expand) gutter (default true).
  folding?: boolean
  // Offer the "Define step definition" affordance on a settled selection
  // (default true). Markdown editors only.
  define?: boolean
  // When set, wrap the editor in a window chrome whose titlebar shows this
  // filename (the extension is coloured). Omit for the bare bordered look.
  filename?: string
  // Editors sharing a group run together; their specs run against the step
  // files in the same group. Omit to use the page-wide default group.
  group?: string
  // Hidden companion step sources fed to this editor's run group without
  // rendering a visible editor. Use when a doc shows only the spec.
  steps?: ReadonlyArray<{ path: string; source: string }>
}
const {
  uri,
  lang = 'markdown',
  lineNumbers = true,
  folding = true,
  define = true,
  filename,
  group,
  steps,
} = Astro.props

// The document is the default slot. Author it as a raw string child —
// `<Editor uri="…">{`line one\nline two`}</Editor>` — so MDX/Astro passes the
// text through verbatim. The rendered slot is HTML-escaped, so decode it back
// to the raw source before handing it to CodeMirror via `data-doc`.
const doc = decodeEntities(
  (await Astro.slots.render('default')).replace(/^\n+/, '').replace(/\n+$/, ''),
)

// Split the name from its (possibly multi-dot) extension so ".var.md" reads as
// a single highlighted unit, e.g. "hello" + ".var.md".
const dot = filename ? filename.indexOf('.') : -1
const name = filename ? (dot === -1 ? filename : filename.slice(0, dot)) : ''
const ext = filename && dot !== -1 ? filename.slice(dot) : ''
---
{filename ? (
  <figure class="file-editor">
    <figcaption class="fe-bar">
      <span class="fe-dots" aria-hidden="true"><i></i><i></i><i></i></span>
      <span class="fe-name">{name}<span class="fe-ext">{ext}</span></span>
    </figcaption>
    <div
      class="cm-mount"
      data-uri={uri}
      data-lang={lang}
      data-doc={doc}
      data-line-numbers={String(lineNumbers)}
      data-folding={String(folding)}
      data-define={String(define)}
      data-group={group ?? undefined}
      data-steps={steps ? JSON.stringify(steps) : undefined}
    ></div>
  </figure>
) : (
  <div
    class="cm-mount"
    data-uri={uri}
    data-lang={lang}
    data-doc={doc}
    data-line-numbers={String(lineNumbers)}
    data-folding={String(folding)}
    data-define={String(define)}
    data-group={group ?? undefined}
    data-steps={steps ? JSON.stringify(steps) : undefined}
  ></div>
)}
```

- [ ] **Step 2: Replace the `<style>` block with the bare styles plus the ported window chrome**

Replace the existing `<style>` block (lines 34-38) with:

```astro
<style>
  .cm-mount { border: 1px solid var(--ax-border-subtle); border-radius: var(--radius-5); overflow: hidden; margin: 24px 0; }
  .cm-mount :global(.cm-editor) { font-size: 14px; }
  .cm-mount :global(.cm-editor.cm-focused) { outline: none; }

  /* Window chrome — shown only when `filename` is set. The editor body is
     CodeMirror (themed by varEditorThemeExt), so the chrome is just the
     titlebar; the nested mount drops its own border/margin to nest cleanly. */
  .file-editor {
    margin: 28px 0;
    border: 2px solid var(--ink);
    border-radius: var(--radius-5);
    overflow: hidden;
    background: var(--ink);
    box-shadow: 6px 6px 0 0 var(--ink);
    transition:
      transform 0.15s ease,
      box-shadow 0.15s ease;
  }
  .file-editor:hover {
    transform: translate(-2px, -2px);
    box-shadow: 9px 9px 0 0 var(--ink);
  }
  .file-editor .cm-mount {
    margin: 0;
    border: 0;
    border-radius: 0;
  }
  .fe-bar {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 9px 16px;
    background: var(--yellow);
    border-bottom: 2px solid var(--ink);
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  }
  .fe-dots {
    display: inline-flex;
    gap: 7px;
  }
  .fe-dots i {
    display: block;
    width: 12px;
    height: 12px;
    border: 1.5px solid var(--ink);
    border-radius: 50%;
  }
  .fe-dots i:nth-child(1) {
    background: var(--accent);
  }
  .fe-dots i:nth-child(2) {
    background: var(--orange);
  }
  .fe-dots i:nth-child(3) {
    background: var(--cream);
  }
  .fe-name {
    font-size: 14px;
    font-weight: 600;
    color: var(--ink);
    letter-spacing: 0.01em;
  }
  .fe-ext {
    color: var(--accent);
  }
  @media (max-width: 520px) {
    .file-editor {
      box-shadow: 4px 4px 0 0 var(--ink);
    }
    .file-editor:hover {
      transform: none;
      box-shadow: 4px 4px 0 0 var(--ink);
    }
  }
</style>
<script>
  import '../scripts/editor-mount.ts'
</script>
```

- [ ] **Step 3: Build the website (type-checks the component)**

Run: `pnpm --filter @oselvar/website build`
Expected: exit 0. index/playground still render (they pass no `filename`/`group`/`steps`, so the bare branch is used and `data-group`/`data-steps` are absent → default group, no hidden steps).

- [ ] **Step 4: Commit**

```bash
git add packages/website/src/components/Editor.astro
git commit -m "feat(website): Editor gains optional filename chrome, group, hidden steps

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Migrate the three docs to `Editor`

**Files:**
- Modify: `packages/website/src/content/docs/start-here/hello-var-your-first-spec.mdx`
- Modify: `packages/website/src/content/docs/reference/step-arguments.mdx`
- Modify: `packages/website/src/content/docs/reference/tables.mdx`

**Interfaces:**
- Consumes: the new `Editor` props from Task 3.

Each runnable spec sample gets its **own** `group`, keeps its steps **hidden** via the `steps` prop (doc layout unchanged), and sets `define={false}` (no visible steps editor to receive a generated snippet; highlighting via semantic tokens is unaffected). The plain-markdown `hello.md` sample carries no steps and never runs.

- [ ] **Step 1: `hello-var-your-first-spec.mdx` — swap the import**

Change line 8 from:

```mdx
import FileEditor from '../../../components/FileEditor.astro'
```

to:

```mdx
import Editor from '../../../components/Editor.astro'
```

- [ ] **Step 2: `hello-var-your-first-spec.mdx` — migrate the plain `hello.md` sample**

Replace lines 16-20:

```mdx
<FileEditor filename="hello.md">{`
# Hello, Vár

I hope this works!
`}</FileEditor>
```

with:

```mdx
<Editor uri="file:///hello.md" lang="markdown" filename="hello.md" define={false} folding={false}>{`
# Hello, Vár

I hope this works!
`}</Editor>
```

- [ ] **Step 3: `hello-var-your-first-spec.mdx` — migrate the `hello.var.md` sample**

Replace lines 40-51:

```mdx
<FileEditor filename="hello.var.md" steps={[{ path: '01-hello.steps.ts', source: helloSteps }]}>{`
# Hello, Vár
Run \`pnpm test\` and watch this file run as tests.

First I greet "world" okay? I think the greeting should be "Hello, world!"

Try changing to "Hello, Vár!" and watch the test fail.

## Another example

The expression \`1+1\` should evaluate to \`2\`.
`}</FileEditor>
```

with (same body, new tag + `uri`/`group`, `define={false}`):

```mdx
<Editor uri="file:///hello.var.md" lang="markdown" filename="hello.var.md" group="hello-var-tutorial" define={false} steps={[{ path: '01-hello.steps.ts', source: helloSteps }]}>{`
# Hello, Vár
Run \`pnpm test\` and watch this file run as tests.

First I greet "world" okay? I think the greeting should be "Hello, world!"

Try changing to "Hello, Vár!" and watch the test fail.

## Another example

The expression \`1+1\` should evaluate to \`2\`.
`}</Editor>
```

- [ ] **Step 4: `step-arguments.mdx` — swap import and migrate the sample**

Change line 8 `import FileEditor …` → `import Editor from '../../../components/Editor.astro'`.

Replace lines 44-52:

```mdx
<FileEditor filename="hello.var.md" steps={[{ path: '01-hello.steps.ts', source: helloSteps }]}>{`
# Hello, Vár

First I greet "world" okay? I think the greeting should be "Hello, world!"

## Another example

The expression \`1+1\` should evaluate to \`2\`.
`}</FileEditor>
```

with:

```mdx
<Editor uri="file:///hello.var.md" lang="markdown" filename="hello.var.md" group="step-arguments" define={false} steps={[{ path: '01-hello.steps.ts', source: helloSteps }]}>{`
# Hello, Vár

First I greet "world" okay? I think the greeting should be "Hello, world!"

## Another example

The expression \`1+1\` should evaluate to \`2\`.
`}</Editor>
```

- [ ] **Step 5: `tables.mdx` — swap import and migrate the sample**

Change line 8 `import FileEditor …` → `import Editor from '../../../components/Editor.astro'`.

Replace lines 61-73:

```mdx
<FileEditor filename="yahtzee.var.md" steps={[{ path: '04-yahtzee.steps.ts', source: yahtzeeSteps }]}>{`
# Yahtzee

Examples of dice, category and score:

| dice          | category       | score |
| ------------- | -------------- | ----- |
| 3, 3, 3, 4, 4 | full house     | 17    |
| 3, 3, 3, 4, 4 | threes         | 9     |
| 3, 3, 3, 3, 3 | full house     | 0     |
| 3, 3, 3, 3, 3 | Yahtzee        | 50    |
| 1, 2, 3, 4, 5 | small straight | 15    |
`}</FileEditor>
```

with:

```mdx
<Editor uri="file:///yahtzee.var.md" lang="markdown" filename="yahtzee.var.md" group="tables" define={false} steps={[{ path: '04-yahtzee.steps.ts', source: yahtzeeSteps }]}>{`
# Yahtzee

Examples of dice, category and score:

| dice          | category       | score |
| ------------- | -------------- | ----- |
| 3, 3, 3, 4, 4 | full house     | 17    |
| 3, 3, 3, 4, 4 | threes         | 9     |
| 3, 3, 3, 3, 3 | full house     | 0     |
| 3, 3, 3, 3, 3 | Yahtzee        | 50    |
| 1, 2, 3, 4, 5 | small straight | 15    |
`}</Editor>
```

- [ ] **Step 6: Build the website**

Run: `pnpm --filter @oselvar/website build`
Expected: exit 0. No remaining references to `FileEditor` in these files.

- [ ] **Step 7: Commit**

```bash
git add packages/website/src/content/docs/start-here/hello-var-your-first-spec.mdx \
        packages/website/src/content/docs/reference/step-arguments.mdx \
        packages/website/src/content/docs/reference/tables.mdx
git commit -m "feat(website): docs use live Editor with hidden steps + window chrome

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Delete `FileEditor.astro` and the dead `highlightSteps`

**Files:**
- Delete: `packages/website/src/components/FileEditor.astro`
- Modify: `packages/website/src/lib/step-highlight.ts`
- Modify: `packages/website/src/lib/step-highlight.test.ts`
- Modify: `packages/website/src/components/CopyButton.astro`
- Modify: `packages/website/src/styles/global.css`

**Interfaces:**
- `step-highlight.ts` keeps only `decodeEntities` (still imported by `Editor.astro`). `highlightSteps`, `Segment`, `SegmentKind`, `HighlightedLine`, `StepFile`, `RANK`, `shrinkRange`, `coalesce`, and the `import … buildWorkspaceIndex` line are removed.

- [ ] **Step 1: Confirm `FileEditor` has no remaining references**

Run: `grep -rn "FileEditor" packages/website/src`
Expected: only `components/CopyButton.astro` (comments + the `.file-editor` skip), to be fixed below. No `import FileEditor` anywhere.

- [ ] **Step 2: Delete the component**

```bash
git rm packages/website/src/components/FileEditor.astro
```

- [ ] **Step 3: Trim `step-highlight.ts` to `decodeEntities` only**

Replace the entire file contents with:

```ts
// Astro escapes a fixed set of characters when it renders a text expression
// into a slot. Reverse the set Astro emits plus `&apos;` defensively (Astro
// does not emit `&apos;` but some tooling does). `&amp;` must be decoded last
// so we never double-decode.
export function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}
```

- [ ] **Step 4: Trim `step-highlight.test.ts` to the `decodeEntities` suite**

Replace the entire file contents with:

```ts
import { describe, expect, it } from 'vitest'
import { decodeEntities } from './step-highlight.js'

describe('decodeEntities', () => {
  it('reverses the entities Astro emits', () => {
    expect(decodeEntities('a &amp; b &lt;c&gt; &quot;q&quot; &#39;x&#39; &#34;y&#34;')).toBe(
      'a & b <c> "q" \'x\' "y"',
    )
  })
})
```

- [ ] **Step 5: Fix `CopyButton.astro` — drop the FileEditor skip + comments**

In `packages/website/src/components/CopyButton.astro`:

Change the header comment (lines 5-8) from:

```astro
// Rendered once per docs page. The script enhances every <pre> inside
// `.doc-body` (skipping the FileEditor code windows) with a copy button that
// follows the Aksel CopyButton behaviour: a Files icon that swaps to a
// Checkmark + "Copied!" label for 2s after a successful copy.
```

to:

```astro
// Rendered once per docs page. The script enhances every <pre> inside
// `.doc-body` with a copy button that follows the Aksel CopyButton behaviour:
// a Files icon that swaps to a Checkmark + "Copied!" label for 2s after a
// successful copy. (Live CodeMirror editors render a contenteditable div, not a
// <pre>, so they are never matched.)
```

Remove the skip (lines 87-88):

```astro
      // Skip the FileEditor code windows — only real fenced code blocks.
      if (pre.closest('.file-editor')) continue
```

(Delete both lines; the `for` loop body continues with the `const wrap = …` that followed.)

- [ ] **Step 6: Fix the legacy-brand comment in `global.css`**

Change the comment at line ~13 from:

```css
  /* Legacy brand names still used by FileEditor + the CodeMirror theme files.
     They resolve to the mode-aware tokens defined below. */
```

to:

```css
  /* Legacy brand names still used by the Editor window chrome + the CodeMirror
     theme files. They resolve to the mode-aware tokens defined below. */
```

- [ ] **Step 7: Run the trimmed tests**

Run: `NODE_OPTIONS="--import tsx" npx vitest run packages/website/src/lib/step-highlight.test.ts packages/website/src/lib/run-grouping.test.ts`
Expected: PASS (1 + 5 tests).

- [ ] **Step 8: Dead-code + lint + build**

Run: `pnpm knip`
Expected: no new unused-export/file findings for `step-highlight.ts` or `run-grouping.ts`. (If `knip` flags a pre-existing unrelated issue, leave it; only fix regressions introduced here.)

Run: `pnpm biome check packages/website/src`
Expected: no errors.

Run: `pnpm --filter @oselvar/website build`
Expected: exit 0.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "refactor(website): delete FileEditor + dead highlightSteps; fixups

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Full verification + manual visual pass

**Files:** none (verification only).

- [ ] **Step 1: Full project check**

Run: `pnpm check`
Expected: lint + typecheck + tests + knip + jscpd all pass. (`pnpm check` = `lint && typecheck && test && knip && jscpd`.)

- [ ] **Step 2: Website build**

Run: `pnpm --filter @oselvar/website build`
Expected: exit 0.

- [ ] **Step 3: Manual visual pass (dev server)**

Run: `pnpm --filter @oselvar/website dev` and open each page:
- `/` (index) — the showcase editor + hidden steps still run; spec shows pass/fail.
- `/playground` — spec + steps editors run together (default group).
- `/start-here/hello-var-your-first-spec` — the `hello.md` window renders (chrome titlebar, no run); the `hello.var.md` window renders, is editable, shows semantic highlighting, and runs (red/green) using its hidden steps. Editing it re-runs only this sample.
- `/reference/step-arguments` — `hello.var.md` window renders and runs.
- `/reference/tables` — `yahtzee.var.md` window renders, table cells show pass/fail.

Confirm: window chrome (traffic-light dots + filename with coloured extension) appears on doc samples; no copy button is attached to live editors; no console errors.

- [ ] **Step 4: Final confirmation**

Report results (build exit code, test counts, any manual findings). No commit needed if Tasks 1-5 are already committed and nothing changed.

---

## Self-Review

**Spec coverage:**
- Live & editable doc samples → Tasks 3-4 (live `Editor`, `define={false}` keeps highlighting; runs via hidden steps). ✓
- Optional filename chrome → Task 3 (`filename` prop + ported `.fe-*` chrome). ✓
- Per-doc steps (hidden carried) → Task 3 (`steps` prop → `data-steps`) + Task 2 (parse + merge). Visible-steps alternative is supported (second `<Editor>` in same group) though the 3 docs use hidden. ✓
- Group run scope → Task 1 (`groupRunInputs`) + Task 2 (per-group debounce/run). ✓
- Delete FileEditor + dead `highlightSteps`, keep `decodeEntities` → Task 5. ✓
- CopyButton + global.css comment fixups → Task 5. ✓
- index/playground unchanged (default group) → verified Task 6. ✓

**Placeholder scan:** No TBD/TODO; every code step shows full code. ✓

**Type consistency:** `groupRunInputs(editors, hiddenStepsByGroup)`, `StepFile`, `EditorDescriptor`, `RunInput` are used identically in Tasks 1-2. `data-group`/`data-steps` attribute names match between Task 2 (read) and Task 3 (write). `filename`/`group`/`steps` prop names match between Task 3 (definition) and Task 4 (usage). ✓
