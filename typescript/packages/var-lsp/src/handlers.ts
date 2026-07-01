import {
  diffExpressions,
  expressionSegments,
  inferStepRole,
  renderExpression,
  type StepKind,
} from '@oselvar/var-core'
import {
  createTypeScriptSnippetEmitter,
  generateSnippet,
  type MatchRef,
  type SnippetEmitter,
} from '@oselvar/var-language'
import type {
  HandlerSync,
  PlanParamFate,
  PlanRenameResult,
  Position,
  Range,
  RenderTextResult,
  StepAtMatch,
  StepAtResult,
} from './protocol.js'
import type { Store } from './store.js'
import { uriToPath } from './uri.js'

type HoverParams = { readonly uri: string; readonly position: Position }
type HoverResult = { readonly contents: string } | null

type DefinitionParams = HoverParams
type LocationLink = {
  readonly originSelectionRange: Range
  readonly targetUri: string
  readonly targetRange: Range
  readonly targetSelectionRange: Range
}
type DefinitionResult = ReadonlyArray<LocationLink>

type Diagnostic = {
  readonly code: string
  readonly severity: 'error' | 'warning'
  readonly message: string
  readonly range: { readonly start: Position; readonly end: Position }
}

type SnippetResult = { readonly fullCode: string; readonly expression: string }

// Ready-to-apply edit for the Rename refactor. The client just turns these
// into a WorkspaceEdit and calls applyEdit.
type RenameEdit = { readonly uri: string; readonly range: Range; readonly newText: string }

type RenameStepResult =
  | {
      readonly ok: true
      // The expression-literal edit covers ONLY the inside of the surrounding
      // quotes — i.e. `expressionInnerRange` excludes the quote characters,
      // so the client doesn't have to know which quote style the source used.
      readonly stepDef: {
        readonly uri: string
        readonly expressionInnerRange: Range
        readonly newExpression: string
      }
      readonly sites: ReadonlyArray<RenameEdit>
    }
  | { readonly ok: false; readonly error: string }

type RenameStepParams = HoverParams & { readonly newName: string }

type CompletionItem = {
  readonly label: string
  readonly insertText: string
  readonly filterText: string
  readonly range: Range
}

type CompletionParams = HoverParams & { readonly linePrefix: string }

type Handlers = {
  hover(params: HoverParams): HoverResult
  definition(params: DefinitionParams): DefinitionResult
  diagnosticsFor(uri: string): ReadonlyArray<Diagnostic>
  generateSnippet(params: {
    readonly text: string
    readonly uri?: string
    readonly position?: Position
  }): SnippetResult
  stepGlobs(): ReadonlyArray<string>
  stepAt(params: HoverParams): StepAtResult
  renameStep(params: RenameStepParams): RenameStepResult
  planRename(params: RenameStepParams): PlanRenameResult
  renderExpressionText(params: {
    readonly expression: string
    readonly values: ReadonlyArray<string>
  }): RenderTextResult
  completions(params: CompletionParams): ReadonlyArray<CompletionItem>
}

