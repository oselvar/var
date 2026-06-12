import {
  addStep,
  createRegistry,
  defineParameterType,
  parse,
  plan,
  type Registry,
  type ScannerPlugin,
} from '@oselvar/bdd'
import { type Range, type StepDef, discoverParameterTypes, discoverStepDefs } from './step-defs.js'

export type WorkspaceInput = {
  readonly stepFiles: ReadonlyArray<{ readonly path: string; readonly source: string }>
  readonly bddFiles: ReadonlyArray<{ readonly path: string; readonly source: string }>
  // Optional: opt-in scanner extensions (e.g. Gherkin tables, Gherkin doc
  // strings) sourced from bdd.config.ts. Empty/omitted = pure markdown.
  readonly scannerPlugins?: ReadonlyArray<ScannerPlugin>
}

export type MatchRef = {
  readonly bddPath: string
  readonly range: Range
  readonly paramRanges: ReadonlyArray<Range>
  // The captured value for each parameter, sliced from the .bdd.md source at
  // index time. Same order as `paramRanges` and the cucumber expression's
  // parameter list. Used by the rename refactor to preserve values across
  // expressions whose parameter list survives the edit.
  readonly paramValues: ReadonlyArray<string>
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
  // The fully-populated registry (step defs + custom parameter types) so
  // downstream tools — snippet generation, completion, etc. — can use the
  // same view the matcher used.
  readonly registry: Registry
}

const EMPTY_HANDLER = (): void => {}

export function buildWorkspaceIndex(input: WorkspaceInput): WorkspaceIndex {
  const stepDefs: StepDef[] = []
  let registry = createRegistry()

  // First pass: register every custom parameter type. We need them in place
  // before compiling any step expressions, otherwise a `step('I fly to {airport}')`
  // discovered in the same file would fail with UndefinedParameterTypeError.
  for (const file of input.stepFiles) {
    for (const pt of discoverParameterTypes(file.path, file.source)) {
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
        // duplicate step definition or unknown parameter type — surface as a
        // diagnostic in a future iteration.
      }
    }
  }

  const matches: MatchRef[] = []
  const diagnostics: DiagnosticRef[] = []

  for (const file of input.bddFiles) {
    const bdd = parse(file.path, file.source, input.scannerPlugins ?? [])
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
          paramValues: step.paramSpans.map((s) => file.source.slice(s.startOffset, s.endOffset)),
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
