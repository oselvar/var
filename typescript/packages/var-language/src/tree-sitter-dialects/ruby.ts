import type { Node } from 'web-tree-sitter'
import type { HandlerParam, HandlerParams } from '../step-defs.ts'
import { decodeSimpleOrHexEscape } from './escape-decode.ts'
import { type LanguageSpec, toRange } from './types.ts'

// Verified against tree-sitter-ruby 0.23.1 and all 15 conformance bundles
// (2026-07-07). In the block DSL a step def is a `stimulus`/`sensor` method
// call whose first argument is the expression string and whose handler is the
// trailing block — `block` (brace) or `do_block` (do…end). The surrounding
// `steps(...) do … end` call has method name "steps", so the #match? filter
// excludes it.
const STEP_DEFINITION_QUERY = `
(call
  !receiver
  method: (identifier) @function-name
  arguments: (argument_list . (string) @expression)
  block: [(block) (do_block)] @handler
  (#match? @function-name "^(stimulus|sensor)$")
) @root
`

// A custom parameter type is a `param("name", "regexp", …)` call: name the
// first positional string, regexp the second. Trailing parse:/format: keyword
// arguments are not anchored, so they're ignored.
const PARAMETER_TYPE_QUERY = `
(call
  !receiver
  method: (identifier) @function-name
  arguments: (argument_list
    .
    (string) @name
    .
    (string) @regexp-value
  )
  (#eq? @function-name "param")
) @root
`

// Ruby double-quoted escapes. (Single-quoted strings recognize only \\ and \',
// handled separately.)
const DOUBLE_QUOTE_ESCAPES: Readonly<Record<string, string>> = {
  '\\': '\\',
  "'": "'",
  '"': '"',
  n: '\n',
  t: '\t',
  r: '\r',
  s: ' ',
  '0': '\0',
  a: '',
  b: '\b',
  e: '',
  f: '\f',
  v: '\v',
  '#': '#',
}

function decodeDoubleEscape(text: string): string {
  const body = text.slice(1) // drop the leading backslash
  const decoded = decodeSimpleOrHexEscape(body, DOUBLE_QUOTE_ESCAPES)
  if (decoded !== undefined) return decoded
  if (body.startsWith('u{')) {
    // \u{XXXX YYYY} — one or more space-separated code points.
    return body
      .slice(2, -1)
      .trim()
      .split(/\s+/)
      .map((h) => String.fromCodePoint(Number.parseInt(h, 16)))
      .join('')
  }
  if (body.startsWith('u') && body.length === 5) {
    return String.fromCodePoint(Number.parseInt(body.slice(1), 16))
  }
  if (/^[0-7]{1,3}$/.test(body)) {
    return String.fromCodePoint(Number.parseInt(body, 8))
  }
  // Unknown escape: Ruby keeps the character, dropping the backslash.
  return body
}

// Single-quoted Ruby: only \\ and \' are escapes; every other backslash is
// literal (so a regexp pattern like '£\d+\.\d{2}' survives verbatim).
function decodeSingleQuoted(content: string): string {
  let out = ''
  for (let i = 0; i < content.length; i++) {
    const next = content[i + 1]
    if (content[i] === '\\' && (next === '\\' || next === "'")) {
      out += next
      i++
    } else {
      out += content[i]
    }
  }
  return out
}

// (string "'"|"\"" (string_content) (escape_sequence)* …): unlike Python,
// escape_sequence nodes are SIBLINGS of string_content, direct children of the
// string. Single quotes never produce escape_sequence nodes; their content is
// decoded for \\ and \'.
function decodeString(node: Node): string {
  const single = node.text.startsWith("'")
  // %-literals and heredocs: no C-style decode — join the raw content.
  if (!single && !node.text.startsWith('"')) {
    return node.namedChildren
      .filter((c): c is Node => c?.type === 'string_content')
      .map((c) => c.text)
      .join('')
  }
  let out = ''
  for (const child of node.children) {
    if (child?.type === 'string_content') {
      out += single ? decodeSingleQuoted(child.text) : child.text
    } else if (child?.type === 'escape_sequence') {
      out += single ? decodeSingleQuoted(child.text) : decodeDoubleEscape(child.text)
    }
  }
  return out
}

/* jscpd:ignore-start — shared param-extraction shape; per-dialect on purpose (see python.ts) */
function extractHandlerParams(handlerNode: Node): HandlerParams | undefined {
  const parameters = handlerNode.childForFieldName('parameters')
  const params = parameters?.namedChildren.filter((p): p is Node => p !== null) ?? []
  if (params.length === 0) return undefined
  // Ruby block parameters carry no type annotations.
  const structured: HandlerParam[] = params.map((p) => {
    switch (p.type) {
      case 'optional_parameter':
      case 'splat_parameter':
        return { name: p.childForFieldName('name')?.text ?? p.text, typeText: '' }
      default:
        return { name: p.text, typeText: '' }
    }
  })
  // biome-ignore lint/style/noNonNullAssertion: length checked non-zero above
  return { range: toRange(params[0]!, params[params.length - 1]!), params: structured }
}
/* jscpd:ignore-end */

export const rubySpec: LanguageSpec = {
  stepDefQuery: STEP_DEFINITION_QUERY,
  parameterTypeQuery: PARAMETER_TYPE_QUERY,
  decodeString,
  extractHandlerParams: (handlerNode) =>
    handlerNode.type === 'block' || handlerNode.type === 'do_block'
      ? extractHandlerParams(handlerNode)
      : undefined,
  resolveRegexp: (node) => (node.type === 'string' ? decodeString(node) : node.text),
}