export function buildHandlers(store: Store): Handlers {
  return {
    hover({ uri, position }) {
      const m = findMatchAt(store, uri, position)
      if (!m) return null
      const contents = `Matched by \`step('${m.stepDef.expression}')\` at ${m.stepDef.file}:${m.stepDef.expressionRange.start.line}`
      return { contents }
    },
    definition({ uri, position }) {
      const m = findMatchAt(store, uri, position)
      if (!m) return []
      const targetRange = toLspRange(m.stepDef.expressionRange)
      return [
        {
          // originSelectionRange tells the editor which area to underline on
          // cmd-hover; without it, only the word under the cursor is shown.
          originSelectionRange: toLspRange(m.range),
          targetUri: `file://${m.stepDef.file}`,
          targetRange,
          targetSelectionRange: targetRange,
        },
      ]
    },
    diagnosticsFor(uri) {
      const path = uriToPath(uri)
      return store
        .index()
        .diagnostics.filter((d) => d.varPath === path)
        .map((d) => ({
          code: d.code,
          severity: d.severity,
          message: d.message,
          range: d.range,
        }))
    },
    generateSnippet({ text, uri, position }) {
      // Use the live index registry so custom parameter types declared in
      // *.steps.ts surface in the generated expression.
      // When both uri and position are supplied, infer the role from the
      // neighbouring matched steps in the same file. The lookup is file-scoped:
      // the workspace index does not expose example/heading boundaries, so steps
      // from other examples in the same .md are included. That is an
      // accepted approximation — inferStepRole inspects only presence/emptiness
      // and first action/sensor, and the snippet always offers the other roles
      // commented out, so a wrong guess is one keystroke to fix.
      const role =
        uri !== undefined && position !== undefined
          ? inferStepRole(neighbourRolesForSelection(store, uri, position))
          : undefined
      const template = store.snippetTemplate()
      const snippet = generateSnippet(text, store.index().registry, {
        ...(template !== undefined ? { template } : {}),
        ...(role !== undefined ? { role } : {}),
      })
      return { fullCode: snippet.fullCode, expression: snippet.expression }
    },
    stepGlobs() {
      return store.stepGlobs()
    },
    renameStep({ uri, position, newName }) {
      const prepared = prepareRename(store, uri, position, newName)
      if (!prepared.ok) return prepared
      const { stepAt, newExpression, diff } = prepared

      // Phase 3 supports only the literal-only path; adding/removing/typed-
      // changing a parameter is the Phase 4 territory.
      const offending = diff.paramFates.find((f) => f.kind !== 'kept')
      if (offending) {
        const verb = offending.kind === 'added' ? 'adding a parameter' : 'removing a parameter'
        return {
          ok: false,
          error: `Rename across ${verb} isn't supported yet — coming soon.`,
        }
      }

      // Build the cascade. The step-def edit uses the inner range (no quotes);
      // each matched site gets its substring rebuilt from the new expression
      // with the existing captured values spliced back in order.
      const sites: RenameEdit[] = []
      for (const m of stepAt.matches) {
        let rebuilt: string
        try {
          rebuilt = renderExpression(newExpression, m.paramValues, store.index().registry)
        } catch (e) {
          return {
            ok: false,
            error: `Internal: failed to rebuild a match site: ${(e as Error).message}`,
          }
        }
        sites.push({ uri: m.uri, range: m.range, newText: rebuilt })
      }

      return {
        ok: true,
        stepDef: {
          uri: stepAt.stepDefUri,
          expressionInnerRange: innerRange(stepAt.expressionRange),
          newExpression,
        },
        sites,
      }
    },
    stepAt({ uri, position }) {
      return resolveStepAt(store, uri, position)
    },
    planRename({ uri, position, newName }) {
      const prepared = prepareRename(store, uri, position, newName)
      if (!prepared.ok) return prepared
      const { stepAt, newExpression, diff } = prepared

      // Enrich each fate with the OLD and NEW parameter names so the client
      // can produce a clearer prompt (e.g. "{string} → {airport}").
      const oldParams = diff.oldSegments.filter((s) => s.kind === 'param')
      const newParams = diff.newSegments.filter((s) => s.kind === 'param')
      const paramFates: PlanParamFate[] = diff.paramFates.map((f) => {
        if (f.kind === 'kept') {
          return {
            kind: 'kept',
            oldIndex: f.oldIndex,
            newIndex: f.newIndex,
            oldName: (oldParams[f.oldIndex] as { name: string }).name,
            newName: (newParams[f.newIndex] as { name: string }).name,
            nameUnchanged: f.nameUnchanged,
          }
        }
        if (f.kind === 'added') {
          return { kind: 'added', newIndex: f.newIndex, name: f.name }
        }
        return {
          kind: 'removed',
          oldIndex: f.oldIndex,
          name: (oldParams[f.oldIndex] as { name: string }).name,
        }
      })

      // Phase 5: also sync the TS handler signature when we have its source.
      const stepDefRecord = store
        .index()
        .stepDefs.find(
          (d) => d.expression === stepAt.expression && `file://${d.file}` === stepAt.stepDefUri,
        )
      const handlerSync = stepDefRecord?.handlerParams
        ? buildHandlerSync({
            stepDefUri: stepAt.stepDefUri,
            old: stepDefRecord.handlerParams,
            paramFates: diff.paramFates,
            newExpressionParams: diff.newSegments
              .filter((s) => s.kind === 'param')
              .map((s) => (s as { name: string }).name),
            registry: store.index().registry,
          })
        : undefined

      return {
        ok: true,
        newExpression,
        paramFates,
        stepDef: {
          uri: stepAt.stepDefUri,
          expressionInnerRange: innerRange(stepAt.expressionRange),
        },
        matches: stepAt.matches.map((m) => ({
          uri: m.uri,
          range: m.range,
          paramValues: m.paramValues,
        })),
        handlerSync,
      }
    },
    renderExpressionText({ expression, values }) {
      try {
        const text = renderExpression(expression, values, store.index().registry)
        return { ok: true, text }
      } catch (e) {
        return { ok: false, error: (e as Error).message }
      }
    },
    completions({ uri, position, linePrefix }) {
      // Only offer completions in var spec docs (those matched by the `vars`
      // globs). .steps.ts gets its own TS completions from the TypeScript
      // service, and ordinary markdown is left alone.
      if (!store.isVarDoc(uriToPath(uri))) return []

      // Compute the replace range: from the first non-whitespace character of
      // the current line to the cursor. No Given/When/Then heuristics — if
      // the user wants narration kept around the inserted snippet, they
      // either insert it after typing or edit the result.
      const leadingWs = linePrefix.length - linePrefix.trimStart().length
      const range: Range = {
        start: { line: position.line, character: leadingWs },
        end: position,
      }

      const registry = store.index().registry
      const items: CompletionItem[] = []
      for (const step of registry.steps) {
        items.push({
          label: step.expression,
          insertText: buildSnippet(step.expression, registry),
          // filterText is what VSCode matches the user's typed prefix against.
          // We use the literal portions joined so typing words from the
          // sentence matches the suggestion.
          filterText: expressionLiteralText(step.expression, registry),
          range,
        })
      }
      return items
    },
  }
}

