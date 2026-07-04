# Tree-sitter Scanners for Python, Java, Kotlin — Implementation Plan (Sub-project C)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend `@oselvar/var-language`'s tree-sitter step-definition scanner (TypeScript/TSX today) with Python, Java, and Kotlin dialects — step defs, custom parameter types, and handler params — proven identical across languages by an extraction conformance test over the shared bundle corpus.

**Architecture:** The scanner is refactored around a per-language `LanguageSpec` table (query strings + string decoder + handler-param extractor + regexp resolver), one file per language under `src/tree-sitter-dialects/`. Because `StepDefScanner.discover*` is synchronous, "lazy" grammar loading happens at scanner construction: `createTreeSitterScanner(grammarLoader, languages?)` loads exactly the requested dialects (default: the current TS pair), and the LSP store derives the language set from the configured step files' extensions, rebuilding the scanner only when that set changes — a TS-only workspace never fetches the other wasm files. **Every query and node shape in this plan was verified empirically** on 2026-07-02 against the real grammars (`tree-sitter-python@0.25.0`, `tree-sitter-java@0.23.5`, `@tree-sitter-grammars/tree-sitter-kotlin@1.1.0`, all shipping prebuilt wasm — the spec's vendoring risk is void) by parsing all 13 conformance bundles' fixtures: the six queries below extracted identical `(kind, expression)` sets in all three new languages plus bundle 13's `{airport, [A-Z]{3}}` parameter type.

**Tech Stack:** web-tree-sitter 0.26.10 (existing), the three grammar npm packages above, vitest, TypeScript strict. Spec: `doc/superpowers/specs/2026-07-02-multi-language-authoring-design.md` (Sub-project C).

## Global Constraints

- Run all pnpm/vitest/tsc commands from `typescript/`. `pnpm -r build` + `pnpm typecheck` before calling any task done; `pnpm check` where stated. Biome quirk: this worktree's path contains `.claude`, colliding with biome.json's `!**/.claude` ignore — run biome legs from a hardlink copy at a `.claude`-free path when needed; never modify biome.json.
- Biome style: single quotes, no semicolons, 2-space indent, trailing commas, `import type`, `node:` protocol.
- Immutable types (`readonly`, `ReadonlyArray`); pure functions — dialects are pure data + pure functions; I/O stays in the loaders.
- Minimal public API: dialect modules are internal — `@oselvar/var-language`'s `index.ts` gains NO new exports beyond what already exists (`createTreeSitterScanner`'s signature change is source-compatible: the new parameter is optional).
- Capture-name conventions carry over: `@root`, `@function-name`, `@expression`, `@handler`, `@name`, `@regexp-value`.
- Expression captures are string literals only (no regexp/template/f-string branches) — Var has no raw-regexp step definitions.
- Positions are UTF-16 code units, 1-based — web-tree-sitter already returns UTF-16 positions for JS-string input (verified by the existing emoji test); `toPosition`/`toRange` are unchanged and shared.
- `StepDef`/`ParameterTypeDef`/`HandlerParams` types in `step-defs.ts` are UNCHANGED — the extraction seam holds.
- Grammar deps: devDependencies in `var-language` (test loader only), dependencies in `var-lsp` (node loader); both packages' `knip.json` `ignoreDependencies` arrays gain the two new package names (`tree-sitter-python`, `tree-sitter-java`, `@tree-sitter-grammars/tree-sitter-kotlin`) — dynamic `import.meta.resolve` strings are untraceable by knip.
- Trunk stays green per task: Tasks 2–4 each add one dialect with its own tests; nothing routes `.py`/`.java`/`.kt` files until the dialect exists (unknown extensions are skipped, yielding `[]` — never a crash).

---

### Task 1: Dialect-table refactor + grammar wiring (behavior-preserving for TS/TSX)

**Files:**
- Create: `typescript/packages/var-language/src/tree-sitter-dialects/types.ts`
- Create: `typescript/packages/var-language/src/tree-sitter-dialects/typescript.ts`
- Rewrite: `typescript/packages/var-language/src/tree-sitter-scanner.ts`
- Delete: `typescript/packages/var-language/src/tree-sitter-queries.ts` (contents move into the typescript dialect)
- Modify: `typescript/packages/var-language/package.json` (add the three grammar devDeps), `typescript/packages/var-lsp/package.json` (add the three grammar deps), `typescript/knip.json` (extend both `ignoreDependencies` arrays)
- Modify: `typescript/packages/var-language/tests/test-grammar-loader.ts`, `typescript/packages/var-lsp/src/node-grammar-loader.ts` (id→wasm mapping table)
- Modify: `typescript/packages/var-lsp/src/store.ts` (derive language set from step paths; rebuild scanner when it changes)
- Test: existing `typescript/packages/var-language/tests/tree-sitter-scanner.test.ts` must stay green unchanged (behavior-preserving proof); `typescript/packages/var-lsp/src/store.test.ts` extended.

**Interfaces:**
- Consumes: `GrammarLoader` (unchanged); `StepDef`/`ParameterTypeDef`/`HandlerParams`/`Position`/`Range` from `step-defs.js` (unchanged); `StepDefScanner` (unchanged).
- Produces (Tasks 2–4 add entries to this table; Task 5 relies on the factory signature):
  - `type LanguageId = 'typescript' | 'typescript-tsx' | 'python' | 'java' | 'kotlin'`
  - `type LanguageSpec = { readonly stepDefQuery: string; readonly parameterTypeQuery: string; decodeString(node: Node): string; extractHandlerParams(handlerNode: Node): HandlerParams | undefined; resolveRegexp(node: Node): string }` (in `tree-sitter-dialects/types.ts`, with `toRange`/`toPosition` moved there as shared helpers)
  - `createTreeSitterScanner(grammarLoader: GrammarLoader, languages?: ReadonlyArray<LanguageId>): Promise<StepDefScanner>` — default `['typescript', 'typescript-tsx']`; files whose extension maps to an unloaded/unknown language yield `[]`.
  - `languageIdForPath(path: string): LanguageId | undefined` exported from `tree-sitter-scanner.ts` (used by the store): `.tsx`→`typescript-tsx`, `.ts`→`typescript`, `.py`→`python`, `.java`→`java`, `.kt`→`kotlin`, else `undefined`.
  - Grammar file mapping (BOTH loaders): `typescript`→`tree-sitter-typescript/tree-sitter-typescript.wasm`, `typescript-tsx`→`tree-sitter-typescript/tree-sitter-tsx.wasm`, `python`→`tree-sitter-python/tree-sitter-python.wasm`, `java`→`tree-sitter-java/tree-sitter-java.wasm`, `kotlin`→`@tree-sitter-grammars/tree-sitter-kotlin/tree-sitter-kotlin.wasm`; unknown id throws.

