import type { Node } from 'web-tree-sitter'
import type { HandlerParams } from '../step-defs.ts'
import type { LanguageSpec } from './types.ts'

// Verified against tree-sitter-rust 0.24.0 and all 15 conformance bundles
// (2026-07-12). Rust authors steps through the `var::Steps` builder, so a step
// def is a method call `s.stimulus(...)` / `s.sensor(...)` — the method name is
// the kind, matching every other port. The expression is the FIRST string
// argument (anchored with `.`), so string literals inside the handler closure
// are never mistaken for it; the `steps`/`from_registry`/`into_registry` calls
// have other names, excluded by the #match filter.
const STEP_DEFINITION_QUERY = `
(call_expression
  function: (field_expression
    field: (field_identifier) @function-name)
  arguments: (arguments . (string_literal) @expression)
  (#match? @function-name "^(stimulus|sensor)$")
) @root
`

// A custom parameter type is `s.param("name", "regexp", …)` or
// `s.param_with_format("name", "regexp", …)`: name the first string, regexp the
// second — which may be a raw string (`r"£\\d+\\.\\d{2}"`), whose backslashes
// are literal.
const PARAMETER_TYPE_QUERY = `
(call_expression
  function: (field_expression
    field: (field_identifier) @function-name)
  arguments: (arguments
    .
    (string_literal) @name
    .
    [(string_literal) (raw_string_literal)] @regexp-value
  )
  (#match? @function-name "^param")
) @root
`

const ESCAPES: Readonly<Record<string, string>> = {
  '\\': '\\',
  '"': '"',
  "'": "'",
  n: '\n',
  t: '\t',
  r: '\r',
  '0': '\0',
}

// Decode one `escape_sequence` node's text (leading backslash included).
function decodeEscape(text: string): string {
  const body = text.slice(1)
  if (body.startsWith('u{')) return String.fromCodePoint(Number.parseInt(body.slice(2, -1), 16))
  if (body.startsWith('x')) return String.fromCharCode(Number.parseInt(body.slice(1), 16))
  return ESCAPES[body] ?? body
}

// Both string_literal and raw_string_literal carry their text in one or more
// `string_content` children; a plain string additionally has `escape_sequence`
// siblings. A raw string has none, so its content survives verbatim.
function decodeString(node: Node): string {
  let out = ''
  for (const child of node.children) {
    if (child?.type === 'string_content') out += child.text
    else if (child?.type === 'escape_sequence') out += decodeEscape(child.text)
  }
  return out
}

export const rustSpec: LanguageSpec = {
  stepDefQuery: STEP_DEFINITION_QUERY,
  parameterTypeQuery: PARAMETER_TYPE_QUERY,
  decodeString,
  // Handler params (the closure arguments) aren't captured yet — Rust LSP hover
  // is future work; extraction conformance only needs kind/expression/regexp.
  extractHandlerParams: (): HandlerParams | undefined => undefined,
  resolveRegexp: (node) => decodeString(node),
}
