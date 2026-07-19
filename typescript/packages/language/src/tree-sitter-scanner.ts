import type { StepKind } from '@varar/core'
import { Language, type Node, Parser, Query, type QueryMatch } from 'web-tree-sitter'
import type { GrammarLoader } from './grammar-loader.ts'
import type { StepDefScanner } from './scanner.ts'
import type { ParameterTypeDef, StepDef } from './step-defs.ts'
import { javaSpec } from './tree-sitter-dialects/java.ts'
import { kotlinSpec } from './tree-sitter-dialects/kotlin.ts'
import { pythonSpec } from './tree-sitter-dialects/python.ts'
import { rubySpec } from './tree-sitter-dialects/ruby.ts'
import { rustSpec } from './tree-sitter-dialects/rust.ts'
import type { LanguageId, LanguageSpec } from './tree-sitter-dialects/types.ts'
import { toRange } from './tree-sitter-dialects/types.ts'
import { typescriptSpec } from './tree-sitter-dialects/typescript.ts'

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
  java: javaSpec,
  kotlin: kotlinSpec,
  python: pythonSpec,
  ruby: rubySpec,
  rust: rustSpec,
  typescript: typescriptSpec,
  'typescript-tsx': typescriptSpec,
}

const EXTENSIONS: ReadonlyArray<readonly [string, LanguageId]> = [
  ['.tsx', 'typescript-tsx'],
  ['.ts', 'typescript'],
  ['.py', 'python'],
  ['.java', 'java'],
  ['.kt', 'kotlin'],
  ['.rb', 'ruby'],
  ['.rs', 'rust'],
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
  // The runtime init is global and one-time; the first caller's loader decides
  // how the emscripten `.wasm` is located (a no-op default on Node, a bundled
  // URL in the browser). A process only ever uses one environment's loader.
  initPromise ??= Parser.init(grammarLoader.initOptions)
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
