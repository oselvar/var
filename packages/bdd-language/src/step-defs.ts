import * as ts from 'typescript'

export type Position = { readonly line: number; readonly character: number }
export type Range = { readonly start: Position; readonly end: Position }

export type HandlerParam = {
  // The source text after the colon, e.g. `string` for `name: string` or
  // empty when no annotation is present (e.g. `ctx`).
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
  if (
    ts.isCallExpression(node) &&
    isDefineParameterTypeCall(node) &&
    node.arguments.length >= 1
  ) {
    const arg0 = node.arguments[0]
    if (arg0 && ts.isObjectLiteralExpression(arg0)) {
      const name = readStringProperty(arg0, 'name')
      const regexp = readRegexpProperty(arg0, 'regexp')
      if (name !== undefined && regexp !== undefined) {
        out.push({
          file,
          name,
          regexp,
          callRange: rangeOf(sf, node),
        })
      }
    }
  }
  ts.forEachChild(node, (child) => visitForParameterTypes(sf, child, out, file))
}

function isDefineParameterTypeCall(node: ts.CallExpression): boolean {
  // Match a bare `defineParameterType(...)` call. False positives on shadowed
  // locals are filtered out by the same logic that protects `step()` — only
  // CallExpressions with this identifier qualify, regardless of import shape.
  return ts.isIdentifier(node.expression) && node.expression.text === 'defineParameterType'
}

function readStringProperty(
  obj: ts.ObjectLiteralExpression,
  name: string,
): string | undefined {
  for (const prop of obj.properties) {
    if (!ts.isPropertyAssignment(prop)) continue
    if (!ts.isIdentifier(prop.name) || prop.name.text !== name) continue
    const init = prop.initializer
    if (ts.isStringLiteral(init) || ts.isNoSubstitutionTemplateLiteral(init)) return init.text
  }
  return undefined
}

function readRegexpProperty(
  obj: ts.ObjectLiteralExpression,
  name: string,
): string | undefined {
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
      const handler = node.arguments[1]
      const handlerParams =
        handler && (ts.isArrowFunction(handler) || ts.isFunctionExpression(handler))
          ? extractHandlerParams(sf, handler)
          : undefined
      out.push({
        file,
        expression: arg0.text,
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
  const first = params[0]!
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

function isStepCall(node: ts.CallExpression): boolean {
  // Match `step(...)` regardless of whether `step` came from an import or a
  // destructured `defineContext(...)` return. We accept any bare identifier
  // named `step`. False positives from shadowed locals are filtered out by
  // the test in Step 1 — function declarations, properties, and comments are
  // not CallExpressions.
  return ts.isIdentifier(node.expression) && node.expression.text === 'step'
}

function rangeOf(sf: ts.SourceFile, node: ts.Node): Range {
  const start = sf.getLineAndCharacterOfPosition(node.getStart(sf))
  const end = sf.getLineAndCharacterOfPosition(node.getEnd())
  return {
    start: { line: start.line + 1, character: start.character + 1 },
    end: { line: end.line + 1, character: end.character + 1 },
  }
}
