# Authoring Surface Implementation Plan (Sub-project D)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Per-language snippet generation (Python/Java/Kotlin emitters + default templates, language selected from `config.steps` by the user-approved algorithm), a lifted rename signature-sync guard, and VS Code activation for the new languages.

**Architecture:** The `SnippetEmitter` interface grows from one method (`typeNameFor`) to own every language-shaped construct: param rendering (`name: Type` vs `Type name`), the state/ctx first argument (absent in Kotlin, whose lambdas are user-params-only with state as receiver), and the per-language default template. `generateSnippet` and `buildHandlerSync` delegate to the emitter; TypeScript output stays byte-identical (existing snippet tests pass unchanged). The LSP picks the snippet language server-side — languages derived from `config.steps` glob extensions; single → use it; multiple → most indexed step files wins; tie → first appearance in `config.steps` order — and returns it in the `var/generateSnippet` response so the VS Code quick-pick can filter to that language's files. The rename guard flips from ".ts/.tsx only" to "emitter by `languageIdForPath`", with one safety carve-out: a Kotlin sync that would empty the lambda's param list is skipped (it would strand the `->`).

**Tech Stack:** existing var-language/var-lsp/var-vscode packages; no new dependencies. Spec: `docs/superpowers/specs/2026-07-02-multi-language-authoring-design.md` (Sub-project D + the decision log's snippet-selection algorithm).

## Global Constraints

- Run all pnpm/vitest commands from `typescript/`. `pnpm -r build` + `pnpm typecheck` per task; `pnpm check` + website build + `make check` at the end. Biome quirk: this worktree's path contains `.claude` — run biome legs from a hardlink copy at a `.claude`-free path when needed; never modify biome.json.
- Biome style: single quotes, no semicolons, 2-space indent, trailing commas, `import type`. Immutable types. NO raw control bytes in any source file (a prior task shipped one — textual escapes only).
- Behavior preservation: every existing snippet/handler test passes UNCHANGED except where a task explicitly modifies it (the TS-only-guard test from sub-project C is deliberately replaced in Task 2).
- Snippet-language selection algorithm (user-approved, spec section D): derive the language of each glob in `config.steps` from its extension; exactly one language → use it; multiple → count the workspace's indexed step files per language and pick the max; tie → the language appearing FIRST in `config.steps` order. The quick-pick is then filtered to files of the picked language.
- `typescript-tsx` normalizes to `typescript` everywhere in this feature (templates, emitters, selection, filtering).
- Emitter type-name mappings (Number-typed parameter type / everything else): TypeScript `number`/`string`, Python `int`/`str`, Java `Integer`/`String`, Kotlin `Int`/`String`.
- Packaging deferral (spec deviation, recorded in Task 3's spec edit): there is NO VS Code packaging pipeline today (dev symlink installer only — `typescript/scripts/install-vscode.mjs`); the spec's "packaged extension bundles wasm" line is deferred to a future packaging project. The dev-install flow already resolves all five wasm files through the workspace's node_modules.
- Trunk stays green per task.

---

### Task 1: Per-language snippet emitters + templates in var-language

**Files:**
- Rewrite: `typescript/packages/var-language/src/snippet-emitter.ts`
- Modify: `typescript/packages/var-language/src/snippet.ts`
- Modify: `typescript/packages/var-language/src/snippet-template.ts` (add three templates)
- Modify: `typescript/packages/var-language/src/index.ts` (export `emitterForLanguage`; keep existing exports)
- Test: `typescript/packages/var-language/tests/snippet-emitter.test.ts` (extend), `typescript/packages/var-language/tests/snippet-languages.test.ts` (new)

**Interfaces:**
- Consumes: `LanguageId` from `./tree-sitter-dialects/types.js`; existing `renderTemplate`, `DEFAULT_SNIPPET_TEMPLATE`.
- Produces (Tasks 2–3 rely on):

```ts
export interface SnippetEmitter {
  // Normalized language id: 'typescript' | 'python' | 'java' | 'kotlin'.
  readonly language: string
  readonly defaultTemplate: string
  // Whether the state/ctx argument appears in the handler's parameter list.
  // True everywhere except Kotlin, where state is the lambda receiver.
  readonly stateInParams: boolean
  typeNameFor(parameterType: { readonly type: unknown }): string
  // 'name: Type' (ts/py/kt) vs 'Type name' (java); bare name when typeName is ''.
  renderParam(name: string, typeName: string): string
  // The rendered state argument ('state', 'Ctx ctx', ...); '' when stateInParams is false.
  renderStateParam(): string
}
export function createTypeScriptSnippetEmitter(): SnippetEmitter
export function createPythonSnippetEmitter(): SnippetEmitter
export function createJavaSnippetEmitter(): SnippetEmitter
export function createKotlinSnippetEmitter(): SnippetEmitter
// tsx → typescript; undefined/unknown → typescript.
export function emitterForLanguage(languageId: string | undefined): SnippetEmitter
```

- `generateSnippet(rawText, registry, options)` keeps its signature; template fallback becomes `options.template ?? emitter.defaultTemplate`; a new template variable `{{lambdaParams}}` (Kotlin: `count: Int ->` or `''`) joins the existing set. TypeScript `fullCode` output is byte-identical for every existing test.

- [ ] **Step 1: Write the failing tests**

Extend `typescript/packages/var-language/tests/snippet-emitter.test.ts` with:

```ts
test('python emitter maps Number to int, others to str, renders name: Type', () => {
  const e = createPythonSnippetEmitter()
  expect(e.typeNameFor({ type: Number })).toBe('int')
  expect(e.typeNameFor({ type: String })).toBe('str')
  expect(e.renderParam('count', 'int')).toBe('count: int')
  expect(e.renderParam('row', '')).toBe('row')
  expect(e.renderStateParam()).toBe('state')
  expect(e.stateInParams).toBe(true)
})

test('java emitter maps Number to Integer, renders Type name', () => {
  const e = createJavaSnippetEmitter()
  expect(e.typeNameFor({ type: Number })).toBe('Integer')
  expect(e.typeNameFor({ type: String })).toBe('String')
  expect(e.renderParam('count', 'Integer')).toBe('Integer count')
  expect(e.renderStateParam()).toBe('Ctx ctx')
})

test('kotlin emitter maps Number to Int and has no state param', () => {
  const e = createKotlinSnippetEmitter()
  expect(e.typeNameFor({ type: Number })).toBe('Int')
  expect(e.renderParam('count', 'Int')).toBe('count: Int')
  expect(e.stateInParams).toBe(false)
  expect(e.renderStateParam()).toBe('')
})

test('emitterForLanguage normalizes tsx and defaults unknown to typescript', () => {
  expect(emitterForLanguage('typescript-tsx').language).toBe('typescript')
  expect(emitterForLanguage('python').language).toBe('python')
  expect(emitterForLanguage(undefined).language).toBe('typescript')
  expect(emitterForLanguage('rust').language).toBe('typescript')
})
```

New `typescript/packages/var-language/tests/snippet-languages.test.ts`:

```ts
import { createRegistry } from '@oselvar/var-core'
import { expect, test } from 'vitest'
import { generateSnippet } from '../src/snippet.js'
import {
  createJavaSnippetEmitter,
  createKotlinSnippetEmitter,
  createPythonSnippetEmitter,
} from '../src/snippet-emitter.js'

test('python snippet renders a decorated def with typed args', () => {
  const s = generateSnippet('I have 5 cukes', createRegistry(), {
    snippetEmitter: createPythonSnippetEmitter(),
  })
  expect(s.fullCode).toContain('@action("I have {int} cukes")')
  expect(s.fullCode).toContain('def _(state, count: int):')
  expect(s.fullCode).toContain('raise NotImplementedError')
  expect(s.fullCode).toContain('# @context("I have {int} cukes")')
})

test('java snippet renders a binder call with Type-name args', () => {
  const s = generateSnippet('I have 5 cukes', createRegistry(), {
    snippetEmitter: createJavaSnippetEmitter(),
  })
  expect(s.fullCode).toContain('s.action(')
  expect(s.fullCode).toContain('"I have {int} cukes"')
  expect(s.fullCode).toContain('(Ctx ctx, Integer count) -> {')
  expect(s.fullCode).toContain('UnsupportedOperationException')
})

test('kotlin snippet renders a trailing lambda with user-only params', () => {
  const s = generateSnippet('I have 5 cukes', createRegistry(), {
    snippetEmitter: createKotlinSnippetEmitter(),
  })
  expect(s.fullCode).toContain('action("I have {int} cukes") { count: Int ->')
  expect(s.fullCode).toContain('TODO("not implemented")')
})

test('kotlin snippet with no parameters renders an empty lambda header', () => {
  const s = generateSnippet('the world turns', createRegistry(), {
    snippetEmitter: createKotlinSnippetEmitter(),
  })
  expect(s.fullCode).toContain('action("the world turns") {')
  expect(s.fullCode).not.toContain('->')
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run (from `typescript/`): `pnpm --filter @oselvar/var-language exec vitest run tests/snippet-emitter.test.ts tests/snippet-languages.test.ts`
Expected: FAIL — the new factory functions don't exist.

- [ ] **Step 3: Implement**

`typescript/packages/var-language/src/snippet-template.ts` — keep `DEFAULT_SNIPPET_TEMPLATE` unchanged, append:

```ts
// Python: decorated def. {{args}} arrives pre-rendered ('state, count: int').
export const PYTHON_SNIPPET_TEMPLATE = `# @{{altA}}("{{expression}}")
# @{{altB}}("{{expression}}")
@{{role}}("{{expression}}")
def _({{args}}):
    # Write code here that turns the phrase above into concrete actions
    raise NotImplementedError("not implemented")
`

// Java: binder call on the conventional 's' StateBinder variable. {{args}}
// arrives pre-rendered ('Ctx ctx, Integer count').
export const JAVA_SNIPPET_TEMPLATE = `// s.{{altA}}("{{expression}}", ({{args}}) -> { ... })
// s.{{altB}}("{{expression}}", ({{args}}) -> { ... })
s.{{role}}(
        "{{expression}}",
        ({{args}}) -> {
            // Write code here that turns the phrase above into concrete actions
            throw new UnsupportedOperationException("not implemented");
        });
`

// Kotlin: trailing lambda; state is the receiver, so params are user-only.
// {{lambdaParams}} is 'count: Int ->' or '' (zero-capture step).
export const KOTLIN_SNIPPET_TEMPLATE = `// {{altA}}("{{expression}}") { {{lambdaParams}} ... }
// {{altB}}("{{expression}}") { {{lambdaParams}} ... }
{{role}}("{{expression}}") { {{lambdaParams}}
    // Write code here that turns the phrase above into concrete actions
    TODO("not implemented")
}
`
```

`typescript/packages/var-language/src/snippet-emitter.ts` — full rewrite:

```ts
import {
  DEFAULT_SNIPPET_TEMPLATE,
  JAVA_SNIPPET_TEMPLATE,
  KOTLIN_SNIPPET_TEMPLATE,
  PYTHON_SNIPPET_TEMPLATE,
} from './snippet-template.js'

// Owns every language-shaped construct of generated step-definition source:
// the type-name mapping, the 'name: Type' vs 'Type name' param shape, the
// state/ctx first argument (absent in Kotlin — state is the lambda receiver),
// and the language's default snippet template. generateSnippet and the LSP's
// rename handler-signature sync both delegate here, which is what makes
// non-TypeScript sync safe (sub-project D lifted the C-era TS-only guard).
export interface SnippetEmitter {
  readonly language: string
  readonly defaultTemplate: string
  readonly stateInParams: boolean
  typeNameFor(parameterType: { readonly type: unknown }): string
  renderParam(name: string, typeName: string): string
  renderStateParam(): string
}

const colonParam = (name: string, typeName: string): string =>
  typeName ? `${name}: ${typeName}` : name

export function createTypeScriptSnippetEmitter(): SnippetEmitter {
  return {
    language: 'typescript',
    defaultTemplate: DEFAULT_SNIPPET_TEMPLATE,
    stateInParams: true,
    typeNameFor: (pt) => (pt.type === Number ? 'number' : 'string'),
    renderParam: colonParam,
    renderStateParam: () => 'state',
  }
}

export function createPythonSnippetEmitter(): SnippetEmitter {
  return {
    language: 'python',
    defaultTemplate: PYTHON_SNIPPET_TEMPLATE,
    stateInParams: true,
    typeNameFor: (pt) => (pt.type === Number ? 'int' : 'str'),
    renderParam: colonParam,
    renderStateParam: () => 'state',
  }
}

export function createJavaSnippetEmitter(): SnippetEmitter {
  return {
    language: 'java',
    defaultTemplate: JAVA_SNIPPET_TEMPLATE,
    stateInParams: true,
    typeNameFor: (pt) => (pt.type === Number ? 'Integer' : 'String'),
    renderParam: (name, typeName) => (typeName ? `${typeName} ${name}` : name),
    // 'Ctx' is the repo-wide fixture convention for the state record; the
    // author renames it to their real state type after pasting.
    renderStateParam: () => 'Ctx ctx',
  }
}

export function createKotlinSnippetEmitter(): SnippetEmitter {
  return {
    language: 'kotlin',
    defaultTemplate: KOTLIN_SNIPPET_TEMPLATE,
    stateInParams: false,
    typeNameFor: (pt) => (pt.type === Number ? 'Int' : 'String'),
    renderParam: colonParam,
    renderStateParam: () => '',
  }
}

const EMITTERS: Readonly<Record<string, () => SnippetEmitter>> = {
  typescript: createTypeScriptSnippetEmitter,
  'typescript-tsx': createTypeScriptSnippetEmitter,
  python: createPythonSnippetEmitter,
  java: createJavaSnippetEmitter,
  kotlin: createKotlinSnippetEmitter,
}

// tsx normalizes to typescript; unknown/undefined default to typescript so
// every existing TS-only caller keeps its behavior.
export function emitterForLanguage(languageId: string | undefined): SnippetEmitter {
  const factory = languageId !== undefined && Object.hasOwn(EMITTERS, languageId)
    ? EMITTERS[languageId]
    : undefined
  return (factory ?? createTypeScriptSnippetEmitter)()
}
```

`typescript/packages/var-language/src/snippet.ts` — replace the arg/signature/template assembly (keep the generator + FRIENDLY_NAMES + naming logic unchanged):

```ts
  const handlerArgs = (generated?.parameterTypes ?? []).map((pt) => {
    const baseName = FRIENDLY_NAMES[pt.name ?? ''] ?? pt.name ?? 'arg'
    const count = (usedNames.get(baseName) ?? 0) + 1
    usedNames.set(baseName, count)
    const argName = count === 1 ? baseName : `${baseName}${count}`
    return emitter.renderParam(argName, emitter.typeNameFor(pt))
  })

  const stateParam = emitter.renderStateParam()
  const argsList = stateParam ? [stateParam, ...handlerArgs] : handlerArgs
  const args = argsList.join(', ')
  // Kotlin-style trailing-lambda header: params + arrow, or empty when the
  // step captures nothing (a bare '{' block). Other templates ignore it.
  const lambdaParams = handlerArgs.length > 0 ? `${handlerArgs.join(', ')} ->` : ''
  const handlerSignature = `(${args}) => {`
  const role: StepKind = options.role ?? 'action'
  const others = (['context', 'action', 'sensor'] as const).filter((k) => k !== role)
  const fullCode = renderTemplate(options.template ?? emitter.defaultTemplate, {
    role,
    altA: others[0] as string,
    altB: others[1] as string,
    expression,
    args,
    lambdaParams,
    originalText,
  })
```

Note: for TypeScript this is output-identical on every tested surface (args string unchanged; the only delta is `handlerSignature` for a ZERO-parameter step, which previously rendered a stray `(state, ) => {` — the new `(state) => {` is strictly better and untested either way; call it out in the commit message). Export `emitterForLanguage` plus the three new factories and templates from `index.ts` alongside the existing snippet exports.

- [ ] **Step 4: Run tests to verify they pass, then gates**

Run: `pnpm --filter @oselvar/var-language exec vitest run` — the new tests pass AND every pre-existing snippet test passes UNCHANGED (TS byte-identity proof). Then `pnpm -r build && pnpm typecheck`.

- [ ] **Step 5: Commit**

```bash
git add typescript/packages/var-language
git commit -m "feat(var-language): per-language snippet emitters and templates"
```

---

### Task 2: LSP — server-side language selection, per-language templates, guard lift

**Files:**
- Modify: `typescript/packages/var-lsp/src/store.ts` (`snippetTemplate(language)`, new `stepPaths()`)
- Modify: `typescript/packages/var-lsp/src/handlers.ts` (selection algorithm; emitter threading; guard lift; `SnippetResult` gains `language`)
- Modify: `typescript/packages/var-lsp/src/protocol.ts` (add `GenerateSnippetResult`)
- Modify: `typescript/packages/var-lsp/src/store.test.ts` (snippetTemplate signature), `typescript/packages/var-lsp/tests/handlers.test.ts` (selection + guard tests; the C-era `.py`-returns-no-handlerSync test is REPLACED — see Step 1)

**Interfaces:**
- Consumes: `emitterForLanguage`, `languageIdForPath` from `@oselvar/var-language` (Task 1 + sub-project C); `config.snippets: Readonly<Record<string, string>>`.
- Produces (Task 3 relies on): `var/generateSnippet` response type `GenerateSnippetResult = { readonly fullCode: string; readonly expression: string; readonly language: string }` exported from `@oselvar/var-lsp/protocol`; `Store.snippetTemplate(language: string): string | undefined` (reads `config.snippets[language]`); `Store.stepPaths(): ReadonlyArray<string>` (the step files listed at the last reindex).
- Selection helper (internal to handlers.ts, tested through the request): languages from `config.steps` glob extensions via `languageIdForPath` (tsx→typescript, dedup, config order); one → it; several → group `store.stepPaths()` by normalized language, max count wins, tie → earliest configured; none recognizable → `typescript`.
- Guard lift semantics: `syncable` becomes `handlerParams !== undefined` (no extension check); `buildHandlerSync` gains the emitter (`emitterForLanguage(languageIdForPath(stepDefRecord.file))`), renders params via `emitter.renderParam`, honors `stateInParams` (Kotlin: do NOT treat `params[0]` as ctx, no ctx prefix), and returns `undefined` when a Kotlin sync would produce ZERO params (an empty param list would strand the lambda's `->`).

- [ ] **Step 1: Write the failing tests**

In `typescript/packages/var-lsp/tests/handlers.test.ts` (follow the file's `tempWorkspace`/`makeStore` conventions — read neighbouring tests first):

```ts
test('generateSnippet picks python when it is the only configured step language', async () => {
  const { dir, cleanup } = tempWorkspace((dir) => {
    writeFileSync(
      join(dir, 'var.config.json'),
      '{ "docs": { "include": ["**/*.md"], "exclude": [] }, "steps": ["**/*.steps.py"] }\n',
    )
    writeFileSync(join(dir, 'a.steps.py'), '@action("existing")\ndef _(state):\n    pass\n')
    writeFileSync(join(dir, 'b.md'), '# B\n\nGiven I have 5 cukes')
  })
  try {
    const store = await makeStore(dir)
    const h = buildHandlers(store)
    const result = h.generateSnippet({ text: 'I have 5 cukes' })
    expect(result.language).toBe('python')
    expect(result.fullCode).toContain('@action("I have {int} cukes")')
    expect(result.fullCode).toContain('def _(state, count: int):')
  } finally {
    cleanup()
  }
})

test('generateSnippet resolves multi-language by file count, ties by config order', async () => {
  const { dir, cleanup } = tempWorkspace((dir) => {
    writeFileSync(
      join(dir, 'var.config.json'),
      '{ "docs": { "include": ["**/*.md"], "exclude": [] }, "steps": ["**/*.steps.ts", "**/*.steps.py"] }\n',
    )
    // Two python files vs one typescript file: python wins on count.
    writeFileSync(join(dir, 'a.steps.ts'), `action('x', () => {})\n`)
    writeFileSync(join(dir, 'p1.steps.py'), '@action("p1")\ndef _(state):\n    pass\n')
    writeFileSync(join(dir, 'p2.steps.py'), '@action("p2")\ndef _(state):\n    pass\n')
    writeFileSync(join(dir, 'b.md'), '# B\n\nGiven x')
  })
  try {
    const store = await makeStore(dir)
    const h = buildHandlers(store)
    expect(h.generateSnippet({ text: 'I greet "bob"' }).language).toBe('python')
  } finally {
    cleanup()
  }
})

test('generateSnippet tie-breaks to the first language in config.steps order', async () => {
  const { dir, cleanup } = tempWorkspace((dir) => {
    writeFileSync(
      join(dir, 'var.config.json'),
      '{ "docs": { "include": ["**/*.md"], "exclude": [] }, "steps": ["**/*.steps.py", "**/*.steps.ts"] }\n',
    )
    writeFileSync(join(dir, 'a.steps.ts'), `action('x', () => {})\n`)
    writeFileSync(join(dir, 'p1.steps.py'), '@action("p1")\ndef _(state):\n    pass\n')
    writeFileSync(join(dir, 'b.md'), '# B\n\nGiven x')
  })
  try {
    const store = await makeStore(dir)
    const h = buildHandlers(store)
    expect(h.generateSnippet({ text: 'hello' }).language).toBe('python')
  } finally {
    cleanup()
  }
})

test('generateSnippet honors a config snippets template override for the picked language', async () => {
  const { dir, cleanup } = tempWorkspace((dir) => {
    writeFileSync(
      join(dir, 'var.config.json'),
      '{ "docs": { "include": ["**/*.md"], "exclude": [] }, "steps": ["**/*.steps.py"], "snippets": { "python": "PY:{{expression}}" } }\n',
    )
    writeFileSync(join(dir, 'a.steps.py'), '@action("existing")\ndef _(state):\n    pass\n')
    writeFileSync(join(dir, 'b.md'), '# B\n\nGiven x')
  })
  try {
    const store = await makeStore(dir)
    const h = buildHandlers(store)
    expect(h.generateSnippet({ text: 'I have 5 cukes' }).fullCode).toBe('PY:I have {int} cukes')
  } finally {
    cleanup()
  }
})
```

Guard-lift rename tests — REPLACE sub-project C's test `renaming a step defined in a .py file returns no handlerSync` (exact name may differ; find the test added by the C plan asserting `plan.handlerSync` undefined for a `.py` step) with:

```ts
test('renaming a .py step syncs the def parameters in python shape', async () => {
  // Same fixture shape as the .ts handlerSync test (param addition), but the
  // step lives in a .py file: sync now fires and renders python source.
  const { dir, cleanup } = tempWorkspace((dir) => {
    writeFileSync(
      join(dir, 'var.config.json'),
      '{ "docs": { "include": ["**/*.md"], "exclude": [] }, "steps": ["**/*.steps.py"] }\n',
    )
    writeFileSync(join(dir, 'a.steps.py'), '@action("I greet {string}")\ndef _(state, user):\n    pass\n')
    writeFileSync(join(dir, 'b.md'), '# B\n\nGiven I greet "bob"')
  })
  try {
    const store = await makeStore(dir)
    const h = buildHandlers(store)
    const at = h.stepAt({ uri: `file://${join(dir, 'b.md')}`, position: { line: 2, character: 8 } })
    expect(at).toBeTruthy()
    const plan = h.planRename({
      uri: `file://${join(dir, 'b.md')}`,
      position: { line: 2, character: 8 },
      newName: 'I greet "bob" {int} times',
    })
    if (!plan.ok) throw new Error(plan.error)
    expect(plan.handlerSync).toBeDefined()
    // Kept param reused verbatim; added {int} param rendered python-style.
    expect(plan.handlerSync?.newText).toBe('state, user, count: int')
  } finally {
    cleanup()
  }
})
```

(Adapt the exact `stepAt`/`planRename` call shapes and md positions to the file's existing `.ts` handlerSync test — copy its skeleton, change the fixture to `.py` and the assertions to the values above.)

In `typescript/packages/var-lsp/src/store.test.ts`: update the `snippetTemplate` usage to the new one-arg form — assert `store.snippetTemplate('typescript')` returns the configured template and `store.snippetTemplate('python')` is `undefined` when only typescript is configured.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @oselvar/var-lsp exec vitest run`
Expected: FAIL — `generateSnippet` result has no `language`; `snippetTemplate` arity; the replaced rename test.

- [ ] **Step 3: Implement**

`typescript/packages/var-lsp/src/store.ts`:
- `snippetTemplate(language: string): string | undefined` → `config.snippets[language]` (use `Object.hasOwn` guard: `Object.hasOwn(config.snippets, language) ? config.snippets[language] : undefined`).
- Add `stepPaths(): ReadonlyArray<string>` to the `Store` type and implementation: capture `stepPaths` from `reindex()` into a `let currentStepPaths: ReadonlyArray<string> = []` and return it.

`typescript/packages/var-lsp/src/protocol.ts`:

```ts
export type GenerateSnippetResult = {
  readonly fullCode: string
  readonly expression: string
  // The language the server selected from config.steps (the user-approved
  // algorithm: single configured language, else most step files, tie broken
  // by config order). The client filters its steps-file quick-pick to this.
  readonly language: string
}
```

`typescript/packages/var-lsp/src/handlers.ts`:
- Import `emitterForLanguage`, `languageIdForPath` from `@oselvar/var-language` and `GenerateSnippetResult` from `./protocol.js`; replace the internal `SnippetResult` with `GenerateSnippetResult`.
- Add the selection helper (module-private):

```ts
// The user-approved snippet-language selection: languages configured in
// config.steps (by glob extension, config order, tsx folded into
// typescript); a single configured language wins outright; with several,
// the language owning the most indexed step files wins; ties break to the
// FIRST configured language. No recognizable language -> typescript.
function snippetLanguageFor(
  stepGlobs: ReadonlyArray<string>,
  stepPaths: ReadonlyArray<string>,
): string {
  const normalize = (id: string): string => (id === 'typescript-tsx' ? 'typescript' : id)
  const configured: string[] = []
  for (const glob of stepGlobs) {
    const id = languageIdForPath(glob)
    if (id === undefined) continue
    const language = normalize(id)
    if (!configured.includes(language)) configured.push(language)
  }
  if (configured.length === 0) return 'typescript'
  if (configured.length === 1) return configured[0] as string
  const counts = new Map<string, number>()
  for (const path of stepPaths) {
    const id = languageIdForPath(path)
    if (id === undefined) continue
    const language = normalize(id)
    counts.set(language, (counts.get(language) ?? 0) + 1)
  }
  let best = configured[0] as string
  let bestCount = counts.get(best) ?? 0
  for (const language of configured.slice(1)) {
    const count = counts.get(language) ?? 0
    if (count > bestCount) {
      best = language
      bestCount = count
    }
  }
  return best
}
```

- `generateSnippet` handler: pick `const language = snippetLanguageFor(store.stepGlobs(), store.stepPaths())`, `const emitter = emitterForLanguage(language)`, `const template = store.snippetTemplate(language)`, pass BOTH `snippetEmitter: emitter` and (when defined) `template` to `generateSnippet(...)`, return `{ fullCode, expression, language }`.
- Guard lift in `planRename`: replace the `syncable` extension check with `handlerParams !== undefined`; compute `const emitter = emitterForLanguage(languageIdForPath(stepDefRecord.file))` and pass `snippetEmitter: emitter` into `buildHandlerSync`. Update the C-era comment to say sync is now per-language via emitters.
- `buildHandlerSync`: replace `renderHandlerParam` calls with `emitter.renderParam(p.name, p.typeText)`; typeText for added params via `emitter.typeNameFor(paramType)` with fallback `emitter.typeNameFor({ type: String })`; honor `emitter.stateInParams`:

```ts
  const emitter = input.snippetEmitter ?? createTypeScriptSnippetEmitter()
  // Kotlin lambdas carry user params only (state is the receiver): the whole
  // old params list is user params, and there is no ctx prefix to render.
  const ctxParam = emitter.stateInParams ? old.params[0] : undefined
  const oldUserParams = emitter.stateInParams ? old.params.slice(1) : [...old.params]
  ...
  const userText = newUserParams.map((p) => emitter.renderParam(p.name, p.typeText)).join(', ')
  if (!emitter.stateInParams && newUserParams.length === 0) {
    // An empty Kotlin param list would strand the lambda's '->'; skip the
    // sync rather than corrupt the file (the author removes the params).
    return undefined
  }
  const ctxText = ctxParam
    ? emitter.renderParam(ctxParam.name, ctxParam.typeText)
    : emitter.stateInParams
      ? emitter.renderStateParam()
      : ''
  const newText = ctxText ? (userText ? `${ctxText}, ${userText}` : ctxText) : userText
```

(`buildHandlerSync`'s return type becomes `HandlerSync | undefined`; `planRename` already handles `undefined`.)

- [ ] **Step 4: Run the gates**

Run: `pnpm --filter @oselvar/var-lsp exec vitest run && pnpm --filter @oselvar/var-language exec vitest run` then `pnpm -r build && pnpm typecheck`. The pre-existing `.ts` handlerSync rename test must pass UNCHANGED (TS byte-identity through the emitter path).

- [ ] **Step 5: Commit**

```bash
git add typescript/packages/var-lsp typescript/packages/var-language
git commit -m "feat(var-lsp): per-language snippet selection and rename signature sync"
```

---

### Task 3: VS Code wiring, website config, spec bookkeeping, full gate

**Files:**
- Modify: `typescript/packages/var-vscode/package.json` (activationEvents), `typescript/packages/var-vscode/src/extension.ts` (selectors, rename providers, quick-pick filter, fallback globs)
- Modify: `typescript/packages/website/src/lib/var-worker.ts`, `typescript/packages/website-starlight/src/lib/var-worker.ts` (no functional need — leave `snippets` typescript-only; ONLY update if the `GenerateSnippetResult` type change surfaces in editor-mount typings; verify)
- Modify: `docs/superpowers/specs/2026-07-02-multi-language-authoring-design.md` (Status; packaging deferral note)

**Interfaces:**
- Consumes: `GenerateSnippetResult` from `@oselvar/var-lsp/protocol`; `languageIdForPath` from `@oselvar/var-language` (already a dependency of var-vscode).

- [ ] **Step 1: Extend activation and selectors**

`typescript/packages/var-vscode/package.json` `activationEvents`:

```json
  "activationEvents": [
    "onLanguage:markdown",
    "onLanguage:typescript",
    "onLanguage:python",
    "onLanguage:java",
    "onLanguage:kotlin",
    "workspaceContains:**/var.config.json"
  ],
```

`typescript/packages/var-vscode/src/extension.ts`:
- `documentSelector` gains the three step-file patterns used by the repo's conventions:

```ts
    documentSelector: [
      { scheme: 'file', pattern: '**/*.md' },
      { scheme: 'file', pattern: '**/*.steps.ts' },
      { scheme: 'file', pattern: '**/*.steps.py' },
      { scheme: 'file', pattern: '**/*.steps.kt' },
      { scheme: 'file', pattern: '**/*Steps.java' },
    ],
```

- The same three patterns are added as `registerRenameProvider` registrations beside the existing `**/*.steps.ts` one.
- `findStepFiles` fallback becomes `['**/*.steps.ts', '**/*.steps.py', '**/*.steps.kt', '**/*Steps.java']`.

- [ ] **Step 2: Filter the quick-pick to the selected language**

In `registerGenerateStepDefinition`: type the `var/generateSnippet` response as `GenerateSnippetResult` (import from `@oselvar/var-lsp/protocol`), then filter:

```ts
import { languageIdForPath } from '@oselvar/var-language'
...
    const normalize = (id: string | undefined): string | undefined =>
      id === 'typescript-tsx' ? 'typescript' : id
    const stepFiles = (await findStepFiles(stepGlobs)).filter(
      (u) => normalize(languageIdForPath(u.fsPath)) === snippet.language,
    )
    if (stepFiles.length === 0) {
      void window.showWarningMessage(
        `No ${snippet.language} steps files found in the workspace. Create one first, then re-run the command.`,
      )
      return
    }
```

(The snippet is generated by the server in the selected language BEFORE the pick, and the pick is filtered to that language — snippet and target file can never disagree, per the approved design.)

- [ ] **Step 3: Verify the websites need no change**

Run: `pnpm --filter @oselvar/website build && pnpm --filter @oselvar/website check 2>&1 | tail -20` — the editor-mounts type the snippet response inline as `{ fullCode, expression }`; the added `language` field is structurally compatible, so no edit is expected. If `check` reports a NEW error at the `var/generateSnippet` call sites, update those inline types to `GenerateSnippetResult`; otherwise leave untouched.

- [ ] **Step 4: Spec bookkeeping**

In `docs/superpowers/specs/2026-07-02-multi-language-authoring-design.md`:
- Status line → `**Status:** Sub-projects A–D implemented`.
- In the Sub-project D "VS Code" section, replace the "packaged extension bundles all grammar wasm files" bullet with: `The dev install (typescript/scripts/install-vscode.mjs symlink) resolves all five grammar wasm files through the workspace's node_modules; a real packaging pipeline (vsce bundle incl. wasm + built LSP) does not exist yet and is deferred to a future packaging project.`

- [ ] **Step 5: Full gates and commit**

Run (from `typescript/`): `pnpm check` and `pnpm --filter @oselvar/website build`; then from the repo root: `make check`. Manual smoke (optional but valuable — note result in the report): `pnpm install:vscode` and confirm the extension activates in a scratch workspace with a `var.config.json` whose steps glob only `**/*.steps.py`.

```bash
git add typescript docs/superpowers/specs/2026-07-02-multi-language-authoring-design.md
git commit -m "feat(var-vscode): activate for python/java/kotlin; language-filtered snippet quick-pick"
```