function findMatchAt(store: Store, uri: string, position: Position): MatchRef | undefined {
  const path = uriToPath(uri)
  // LSP positions are 0-based; the workspace index stores 1-based line/col.
  const pos: Position = { line: position.line + 1, character: position.character + 1 }
  return store.index().matches.find((m) => {
    if (m.varPath !== path) return false
    return contains(m.range, pos)
  })
}

function contains(range: { start: Position; end: Position }, position: Position): boolean {
  if (position.line < range.start.line || position.line > range.end.line) return false
  if (position.line === range.start.line && position.character < range.start.character) return false
  if (position.line === range.end.line && position.character > range.end.character) return false
  return true
}

// Returns the StepKind of matched steps strictly before and strictly after
// `position` (0-based LSP) in the given .md file.
function neighbourRolesForSelection(
  store: Store,
  uri: string,
  position: Position,
): { readonly before: ReadonlyArray<StepKind>; readonly after: ReadonlyArray<StepKind> } {
  const path = uriToPath(uri)
  // Convert 0-based LSP position to 1-based workspace-index position.
  const pos: Position = { line: position.line + 1, character: position.character + 1 }
  const fileMatches = store
    .index()
    .matches.filter((m) => m.varPath === path)
    .slice()
    .sort((a, b) =>
      a.range.start.line !== b.range.start.line
        ? a.range.start.line - b.range.start.line
        : a.range.start.character - b.range.start.character,
    )
  const before: StepKind[] = []
  const after: StepKind[] = []
  for (const m of fileMatches) {
    if (posLt(m.range.end, pos)) {
      before.push(m.stepDef.kind)
    } else if (posLt(pos, m.range.start)) {
      after.push(m.stepDef.kind)
    }
    // A match that contains pos is neither (shouldn't happen for an unmatched selection).
  }
  return { before, after }
}

// Returns true if position `a` is strictly before position `b`.
function posLt(a: Position, b: Position): boolean {
  if (a.line !== b.line) return a.line < b.line
  return a.character < b.character
}