- [ ] **Step 1: Add the grammar packages**

In `typescript/packages/var-language/package.json` devDependencies (beside `tree-sitter-typescript`):

```json
    "@tree-sitter-grammars/tree-sitter-kotlin": "^1.1.0",
    "tree-sitter-java": "^0.23.5",
    "tree-sitter-python": "^0.25.0",
```

Same three lines in `typescript/packages/var-lsp/package.json` `dependencies`. In `typescript/knip.json`, both packages' `ignoreDependencies` become:

```json
      "ignoreDependencies": [
        "@tree-sitter-grammars/tree-sitter-kotlin",
        "tree-sitter-java",
        "tree-sitter-python",
        "tree-sitter-typescript"
      ]
```

Run `pnpm install` from `typescript/`. Verify the wasm files exist:

```bash
find node_modules/.pnpm -maxdepth 3 -name "tree-sitter-python.wasm" -o -maxdepth 3 -name "tree-sitter-java.wasm" -o -maxdepth 3 -name "tree-sitter-kotlin.wasm" | sort
```

Expected: three wasm paths print (each package ships its `.wasm` at the package root — verified against the registry on 2026-07-02).

- [ ] **Step 2: Create the dialect types + move the TS dialect**

`typescript/packages/var-language/src/tree-sitter-dialects/types.ts`:

```ts
import type { Node } from 'web-tree-sitter'
import type { HandlerParams, Position, Range } from '../step-defs.js'

export type LanguageId = 'typescript' | 'typescript-tsx' | 'python' | 'java' | 'kotlin'

// One entry per language: the queries plus the three language-specific
// behaviors (string decoding, handler-param extraction, regexp resolution).
// Everything else — parsing, capture handling, range math — is shared and
// language-agnostic (the extraction seam from ADR 0001).
export type LanguageSpec = {
  readonly stepDefQuery: string
  readonly parameterTypeQuery: string
  decodeString(node: Node): string
  extractHandlerParams(handlerNode: Node): HandlerParams | undefined
  resolveRegexp(node: Node): string
}

export function toPosition(point: { row: number; column: number }): Position {
  return { line: point.row + 1, character: point.column + 1 }
}

export function toRange(startNode: Node, endNode: Node = startNode): Range {
  return { start: toPosition(startNode.startPosition), end: toPosition(endNode.endPosition) }
}
```

`typescript/packages/var-language/src/tree-sitter-dialects/typescript.ts`: move — verbatim, unchanged in behavior — the current `STEP_DEFINITION_QUERY` and `PARAMETER_TYPE_QUERY` from `tree-sitter-queries.ts` (including their comments), plus the current `SIMPLE_ESCAPES`/`decodeEscapeSequence`/`decodeString` and `extractHandlerParams` from `tree-sitter-scanner.ts`, and wrap them:

```ts
export const typescriptSpec: LanguageSpec = {
  stepDefQuery: STEP_DEFINITION_QUERY,
  parameterTypeQuery: PARAMETER_TYPE_QUERY,
  decodeString,
  extractHandlerParams: (handlerNode) =>
    handlerNode.type === 'arrow_function' || handlerNode.type === 'function_expression'
      ? extractHandlerParams(handlerNode)
      : undefined,
  resolveRegexp: (node) => {
    const pattern = node.childForFieldName('pattern')
    return node.type === 'regex' && pattern ? pattern.text : decodeString(node)
  },
}
```

(The handler-type guard and the regex/string branch move INTO the dialect — they were the TS-specific bits of the shared code paths.) Delete `tree-sitter-queries.ts`.

- [ ] **Step 3: Rewrite the orchestrator**

`typescript/packages/var-language/src/tree-sitter-scanner.ts` becomes:

```ts
import type { StepKind } from '@oselvar/var-core'
import { Language, type Node, Parser, Query, type QueryMatch } from 'web-tree-sitter'
import type { GrammarLoader } from './grammar-loader.js'
import type { StepDefScanner } from './scanner.js'
import type { ParameterTypeDef, StepDef } from './step-defs.js'
import type { LanguageId, LanguageSpec } from './tree-sitter-dialects/types.js'
import { toRange } from './tree-sitter-dialects/types.js'
import { typescriptSpec } from './tree-sitter-dialects/typescript.js'

type Dialect = {
  readonly parser: Parser
  readonly stepDefQuery: Query
  readonly parameterTypeQuery: Query
  readonly spec: LanguageSpec
}

// Tasks 2-4 add python/java/kotlin entries. typescript-tsx shares the
// typescript spec: the queries and decoding are identical — only the grammar
// (loaded per languageId) differs, which is why TSX is a separate LanguageId.
const SPECS: Readonly<Partial<Record<LanguageId, LanguageSpec>>> = {
  typescript: typescriptSpec,
  'typescript-tsx': typescriptSpec,
}

const EXTENSIONS: ReadonlyArray<readonly [string, LanguageId]> = [
  ['.tsx', 'typescript-tsx'],
  ['.ts', 'typescript'],
  ['.py', 'python'],
  ['.java', 'java'],
  ['.kt', 'kotlin'],
]

export function languageIdForPath(path: string): LanguageId | undefined {
  return EXTENSIONS.find(([ext]) => path.endsWith(ext))?.[1]
}

let initPromise: Promise<void> | undefined
// Dialects are cached per GrammarLoader so a store that rebuilds its scanner
// with a wider language set never re-fetches wasm it already loaded.
const dialectCaches = new WeakMap<GrammarLoader, Map<LanguageId, Promise<Dialect>>>()

async function loadDialect(grammarLoader: GrammarLoader, languageId: LanguageId): Promise<Dialect> {
  let cache = dialectCaches.get(grammarLoader)
  if (!cache) {
    cache = new Map()
    dialectCaches.set(grammarLoader, cache)
  }
  let dialect = cache.get(languageId)
  if (!dialect) {
    dialect = (async () => {
      const spec = SPECS[languageId]
      if (!spec) throw new Error(`No tree-sitter dialect for language "${languageId}"`)
      const bytes = await grammarLoader.load(languageId)
      const language = await Language.load(bytes)
      const parser = new Parser()
      parser.setLanguage(language)
      return {
        parser,
        stepDefQuery: new Query(language, spec.stepDefQuery),
        parameterTypeQuery: new Query(language, spec.parameterTypeQuery),
        spec,
      }
    })()
    cache.set(languageId, dialect)
  }
  return dialect
}

// Loads exactly the requested dialects up front (discover* is synchronous, so
// grammars can't load lazily mid-scan). Callers pass the language set derived
// from their step files — a TS-only workspace never fetches the other wasm
// files. Files whose extension maps to an unrequested or unknown language are
// skipped (empty result), never an error.
export async function createTreeSitterScanner(
  grammarLoader: GrammarLoader,
  languages: ReadonlyArray<LanguageId> = ['typescript', 'typescript-tsx'],
): Promise<StepDefScanner> {
  initPromise ??= Parser.init()
  await initPromise
  const dialects = new Map<LanguageId, Dialect>()
  for (const id of languages) {
    dialects.set(id, await loadDialect(grammarLoader, id))
  }
  const dialectFor = (path: string): Dialect | undefined => {
    const id = languageIdForPath(path)
    return id ? dialects.get(id) : undefined
  }
  return {
    discoverStepDefs: (path, source) => {
      const dialect = dialectFor(path)
      return dialect ? discoverStepDefs(dialect, path, source) : []
    },
    discoverParameterTypes: (path, source) => {
      const dialect = dialectFor(path)
      return dialect ? discoverParameterTypes(dialect, path, source) : []
    },
  }
}

function captureMap(match: QueryMatch): Record<string, Node> {
  return Object.fromEntries(match.captures.map((c) => [c.name, c.node]))
}

function discoverStepDefs(dialect: Dialect, file: string, source: string): ReadonlyArray<StepDef> {
  const tree = dialect.parser.parse(source)
  if (!tree) return []
  const out: StepDef[] = []
  for (const match of dialect.stepDefQuery.matches(tree.rootNode)) {
    const captures = captureMap(match)
    const rootNode = captures.root
    const expressionNode = captures.expression
    const functionNameNode = captures['function-name']
    const handlerNode = captures.handler
    if (!rootNode || !expressionNode || !functionNameNode) continue
    out.push({
      file,
      expression: dialect.spec.decodeString(expressionNode),
      kind: functionNameNode.text as StepKind,
      expressionRange: toRange(expressionNode),
      callRange: toRange(rootNode),
      handlerParams: handlerNode ? dialect.spec.extractHandlerParams(handlerNode) : undefined,
    })
  }
  return out
}

function discoverParameterTypes(
  dialect: Dialect,
  file: string,
  source: string,
): ReadonlyArray<ParameterTypeDef> {
  const tree = dialect.parser.parse(source)
  if (!tree) return []
  const out: ParameterTypeDef[] = []
  for (const match of dialect.parameterTypeQuery.matches(tree.rootNode)) {
    const captures = captureMap(match)
    const rootNode = captures.root
    const nameNode = captures.name
    const regexpValueNode = captures['regexp-value']
    if (!rootNode || !nameNode || !regexpValueNode) continue
    out.push({
      file,
      name: dialect.spec.decodeString(nameNode) || nameNode.text,
      regexp: dialect.spec.resolveRegexp(regexpValueNode),
      callRange: toRange(rootNode),
    })
  }
  return out
}
```

