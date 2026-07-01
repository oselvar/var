# Tree-sitter `StepDefScanner` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reimplement the TypeScript-compiler-based `StepDefScanner` on tree-sitter, behind the exact same port, and dogfood it as `var-lsp`'s real default scanner.

**Architecture:** `web-tree-sitter` (isomorphic parser runtime) + two grammars from `tree-sitter-typescript` (`typescript` for `.ts`, `tsx` for `.tsx` — never one for both, see Task 1) run tree-sitter queries in `@oselvar/var-language` to reproduce `StepDef`/`ParameterTypeDef` extraction exactly. A new `GrammarLoader` port supplies grammar bytes per environment; `@oselvar/var-lsp` gets a Node implementation and switches its `Store` to use it. `website`/`@oselvar/var-vscode` are untouched — they keep using `createTypeScriptScanner()`.

**Tech Stack:** `web-tree-sitter` 0.26.10, `tree-sitter-typescript` 0.23.2 (grammar source **and** its own prebuilt `.wasm` — no build step), vitest, TypeScript strict (`noUncheckedIndexedAccess`, `verbatimModuleSyntax`, `exactOptionalPropertyTypes`).

## Global Constraints

- Run all pnpm/vitest/tsc commands from `typescript/` (this plan's paths are relative to that directory).
- `pnpm -r build` type-checks `src/`; `pnpm typecheck` (part of `pnpm check`) type-checks `tests/`. A green vitest run does not prove either passes — run both before calling a task done.
- Biome style: single quotes, no semicolons, 2-space indent, trailing commas, `import type` (or inline `type` per-specifier in a mixed import) for type-only imports (`verbatimModuleSyntax`), `node:` protocol for built-ins.
- No raw-regexp step definitions — Var only has cucumber-expression (string-literal) step definitions. Queries must not grow a `(regex)`/`(template_string)` branch for the step *expression* capture (unlike cucumber/language-service's own query).
- Reference design doc: `docs/superpowers/specs/2026-07-01-treesitter-lsp-scanner-design.md`. Every query, node shape, and position claim in this plan was verified empirically against the real `tree-sitter-typescript` 0.23.2 grammar before writing — see that doc's "Lessons from cucumber/language-service" section for how.

---

### Task 1: `GrammarLoader` port + tree-sitter-based `StepDefScanner` in `var-language`

**Files:**
- Create: `packages/var-language/src/grammar-loader.ts`
- Create: `packages/var-language/src/tree-sitter-queries.ts`
- Create: `packages/var-language/src/tree-sitter-scanner.ts`
- Create: `packages/var-language/tests/test-grammar-loader.ts`
- Create: `packages/var-language/tests/tree-sitter-scanner.test.ts`
- Modify: `packages/var-language/package.json`

**Interfaces:**
- Produces: `GrammarLoader` (`packages/var-language/src/grammar-loader.ts`) — `interface GrammarLoader { load(languageId: string): Promise<Uint8Array> }`.
- Produces: `createTreeSitterScanner(grammarLoader: GrammarLoader): Promise<StepDefScanner>` (`packages/var-language/src/tree-sitter-scanner.ts`) — `StepDefScanner` is the existing type from `packages/var-language/src/scanner.ts`, unchanged.
- Produces (test-only): `createTestGrammarLoader(): GrammarLoader` (`packages/var-language/tests/test-grammar-loader.ts`) — reused by Task 2.
- Consumes: `StepDef`, `ParameterTypeDef`, `Position`, `Range`, `HandlerParam`, `HandlerParams` from `packages/var-language/src/step-defs.ts` (all already exist, unchanged). `StepKind` from `@oselvar/var-core`.

- [ ] **Step 1: Add dependencies**

Edit `packages/var-language/package.json`. In `"dependencies"`, add `web-tree-sitter` (alongside the existing `@oselvar/var-core` and `typescript` entries):

```json
  "dependencies": {
    "@oselvar/var-core": "workspace:*",
    "typescript": "^6.0.3",
    "web-tree-sitter": "^0.26.10"
  },
```

Add a new `"devDependencies"` field (there isn't one yet) for the grammar package, needed only by this package's own tests:

```json
  "devDependencies": {
    "tree-sitter-typescript": "^0.23.2"
  },
```

Run `pnpm install` from `typescript/` to fetch them.

- [ ] **Step 2: Write the `GrammarLoader` port**

Create `packages/var-language/src/grammar-loader.ts`:

```ts
export interface GrammarLoader {
  load(languageId: string): Promise<Uint8Array>
}
```

- [ ] **Step 3: Write the test grammar loader helper**

Create `packages/var-language/tests/test-grammar-loader.ts`:

```ts
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import type { GrammarLoader } from '../src/grammar-loader.js'

export function createTestGrammarLoader(): GrammarLoader {
  return {
    async load(languageId) {
      const filename =
        languageId === 'typescript-tsx' ? 'tree-sitter-tsx.wasm' : 'tree-sitter-typescript.wasm'
      const url = import.meta.resolve(`tree-sitter-typescript/${filename}`)
      return readFile(fileURLToPath(url))
    },
  }
}
```

This resolves the two `.wasm` files that `tree-sitter-typescript` ships directly in its own npm package (confirmed present via its `package.json` `files` array — not generated by a postinstall step).

- [ ] **Step 4: Write the failing tests**

Create `packages/var-language/tests/tree-sitter-scanner.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { createTreeSitterScanner } from '../src/tree-sitter-scanner.js'
import { createTestGrammarLoader } from './test-grammar-loader.js'

describe('createTreeSitterScanner', () => {
  test('discovers a step call and a parameter type', async () => {
    const scanner = await createTreeSitterScanner(createTestGrammarLoader())
    const stepDefs = scanner.discoverStepDefs(
      's.ts',
      `action('I have {int} cukes', (ctx, n) => {})\n`,
    )
    expect(stepDefs).toHaveLength(1)
    expect(stepDefs[0]?.expression).toBe('I have {int} cukes')
    expect(stepDefs[0]?.kind).toBe('action')

    const paramTypes = scanner.discoverParameterTypes(
      'p.ts',
      `const x = defineState(() => ({}), {\n  airport: { regexp: /[A-Z]{3}/ },\n})\n`,
    )
    expect(paramTypes).toHaveLength(1)
    expect(paramTypes[0]?.name).toBe('airport')
    expect(paramTypes[0]?.regexp).toBe('[A-Z]{3}')
  })

  test('reports positions in UTF-16 code units, matching a non-ASCII expression exactly', async () => {
    const scanner = await createTreeSitterScanner(createTestGrammarLoader())
    const source = "action('café {int} 🎉', () => {})\n"
    const stepDefs = scanner.discoverStepDefs('s.ts', source)
    expect(stepDefs[0]?.expression).toBe('café {int} 🎉')
    // 'action(' is 7 ASCII characters, so the string starts at UTF-16 column 7
    // (0-based) -> 1-based character 8. Verified empirically: no byte-offset
    // conversion is needed — web-tree-sitter's Parser.parse() already returns
    // UTF-16 code-unit positions when given a plain JS string.
    expect(stepDefs[0]?.expressionRange.start).toEqual({ line: 1, character: 8 })
  })

  test('selects the typescript grammar (not tsx) for .ts files', async () => {
    const scanner = await createTreeSitterScanner(createTestGrammarLoader())
    // A legacy angle-bracket type assertion is valid in .ts. Verified
    // empirically: under the tsx grammar this produces an ERROR node that
    // swallows the rest of the file as JSX, losing the step definition on the
    // next line entirely (0 matches instead of 1).
    const source = `const y = <string>value\naction('a real step', () => {})\n`
    const stepDefs = scanner.discoverStepDefs('s.ts', source)
    expect(stepDefs).toHaveLength(1)
    expect(stepDefs[0]?.expression).toBe('a real step')
  })
})
```

- [ ] **Step 5: Run to verify it fails**

Run: `NODE_OPTIONS="--import tsx" npx vitest run packages/var-language/tests/tree-sitter-scanner.test.ts`
Expected: FAIL — `Cannot find module '../src/tree-sitter-scanner.js'` (or similar), since the module doesn't exist yet.

- [ ] **Step 6: Write the query strings**

Create `packages/var-language/src/tree-sitter-queries.ts`:

```ts
// Capture names follow cucumber/language-service's convention
// (@root/@function-name/@expression/@name) rather than inventing new ones.
//
// The leading `.` before `(string)` matters: without it, this query matches
// a string literal at *any* argument position (e.g. wrongly treating 'text'
// in `action(someVar, 'text', handler)` as the expression). Verified
// empirically. The current TS-compiler scanner only ever looks at
// arguments[0], so this anchors the same way.
export const STEP_DEFINITION_QUERY = `
(call_expression
  function: (identifier) @function-name
  arguments: (arguments
    .
    (string) @expression
    .
    (_)? @handler
  )
  (#match? @function-name "^(context|action|sensor)$")
) @root
`

// Var has no raw-regexp step definitions, so unlike cucumber/language-service
// this has no (regex)/(template_string) branch on @expression above. This
// query's own (regex) alternative below is unrelated: it's for a parameter
// type's *own* regexp property (e.g. `{ airport: { regexp: /[A-Z]{3}/ } }`),
// which is a real regexp regardless of the step-definition rule.
export const PARAMETER_TYPE_QUERY = `
(call_expression
  function: (identifier) @function-name
  arguments: (arguments
    .
    (_)
    .
    (object
      (pair
        key: (property_identifier) @name
        value: (object
          (pair
            key: (property_identifier) @regexp-key
            value: [(regex) (string)] @regexp-value
          )
        )
      )
    )
  )
  (#eq? @function-name "defineState")
  (#eq? @regexp-key "regexp")
) @root
`
```

- [ ] **Step 7: Implement the scanner**

Create `packages/var-language/src/tree-sitter-scanner.ts`:

```ts
import type { StepKind } from '@oselvar/var-core'
import { Language, Parser, Query, type Node, type QueryMatch } from 'web-tree-sitter'
import type { GrammarLoader } from './grammar-loader.js'
import type { StepDefScanner } from './scanner.js'
import type {
  HandlerParam,
  HandlerParams,
  ParameterTypeDef,
  Position,
  Range,
  StepDef,
} from './step-defs.js'
import { PARAMETER_TYPE_QUERY, STEP_DEFINITION_QUERY } from './tree-sitter-queries.js'

type Dialect = {
  readonly parser: Parser
  readonly stepDefQuery: Query
  readonly parameterTypeQuery: Query
}

let initPromise: Promise<void> | undefined

async function loadDialect(grammarLoader: GrammarLoader, languageId: string): Promise<Dialect> {
  const bytes = await grammarLoader.load(languageId)
  const language = await Language.load(bytes)
  const parser = new Parser()
  parser.setLanguage(language)
  return {
    parser,
    stepDefQuery: new Query(language, STEP_DEFINITION_QUERY),
    parameterTypeQuery: new Query(language, PARAMETER_TYPE_QUERY),
  }
}

// The TypeScript and TSX grammars are not interchangeable: the TSX grammar
// treats `<...>` as JSX, which can misparse a legacy `.ts` angle-bracket type
// assertion badly enough to lose every step definition after it in the same
// file (verified empirically — see tree-sitter-scanner.test.ts). Select by
// extension rather than picking one grammar for both.
export async function createTreeSitterScanner(
  grammarLoader: GrammarLoader,
): Promise<StepDefScanner> {
  initPromise ??= Parser.init()
  await initPromise
  const typescript = await loadDialect(grammarLoader, 'typescript')
  const typescriptTsx = await loadDialect(grammarLoader, 'typescript-tsx')
  const dialectFor = (path: string): Dialect =>
    path.endsWith('.tsx') ? typescriptTsx : typescript

  return {
    discoverStepDefs: (path, source) => discoverStepDefs(dialectFor(path), path, source),
    discoverParameterTypes: (path, source) =>
      discoverParameterTypes(dialectFor(path), path, source),
  }
}

function toPosition(point: { row: number; column: number }): Position {
  return { line: point.row + 1, character: point.column + 1 }
}

function toRange(startNode: Node, endNode: Node = startNode): Range {
  return { start: toPosition(startNode.startPosition), end: toPosition(endNode.endPosition) }
}

const ESCAPE_SEQUENCES: Readonly<Record<string, string>> = {
  "\\'": "'",
  '\\"': '"',
  '\\\\': '\\',
  '\\n': '\n',
  '\\t': '\t',
}

// Unlike `ts.StringLiteral.text` (already decoded), a tree-sitter `string`
// node's children are the two quote tokens plus alternating `string_fragment`
// (verbatim text) and `escape_sequence` nodes — this reconstructs the decoded
// value. Verified against `action('I said \'hi\'', ...)`, whose `string` node
// has children `(string_fragment "I said ") (escape_sequence "\'")
// (string_fragment "hi") (escape_sequence "\'")`.
function decodeString(node: Node): string {
  let out = ''
  for (const child of node.children) {
    if (child.type === 'string_fragment') out += child.text
    else if (child.type === 'escape_sequence') out += ESCAPE_SEQUENCES[child.text] ?? child.text
  }
  return out
}

function captureMap(match: QueryMatch): Record<string, Node> {
  return Object.fromEntries(match.captures.map((c) => [c.name, c.node]))
}

function extractHandlerParams(handlerNode: Node): HandlerParams | undefined {
  const formalParams = handlerNode.childForFieldName('parameters')
  const params = formalParams?.namedChildren ?? []
  if (params.length === 0) return undefined
  // biome-ignore lint/style/noNonNullAssertion: length checked non-zero above
  const first = params[0]!
  // biome-ignore lint/style/noNonNullAssertion: length checked non-zero above
  const last = params[params.length - 1]!
  const structured: HandlerParam[] = params.map((p) => {
    const pattern = p.childForFieldName('pattern')
    // `type_annotation`'s own `.text` includes the leading colon (e.g.
    // ": number"); its first named child is the bare type node ("number").
    const typeAnnotation = p.childForFieldName('type')
    return {
      name: pattern ? pattern.text : p.text,
      typeText: typeAnnotation ? typeAnnotation.namedChild(0)?.text ?? '' : '',
    }
  })
  return { range: toRange(first, last), params: structured }
}

function discoverStepDefs(
  dialect: Dialect,
  file: string,
  source: string,
): ReadonlyArray<StepDef> {
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
    const handlerParams =
      handlerNode &&
      (handlerNode.type === 'arrow_function' || handlerNode.type === 'function_expression')
        ? extractHandlerParams(handlerNode)
        : undefined
    out.push({
      file,
      expression: decodeString(expressionNode),
      kind: functionNameNode.text as StepKind,
      expressionRange: toRange(expressionNode),
      callRange: toRange(rootNode),
      handlerParams,
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
    const pattern = regexpValueNode.childForFieldName('pattern')
    const regexp =
      regexpValueNode.type === 'regex' && pattern ? pattern.text : decodeString(regexpValueNode)
    out.push({ file, name: nameNode.text, regexp, callRange: toRange(rootNode) })
  }
  return out
}
```

- [ ] **Step 8: Run to verify it passes**

Run: `NODE_OPTIONS="--import tsx" npx vitest run packages/var-language/tests/tree-sitter-scanner.test.ts`
Expected: PASS — 3 tests passed.

- [ ] **Step 9: Type-check**

Run: `pnpm --filter @oselvar/var-language build`
Expected: exit 0.

Run (from `typescript/`): `pnpm typecheck`
Expected: exit 0.

- [ ] **Step 10: Commit**

```bash
git add packages/var-language/package.json packages/var-language/src/grammar-loader.ts packages/var-language/src/tree-sitter-queries.ts packages/var-language/src/tree-sitter-scanner.ts packages/var-language/tests/test-grammar-loader.ts packages/var-language/tests/tree-sitter-scanner.test.ts pnpm-lock.yaml
git commit -m "feat(var-language): tree-sitter-based StepDefScanner behind the existing port"
```

---

### Task 2: Prove parity — parametrize `step-defs.test.ts` over both scanners

**Files:**
- Modify: `packages/var-language/tests/step-defs.test.ts` (full rewrite)

**Interfaces:**
- Consumes: `createTypeScriptScanner` (`packages/var-language/src/scanner.js`, existing), `createTreeSitterScanner` (Task 1), `createTestGrammarLoader` (Task 1), `StepDefScanner` type (existing).

This task replaces the 12 existing test cases (which currently call the raw `discoverStepDefs`/`discoverParameterTypes` functions from `step-defs.ts` directly) with the same 12 cases run through the `StepDefScanner` interface, parametrized over **both** implementations via `describe.each`. Adds one new case (escaped-quote decoding) that's a fair parity fixture for both scanners.

- [ ] **Step 1: Rewrite the test file**

Replace the full contents of `packages/var-language/tests/step-defs.test.ts`:

```ts
import { beforeAll, describe, expect, test } from 'vitest'
import { createTypeScriptScanner, type StepDefScanner } from '../src/scanner.js'
import { createTreeSitterScanner } from '../src/tree-sitter-scanner.js'
import { createTestGrammarLoader } from './test-grammar-loader.js'

const scannerFactories: ReadonlyArray<{
  readonly label: string
  readonly create: () => Promise<StepDefScanner>
}> = [
  { label: 'typescript-compiler', create: async () => createTypeScriptScanner() },
  { label: 'tree-sitter', create: async () => createTreeSitterScanner(createTestGrammarLoader()) },
]

describe.each(scannerFactories)('$label scanner', ({ create }) => {
  let scanner: StepDefScanner

  beforeAll(async () => {
    scanner = await create()
  })

  test('discovers a single step call with its source range', () => {
    const source = `import { action } from '@oselvar/var'
action('I have {int} cukes', (ctx, n) => {})
`
    const defs = scanner.discoverStepDefs('steps.ts', source)
    expect(defs).toHaveLength(1)
    expect(defs[0]?.expression).toBe('I have {int} cukes')
    expect(defs[0]?.kind).toBe('action')
    // The expression literal starts at character 8 of line 2 (1-based).
    expect(defs[0]?.expressionRange.start.line).toBe(2)
    expect(defs[0]?.callRange.start.line).toBe(2)
  })

  test('discovers multiple step calls across the file', () => {
    const source = `import { context, action, sensor } from '@oselvar/var'
context('first', () => {})
action('second', () => {})
sensor('third', () => {})
`
    const defs = scanner.discoverStepDefs('steps.ts', source)
    expect(defs.map((d) => d.expression)).toEqual(['first', 'second', 'third'])
    expect(defs.map((d) => d.kind)).toEqual(['context', 'action', 'sensor'])
  })

  test('handles the destructured-role pattern: const { action } = defineState(...)', () => {
    const source = `import { defineState } from '@oselvar/var'
const { action } = defineState(() => ({}))
action('I greet {string}', (ctx, name: string) => {})
`
    const defs = scanner.discoverStepDefs('steps.ts', source)
    expect(defs).toHaveLength(1)
    expect(defs[0]?.expression).toBe('I greet {string}')
    expect(defs[0]?.kind).toBe('action')
  })

  test('ignores `step` in unrelated positions (e.g. shadowed locals, comments)', () => {
    const source = `// action('not a real step', () => {})
function action() {}
const obj = { action: 1 }
`
    const defs = scanner.discoverStepDefs('steps.ts', source)
    expect(defs).toHaveLength(0)
  })

  test('returns empty array for a file with no step calls', () => {
    expect(scanner.discoverStepDefs('empty.ts', '')).toEqual([])
    expect(scanner.discoverStepDefs('empty.ts', 'const x = 1\n')).toEqual([])
  })

  test('discovers a paramType from defineState with a regexp literal', () => {
    const source = `import { defineState } from '@oselvar/var-core'
const { action } = defineState(() => ({}), {
  airport: { regexp: /[A-Z]{3}/, transformer: (r) => r },
})
`
    const defs = scanner.discoverParameterTypes('p.ts', source)
    expect(defs).toHaveLength(1)
    expect(defs[0]?.name).toBe('airport')
    expect(defs[0]?.regexp).toBe('[A-Z]{3}')
  })

  test('discovers a paramType from defineState with a string-literal regexp', () => {
    const source = `const { action } = defineState(() => ({}), {
  airport: { regexp: '[A-Z]{3}' },
})
`
    const defs = scanner.discoverParameterTypes('p.ts', source)
    expect(defs).toHaveLength(1)
    expect(defs[0]?.name).toBe('airport')
    expect(defs[0]?.regexp).toBe('[A-Z]{3}')
  })

  test('discovers multiple paramTypes from one defineState call', () => {
    const source = `const x = defineState(() => ({}), {
  airport: { regexp: /[A-Z]{3}/ },
  digit: { regexp: '[0-9]' },
})
`
    const names = scanner.discoverParameterTypes('p.ts', source).map((d) => d.name)
    expect(names).toEqual(['airport', 'digit'])
  })

  test('skips paramType entries with a non-literal regexp', () => {
    const source = `const x = defineState(() => ({}), {
  airport: { regexp: someRe },
})
`
    expect(scanner.discoverParameterTypes('p.ts', source)).toHaveLength(0)
  })

  test('returns empty when defineState has no paramTypes argument', () => {
    const source = `const { action } = defineState(() => ({ n: 0 }))
`
    expect(scanner.discoverParameterTypes('p.ts', source)).toEqual([])
  })

  test('captures the handler params range and structured (name, type) entries', () => {
    const source = `action('I have {int} cukes', (ctx, count: number) => {})
`
    const defs = scanner.discoverStepDefs('s.ts', source)
    expect(defs).toHaveLength(1)
    expect(defs[0]?.kind).toBe('action')
    expect(defs[0]?.handlerParams).toBeDefined()
    expect(defs[0]?.handlerParams?.params).toEqual([
      { name: 'ctx', typeText: '' },
      { name: 'count', typeText: 'number' },
    ])
    // The range starts somewhere on line 1.
    expect(defs[0]?.handlerParams?.range.start.line).toBe(1)
    expect(defs[0]?.handlerParams?.range.end.line).toBe(1)
  })

  test('is undefined when the handler is not an arrow/function expression', () => {
    const source = `const fn = (ctx: unknown) => {}
sensor('do thing', fn)
`
    const defs = scanner.discoverStepDefs('s.ts', source)
    expect(defs[0]?.handlerParams).toBeUndefined()
    expect(defs[0]?.kind).toBe('sensor')
  })

  test('decodes an escaped quote inside the expression string', () => {
    const source = `action('I said \\'hi\\'', () => {})
`
    const defs = scanner.discoverStepDefs('s.ts', source)
    expect(defs).toHaveLength(1)
    expect(defs[0]?.expression).toBe("I said 'hi'")
  })
})
```

- [ ] **Step 2: Run to verify all pass, for both scanners**

Run: `NODE_OPTIONS="--import tsx" npx vitest run packages/var-language/tests/step-defs.test.ts`
Expected: PASS — 26 tests passed (13 tests × 2 scanner labels: `typescript-compiler scanner` and `tree-sitter scanner`).

If any test fails for the `tree-sitter scanner` label specifically, that's a real parity bug in Task 1's implementation — fix `tree-sitter-scanner.ts` or `tree-sitter-queries.ts`, not the test.

- [ ] **Step 3: Type-check**

Run (from `typescript/`): `pnpm typecheck`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add packages/var-language/tests/step-defs.test.ts
git commit -m "test(var-language): parametrize step-defs tests over both scanners"
```

---

### Task 3: Wire the tree-sitter scanner into `var-lsp`

**Files:**
- Modify: `packages/var-language/src/index.ts`
- Create: `packages/var-lsp/src/node-grammar-loader.ts`
- Modify: `packages/var-lsp/src/store.ts`
- Modify: `packages/var-lsp/src/bin.ts`
- Modify: `packages/var-lsp/src/store.test.ts`
- Modify: `packages/var-lsp/tests/handlers.test.ts`
- Modify: `packages/var-lsp/package.json`

**Interfaces:**
- Consumes: `createTreeSitterScanner`, `GrammarLoader` (Task 1, re-exported from `@oselvar/var-language`'s public entry in Step 1 below).
- Produces: `createNodeGrammarLoader(): GrammarLoader` (`packages/var-lsp/src/node-grammar-loader.ts`).
- Modifies: `StoreDeps` (`packages/var-lsp/src/store.ts`) gains a required `grammarLoader: GrammarLoader` field — every existing caller of `createStore(...)` must be updated (3 in `store.test.ts`, 1 in `handlers.test.ts`, 1 in `bin.ts`'s `registerHandlers` deps factory).

- [ ] **Step 1: Export the new port and factory from `var-language`'s public entry**

Edit `packages/var-language/src/index.ts`, adding two lines (keep existing lines unchanged):

```ts
export type { DiagnosticRef, MatchRef, WorkspaceIndex, WorkspaceInput } from './index-workspace.js'
export { buildWorkspaceIndex } from './index-workspace.js'
export type { GrammarLoader } from './grammar-loader.js'
export type { StepDefScanner } from './scanner.js'
export { createTypeScriptScanner } from './scanner.js'
export { createTreeSitterScanner } from './tree-sitter-scanner.js'
export type { ParameterTypeDef, Position, Range, StepDef } from './step-defs.js'
export { discoverParameterTypes, discoverStepDefs } from './step-defs.js'
export const VERSION = '0.0.0'
```

- [ ] **Step 2: Add the runtime dependency to `var-lsp`**

Edit `packages/var-lsp/package.json`, adding `tree-sitter-typescript` to `"dependencies"` (alongside the existing entries):

```json
  "dependencies": {
    "@oselvar/var-core": "workspace:*",
    "@oselvar/var-language": "workspace:*",
    "tree-sitter-typescript": "^0.23.2",
    "vscode-languageserver": "^10.0.1",
    "vscode-languageserver-textdocument": "^1.0.12"
  },
```

Run `pnpm install` from `typescript/`.

- [ ] **Step 3: Write the Node grammar loader**

Create `packages/var-lsp/src/node-grammar-loader.ts`:

```ts
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import type { GrammarLoader } from '@oselvar/var-language'

export function createNodeGrammarLoader(): GrammarLoader {
  return {
    async load(languageId) {
      const filename =
        languageId === 'typescript-tsx' ? 'tree-sitter-tsx.wasm' : 'tree-sitter-typescript.wasm'
      const url = import.meta.resolve(`tree-sitter-typescript/${filename}`)
      return readFile(fileURLToPath(url))
    },
  }
}
```

(This is the same shape as `packages/var-language/tests/test-grammar-loader.ts` from Task 1 — that one is test-only scaffolding inside `var-language`; this is the real one shipped by `var-lsp`. A few lines of duplication between a test helper and a real adapter in a different package is fine — not worth a shared abstraction for this.)

- [ ] **Step 4: Wire it into `store.ts`**

Edit `packages/var-lsp/src/store.ts`, replacing the full file contents:

```ts
import type { VarConfig } from '@oselvar/var-core'
import { createRegistry } from '@oselvar/var-core'
import {
  buildWorkspaceIndex,
  createTreeSitterScanner,
  type GrammarLoader,
  type StepDefScanner,
  type WorkspaceIndex,
} from '@oselvar/var-language'
import type { FileSystem } from './file-system.js'

export type { FileSystem } from './file-system.js'

export type StoreDeps = {
  readonly fs: FileSystem
  readonly config: VarConfig
  readonly grammarLoader: GrammarLoader
}

export type Store = {
  reindex(): Promise<void>
  index(): WorkspaceIndex
  snippetTemplate(): string
  stepGlobs(): ReadonlyArray<string>
  // Whether a file is a var spec — i.e. it was discovered by the `vars` globs.
  // There is no `.md` extension to key off of; the config defines specs.
  isVarDoc(path: string): boolean
  fs(): FileSystem
}

export function createStore(deps: StoreDeps): Store {
  const { fs, config, grammarLoader } = deps
  let current: WorkspaceIndex = {
    stepDefs: [],
    matches: [],
    diagnostics: [],
    registry: createRegistry(),
  }
  // Created once, lazily, on the first reindex — not in createStore itself,
  // which stays synchronous. Later reindexes reuse it.
  let scannerPromise: Promise<StepDefScanner> | undefined
  return {
    async reindex() {
      scannerPromise ??= createTreeSitterScanner(grammarLoader)
      const scanner = await scannerPromise
      const stepPaths = await fs.list({ include: config.steps, exclude: [] })
      const varPaths = await fs.list(config.vars)
      const stepFiles = await Promise.all(
        stepPaths.map(async (path) => ({ path, source: await fs.read(path) })),
      )
      const varFiles = await Promise.all(
        varPaths.map(async (path) => ({ path, source: await fs.read(path) })),
      )
      current = buildWorkspaceIndex({
        stepFiles,
        varFiles,
        scannerPlugins: config.scannerPlugins,
        scanner,
      })
    },
    index: () => current,
    snippetTemplate: () => config.snippet.template,
    stepGlobs: () => config.steps,
    // Delegates to the filesystem port so unsaved editor buffers (which the
    // disk-backed index can't see) are still recognised as spec docs.
    isVarDoc: (path) => fs.matches(path, config.vars),
    fs: () => fs,
  }
}
```

- [ ] **Step 5: Wire it into `bin.ts`**

Edit `packages/var-lsp/src/bin.ts`, replacing the full file contents:

```ts
#!/usr/bin/env node
import { loadVarConfig } from '@oselvar/var-core/node'
import { createConnection, ProposedFeatures } from 'vscode-languageserver/node'
import { createNodeFileSystem } from './node-file-system.js'
import { createNodeGrammarLoader } from './node-grammar-loader.js'
import { registerHandlers } from './server.js'

const connection = createConnection(ProposedFeatures.all)
registerHandlers(connection, async (rootUri) => {
  const root = (rootUri ?? process.cwd()).replace(/^file:\/\//, '')
  return {
    fs: createNodeFileSystem(root),
    config: await loadVarConfig(root),
    grammarLoader: createNodeGrammarLoader(),
  }
})
connection.listen()
```

- [ ] **Step 6: Update `store.test.ts`**

Edit `packages/var-lsp/src/store.test.ts`. Add an import and a shared `grammarLoader`, and pass it into all three `createStore(...)` calls:

```ts
import { DEFAULT_SNIPPET_TEMPLATE } from '@oselvar/var-core'
import { describe, expect, it } from 'vitest'
import { createNodeGrammarLoader } from './node-grammar-loader.js'
import { createStore, type FileSystem } from './store.js'

function fakeFs(files: Record<string, string>): FileSystem {
  const map = new Map(Object.entries(files))
  return {
    async list(globs) {
      // Minimal matcher: support '**/*.ext' by extension suffix.
      const exts = globs.include.map((g) => g.slice(g.lastIndexOf('.')))
      return [...map.keys()].filter((p) => exts.some((e) => p.endsWith(e)))
    },
    async read(path) {
      const v = map.get(path)
      if (v === undefined) throw new Error(`no such file: ${path}`)
      return v
    },
    async write(path, content) {
      map.set(path, content)
    },
    matches(path, globs) {
      const exts = globs.include.map((g) => g.slice(g.lastIndexOf('.')))
      return exts.some((e) => path.endsWith(e))
    },
  }
}

const config = {
  vars: { include: ['**/*.md'], exclude: [] },
  steps: ['**/*.steps.ts'],
  snippet: { template: DEFAULT_SNIPPET_TEMPLATE },
  scannerPlugins: [],
}

const grammarLoader = createNodeGrammarLoader()

describe('createStore over a FileSystem', () => {
  it('indexes matches from in-memory step + var files', async () => {
    const fs = fakeFs({
      '/s.steps.ts': `action('I greet {string}', (ctx, name: string) => {})\n`,
      '/hello.md': `# Hi\n\nFirst I greet "world" okay?\n`,
    })
    const store = createStore({ fs, config, grammarLoader })
    await store.reindex()
    const matches = store.index().matches.filter((m) => m.varPath === '/hello.md')
    expect(matches.length).toBeGreaterThan(0)
  })

  it('reflects a written file on reindex', async () => {
    const fs = fakeFs({ '/s.steps.ts': '', '/a.md': '# none\n' })
    const store = createStore({ fs, config, grammarLoader })
    await store.reindex()
    expect(store.index().matches.length).toBe(0)
    await fs.write('/s.steps.ts', `action('I greet {string}', () => {})`)
    await fs.write('/a.md', `I greet "x"`)
    await store.reindex()
    expect(store.index().matches.length).toBeGreaterThan(0)
  })

  it('recognises spec docs by the vars globs, including unsaved buffers', async () => {
    const fs = fakeFs({ '/s.steps.ts': '', '/hello.md': '# Hi\n' })
    const store = createStore({ fs, config, grammarLoader })
    await store.reindex()
    // A saved spec and an unsaved buffer that matches `vars` are both var docs;
    // a `.steps.ts` is not (it doesn't match the `**/*.md` vars glob).
    expect(store.isVarDoc('/hello.md')).toBe(true)
    expect(store.isVarDoc('/never/written/draft.md')).toBe(true)
    expect(store.isVarDoc('/s.steps.ts')).toBe(false)
  })
})
```

- [ ] **Step 7: Update `handlers.test.ts`**

Edit `packages/var-lsp/tests/handlers.test.ts`. Add an import and pass `grammarLoader` into `makeStore`'s `createStore(...)` call:

```ts
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadVarConfig } from '@oselvar/var-core/node'
import { expect, test } from 'vitest'
import { buildHandlers } from '../src/handlers.js'
import { createNodeFileSystem } from '../src/node-file-system.js'
import { createNodeGrammarLoader } from '../src/node-grammar-loader.js'
import { createStore } from '../src/store.js'

function tempWorkspace(setup: (dir: string) => void): { dir: string; cleanup: () => void } {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'var-lsp-')))
  setup(dir)
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) }
}

