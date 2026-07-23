import {
  addStep,
  createRegistry,
  defineParameterType,
  parse,
  plan,
  type Registry,
} from '@varar/core'
import type { StepDefScanner } from './scanner.ts'
import type { Range, StepDef } from './step-defs.ts'

export type WorkspaceInput = {
  readonly stepFiles: ReadonlyArray<{ readonly path: string; readonly source: string }>
  readonly varFiles: ReadonlyArray<{ readonly path: string; readonly source: string }>
  // The step-def scanner. Always the tree-sitter scanner
  // (createTreeSitterScanner); callers build it at their async shell edge with
  // an environment-specific GrammarLoader and pass the resolved instance here.
  readonly scanner: StepDefScanner
}

export type MatchRef = {
  readonly varPath: string
  readonly range: Range
  readonly paramRanges: ReadonlyArray<Range>
  // The captured value for each parameter, sliced from the .md source at
  // index time. Same order as `paramRanges` and the cucumber expression's
  // parameter list. Used by the rename refactor to preserve values across
  // expressions whose parameter list survives the edit.
  readonly paramValues: ReadonlyArray<string>
  // Present only on header-binding matches: one range per header cell, located
  // in the table's header row. Kept separate from `paramRanges` because that
  // array must stay aligned 1:1 with the expression's parameter list (rename
  // relies on it). Editors paint these as parameters too.
  readonly headerCellRanges?: ReadonlyArray<Range>
  readonly stepDef: StepDef
}

export type DiagnosticRef = {
  readonly varPath: string
  readonly code: string
  readonly severity: 'error' | 'warning'
  readonly message: string
  readonly range: Range
}

export type WorkspaceIndex = {
  readonly stepDefs: ReadonlyArray<StepDef>
  readonly matches: ReadonlyArray<MatchRef>
  readonly diagnostics: ReadonlyArray<DiagnosticRef>
  // The fully-populated registry (step defs + custom parameter types) so
  // downstream tools — snippet generation, completion, etc. — can use the
  // same view the matcher used.
  readonly registry: Registry
}

const EMPTY_HANDLER = (): void => {}

export function buildWorkspaceIndex(input: WorkspaceInput): WorkspaceIndex {
  const scanner = input.scanner
  const stepDefs: StepDef[] = []
  let registry = createRegistry()

  // First pass: register every custom parameter type. We need them in place
  // before compiling any step expressions, otherwise a `step('I fly to {airport}')`
  // discovered in the same file would fail with UndefinedParameterTypeError.
  for (const file of input.stepFiles) {
    for (const pt of scanner.discoverParameterTypes(file.path, file.source)) {
      try {
        registry = defineParameterType(registry, {
          name: pt.name,
          regexp: pt.regexp,
        })
      } catch {
        // Duplicate parameter type or invalid regex; ignore at index time.
      }
    }
  }

  for (const file of input.stepFiles) {
    const defs = scanner.discoverStepDefs(file.path, file.source)
    for (const def of defs) {
      stepDefs.push(def)
      try {
        registry = addStep(registry, {
          expression: def.expression,
          expressionSourceFile: def.file,
          expressionSourceLine: def.expressionRange.start.line,
          kind: def.kind,
          handler: EMPTY_HANDLER,
        })
      } catch {
        // duplicate step definition or unknown parameter type — surface as a
        // diagnostic in a future iteration.
      }
    }
  }

  const matches: MatchRef[] = []
  const diagnostics: DiagnosticRef[] = []

  for (const file of input.varFiles) {
    const varDoc = parse(file.path, file.source)
    const result = plan(varDoc, registry)
    // Header-bound tables expand to one example per row, all sharing the same
    // binding paragraph. For highlighting we want the paragraph (with its
    // header-cell words as parameters) once — not the per-row table lines the
    // executor runs against. Dedupe by the paragraph's start position.
    const seenBindings = new Set<string>()
    for (const ex of result.examples) {
      if (ex.headerBinding) {
        const b = ex.headerBinding
        const key = `${b.matchSpan.startLine}:${b.matchSpan.startCol}`
        if (seenBindings.has(key)) continue
        seenBindings.add(key)
        const def = stepDefs.find(
          (d) => d.expression === b.stepDef.expression && d.file === b.stepDef.expressionSourceFile,
        )
        if (!def) continue
        matches.push({
          varPath: file.path,
          range: toRange(b.matchSpan),
          paramRanges: b.paramSpans.map(toRange),
          paramValues: b.paramSpans.map((s) => file.source.slice(s.startOffset, s.endOffset)),
          headerCellRanges: b.headerCellSpans.map(toRange),
          stepDef: def,
        })
        continue
      }
      for (const step of ex.steps) {
        const def = stepDefs.find(
          (d) =>
            d.expression === step.stepDef.expression &&
            d.file === step.stepDef.expressionSourceFile,
        )
        if (!def) continue
        matches.push({
          varPath: file.path,
          range: toRange(step.matchSpan),
          paramRanges: step.paramSpans.map(toRange),
          paramValues: step.paramSpans.map((s) => file.source.slice(s.startOffset, s.endOffset)),
          stepDef: def,
        })
      }
    }
    for (const d of result.diagnostics) {
      diagnostics.push({
        varPath: file.path,
        code: d.code,
        severity: d.severity,
        message: d.message,
        range: toRange(d.span),
      })
    }
  }

  return { stepDefs, matches, diagnostics, registry }
}

type SpanLike = {
  readonly startLine: number
  readonly startCol: number
  readonly endLine: number
  readonly endCol: number
}

function toRange(span: SpanLike): Range {
  return {
    start: { line: span.startLine, character: span.startCol },
    end: { line: span.endLine, character: span.endCol },
  }
}
