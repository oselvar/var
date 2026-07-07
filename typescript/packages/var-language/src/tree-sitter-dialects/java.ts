import type { Node } from 'web-tree-sitter'
import type { HandlerParam, HandlerParams } from '../step-defs.ts'
import { type LanguageSpec, toRange } from './types.ts'

// Verified against tree-sitter-java 0.23.5 and all 13 conformance bundles
// (2026-07-02). The receiver is deliberately unconstrained — steps register
// on whatever the binder variable is called (s.stimulus, binder.sensor, ...).
const STEP_DEFINITION_QUERY = `
(method_invocation
  name: (identifier) @function-name
  arguments: (argument_list
    .
    (string_literal) @expression
    .
    (_)? @handler)
  (#match? @function-name "^(stimulus|sensor)$")
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
  (#eq? @function-name "param")
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
