import { type CucumberExpression, type Node, NodeType } from '@cucumber/cucumber-expressions'
import type { Fence, Table, VarDoc } from './ast.ts'
import { isCellMismatchError, ReturnShapeError } from './cell-diff.ts'
import type { DiagnosticCode, Severity } from './diagnostics.ts'
import { collectExamples, isUnexpectedPassError, type StepObservation } from './execute.ts'
import { failureAnchor } from './failure-anchor.ts'
import { plan as buildPlan, type ExecutionPlan } from './plan.ts'
import type { Registry } from './registry.ts'
import type { Span } from './span.ts'

// ---- Artifact types (the serialized contract) -----------------------------

export type VarDocArtifact = {
  readonly path: string
  readonly examples: VarDoc['examples']
  readonly orphanAttachments: ReadonlyArray<Table | Fence>
}

export type RegistryArtifact = {
  readonly steps: ReadonlyArray<{
    readonly expression: string
    readonly parameterTypeNames: ReadonlyArray<string>
  }>
  // Custom parameter types (name + source regexp). Empty until a bundle uses
  // defineParameterType — see the plan's deferred list.
  readonly parameterTypes: ReadonlyArray<{ readonly name: string; readonly regexp: string }>
}

export type PlanArtifact = {
  readonly examples: ReadonlyArray<{
    readonly name: string
    readonly scopeStack: ReadonlyArray<string>
    readonly span: Span
    readonly expectedOutcome: 'pass' | 'fail'
    readonly expectedErrorMessage?: string
    readonly steps: ReadonlyArray<{
      readonly text: string
      readonly matchSpan: Span
      readonly paramSpans: ReadonlyArray<Span>
      readonly matchedExpression: string
      readonly args: ReadonlyArray<{
        readonly value: string
        readonly parameterType: string | null
      }>
      readonly dataTable?: Table
      readonly docString?: {
        readonly content: string
        readonly contentType: string
        readonly span: Span
      }
    }>
  }>
  readonly diagnostics: ReadonlyArray<{
    readonly code: DiagnosticCode
    readonly severity: Severity
    readonly span: Span
  }>
}

// `message` is present on every core-generated kind and absent on `thrown`; see
// toFailureArtifact for why.
export type FailureArtifact =
  | {
      readonly kind: 'cell-mismatch'
      readonly line: number
      readonly anchor: Span
      readonly message: string
      readonly cells: ReadonlyArray<{
        readonly column: string
        readonly expected: string
        readonly actual: string
        readonly span: Span
      }>
    }
  | {
      readonly kind: 'return-shape'
      readonly line: number
      readonly anchor: Span
      readonly message: string
    }
  | { readonly kind: 'thrown'; readonly line: number; readonly anchor: Span }
  | {
      readonly kind: 'unexpected-pass'
      readonly line: number
      readonly anchor: Span
      readonly message: string
    }

export type StepTrace = {
  readonly exampleName: string
  readonly ordinal: number
  readonly stepText: string
  readonly matchedExpression: string
  readonly contextKey: { readonly exampleName: string; readonly stepFile: string }
  readonly outcome: 'pass' | 'fail' | 'skipped'
  readonly failure?: FailureArtifact
}

export type TraceArtifact = {
  readonly examples: ReadonlyArray<{
    readonly name: string
    readonly outcome: 'pass' | 'fail'
    readonly steps: ReadonlyArray<StepTrace>
  }>
}

export type BundleArtifacts = {
  readonly varDoc: VarDocArtifact
  readonly registry: RegistryArtifact
  readonly plan: PlanArtifact
  readonly trace: TraceArtifact
}

// ---- Canonical serialization ----------------------------------------------

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys)
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = sortKeys((value as Record<string, unknown>)[key])
    }
    return out
  }
  return value
}

// Deterministic JSON: recursively key-sorted, 2-space indent, LF endings,
// trailing newline. The wire format every implementation must reproduce.
export function canonicalStringify(value: unknown): string {
  return `${JSON.stringify(sortKeys(value), null, 2)}\n`
}

// `path/to/foo.steps.ts` -> `foo.steps` ; `s.ts` -> `s`. Normalizes step-def
// file references so TS and Python fixtures serialize identically. Internal
// (not exported) — used only within this module.
function fileStem(path: string): string {
  const base = path.split(/[\\/]/).pop() ?? path
  return base.replace(/\.[^.]+$/, '')
}

// Parameter-type names in source order, read from the compiled expression's
// AST (authoritative). A naive `{...}` regex miscounts on escaped braces
// (`\{`/`\}`), which are literal text, not parameters. Cucumber rejects
// parameters inside optionals/alternation, so they only appear at the top
// level, but we recurse defensively. Internal — used only within this module.
function parameterTypeNames(compiled: CucumberExpression): ReadonlyArray<string> {
  const names: string[] = []
  const visit = (node: Node): void => {
    if (node.type === NodeType.parameter) {
      names.push(node.text())
      return
    }
    for (const child of node.nodes ?? []) visit(child)
  }
  visit(compiled.ast)
  return names
}

export function toVarDocArtifact(doc: VarDoc): VarDocArtifact {
  return { path: doc.path, examples: doc.examples, orphanAttachments: doc.orphanAttachments }
}

