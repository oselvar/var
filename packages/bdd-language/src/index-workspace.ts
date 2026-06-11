import { addStep, createRegistry, parse, plan } from '@oselvar/bdd'
import { type Range, type StepDef, discoverStepDefs } from './step-defs.js'

export type WorkspaceInput = {
  readonly stepFiles: ReadonlyArray<{ readonly path: string; readonly source: string }>
  readonly bddFiles: ReadonlyArray<{ readonly path: string; readonly source: string }>
}

export type MatchRef = {
  readonly bddPath: string
  readonly range: Range
  readonly paramRanges: ReadonlyArray<Range>
  readonly stepDef: StepDef
}

export type DiagnosticRef = {
  readonly bddPath: string
  readonly code: string
  readonly severity: 'error' | 'warning'
  readonly message: string
  readonly range: Range
}

export type WorkspaceIndex = {
  readonly stepDefs: ReadonlyArray<StepDef>
  readonly matches: ReadonlyArray<MatchRef>
  readonly diagnostics: ReadonlyArray<DiagnosticRef>
}

const EMPTY_HANDLER = (): void => {}

export function buildWorkspaceIndex(input: WorkspaceInput): WorkspaceIndex {
  const stepDefs: StepDef[] = []
  let registry = createRegistry()
  for (const file of input.stepFiles) {
    const defs = discoverStepDefs(file.path, file.source)
    for (const def of defs) {
      stepDefs.push(def)
      try {
        registry = addStep(registry, {
          expression: def.expression,
          expressionSourceFile: def.file,
          expressionSourceLine: def.expressionRange.start.line,
          handler: EMPTY_HANDLER,
        })
      } catch {
        // duplicate step definition — surface as a diagnostic in a future iteration.
      }
    }
  }

  const matches: MatchRef[] = []
  const diagnostics: DiagnosticRef[] = []

  for (const file of input.bddFiles) {
    const bdd = parse(file.path, file.source)
    const result = plan(bdd, registry)
    for (const ex of result.examples) {
      for (const step of ex.steps) {
        const def = stepDefs.find(
          (d) =>
            d.expression === step.stepDef.expression &&
            d.file === step.stepDef.expressionSourceFile,
        )
        if (!def) continue
        matches.push({
          bddPath: file.path,
          range: toRange(step.matchSpan),
          paramRanges: step.paramSpans.map(toRange),
          stepDef: def,
        })
      }
    }
    for (const d of result.diagnostics) {
      diagnostics.push({
        bddPath: file.path,
        code: d.code,
        severity: d.severity,
        message: d.message,
        range: toRange(d.span),
      })
    }
  }

  return { stepDefs, matches, diagnostics }
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
