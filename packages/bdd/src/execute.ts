import type { ExecutionPlan } from './plan.js'
import type { Reporter, TestSink } from './ports.js'

export type ExecutePorts = {
  readonly sink: TestSink
  readonly reporter: Reporter
}

export function executePlan(plan: ExecutionPlan, ports: ExecutePorts): void {
  for (const d of plan.diagnostics) ports.reporter.diagnostic(d)
  for (const ex of plan.examples) {
    ports.sink.example(ex.name, async () => {
      const ctx: unknown = {}
      for (const step of ex.steps) {
        await step.stepDef.handler(ctx, ...step.args)
      }
    })
  }
}