async function makeStore(dir: string) {
  const config = await loadVarConfig(dir)
  const fs = createNodeFileSystem(dir)
  const store = createStore({ fs, config, grammarLoader: createNodeGrammarLoader() })
  await store.reindex()
  return store
}
```

Leave the rest of the file (the `test(...)` blocks below `makeStore`) unchanged — only the imports and `makeStore` body change.

- [ ] **Step 8: Run the var-lsp test suite**

Run: `NODE_OPTIONS="--import tsx" npx vitest run packages/var-lsp`
Expected: PASS — all existing `store.test.ts` and `handlers.test.ts` tests pass unchanged (they're now exercising the real tree-sitter scanner end-to-end).

- [ ] **Step 9: Type-check**

Run: `pnpm --filter @oselvar/var-language --filter @oselvar/var-lsp build`
Expected: exit 0.

Run (from `typescript/`): `pnpm typecheck`
Expected: exit 0.

- [ ] **Step 10: Commit**

```bash
git add packages/var-language/src/index.ts packages/var-lsp/package.json packages/var-lsp/src/node-grammar-loader.ts packages/var-lsp/src/store.ts packages/var-lsp/src/bin.ts packages/var-lsp/src/store.test.ts packages/var-lsp/tests/handlers.test.ts pnpm-lock.yaml
git commit -m "feat(var-lsp): dogfood the tree-sitter StepDefScanner as the real default"
```

---

### Task 4: Full workspace verification

**Files:** none (verification only).

- [ ] **Step 1: Full build**

Run (from `typescript/`): `pnpm -r build`
Expected: exit 0 across every package, including `@oselvar/website`'s Astro build (unaffected by this change, but must still be green).

- [ ] **Step 2: Full check**

Run (from `typescript/`): `pnpm check`
Expected: exit 0. This runs `pnpm lint && pnpm typecheck && pnpm test && pnpm knip && pnpm jscpd` in sequence.

If `knip` flags `web-tree-sitter`/`tree-sitter-typescript` as unused in either package, that means an import path from Task 1 or Task 3 doesn't match what's actually referenced — double-check the `dependencies`/`devDependencies` block matches an actual import somewhere in that package's `src/` or `tests/`.

If `jscpd` flags duplication between `packages/var-language/tests/test-grammar-loader.ts` and `packages/var-lsp/src/node-grammar-loader.ts`, that's the acceptable, explicitly-decided duplication from Task 3 Step 3 — raise the threshold for that specific pair only if the default config forces a hard failure; don't merge the two into a shared package to silence it (that was rejected during design specifically to avoid a devDependency from `var-language` on `var-lsp`, or vice versa).

- [ ] **Step 3: Manual dogfood sanity check**

Run: `pnpm install:vscode` is out of scope (touches the VS Code extension, not part of this change) — skip it. Instead, confirm the LSP binary itself starts cleanly against a real workspace:

```bash
cd packages/var-examples
node --import tsx ../var-lsp/src/bin.ts --stdio &
LSP_PID=$!
sleep 1
kill $LSP_PID
```

Expected: no crash/stack trace printed in that ~1 second window (the process starts and sits listening; killing it is just cleanup — this isn't a scripted protocol exchange, just confirms `Parser.init()` and the two grammar loads complete without throwing during LSP startup).

- [ ] **Step 4: Final commit (if any fixups were needed)**

If Steps 1–3 required any fixes, commit them now with a message describing what broke and why. If everything was already green, there's nothing to commit here.

---

## Self-Review Notes

- **Spec coverage:** ARCHITECTURE.md §7 steps 1 (Task 1, 2) and 2 (Task 1's `GrammarLoader` + Task 3's Node implementation) are covered. Real dogfood in `var-lsp` (Task 3) per the design doc's explicit scope decision. `website`/`var-vscode` are correctly left untouched (no task touches them). All three "Out of scope" bullets from the design doc (StepDef.typeText opacity, SnippetEmitter port, file-pattern de-hardcoding, Model A/B, conformance harness) have no corresponding task — correct, they're follow-ups.
- **Placeholder scan:** no TBD/TODO; every step shows the complete file content or exact command.
- **Type consistency:** `GrammarLoader.load(languageId: string)` is used identically in `tree-sitter-scanner.ts` (Task 1), `test-grammar-loader.ts` (Task 1), and `node-grammar-loader.ts` (Task 3) — same signature, same two `languageId` string values (`'typescript'` / `'typescript-tsx'`) mapped to the same two filenames everywhere. `StoreDeps` in Task 3 Step 4 and every `createStore({...})` call site updated in the same task (Steps 6–7) use the same three field names (`fs`, `config`, `grammarLoader`).
