import type { StepKind } from '@oselvar/var-core'
import * as ts from 'typescript'

export type Position = { readonly line: number; readonly character: number }
export type Range = { readonly start: Position; readonly end: Position }

export type HandlerParam = {
  // The source text after the colon, e.g. `string` for `name: string` or
  // empty when no annotation is present (e.g. `ctx`). Opaque: produced
  // verbatim by whichever per-language scanner extracted it (TypeScript
  // compiler AST or tree-sitter node text) and never parsed downstream —
  // every consumer only concatenates it into rendered source.
  readonly typeText: string
  readonly name: string
}

export type HandlerParams = {
  // The full source range covering every parameter (commas included) inside
  // the handler's parentheses, e.g. for `(ctx, name: string)` it spans
  // `ctx, name: string`. 1-based.
  readonly range: Range
  // Each parameter's structured info, including the first (typically `ctx`).
  readonly params: ReadonlyArray<HandlerParam>
}

export type StepDef = {
  readonly file: string
  readonly expression: string
  readonly kind: StepKind
  readonly expressionRange: Range
  readonly callRange: Range
  // Optional because handlers in unusual forms (no parens, identifier-only
  // arrow, etc.) are skipped: we just won't sync those signatures.
  readonly handlerParams?: HandlerParams | undefined
}

export function discoverStepDefs(file: string, source: string): ReadonlyArray<StepDef> {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.ESNext, true)
  const out: StepDef[] = []
  visit(sf, sf, out, file)
  return out
}

export type ParameterTypeDef = {
  readonly file: string
  readonly name: string
  readonly regexp: string
  readonly callRange: Range
}

export function discoverParameterTypes(
  file: string,
  source: string,
): ReadonlyArray<ParameterTypeDef> {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.ESNext, true)
  const out: ParameterTypeDef[] = []
  visitForParameterTypes(sf, sf, out, file)
  return out
}

function visitForParameterTypes(
  sf: ts.SourceFile,
  node: ts.Node,
  out: ParameterTypeDef[],
  file: string,
): void {
  if (ts.isCallExpression(node) && isDefineStateCall(node) && node.arguments.length >= 2) {
    const arg1 = node.arguments[1]
    if (arg1 && ts.isObjectLiteralExpression(arg1)) {
      for (const prop of arg1.properties) {
        if (!ts.isPropertyAssignment(prop)) continue
        const name = ts.isIdentifier(prop.name)
          ? prop.name.text
          : ts.isStringLiteral(prop.name)
            ? prop.name.text
            : undefined
        if (name === undefined) continue
        const def = prop.initializer
        if (!ts.isObjectLiteralExpression(def)) continue
        const regexp = readRegexpProperty(def, 'regexp')
        if (regexp !== undefined) {
          out.push({ file, name, regexp, callRange: rangeOf(sf, node) })
        }
      }
    }
  }
  ts.forEachChild(node, (child) => visitForParameterTypes(sf, child, out, file))
}

function isDefineStateCall(node: ts.CallExpression): boolean {
  // Match a bare `defineState(...)` call, regardless of import shape. Shadowed
  // locals are an accepted false-positive risk, same as the role-call matcher.
  return ts.isIdentifier(node.expression) && node.expression.text === 'defineState'
}

function readRegexpProperty(obj: ts.ObjectLiteralExpression, name: string): string | undefined {
  for (const prop of obj.properties) {
    if (!ts.isPropertyAssignment(prop)) continue
    if (!ts.isIdentifier(prop.name) || prop.name.text !== name) continue
    const init = prop.initializer
    if (ts.isRegularExpressionLiteral(init)) {
      // Strip the leading `/` and trailing `/flags` so the cucumber-expressions
      // ParameterType can take a plain pattern string.
      const text = init.text // e.g. "/[A-Z]{3}/i"
      const lastSlash = text.lastIndexOf('/')
      if (lastSlash > 0) return text.slice(1, lastSlash)
    }
    if (ts.isStringLiteral(init) || ts.isNoSubstitutionTemplateLiteral(init)) return init.text
  }
  return undefined
}

function visit(sf: ts.SourceFile, node: ts.Node, out: StepDef[], file: string): void {
  if (ts.isCallExpression(node) && isStepCall(node) && node.arguments.length >= 1) {
    const arg0 = node.arguments[0]
    if (arg0 && ts.isStringLiteral(arg0)) {
      const kind = (node.expression as ts.Identifier).text as StepKind
      const handler = node.arguments[1]
      const handlerParams =
        handler && (ts.isArrowFunction(handler) || ts.isFunctionExpression(handler))
          ? extractHandlerParams(sf, handler)
          : undefined
      out.push({
        file,
        expression: arg0.text,
        kind,
        expressionRange: rangeOf(sf, arg0),
        callRange: rangeOf(sf, node),
        handlerParams,
      })
    }
  }
  ts.forEachChild(node, (child) => visit(sf, child, out, file))
}

function extractHandlerParams(
  sf: ts.SourceFile,
  handler: ts.ArrowFunction | ts.FunctionExpression,
): HandlerParams | undefined {
  const params = handler.parameters
  if (params.length === 0) return undefined
  // biome-ignore lint/style/noNonNullAssertion: length checked non-zero above
  const first = params[0]!
  // biome-ignore lint/style/noNonNullAssertion: length checked non-zero above
  const last = params[params.length - 1]!
  const start = sf.getLineAndCharacterOfPosition(first.getStart(sf))
  const end = sf.getLineAndCharacterOfPosition(last.getEnd())
  const structured: HandlerParam[] = params.map((p) => {
    const name = ts.isIdentifier(p.name) ? p.name.text : p.name.getText(sf)
    const typeText = p.type ? p.type.getText(sf) : ''
    return { name, typeText }
  })
  return {
    range: {
      start: { line: start.line + 1, character: start.character + 1 },
      end: { line: end.line + 1, character: end.character + 1 },
    },
    params: structured,
  }
}

const ROLE_NAMES: ReadonlyArray<string> = ['context', 'action', 'sensor']

function isStepCall(node: ts.CallExpression): boolean {
  // Match `context(...)`, `action(...)`, or `sensor(...)` — the three role
  // call forms. False positives from shadowed locals are filtered out by the
  // same logic that protects these identifiers — only CallExpressions with
  // these identifiers qualify, regardless of import shape.
  return ts.isIdentifier(node.expression) && ROLE_NAMES.includes(node.expression.text)
}

function rangeOf(sf: ts.SourceFile, node: ts.Node): Range {
  const start = sf.getLineAndCharacterOfPosition(node.getStart(sf))
  const end = sf.getLineAndCharacterOfPosition(node.getEnd())
  return {
    start: { line: start.line + 1, character: start.character + 1 },
    end: { line: end.line + 1, character: end.character + 1 },
  }
}
