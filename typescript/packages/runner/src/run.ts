import {
  collectExamples,
  type Diagnostic,
  type ExecutionPlan,
  type PlannedExample,
  parse,
  plan,
  type QueuedExample,
  type Registry,
  type Reporter,
} from '@varar/core'

export function examplesWithRuns(
  executionPlan: ExecutionPlan,
  createContext: (stepFile: string) => unknown | Promise<unknown>,
  reporter: Reporter,
): ReadonlyArray<{ readonly example: PlannedExample; readonly run: () => void | Promise<void> }> {
  const queued = collectExamples(executionPlan, { reporter, createContext })
  return executionPlan.examples.map((example, i) => ({
    example,
    run: (queued[i] as QueuedExample).run,
  }))
}

export function planSpec(path: string, source: string, registry: Registry): ExecutionPlan {
  return plan(parse(path, source), registry)
}

export class RecordingReporter implements Reporter {
  readonly diagnostics: Diagnostic[] = []
  diagnostic(d: Diagnostic): void {
    this.diagnostics.push(d)
  }
}