NOTE on `name`: for TS the `@name` capture is a `property_identifier` (bare text, `decodeString` returns `''` for it since it has no fragment children — hence the `|| nameNode.text` fallback). For Python/Kotlin/Java the name is a string literal that needs decoding. This fallback line is load-bearing; keep it.

- [ ] **Step 4: Extend both grammar loaders**

Both `typescript/packages/var-language/tests/test-grammar-loader.ts` and `typescript/packages/var-lsp/src/node-grammar-loader.ts` get the same mapping (keep each file's existing knip comment):

```ts
const GRAMMAR_FILES: Readonly<Record<string, string>> = {
  typescript: 'tree-sitter-typescript/tree-sitter-typescript.wasm',
  'typescript-tsx': 'tree-sitter-typescript/tree-sitter-tsx.wasm',
  python: 'tree-sitter-python/tree-sitter-python.wasm',
  java: 'tree-sitter-java/tree-sitter-java.wasm',
  kotlin: '@tree-sitter-grammars/tree-sitter-kotlin/tree-sitter-kotlin.wasm',
}
```

and a body:

```ts
    async load(languageId) {
      const specifier = GRAMMAR_FILES[languageId]
      if (!specifier) throw new Error(`No grammar wasm known for language "${languageId}"`)
      const url = import.meta.resolve(specifier)
      return readFile(fileURLToPath(url))
    },
```

- [ ] **Step 5: Teach the store to derive the language set**

In `typescript/packages/var-lsp/src/store.ts`, replace the memoized `scannerPromise` logic: import `languageIdForPath` (add it to `@oselvar/var-language`'s index.ts exports — it is a pure path helper, acceptable public surface), and inside `reindex()` after `stepPaths` is listed:

```ts
      const languages = [...new Set(stepPaths.map(languageIdForPath))]
        .filter((id): id is NonNullable<typeof id> => id !== undefined)
        .sort()
      const key = languages.join(',')
      if (grammarLoader && key !== scannerKey) {
        scannerKey = key
        scannerPromise = createTreeSitterScanner(
          grammarLoader,
          languages.length > 0 ? languages : undefined,
        )
      }
      const scanner = grammarLoader ? await scannerPromise : undefined
```

with `let scannerKey: string | undefined` beside the existing `let scannerPromise`. (Dialects are cached per loader inside the scanner module, so a rebuild with a wider set reuses already-loaded grammars.)

Add a store test to `typescript/packages/var-lsp/src/store.test.ts` following its existing conventions (read the file first): a workspace whose config `steps` glob matches only `.steps.ts` files indexes fine (proves the default path still works after the signature change).

- [ ] **Step 6: Run the gates**

Run (from `typescript/`): `pnpm --filter @oselvar/var-language exec vitest run` — the existing `tree-sitter-scanner.test.ts` passes UNCHANGED (5 tests: behavior-preserving proof). Then `pnpm --filter @oselvar/var-lsp exec vitest run`, then `pnpm -r build && pnpm typecheck`, then `pnpm check`.

- [ ] **Step 7: Commit**

```bash
git add typescript
git commit -m "refactor(var-language): per-language dialect table for the tree-sitter scanner"
```

---

### Task 2: Python dialect

**Files:**
- Create: `typescript/packages/var-language/src/tree-sitter-dialects/python.ts`
- Modify: `typescript/packages/var-language/src/tree-sitter-scanner.ts` (one line: add `python: pythonSpec` to `SPECS`)
- Test: `typescript/packages/var-language/tests/tree-sitter-scanner-python.test.ts`

**Interfaces:**
- Consumes: `LanguageSpec`, `toRange` from `./types.js`; `HandlerParams` from `../step-defs.js`.
- Produces: `pythonSpec: LanguageSpec`.

Verified grammar facts (tree-sitter-python 0.25.0, probed 2026-07-02 against all 13 bundle fixtures):
- Step def: `(decorated_definition (decorator (call function: (identifier) arguments: (argument_list . (string)))) definition: (function_definition parameters: (parameters ...)))`.
- String: `(string (string_start) (string_content) (string_end))`; **`escape_sequence` nodes are CHILDREN of `string_content`** (not siblings, unlike TS/Java); `string_start.text` carries prefixes — `r"` means RAW: escapes must NOT decode.
- Params: `(parameters (identifier) | (typed_parameter (identifier) type: (type ...)) | (default_parameter name: (identifier) value: ...) | (typed_default_parameter name: ... type: ...))` — bundle 07 has `def _(state, row=None)`.
- Param types: `define_state(..., param_types={"airport": {"regexp": "[A-Z]{3}", "transformer": ...}})` — dict keys are `(string)` nodes (quotes included in text, hence `#match?` not `#eq?` on the key); regexp value is a `(string)` or a `(call)` (`re.compile(r"...")`).

- [ ] **Step 1: Write the failing tests**

`typescript/packages/var-language/tests/tree-sitter-scanner-python.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { createTreeSitterScanner } from '../src/tree-sitter-scanner.js'
import { createTestGrammarLoader } from './test-grammar-loader.js'

async function pythonScanner() {
  return createTreeSitterScanner(createTestGrammarLoader(), ['python'])
}

describe('python dialect', () => {
  test('discovers decorated step defs with kind, expression, and handler params', async () => {
    const scanner = await pythonScanner()
    const source = `from var import define_state

context, action, sensor = define_state(lambda: {})


@action("I fly to {airport}")
def _(state, dest):
    return {"dest": dest}


@sensor("The count is {int}")
def _(state, n: int, row=None):
    pass
`
    const defs = scanner.discoverStepDefs('a.steps.py', source)
    expect(defs.map((d) => [d.kind, d.expression])).toEqual([
      ['action', 'I fly to {airport}'],
      ['sensor', 'The count is {int}'],
    ])
    expect(defs[0]?.handlerParams?.params).toEqual([
      { name: 'state', typeText: '' },
      { name: 'dest', typeText: '' },
    ])
    expect(defs[1]?.handlerParams?.params).toEqual([
      { name: 'state', typeText: '' },
      { name: 'n', typeText: 'int' },
      { name: 'row', typeText: '' },
    ])
  })

  test('decodes escapes; leaves unknown escapes backslashed like Python does', async () => {
    const scanner = await pythonScanner()
    const defs = scanner.discoverStepDefs(
      'a.steps.py',
      `@action("I said \\"hi\\"\\n\\ttwice \\u00e9\\z")\ndef _(state):\n    pass\n`,
    )
    expect(defs[0]?.expression).toBe('I said "hi"\n\ttwice é\\z')
  })

  test('discovers parameter types from string, raw-string, and re.compile regexps', async () => {
    const scanner = await pythonScanner()
    const source = `import re
from var import define_state

context, action, sensor = define_state(
    lambda: {},
    param_types={
        "airport": {"regexp": "[A-Z]{3}", "transformer": lambda code: code.lower()},
        "iata": {"regexp": r"[A-Z]{3}\\d"},
        "code": {"regexp": re.compile(r"[0-9]+")},
    },
)
`
    const types = scanner.discoverParameterTypes('a.steps.py', source)
    expect(types.map((t) => [t.name, t.regexp])).toEqual([
      ['airport', '[A-Z]{3}'],
      ['iata', '[A-Z]{3}\\d'],
      ['code', '[0-9]+'],
    ])
  })

  test('ignores non-step decorators and bare calls', async () => {
    const scanner = await pythonScanner()
    const source = `@other("not a step")
def _(state):
    pass


action = "shadowed"
`
    expect(scanner.discoverStepDefs('a.steps.py', source)).toEqual([])
  })

  test('a .py file scanned by a scanner without the python dialect yields []', async () => {
    const scanner = await createTreeSitterScanner(createTestGrammarLoader(), ['typescript'])
    expect(scanner.discoverStepDefs('a.steps.py', '@action("x")\ndef _(s):\n    pass\n')).toEqual([])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @oselvar/var-language exec vitest run tests/tree-sitter-scanner-python.test.ts`
Expected: FAIL — `No tree-sitter dialect for language "python"`.

- [ ] **Step 3: Implement the dialect**

`typescript/packages/var-language/src/tree-sitter-dialects/python.ts`:

```ts
import type { Node } from 'web-tree-sitter'
import type { HandlerParam, HandlerParams } from '../step-defs.js'
import { type LanguageSpec, toRange } from './types.js'

// Verified against tree-sitter-python 0.25.0 and all 13 conformance bundles
// (2026-07-02): the decorator's call carries the role name and expression;
// the decorated function_definition is the handler.
const STEP_DEFINITION_QUERY = `
(decorated_definition
  (decorator
    (call
      function: (identifier) @function-name
      arguments: (argument_list . (string) @expression)))
  definition: (function_definition) @handler
  (#match? @function-name "^(context|action|sensor)$")
) @root
`

// define_state(..., param_types={"name": {"regexp": <string|re.compile(...)>}}).
// Dict keys are (string) nodes whose text INCLUDES the quotes, so the key
// filter is #match? over quoted text, not #eq?.
const PARAMETER_TYPE_QUERY = `
(call
  function: (identifier) @function-name
  arguments: (argument_list
    (keyword_argument
      name: (identifier) @kwarg-name
      value: (dictionary
        (pair
          key: (string) @name
          value: (dictionary
            (pair
              key: (string) @regexp-key
              value: [(string) (call)] @regexp-value)))))
  )
  (#eq? @function-name "define_state")
  (#eq? @kwarg-name "param_types")
  (#match? @regexp-key "^[\\"'](regexp)[\\"']$")
) @root
`

const SIMPLE_ESCAPES: Readonly<Record<string, string>> = {
  "'": "'",
  '"': '"',
  '\\': '\\',
  a: '\u0007', // BEL — Python's \a
  b: '\b',
  f: '\f',
  n: '\n',
  r: '\r',
  t: '\t',
  v: '\v',
  '\n': '', // line continuation inside a string
}

function decodeEscape(text: string): string {
  const body = text.slice(1)
  const simple = SIMPLE_ESCAPES[body]
  if (simple !== undefined) return simple
  if (body.startsWith('x') && body.length === 3) {
    return String.fromCodePoint(Number.parseInt(body.slice(1), 16))
  }
  if (body.startsWith('u') && body.length === 5) {
    return String.fromCodePoint(Number.parseInt(body.slice(1), 16))
  }
  if (body.startsWith('U') && body.length === 9) {
    return String.fromCodePoint(Number.parseInt(body.slice(1), 16))
  }
  if (/^[0-7]{1,3}$/.test(body)) {
    return String.fromCodePoint(Number.parseInt(body, 8))
  }
  // Python keeps unknown escapes verbatim, backslash included ("\\z" -> "\\z")
  // — unlike ECMAScript, which drops the backslash.
  return text
}

// (string (string_start) (string_content (escape_sequence)*) (string_end)):
// escape_sequence nodes are CHILDREN of string_content, so decoding slices
// the content text around each escape by node offsets. A raw-string prefix
// (r"...") on string_start disables decoding entirely.
function decodeString(node: Node): string {
  const start = node.children.find((c) => c?.type === 'string_start')
  const raw = /[rR]/.test(start?.text ?? '')
  let out = ''
  for (const content of node.children) {
    if (content?.type !== 'string_content') continue
    if (raw || content.children.length === 0) {
      out += content.text
      continue
    }
    let cursor = content.startIndex
    for (const esc of content.children) {
      if (!esc || esc.type !== 'escape_sequence') continue
      out += content.text.slice(cursor - content.startIndex, esc.startIndex - content.startIndex)
      out += decodeEscape(esc.text)
      cursor = esc.endIndex
    }
    out += content.text.slice(cursor - content.startIndex)
  }
  return out
}

function extractHandlerParams(handlerNode: Node): HandlerParams | undefined {
  const parameters = handlerNode.childForFieldName('parameters')
  const params = parameters?.namedChildren.filter((p): p is Node => p !== null) ?? []
  if (params.length === 0) return undefined
  const structured: HandlerParam[] = params.map((p) => {
    switch (p.type) {
      case 'typed_parameter':
        return {
          name: p.namedChild(0)?.text ?? p.text,
          typeText: p.childForFieldName('type')?.text ?? '',
        }
      case 'default_parameter':
        return { name: p.childForFieldName('name')?.text ?? p.text, typeText: '' }
      case 'typed_default_parameter':
        return {
          name: p.childForFieldName('name')?.text ?? p.text,
          typeText: p.childForFieldName('type')?.text ?? '',
        }
      default:
        return { name: p.text, typeText: '' }
    }
  })
  // biome-ignore lint/style/noNonNullAssertion: length checked non-zero above
  return { range: toRange(params[0]!, params[params.length - 1]!), params: structured }
}

export const pythonSpec: LanguageSpec = {
  stepDefQuery: STEP_DEFINITION_QUERY,
  parameterTypeQuery: PARAMETER_TYPE_QUERY,
  decodeString,
  extractHandlerParams: (handlerNode) =>
    handlerNode.type === 'function_definition' ? extractHandlerParams(handlerNode) : undefined,
  resolveRegexp: (node) => {
    if (node.type === 'string') return decodeString(node)
    // re.compile(r"...") — take the call's first string argument.
    const args = node.childForFieldName('arguments')
    const stringArg = args?.namedChildren.find((c) => c?.type === 'string')
    return stringArg ? decodeString(stringArg) : node.text
  },
}
```

Register it in `tree-sitter-scanner.ts`'s `SPECS`: `python: pythonSpec` (with the import).

- [ ] **Step 4: Run tests to verify they pass, then gates**

Run: `pnpm --filter @oselvar/var-language exec vitest run` — new file green, existing tests untouched. Then `pnpm -r build && pnpm typecheck`.

- [ ] **Step 5: Commit**

```bash
git add typescript/packages/var-language typescript/pnpm-lock.yaml
git commit -m "feat(var-language): python tree-sitter dialect"
```

---

### Task 3: Java dialect

**Files:**
- Create: `typescript/packages/var-language/src/tree-sitter-dialects/java.ts`
- Modify: `typescript/packages/var-language/src/tree-sitter-scanner.ts` (add `java: javaSpec` to `SPECS`)
- Test: `typescript/packages/var-language/tests/tree-sitter-scanner-java.test.ts`

**Interfaces:**
- Consumes: `LanguageSpec`, `toRange`; produces `javaSpec: LanguageSpec`.

Verified grammar facts (tree-sitter-java 0.23.5, probed 2026-07-02):
- Step def: `(method_invocation object: _ name: (identifier) arguments: (argument_list (string_literal) (lambda_expression)))` — receiver deliberately unconstrained (any binder variable).
- String: `(string_literal (string_fragment) (escape_sequence)...)` — sibling fragments/escapes, same walker shape as TS.
- Lambda params: `parameters: (formal_parameters (formal_parameter type: _ name: (identifier))...)` OR a single bare `parameters: (identifier)` (e.g. `groups -> ...`).
- Param types: `registrar.defineParameterType("airport", Pattern.compile("[A-Z]{3}"), ...)`.

- [ ] **Step 1: Write the failing tests**

`typescript/packages/var-language/tests/tree-sitter-scanner-java.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { createTreeSitterScanner } from '../src/tree-sitter-scanner.js'
import { createTestGrammarLoader } from './test-grammar-loader.js'

async function javaScanner() {
  return createTreeSitterScanner(createTestGrammarLoader(), ['java'])
}

describe('java dialect', () => {
  test('discovers binder method calls with kind, expression, and typed lambda params', async () => {
    const scanner = await javaScanner()
    const source = `public final class AirportsSteps implements StepDefinitions {
    @Override
    public void defineSteps(Registrar registrar) {
        StateBinder<Ctx> s = registrar.defineState(() -> new Ctx(null));
        s.action("I fly to {airport}", (Ctx ctx, String dest) -> new Ctx(dest));
        s.sensor("The count is {int}", (Ctx ctx, Integer n) -> null);
    }
}
`
    const defs = scanner.discoverStepDefs('AirportsSteps.java', source)
    expect(defs.map((d) => [d.kind, d.expression])).toEqual([
      ['action', 'I fly to {airport}'],
      ['sensor', 'The count is {int}'],
    ])
    expect(defs[0]?.handlerParams?.params).toEqual([
      { name: 'ctx', typeText: 'Ctx' },
      { name: 'dest', typeText: 'String' },
    ])
  })

  test('handles a bare single-identifier lambda parameter', async () => {
    const scanner = await javaScanner()
    const defs = scanner.discoverStepDefs(
      'XSteps.java',
      `class X { void f(StateBinder<C> s) { s.sensor("plain", g -> g); } }\n`,
    )
    expect(defs[0]?.handlerParams?.params).toEqual([{ name: 'g', typeText: '' }])
  })

  test('decodes escape sequences including \\uXXXX', async () => {
    const scanner = await javaScanner()
    const defs = scanner.discoverStepDefs(
      'XSteps.java',
      `class X { void f(StateBinder<C> s) { s.action("I said \\"hi\\"\\n\\u00e9", (C c) -> c); } }\n`,
    )
    expect(defs[0]?.expression).toBe('I said "hi"\né')
  })

  test('discovers defineParameterType with Pattern.compile', async () => {
    const scanner = await javaScanner()
    const source = `class X { void f(Registrar registrar) {
        registrar.defineParameterType("airport", Pattern.compile("[A-Z]{3}"), groups -> groups[0]);
    } }
`
    const types = scanner.discoverParameterTypes('XSteps.java', source)
    expect(types.map((t) => [t.name, t.regexp])).toEqual([['airport', '[A-Z]{3}']])
  })

  test('ignores unrelated method calls', async () => {
    const scanner = await javaScanner()
    expect(
      scanner.discoverStepDefs('XSteps.java', `class X { void f() { log.action(); other("x"); } }\n`),
    ).toEqual([])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @oselvar/var-language exec vitest run tests/tree-sitter-scanner-java.test.ts`
Expected: FAIL — `No tree-sitter dialect for language "java"`.

- [ ] **Step 3: Implement the dialect**

`typescript/packages/var-language/src/tree-sitter-dialects/java.ts`:

```ts
import type { Node } from 'web-tree-sitter'
import type { HandlerParam, HandlerParams } from '../step-defs.js'
import { type LanguageSpec, toRange } from './types.js'

// Verified against tree-sitter-java 0.23.5 and all 13 conformance bundles
// (2026-07-02). The receiver is deliberately unconstrained — steps register
// on whatever the binder variable is called (s.action, binder.sensor, ...).
const STEP_DEFINITION_QUERY = `
(method_invocation
  name: (identifier) @function-name
  arguments: (argument_list
    .
    (string_literal) @expression
    .
    (_)? @handler)
  (#match? @function-name "^(context|action|sensor)$")
) @root
`

const PARAMETER_TYPE_QUERY = `
(method_invocation
  name: (identifier) @function-name
  arguments: (argument_list
    .
    (string_literal) @name
    .
    (method_invocation
      object: (identifier) @pattern-object
      name: (identifier) @pattern-name
      arguments: (argument_list . (string_literal) @regexp-value)))
  (#eq? @function-name "defineParameterType")
  (#eq? @pattern-object "Pattern")
  (#eq? @pattern-name "compile")
) @root
`

const SIMPLE_ESCAPES: Readonly<Record<string, string>> = {
  b: '\b',
  t: '\t',
  n: '\n',
  f: '\f',
  r: '\r',
  s: ' ',
  '"': '"',
  "'": "'",
  '\\': '\\',
}

function decodeEscape(text: string): string {
  const body = text.slice(1)
  const simple = SIMPLE_ESCAPES[body]
  if (simple !== undefined) return simple
  if (body.startsWith('u')) {
    return String.fromCodePoint(Number.parseInt(body.replace(/^u+/, ''), 16))
  }
  if (/^[0-7]{1,3}$/.test(body)) {
    return String.fromCodePoint(Number.parseInt(body, 8))
  }
  return body
}

// (string_literal (string_fragment) (escape_sequence)...) — sibling
// fragments and escapes, the same shape as the TypeScript grammar.
function decodeString(node: Node): string {
  let out = ''
  for (const child of node.children) {
    if (child?.type === 'string_fragment') out += child.text
    else if (child?.type === 'escape_sequence') out += decodeEscape(child.text)
  }
  return out
}

function extractHandlerParams(handlerNode: Node): HandlerParams | undefined {
  const parameters = handlerNode.childForFieldName('parameters')
  if (!parameters) return undefined
  // Bare single-parameter lambda: `g -> ...`
  if (parameters.type === 'identifier') {
    return { range: toRange(parameters), params: [{ name: parameters.text, typeText: '' }] }
  }
  const params = parameters.namedChildren.filter((p): p is Node => p !== null)
  if (params.length === 0) return undefined
  const structured: HandlerParam[] = params.map((p) => ({
    name: p.childForFieldName('name')?.text ?? p.text,
    typeText: p.childForFieldName('type')?.text ?? '',
  }))
  // biome-ignore lint/style/noNonNullAssertion: length checked non-zero above
  return { range: toRange(params[0]!, params[params.length - 1]!), params: structured }
}

export const javaSpec: LanguageSpec = {
  stepDefQuery: STEP_DEFINITION_QUERY,
  parameterTypeQuery: PARAMETER_TYPE_QUERY,
  decodeString,
  extractHandlerParams: (handlerNode) =>
    handlerNode.type === 'lambda_expression' ? extractHandlerParams(handlerNode) : undefined,
  resolveRegexp: decodeString,
}
```

Register `java: javaSpec` in `SPECS`.

- [ ] **Step 4: Run tests + gates**

Run: `pnpm --filter @oselvar/var-language exec vitest run` then `pnpm -r build && pnpm typecheck`.

- [ ] **Step 5: Commit**

```bash
git add typescript/packages/var-language
git commit -m "feat(var-language): java tree-sitter dialect"
```

---

### Task 4: Kotlin dialect

**Files:**
- Create: `typescript/packages/var-language/src/tree-sitter-dialects/kotlin.ts`
- Modify: `typescript/packages/var-language/src/tree-sitter-scanner.ts` (add `kotlin: kotlinSpec` to `SPECS`)
- Test: `typescript/packages/var-language/tests/tree-sitter-scanner-kotlin.test.ts`

**Interfaces:**
- Consumes: `LanguageSpec`, `toRange`; produces `kotlinSpec: LanguageSpec`.

Verified grammar facts (@tree-sitter-grammars/tree-sitter-kotlin 1.1.0, probed 2026-07-02):
- Step def: `(call_expression (call_expression (identifier) (value_arguments (value_argument (string_literal)))) (annotated_lambda (lambda_literal)))` — trailing-lambda call; NO field names on call_expression children (positional matching).
- String: `(string_literal (string_content) (escape_sequence)...)` — sibling content/escapes.
- Lambda params: `(lambda_literal (lambda_parameters (variable_declaration (identifier) (user_type)?)...))`; a ZERO-parameter lambda (`sensor("x") { dest }` — state is the receiver) has NO `lambda_parameters` node → `handlerParams` undefined. IMPORTANT: unlike the other languages, Kotlin's params never include the state — they are user params only (state is the lambda receiver).
- Param types: `parameterType("airport", Regex("[A-Z]{3}")) { ... }` inside the defineState block.

- [ ] **Step 1: Write the failing tests**

`typescript/packages/var-language/tests/tree-sitter-scanner-kotlin.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { createTreeSitterScanner } from '../src/tree-sitter-scanner.js'
import { createTestGrammarLoader } from './test-grammar-loader.js'

async function kotlinScanner() {
  return createTreeSitterScanner(createTestGrammarLoader(), ['kotlin'])
}

describe('kotlin dialect', () => {
  test('discovers trailing-lambda step calls with kind, expression, and lambda params', async () => {
    const scanner = await kotlinScanner()
    const source = `val steps = defineState(::Ctx) {
    action("I fly to {airport}") { dest: String ->
        copy(dest = dest)
    }
    sensor("The row is checked") { row: Map<String, String> ->
        null
    }
}
`
    const defs = scanner.discoverStepDefs('airports.steps.kt', source)
    expect(defs.map((d) => [d.kind, d.expression])).toEqual([
      ['action', 'I fly to {airport}'],
      ['sensor', 'The row is checked'],
    ])
    expect(defs[0]?.handlerParams?.params).toEqual([{ name: 'dest', typeText: 'String' }])
    expect(defs[1]?.handlerParams?.params).toEqual([
      { name: 'row', typeText: 'Map<String, String>' },
    ])
  })

  test('a zero-parameter lambda (state as receiver) has undefined handlerParams', async () => {
    const scanner = await kotlinScanner()
    const defs = scanner.discoverStepDefs(
      'x.steps.kt',
      `val steps = defineState(::Ctx) {\n    sensor("zero") { dest }\n}\n`,
    )
    expect(defs).toHaveLength(1)
    expect(defs[0]?.handlerParams).toBeUndefined()
  })

  test('decodes escape sequences including \\$ and \\uXXXX', async () => {
    const scanner = await kotlinScanner()
    const defs = scanner.discoverStepDefs(
      'x.steps.kt',
      `val steps = defineState(::Ctx) {\n    action("costs \\$5\\n\\u00e9") { n: Int -> copy() }\n}\n`,
    )
    expect(defs[0]?.expression).toBe('costs $5\né')
  })

  test('discovers parameterType with Regex(...)', async () => {
    const scanner = await kotlinScanner()
    const source = `val steps = defineState(::Ctx) {
    parameterType("airport", Regex("[A-Z]{3}")) { captures -> captures[0].lowercase() }
    action("I fly to {airport}") { dest: String -> copy(dest = dest) }
}
`
    const types = scanner.discoverParameterTypes('x.steps.kt', source)
    expect(types.map((t) => [t.name, t.regexp])).toEqual([['airport', '[A-Z]{3}']])
  })

  test('ignores non-step trailing-lambda calls', async () => {
    const scanner = await kotlinScanner()
    expect(
      scanner.discoverStepDefs('x.steps.kt', `val x = listOf("a").map { it }\nfun other() {}\n`),
    ).toEqual([])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @oselvar/var-language exec vitest run tests/tree-sitter-scanner-kotlin.test.ts`
Expected: FAIL — `No tree-sitter dialect for language "kotlin"`.

- [ ] **Step 3: Implement the dialect**

`typescript/packages/var-language/src/tree-sitter-dialects/kotlin.ts`:

```ts
import type { Node } from 'web-tree-sitter'
import type { HandlerParam, HandlerParams } from '../step-defs.js'
import { type LanguageSpec, toRange } from './types.js'

// Verified against @tree-sitter-grammars/tree-sitter-kotlin 1.1.0 and all 13
// conformance bundles (2026-07-02). A DSL step is a trailing-lambda call: the
// OUTER call_expression wraps the inner call (identifier + string argument)
// and the annotated_lambda. This grammar has no field names on
// call_expression children — matching is positional.
const STEP_DEFINITION_QUERY = `
(call_expression
  (call_expression
    (identifier) @function-name
    (value_arguments
      .
      (value_argument (string_literal) @expression)))
  (annotated_lambda (lambda_literal) @handler)
  (#match? @function-name "^(context|action|sensor)$")
) @root
`

const PARAMETER_TYPE_QUERY = `
(call_expression
  (call_expression
    (identifier) @function-name
    (value_arguments
      .
      (value_argument (string_literal) @name)
      .
      (value_argument
        (call_expression
          (identifier) @regex-fn
          (value_arguments . (value_argument (string_literal) @regexp-value))))))
  (#eq? @function-name "parameterType")
  (#eq? @regex-fn "Regex")
) @root
`

const SIMPLE_ESCAPES: Readonly<Record<string, string>> = {
  t: '\t',
  b: '\b',
  n: '\n',
  r: '\r',
  "'": "'",
  '"': '"',
  '\\': '\\',
  $: '$',
}

function decodeEscape(text: string): string {
  const body = text.slice(1)
  const simple = SIMPLE_ESCAPES[body]
  if (simple !== undefined) return simple
  if (body.startsWith('u') && body.length === 5) {
    return String.fromCodePoint(Number.parseInt(body.slice(1), 16))
  }
  return body
}

// (string_literal (string_content) (escape_sequence)...) — sibling content
// and escapes (interpolation nodes, if any, are skipped: a step expression
// with $interpolation is not a static literal and won't round-trip).
function decodeString(node: Node): string {
  let out = ''
  for (const child of node.children) {
    if (child?.type === 'string_content') out += child.text
    else if (child?.type === 'escape_sequence') out += decodeEscape(child.text)
  }
  return out
}

// Kotlin lambda params are USER params only — the state is the lambda's
// receiver (defineState(::Ctx) { ... }), so unlike TS/Python/Java there is no
// leading ctx/state entry. A zero-parameter lambda has no lambda_parameters
// node at all -> undefined (no signature to sync).
function extractHandlerParams(handlerNode: Node): HandlerParams | undefined {
  const parameters = handlerNode.namedChildren.find((c) => c?.type === 'lambda_parameters')
  if (!parameters) return undefined
  const params = parameters.namedChildren.filter(
    (c): c is Node => c !== null && c.type === 'variable_declaration',
  )
  if (params.length === 0) return undefined
  const structured: HandlerParam[] = params.map((p) => {
    // (variable_declaration (identifier) (user_type)?) — the name is named
    // child 0; the type (when annotated) is the next named child. Skip by
    // INDEX, not node identity: web-tree-sitter wraps nodes per access, so
    // `c !== p.namedChild(0)` is not a reliable comparison.
    const name = p.namedChild(0)?.text ?? p.text
    const typeNode = p.namedChildren
      .slice(1)
      .find((c): c is Node => c !== null && c.type !== 'comment')
    return { name, typeText: typeNode?.text ?? '' }
  })
  // biome-ignore lint/style/noNonNullAssertion: length checked non-zero above
  return { range: toRange(params[0]!, params[params.length - 1]!), params: structured }
}

export const kotlinSpec: LanguageSpec = {
  stepDefQuery: STEP_DEFINITION_QUERY,
  parameterTypeQuery: PARAMETER_TYPE_QUERY,
  decodeString,
  extractHandlerParams: (handlerNode) =>
    handlerNode.type === 'lambda_literal' ? extractHandlerParams(handlerNode) : undefined,
  resolveRegexp: decodeString,
}
```

Register `kotlin: kotlinSpec` in `SPECS`.

- [ ] **Step 4: Run tests + gates**

Run: `pnpm --filter @oselvar/var-language exec vitest run` then `pnpm -r build && pnpm typecheck`.

- [ ] **Step 5: Commit**

```bash
git add typescript/packages/var-language
git commit -m "feat(var-language): kotlin tree-sitter dialect"
```

---

### Task 5: Extraction conformance test, LSP signature-sync guard, spec bookkeeping

**Files:**
- Create: `typescript/packages/var-language/tests/extraction-conformance.test.ts`
- Modify: `typescript/packages/var-lsp/src/handlers.ts` (guard `buildHandlerSync` to TS files)
- Test: `typescript/packages/var-lsp/tests/handlers.test.ts` (one added test)
- Modify: `doc/superpowers/specs/2026-07-02-multi-language-authoring-design.md` (Status line)

**Interfaces:**
- Consumes: `createTreeSitterScanner(loader, languages)` and `languageIdForPath` (Task 1); the four dialects; the conformance bundle fixtures (`*.steps.ts/.py/.kt`, `*Steps.java` in all 13 bundles).
- Produces: the ADR's "per-language fixtures, shared expectations" test for the extraction seam; a rename that keeps handler-signature sync TS-only until sub-project D delivers per-language snippet emitters (populating `handlerParams` for non-TS files must NOT cause the LSP to write TypeScript-shaped text into `.py`/`.java`/`.kt` files).

- [ ] **Step 1: Write the extraction conformance test**

`typescript/packages/var-language/tests/extraction-conformance.test.ts`:

```ts
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'
import { createTreeSitterScanner } from '../src/tree-sitter-scanner.js'
import { createTestGrammarLoader } from './test-grammar-loader.js'

// ADR 0001's "per-language fixtures, shared expectations" applied to the
// extraction seam: for every conformance bundle, each language's steps
// fixture must yield the IDENTICAL (kind, expression) set — and, where
// present, the identical parameter-type (name, regexp) set. TypeScript is
// the reference; the other three are compared against it.
const BUNDLES_DIR = fileURLToPath(new URL('../../../../conformance/bundles', import.meta.url))

const FIXTURE_MATCHERS: ReadonlyArray<readonly [string, (f: string) => boolean]> = [
  ['typescript', (f) => f.endsWith('.steps.ts')],
  ['python', (f) => f.endsWith('.steps.py')],
  ['java', (f) => f.endsWith('Steps.java')],
  ['kotlin', (f) => f.endsWith('.steps.kt')],
]

const bundles = readdirSync(BUNDLES_DIR, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name)
  .sort()

describe('extraction conformance across languages', () => {
  for (const bundle of bundles) {
    test(bundle, async () => {
      const scanner = await createTreeSitterScanner(createTestGrammarLoader(), [
        'typescript',
        'python',
        'java',
        'kotlin',
      ])
      const dir = join(BUNDLES_DIR, bundle)
      const files = readdirSync(dir)
      const byLanguage = new Map<string, { steps: string[]; types: string[] }>()
      for (const [language, matches] of FIXTURE_MATCHERS) {
        const fixtures = files.filter(matches).sort()
        expect(fixtures, `${bundle}: missing ${language} fixture`).not.toHaveLength(0)
        const steps: string[] = []
        const types: string[] = []
        for (const fixture of fixtures) {
          const source = readFileSync(join(dir, fixture), 'utf8')
          for (const d of scanner.discoverStepDefs(fixture, source)) {
            steps.push(`${d.kind}|${d.expression}`)
          }
          for (const t of scanner.discoverParameterTypes(fixture, source)) {
            types.push(`${t.name}|${t.regexp}`)
          }
        }
        byLanguage.set(language, { steps: steps.sort(), types: types.sort() })
      }
      const reference = byLanguage.get('typescript')
      for (const [language, actual] of byLanguage) {
        expect(actual.steps, `${bundle}: ${language} step set differs from typescript`).toEqual(
          reference?.steps,
        )
        expect(actual.types, `${bundle}: ${language} param-type set differs`).toEqual(
          reference?.types,
        )
      }
      // The corpus itself must be non-trivial: every bundle defines steps,
      // and bundle 13 defines the {airport} parameter type.
      expect(reference?.steps.length).toBeGreaterThan(0)
      if (bundle === '13-custom-parameter-type') {
        expect(reference?.types).toEqual(['airport|[A-Z]{3}'])
      }
    })
  }
})
```

- [ ] **Step 2: Run it to verify it passes**

Run: `pnpm --filter @oselvar/var-language exec vitest run tests/extraction-conformance.test.ts`
Expected: 13 tests pass (this was verified achievable in the planning probe: all four languages extract identical sets today). Any failure here is a real dialect bug — fix the dialect, not the test.

- [ ] **Step 3: Guard the LSP's handler-signature sync to TypeScript files**

In `typescript/packages/var-lsp/src/handlers.ts`, at the rename path where `buildHandlerSync` is invoked only when `stepDefRecord.handlerParams` exists (around lines 239-249 — read the surrounding code first), add a file-extension guard so non-TS step files never receive TS-rendered signature edits:

```ts
      const syncable =
        stepDefRecord.handlerParams !== undefined &&
        (stepDefRecord.file.endsWith('.ts') || stepDefRecord.file.endsWith('.tsx'))
```

and use `syncable` where `handlerParams !== undefined` gated the sync before. Add a comment:

```ts
      // Handler-signature sync renders TypeScript source (the only
      // SnippetEmitter today). Python/Java/Kotlin step defs now carry
      // handlerParams too (tree-sitter dialects), but until sub-project D
      // ships per-language emitters, syncing would write TS-shaped text into
      // .py/.java/.kt files — so sync stays TS-only.
```

Add one test to `typescript/packages/var-lsp/tests/handlers.test.ts` following the file's existing rename-test conventions (read a nearby rename test first): a workspace with a `.steps.py` step file (config `steps: ["**/*.steps.py"]`, docs glob for `.md`) where renaming the matched step succeeds and the returned plan has NO `handlerSync` edit (assert `plan.handlerSync` is undefined/absent), while the expression edit itself is present.

- [ ] **Step 4: Full gates**

Run (from `typescript/`): `pnpm check` and `pnpm --filter @oselvar/website build`. Then from the repo root: `make check` (Python/Java ports are untouched, but the corpus-reading test proves against their fixtures).

- [ ] **Step 5: Update the spec status and commit**

In `doc/superpowers/specs/2026-07-02-multi-language-authoring-design.md`: `**Status:** Sub-projects A and B implemented; C–D unimplemented` → `**Status:** Sub-projects A–C implemented; D unimplemented`. Also update the spec's Sub-project C "Risk" paragraph: the Kotlin community grammar concern is resolved — `@tree-sitter-grammars/tree-sitter-kotlin@1.1.0` ships prebuilt wasm from npm (no vendoring).

```bash
git add typescript doc/superpowers/specs/2026-07-02-multi-language-authoring-design.md
git commit -m "feat(var-language): extraction conformance across four languages; TS-only signature-sync guard"
```
