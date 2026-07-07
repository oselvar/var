import type { Node } from 'web-tree-sitter'
import type { HandlerParam, HandlerParams } from '../step-defs.ts'
import { type LanguageSpec, toRange } from './types.ts'

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
  (#match? @function-name "^(stimulus|sensor)$")
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
          (value_arguments . (value_argument [
            (string_literal)
            (multiline_string_literal)
          ] @regexp-value))))))
  (#eq? @function-name "param")
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
// and escapes. The Kotlin tree-sitter grammar (1.1.0) doesn't parse \uXXXX as
// escape_sequence nodes; they appear split: `\u` as one string_content, `XXXX`
// as the next. We must process the full node list to reconstruct them.
function decodeString(node: Node): string {
  // A raw string — Regex("""£\d+\.\d{2}""") — parses as its own node type
  // and has no escape processing: the value is the text between the """s.
  if (node.type === 'multiline_string_literal') {
    return node.text.slice(3, -3)
  }
  const children = node.children
  let out = ''
  let skipNext = false

  for (let i = 0; i < children.length; i++) {
    if (skipNext) {
      skipNext = false
      continue
    }

    const child = children[i]
    if (!child) continue

    if (child.type === 'escape_sequence') {
      out += decodeEscape(child.text)
    } else if (child.type === 'string_content') {
      const text = child.text
      // Check if this content ends with \u (incomplete unicode escape)
      if (
        text.endsWith('\\u') &&
        i + 1 < children.length &&
        children[i + 1]?.type === 'string_content'
      ) {
        const nextText = children[i + 1]?.text
        // Check if the next node contains hex digits
        if (nextText && /^[0-9a-fA-F]{4}/.test(nextText)) {
          // Combine them
          out += text.slice(0, -2)
          const unicodePart = nextText.slice(0, 4)
          out += String.fromCodePoint(Number.parseInt(unicodePart, 16))
          // If there's more content in the next node, process it
          const remaining = nextText.slice(4)
          if (remaining) {
            out += decodeStringContent(remaining)
          }
          skipNext = true
          continue
        }
      }
      out += decodeStringContent(text)
    }
  }
  return out
}

function decodeStringContent(text: string): string {
  let out = ''
  let i = 0
  while (i < text.length) {
    if (text[i] === '\\' && i + 1 < text.length) {
      const seq = text.slice(i, i + 2)
      const decoded = decodeEscape(seq)
      if (decoded !== seq) {
        out += decoded
        i += 2
      } else {
        out += text[i]
        i++
      }
    } else {
      out += text[i]
      i++
    }
  }
  return out
}

// Kotlin lambda params are USER params only — the state is the lambda's
// receiver (steps(::Ctx) { ... }), so unlike TS/Python/Java there is no
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
