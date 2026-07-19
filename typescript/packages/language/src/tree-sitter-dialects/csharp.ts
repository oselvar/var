import type { Node } from 'web-tree-sitter'
import type { HandlerParam, HandlerParams } from '../step-defs.ts'
import { type LanguageSpec, toRange } from './types.ts'

// Verified against tree-sitter-c-sharp 0.23.5 and all 15 conformance bundles
// (2026-07-19). A step def is `s.Stimulus("expr", handler)` / `s.Sensor(...)` —
// an invocation on a member access; the receiver (the Steps builder variable)
// is unconstrained. Method names are PascalCase (C# idiom); the shared scanner
// lower-cases @function-name to the `stimulus`/`sensor` StepKind.
const STEP_DEFINITION_QUERY = `
(invocation_expression
  function: (member_access_expression name: (identifier) @function-name)
  arguments: (argument_list
    .
    (argument [(string_literal) (verbatim_string_literal)] @expression)
    .
    (argument (_) @handler)?)
  (#match? @function-name "^(Stimulus|Sensor)$")
) @root
`

// A custom parameter type is `s.Param("name", "regexp", …)`; the regexp is
// commonly a verbatim string (`@"…"`) so backslashes survive.
const PARAMETER_TYPE_QUERY = `
(invocation_expression
  function: (member_access_expression name: (identifier) @function-name)
  arguments: (argument_list
    .
    (argument (string_literal) @name)
    .
    (argument [(string_literal) (verbatim_string_literal)] @regexp-value))
  (#eq? @function-name "Param")
) @root
`

const SIMPLE_ESCAPES: Readonly<Record<string, string>> = {
  "'": "'",
  '"': '"',
  '\\': '\\',
  '0': '\0',
  a: '\x07',
  b: '\b',
  f: '\f',
  n: '\n',
  r: '\r',
  t: '\t',
  v: '\v',
}

function decodeEscape(text: string): string {
  const body = text.slice(1) // drop the leading backslash
  const simple = SIMPLE_ESCAPES[body]
  if (simple !== undefined) return simple
  // \uXXXX, \xX…, \UXXXXXXXX — all hex code points.
  if (body[0] === 'u' || body[0] === 'x' || body[0] === 'U') {
    return String.fromCodePoint(Number.parseInt(body.slice(1), 16))
  }
  return body
}

// A verbatim string `@"…"`: the only escape is a doubled quote (`""` → `"`);
// backslashes are literal (so `@"£\d+\.\d{2}"` survives verbatim).
function decodeVerbatim(text: string): string {
  return text.slice(2, -1).replace(/""/g, '"')
}

// Regular C# strings: sibling (string_literal_content) and (escape_sequence),
// the same shape as the Java/TypeScript grammars.
function decodeString(node: Node): string {
  if (node.type === 'verbatim_string_literal') return decodeVerbatim(node.text)
  let out = ''
  for (const child of node.children) {
    if (child?.type === 'string_literal_content') out += child.text
    else if (child?.type === 'escape_sequence') out += decodeEscape(child.text)
  }
  return out
}

function extractHandlerParams(handlerNode: Node): HandlerParams | undefined {
  const parameters = handlerNode.childForFieldName('parameters')
  if (!parameters) return undefined
  // Bare single-parameter lambda without parentheses: `g => …`
  if (parameters.type === 'implicit_parameter') {
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

export const csharpSpec: LanguageSpec = {
  stepDefQuery: STEP_DEFINITION_QUERY,
  parameterTypeQuery: PARAMETER_TYPE_QUERY,
  decodeString,
  extractHandlerParams: (handlerNode) =>
    handlerNode.type === 'lambda_expression' ? extractHandlerParams(handlerNode) : undefined,
  resolveRegexp: decodeString,
}
