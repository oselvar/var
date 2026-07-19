import type { Node } from 'web-tree-sitter'
import type { HandlerParam, HandlerParams } from '../step-defs.ts'
import { decodeSimpleOrHexEscape } from './escape-decode.ts'
import { type LanguageSpec, toRange } from './types.ts'

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
  (#match? @function-name "^(stimulus|sensor)$")
) @root
`

// A custom parameter type is a `param("name", r"regexp"|re.compile(...), ...)`
// call: name the first positional (string) argument, regexp the second (a
// string or an re.compile(...) call). Trailing parse=/format= keyword arguments
// are not anchored, so they're ignored.
const PARAMETER_TYPE_QUERY = `
(call
  function: (identifier) @function-name
  arguments: (argument_list
    .
    (string) @name
    .
    [(string) (call)] @regexp-value
  )
  (#eq? @function-name "param")
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
  const decoded = decodeSimpleOrHexEscape(body, SIMPLE_ESCAPES)
  if (decoded !== undefined) return decoded
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
      if (esc?.type !== 'escape_sequence') continue
      out += content.text.slice(cursor - content.startIndex, esc.startIndex - content.startIndex)
      out += decodeEscape(esc.text)
      cursor = esc.endIndex
    }
    out += content.text.slice(cursor - content.startIndex)
  }
  return out
}

// Shared param-extraction shape; per-dialect on purpose (see ruby.ts). The whole
// tree-sitter-dialects/ folder is exempt from jscpd (see typescript/.jscpd.json).
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