function resolveStepAt(store: Store, uri: string, position: Position): StepAtResult {
  const path = uriToPath(uri)
  const pos: Position = { line: position.line + 1, character: position.character + 1 }
  const index = store.index()
  let stepDef = index.stepDefs.find((d) => d.file === path && contains(d.expressionRange, pos))
  if (!stepDef) {
    const m = index.matches.find((m) => m.varPath === path && contains(m.range, pos))
    if (m) stepDef = m.stepDef
  }
  if (!stepDef) return null

  const matches: StepAtMatch[] = index.matches
    .filter((m) => m.stepDef.expression === stepDef.expression && m.stepDef.file === stepDef.file)
    .map((m) => ({
      uri: `file://${m.varPath}`,
      range: toLspRange(m.range),
      paramRanges: m.paramRanges.map(toLspRange),
      paramValues: m.paramValues,
    }))

  return {
    expression: stepDef.expression,
    stepDefUri: `file://${stepDef.file}`,
    expressionRange: toLspRange(stepDef.expressionRange),
    matches,
  }
}

type PreparedRename =
  | {
      readonly ok: true
      readonly stepAt: NonNullable<StepAtResult>
      readonly newExpression: string
      readonly diff: ReturnType<typeof diffExpressions>
    }
  | { readonly ok: false; readonly error: string }

// Shared front-half of renameStep/planRename: locate the step under the cursor,
// derive the new cucumber expression (from the edited sentence in a .md, or
// verbatim in a .steps.ts where custom param types like {airport} apply),
// reject a no-op rename, then diff old vs new.
function prepareRename(
  store: Store,
  uri: string,
  position: Position,
  newName: string,
): PreparedRename {
  const stepAt = resolveStepAt(store, uri, position)
  if (!stepAt) return { ok: false, error: 'No step under cursor.' }

  const isVarDoc = store.isVarDoc(uriToPath(uri))
  let newExpression: string
  if (isVarDoc) {
    try {
      const template = store.snippetTemplate()
      newExpression = generateSnippet(newName, store.index().registry, {
        ...(template !== undefined ? { template } : {}),
      }).expression
    } catch (e) {
      return {
        ok: false,
        error: `Cannot derive a cucumber expression from "${newName}": ${(e as Error).message}`,
      }
    }
  } else {
    newExpression = newName
  }

  if (newExpression === stepAt.expression) {
    return { ok: false, error: 'Nothing to rename — the expression is unchanged.' }
  }

  let diff: ReturnType<typeof diffExpressions>
  try {
    diff = diffExpressions(stepAt.expression, newExpression, store.index().registry)
  } catch (e) {
    return { ok: false, error: `Invalid cucumber expression: ${(e as Error).message}` }
  }
  return { ok: true, stepAt, newExpression, diff }
}

// Shrink an expression-literal range to exclude the surrounding quotes. The
// walker emits the literal's full extent including quotes; the inner range is
// (outer.start + 1) .. (outer.end - 1) — string literals don't span lines in
// our discovery, so this is a single-line trim.
function innerRange(outer: Range): Range {
  return {
    start: { line: outer.start.line, character: outer.start.character + 1 },
    end: { line: outer.end.line, character: outer.end.character - 1 },
  }
}

// Friendlier variable names for the built-in types — same map snippet.ts uses
// so a fresh snippet and a sync produce the same names.
const FRIENDLY_NAMES: Record<string, string> = {
  int: 'count',
  float: 'price',
  string: 'user',
}

// Default placeholder values for the built-in parameter types. Strings get
// surrounding quotes so the user can tab through to a quoted value.
const BUILTIN_PLACEHOLDERS: Record<string, string> = {
  int: '0',
  float: '0.0',
  string: '"value"',
}

function buildSnippet(
  expression: string,
  registry: Parameters<typeof expressionSegments>[1],
): string {
  const segs = expressionSegments(expression, registry)
  let stop = 1
  let out = ''
  for (const s of segs) {
    if (s.kind === 'param') {
      const placeholder = BUILTIN_PLACEHOLDERS[s.name] ?? s.name
      out += `\${${stop}:${placeholder}}`
      stop++
    } else {
      out += s.text
    }
  }
  return out
}

