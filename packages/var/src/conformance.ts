import type { Fence, Table, VarDoc } from './ast.js'
import { isCellMismatchError, ReturnShapeError } from './cell-diff.js'
import type { Diagnostic } from './diagnostics.js'
import { isDocStringMismatchError } from './doc-string-diff.js'
import { isUnexpectedPassError } from './execute.js'
import type { ExecutionPlan } from './plan.js'
import type { Registry } from './registry.js'
import type { Span } from './span.js'

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
  readonly diagnostics: ReadonlyArray<Diagnostic>
}

export type FailureArtifact =
  | {
      readonly kind: 'cell-mismatch'
      readonly line: number
      readonly cells: ReadonlyArray<{
        readonly column: string
        readonly expected: string
        readonly actual: string
        readonly span: Span
      }>
    }
  | {
      readonly kind: 'doc-string-mismatch'
      readonly line: number
      readonly diff: { readonly expected: string; readonly actual: string; readonly span: Span }
    }
  | { readonly kind: 'return-shape'; readonly line: number }
  | { readonly kind: 'thrown'; readonly line: number }
  | { readonly kind: 'unexpected-pass'; readonly line: number }

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

// `I have {int} cukes` -> ['int']. Internal — used only within this module.
function parameterTypeNames(expression: string): ReadonlyArray<string> {
  return [...expression.matchAll(/\{([^}]*)\}/g)].map((m) => m[1] ?? '')
}

// Recover the 1-based failing line from the `<specPath>:line:col` frame that
// executePlan injects (augmentStack). Falls back to the step's own line.
function failingLine(error: unknown, specPath: string, fallbackLine: number): number {
  const stack = error instanceof Error && typeof error.stack === 'string' ? error.stack : ''
  const escaped = specPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const m = new RegExp(`${escaped}:(\\d+):\\d+`).exec(stack)
  return m ? Number(m[1]) : fallbackLine
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
      parameterTypeNames: parameterTypeNames(s.expression),
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
      steps: ex.steps.map((step) => {
        const stepNames = parameterTypeNames(step.stepDef.expression)
        return {
          text: step.text,
          matchSpan: step.matchSpan,
          paramSpans: step.paramSpans,
          matchedExpression: step.stepDef.expression,
          args: step.args.map((a, i) => ({
            value: String(a),
            parameterType: stepNames[i] ?? null,
          })),
          ...(step.dataTable ? { dataTable: step.dataTable } : {}),
          ...(step.docString ? { docString: step.docString } : {}),
        }
      }),
    })),
    diagnostics: plan.diagnostics,
  }
}

export function toFailureArtifact(
  error: unknown,
  specPath: string,
  fallbackLine: number,
): FailureArtifact {
  const line = failingLine(error, specPath, fallbackLine)
  if (isCellMismatchError(error)) {
    return {
      kind: 'cell-mismatch',
      line,
      cells: error.cells
        .filter((c) => !c.ok)
        .map((c) => ({ column: c.column, expected: c.expected, actual: c.actual, span: c.span })),
    }
  }
  if (isDocStringMismatchError(error)) {
    return {
      kind: 'doc-string-mismatch',
      line,
      diff: { expected: error.diff.expected, actual: error.diff.actual, span: error.diff.span },
    }
  }
  if (error instanceof ReturnShapeError) return { kind: 'return-shape', line }
  if (isUnexpectedPassError(error)) return { kind: 'unexpected-pass', line }
  return { kind: 'thrown', line }
}
