import { CucumberExpression, type Node, NodeType } from '@cucumber/cucumber-expressions'
import type { Registry } from './registry.js'

// A cucumber expression broken down into its top-level segments. Positions
// (`start`/`end`) are character offsets within the original expression
// string, so callers can splice/replace portions safely.
export type ExpressionSegment =
  | { readonly kind: 'literal'; readonly text: string; readonly start: number; readonly end: number }
  | {
      readonly kind: 'param'
      readonly name: string
      readonly start: number
      readonly end: number
    }
  | {
      // Optional ( `(foo)` ) and alternation ( `red/green` ) groups don't
      // carry a runtime value the way a parameter does; we keep them as
      // opaque literal-ish slices so the differ can still detect rewrites.
      readonly kind: 'opaque'
      readonly text: string
      readonly start: number
      readonly end: number
    }

export function expressionSegments(
  expression: string,
  registry: Registry,
): ReadonlyArray<ExpressionSegment> {
  // CucumberExpression's AST is the canonical decomposition. We construct one
  // just to read `ast` — every other side effect (regex generation, parameter
  // type resolution) is harmless because we throw the instance away.
  const compiled = new CucumberExpression(expression, registry.parameterTypes)
  const root = compiled.ast
  return childrenToSegments(root, expression)
}

function childrenToSegments(
  root: Node,
  source: string,
): ReadonlyArray<ExpressionSegment> {
  // The cucumber-expressions AST splits text into per-token children
  // (word/whitespace), so we walk children and coalesce neighboring TEXT_NODEs
  // into a single literal segment whose positions span the whole run.
  const out: ExpressionSegment[] = []
  let literalStart: number | undefined
  let literalEnd: number | undefined
  const flush = (): void => {
    if (literalStart !== undefined && literalEnd !== undefined) {
      out.push({
        kind: 'literal',
        text: source.slice(literalStart, literalEnd),
        start: literalStart,
        end: literalEnd,
      })
      literalStart = undefined
      literalEnd = undefined
    }
  }
  for (const child of root.nodes ?? []) {
    if (child.type === NodeType.text) {
      if (literalStart === undefined) literalStart = child.start
      literalEnd = child.end
      continue
    }
    flush()
    out.push(nonLiteralSegment(child, source))
  }
  flush()
  return out
}

function nonLiteralSegment(node: Node, source: string): ExpressionSegment {
  const slice = source.slice(node.start, node.end)
  if (node.type === NodeType.parameter) {
    // Strip the surrounding `{...}` to recover the parameter type name.
    const name = slice.startsWith('{') && slice.endsWith('}') ? slice.slice(1, -1) : slice
    return { kind: 'param', name, start: node.start, end: node.end }
  }
  // optional, alternation, expression — treat the raw text as opaque.
  return { kind: 'opaque', text: slice, start: node.start, end: node.end }
}

// Plan describing how each parameter in the OLD expression maps onto the NEW
// expression. Consumers (the rename refactor) use this to decide what to do
// with each .bdd.md site's captured values.
export type ParamFate =
  | {
      readonly kind: 'kept'
      readonly oldIndex: number
      readonly newIndex: number
      // The parameter's name stayed the same (e.g., {string} → {string}).
      // Values can be reused verbatim.
      readonly nameUnchanged: boolean
    }
  | {
      // Parameter at this OLD index no longer exists in the NEW expression.
      // The matching value in each site should be stripped.
      readonly kind: 'removed'
      readonly oldIndex: number
    }
  | {
      // Parameter at this NEW index didn't exist in the OLD expression. The
      // refactor needs to acquire a value for each site (prompt the user).
      readonly kind: 'added'
      readonly newIndex: number
      readonly name: string
    }

export type ExpressionDiff = {
  readonly oldSegments: ReadonlyArray<ExpressionSegment>
  readonly newSegments: ReadonlyArray<ExpressionSegment>
  readonly paramFates: ReadonlyArray<ParamFate>
  // Literal portions changed (e.g., `I greet` → `I welcome`). The cascade
  // rewrites the .bdd.md sites' literal text from this signal.
  readonly literalChanged: boolean
}

// Render an expression by replacing each parameter slot with a concrete value
// supplied by the caller. Used by the rename refactor to rebuild every
// .bdd.md match site from the new expression while preserving captured
// values. Opaque (optional/alternation) segments are emitted verbatim.
//
// Throws if `values.length` doesn't match the number of parameters in the
// expression — callers that need partial coverage should handle add/remove
// fates first.
export function renderExpression(
  expression: string,
  values: ReadonlyArray<string>,
  registry: Registry,
): string {
  const segs = expressionSegments(expression, registry)
  let out = ''
  let i = 0
  for (const s of segs) {
    if (s.kind === 'param') {
      const v = values[i]
      if (v === undefined) {
        throw new Error(
          `renderExpression: only ${values.length} value(s) provided but expression "${expression}" has ${
            segs.filter((s) => s.kind === 'param').length
          } parameter(s)`,
        )
      }
      out += v
      i++
    } else {
      out += s.text
    }
  }
  if (i !== values.length) {
    throw new Error(
      `renderExpression: ${values.length} value(s) provided but expression "${expression}" only has ${i} parameter(s)`,
    )
  }
  return out
}

export function diffExpressions(
  oldExpression: string,
  newExpression: string,
  registry: Registry,
): ExpressionDiff {
  const oldSegments = expressionSegments(oldExpression, registry)
  const newSegments = expressionSegments(newExpression, registry)

  const oldParams = oldSegments.filter((s): s is Extract<ExpressionSegment, { kind: 'param' }> =>
    s.kind === 'param',
  )
  const newParams = newSegments.filter((s): s is Extract<ExpressionSegment, { kind: 'param' }> =>
    s.kind === 'param',
  )

  const paramFates: ParamFate[] = []

  // Phase A: walk old parameters in order. If the same OLD index has a NEW
  // parameter at the same position (positional alignment), pair them. This
  // is the common case — order/count unchanged.
  const newConsumed = new Set<number>()
  for (let i = 0; i < oldParams.length; i++) {
    const nextNew = newParams[i]
    if (nextNew) {
      newConsumed.add(i)
      paramFates.push({
        kind: 'kept',
        oldIndex: i,
        newIndex: i,
        nameUnchanged: oldParams[i]!.name === nextNew.name,
      })
    } else {
      paramFates.push({ kind: 'removed', oldIndex: i })
    }
  }
  for (let j = 0; j < newParams.length; j++) {
    if (newConsumed.has(j)) continue
    paramFates.push({ kind: 'added', newIndex: j, name: newParams[j]!.name })
  }

  // Phase B: did any non-parameter (literal/opaque) segment change?
  const oldLiterals = oldSegments
    .filter((s) => s.kind !== 'param')
    .map((s) => (s.kind === 'literal' ? s.text : s.text))
    .join('')
  const newLiterals = newSegments
    .filter((s) => s.kind !== 'param')
    .map((s) => (s.kind === 'literal' ? s.text : s.text))
    .join('')
  const literalChanged = oldLiterals !== newLiterals

  return { oldSegments, newSegments, paramFates, literalChanged }
}
