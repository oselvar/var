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