function expressionLiteralText(
  expression: string,
  registry: Parameters<typeof expressionSegments>[1],
): string {
  return expressionSegments(expression, registry)
    .map((s) => (s.kind === 'param' ? '' : s.text))
    .join(' ')
    .trim()
}

function buildHandlerSync(input: {
  stepDefUri: string
  old: {
    range: { start: Position; end: Position }
    params: ReadonlyArray<{ name: string; typeText: string }>
  }
  paramFates: ReadonlyArray<
    | { kind: 'kept'; oldIndex: number; newIndex: number; nameUnchanged: boolean }
    | { kind: 'added'; newIndex: number; name: string }
    | { kind: 'removed'; oldIndex: number }
  >
  newExpressionParams: ReadonlyArray<string>
  registry: {
    parameterTypes: { parameterTypes: Iterable<{ name?: string | undefined; type: unknown }> }
  }
  snippetEmitter?: SnippetEmitter
}): HandlerSync {
  const { old, paramFates, newExpressionParams, registry } = input
  const emitter = input.snippetEmitter ?? createTypeScriptSnippetEmitter()
  // Index parameter types by name once so per-fate lookup is O(1).
  const paramTypeByName = new Map<string, { type: unknown }>()
  for (const pt of registry.parameterTypes.parameterTypes) {
    if (pt.name) paramTypeByName.set(pt.name, pt)
  }
  // Old user-supplied args (skip the first, conventionally `ctx`).
  const ctxParam = old.params[0]
  const oldUserParams = old.params.slice(1)

  // Walk fates in newIndex order so we emit args in the order the new
  // expression expects them.
  const ordered = paramFates
    .filter(
      (f): f is Exclude<(typeof paramFates)[number], { kind: 'removed' }> => f.kind !== 'removed',
    )
    .sort((a, b) => a.newIndex - b.newIndex)

  const usedNames = new Map<string, number>()
  const newUserParams: { name: string; typeText: string }[] = []
  for (const fate of ordered) {
    const newPtName = newExpressionParams[fate.newIndex] ?? ''
    if (fate.kind === 'kept' && fate.nameUnchanged) {
      const reuse = oldUserParams[fate.oldIndex]
      if (reuse) {
        newUserParams.push(reuse)
        bumpUsed(usedNames, reuse.name)
        continue
      }
    }
    const baseName = freshName(newPtName, usedNames)
    const paramType = paramTypeByName.get(newPtName)
    const typeText = paramType ? emitter.typeNameFor(paramType) : 'string'
    newUserParams.push({ name: baseName, typeText })
  }

  const ctxText = ctxParam ? renderHandlerParam(ctxParam) : 'state'
  const userText = newUserParams.map(renderHandlerParam).join(', ')
  const newText = userText.length > 0 ? `${ctxText}, ${userText}` : ctxText

  return {
    uri: input.stepDefUri,
    // Convert the StepDef's 1-based range to LSP's 0-based.
    range: {
      start: { line: old.range.start.line - 1, character: old.range.start.character - 1 },
      end: { line: old.range.end.line - 1, character: old.range.end.character - 1 },
    },
    newText,
  }
}

function renderHandlerParam(p: { name: string; typeText: string }): string {
  return p.typeText ? `${p.name}: ${p.typeText}` : p.name
}

function freshName(ptName: string, used: Map<string, number>): string {
  const baseName = FRIENDLY_NAMES[ptName] ?? (ptName || 'arg')
  const next = (used.get(baseName) ?? 0) + 1
  used.set(baseName, next)
  return next === 1 ? baseName : `${baseName}${next}`
}

function bumpUsed(used: Map<string, number>, name: string): void {
  used.set(name, (used.get(name) ?? 0) + 1)
}

function toLspRange(range: { start: Position; end: Position }): Range {
  return {
    start: { line: range.start.line - 1, character: range.start.character - 1 },
    end: { line: range.end.line - 1, character: range.end.character - 1 },
  }
}