export function toRegistryArtifact(
  registry: Registry,
  parameterTypes: ReadonlyArray<{ name: string; regexp: string }> = [],
): RegistryArtifact {
  return {
    steps: registry.steps.map((s) => ({
      expression: s.expression,
      parameterTypeNames: parameterTypeNames(s.compiled),
    })),
    parameterTypes: parameterTypes.map((p) => ({ name: p.name, regexp: p.regexp })),
  }
}

export function toPlanArtifact(plan: ExecutionPlan): PlanArtifact {
  return {
    examples: plan.examples.map((ex) => ({
      name: ex.name,
      scopeStack: ex.scopeStack,
      span: ex.span,
      expectedOutcome: ex.expectedOutcome ?? 'pass',
      ...(ex.expectedErrorMessage ? { expectedErrorMessage: ex.expectedErrorMessage } : {}),
      steps: ex.steps.map((step) => {
        const stepNames = parameterTypeNames(step.stepDef.compiled)
        return {
          text: step.text,
          matchSpan: step.matchSpan,
          paramSpans: step.paramSpans,
          matchedExpression: step.stepDef.expression,
          args: step.paramSpans.map((span, i) => ({
            value: plan.varDoc.source.slice(span.startOffset, span.endOffset),
            parameterType: stepNames[i] ?? null,
          })),
          ...(step.dataTable ? { dataTable: step.dataTable } : {}),
          ...(step.docString ? { docString: step.docString } : {}),
        }
      }),
    })),
    diagnostics: plan.diagnostics.map((d) => ({
      code: d.code,
      severity: d.severity,
      span: d.span,
    })),
  }
}

// `line` is the failing step's own 1-based line in the `.md`
// (`matchSpan.startLine`) and `anchor` is where the failure points — the
// failureAnchor rule (first failing cell span / doc string body / the step's
// match span). Both are deterministic, language-agnostic source positions, not
// values scraped from a JS stack trace, so every port reproduces them; pinning
// `anchor` in the goldens is what keeps each port's editor-facing failure
// location (stack augmentation) from drifting.
export function toFailureArtifact(error: unknown, matchSpan: Span): FailureArtifact {
  const line = matchSpan.startLine
  const anchor = failureAnchor(error, matchSpan)
  // `message` is projected for the kinds the CORE generates, so the corpus pins
  // their wording across ports — an `error` fence matches by substring, so a port
  // that words or quotes a message differently fails a spec its siblings pass.
  // `thrown` is deliberately excluded: those messages come from user handlers and
  // from language runtimes, which differ legitimately (dividing by zero reads
  // "division by zero" in Python, "/ by zero" in Java, "runtime error: integer
  // divide by zero" in Go).
  if (isCellMismatchError(error)) {
    return {
      kind: 'cell-mismatch',
      line,
      anchor,
      message: error.message,
      cells: error.cells
        .filter((c) => !c.ok)
        .map((c) => ({ column: c.column, expected: c.expected, actual: c.actual, span: c.span })),
    }
  }
  if (error instanceof ReturnShapeError)
    return { kind: 'return-shape', line, anchor, message: error.message }
  if (isUnexpectedPassError(error))
    return { kind: 'unexpected-pass', line, anchor, message: error.message }
  return { kind: 'thrown', line, anchor }
}

export async function runConformance(
  varDoc: VarDoc,
  registry: Registry,
  createContext: (stepFile: string) => unknown | Promise<unknown>,
  parameterTypes: ReadonlyArray<{ name: string; regexp: string }> = [],
): Promise<BundleArtifacts> {
  const execution = buildPlan(varDoc, registry)

  const observed = new Map<number, StepObservation[]>()
  const queue = collectExamples(execution, {
    reporter: { diagnostic: () => {} }, // diagnostics are captured in the plan artifact
    createContext,
    observer: {
      step: (o) => {
        const list = observed.get(o.exampleIndex) ?? []
        list.push(o)
        observed.set(o.exampleIndex, list)
      },
    },
  })

  const traceExamples = []
  for (let k = 0; k < queue.length; k++) {
    const { name, run } = queue[k] as { name: string; run: () => void | Promise<void> }
    let outcome: 'pass' | 'fail' = 'pass'
    try {
      await run()
    } catch {
      outcome = 'fail'
    }
    const planned = execution.examples[k]
    const obs = observed.get(k) ?? []
    const steps: StepTrace[] = (planned?.steps ?? []).map((step, i) => {
      const matches = obs.filter((x) => x.ordinal === i + 1)
      const o = matches.find((m) => m.outcome === 'fail') ?? matches[matches.length - 1]
      const stepOutcome = o ? o.outcome : 'skipped'
      return {
        exampleName: name,
        ordinal: i + 1,
        stepText: step.text,
        matchedExpression: step.stepDef.expression,
        contextKey: { exampleName: name, stepFile: fileStem(step.stepDef.expressionSourceFile) },
        outcome: stepOutcome,
        ...(stepOutcome === 'fail' ? { failure: toFailureArtifact(o?.error, step.matchSpan) } : {}),
      }
    })
    traceExamples.push({ name, outcome, steps })
  }

  return {
    varDoc: toVarDocArtifact(varDoc),
    registry: toRegistryArtifact(registry, parameterTypes),
    plan: toPlanArtifact(execution),
    trace: { examples: traceExamples },
  }
}
