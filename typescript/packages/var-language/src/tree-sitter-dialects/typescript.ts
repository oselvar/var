import type { Node } from 'web-tree-sitter'
import type { HandlerParam, HandlerParams } from '../step-defs.ts'
import { decodeSimpleOrHexEscape } from './escape-decode.ts'
import type { LanguageSpec } from './types.ts'
import { toRange } from './types.ts'

// Capture names follow cucumber/language-service's convention
// (@root/@function-name/@expression/@name) rather than inventing new ones.
//
// The leading `.` before `(string)` matters: without it, this query matches
// a string literal at *any* argument position (e.g. wrongly treating 'text'
// in `stimulus(someVar, 'text', handler)` as the expression). Verified
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
  (#match? @function-name "^(stimulus|sensor)$")
) @root
`

// A custom parameter type is a `param('name', /regexp/, parse?, format?)` call:
// the name is the first (string) argument, the regexp the second. Var has no
// raw-regexp step definitions, so unlike cucumber/language-service the step
// query has no (regex)/(template_string) branch on @expression; this query's
// (regex) alternative below is unrelated — it's the parameter type's own regexp
// (e.g. `param('airport', /[A-Z]{3}/)`), a real regexp regardless of that rule.
// `param` is normally reached as a method on the chain returned by `steps()`
// (`steps(f).param('money', /…/)`), so match it both as a bare call and as a
// member call.
export const PARAMETER_TYPE_QUERY = `
(call_expression
  function: [
    (identifier) @function-name
    (member_expression property: (property_identifier) @function-name)
  ]
  arguments: (arguments
    .
    (string) @name
    .
    [(regex) (string)] @regexp-value
  )
  (#eq? @function-name "param")
) @root
`

const SIMPLE_ESCAPES: Readonly<Record<string, string>> = {
  "'": "'",
  '"': '"',
  '`': '`',
  '\\': '\\',
  n: '\n',
  t: '\t',
  r: '\r',
  b: '\b',
  f: '\f',
  v: '\v',
  '0': '\0',
}

// `text` is the escape_sequence node's full text, including the leading
// backslash (e.g. "\\n", "\\x41", "\\u00e9", "\\u{1F389}"). Verified against
// JavaScript's own native escape decoding for every branch below.
function decodeEscapeSequence(text: string): string {
  const body = text.slice(1)
  const decoded = decodeSimpleOrHexEscape(body, SIMPLE_ESCAPES)
  if (decoded !== undefined) return decoded
  if (body.startsWith('u{')) {
    return String.fromCodePoint(Number.parseInt(body.slice(2, -1), 16))
  }
  if (body.startsWith('u') && body.length === 5) {
    return String.fromCodePoint(Number.parseInt(body.slice(1), 16))
  }
  // Redundant escape (e.g. `\z`) — ECMAScript yields the character itself.
  return body
}

// Unlike `ts.StringLiteral.text` (already decoded), a tree-sitter `string`
// node's children are the two quote tokens plus alternating `string_fragment`
// (verbatim text) and `escape_sequence` nodes — this reconstructs the decoded
// value. Verified against `stimulus('I said \'hi\'', ...)`, whose `string` node
// has children `(string_fragment "I said ") (escape_sequence "\'")
// (string_fragment "hi") (escape_sequence "\'")`.
function decodeString(node: Node): string {
  let out = ''
  for (const child of node.children) {
    if (child.type === 'string_fragment') out += child.text
    else if (child.type === 'escape_sequence') out += decodeEscapeSequence(child.text)
  }
  return out
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
      typeText: typeAnnotation ? (typeAnnotation.namedChild(0)?.text ?? '') : '',
    }
  })
  return { range: toRange(first, last), params: structured }
}

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
