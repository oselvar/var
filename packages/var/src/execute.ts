import { CellMismatchError, compareRow, compareTable } from './cell-diff.js'
import { compareDocString, DocStringMismatchError } from './doc-string-diff.js'
import type { ExecutionPlan, PlannedStep } from './plan.js'
import type { Reporter, TestSink } from './ports.js'

export type ExecutePorts = {
  readonly sink: TestSink
  readonly reporter: Reporter
  // Per-stepfile context factory. The runtime calls this once per
  // (example, stepfile) pair on demand — successive steps from the same
  // stepfile share the same context object, steps in different stepfiles
  // each get their own. Defaults to `() => ({})` when omitted.
  readonly createContext?: (stepFile: string) => unknown | Promise<unknown>
}

export function executePlan(plan: ExecutionPlan, ports: ExecutePorts): void {
  for (const d of plan.diagnostics) ports.reporter.diagnostic(d)
  const createContext = ports.createContext ?? (() => ({}))
  const path = plan.varDoc.path
  for (const ex of plan.examples) {
    ports.sink.example(ex.name, async () => {
      // Cache one context per stepfile within this example. Lazy creation
      // keeps the cost zero for stepfiles whose steps don't run.
      const ctxByFile = new Map<string, unknown>()
      let lastReturn: unknown
      for (const step of ex.steps) {
        const file = step.stepDef.expressionSourceFile
        let ctx = ctxByFile.get(file)
        if (!ctxByFile.has(file)) {
          ctx = await createContext(file)
          ctxByFile.set(file, ctx)
        }
        // A trailing data table or doc string is passed as the LAST handler
        // argument, after whatever the cucumber expression captured. Tables
        // arrive as a plain `string[][]` (header row first); doc strings as
        // a plain string. Either form is small enough that callers can
        // shape it however they like.
        const extra: unknown[] = []
        if (step.dataTable) {
          extra.push([
            step.dataTable.header.cells,
            ...step.dataTable.rows.map((r) => r.cells),
          ] as ReadonlyArray<ReadonlyArray<string>>)
        } else if (step.docString) {
          extra.push(step.docString.content)
        }
        let returned: unknown
        try {
          returned = await step.stepDef.handler(ctx, ...step.args, ...extra)
        } catch (err) {
          throw augmentStack(err, step, path)
        }
        lastReturn = returned
        try {
          if (step.dataTable) {
            const bad = compareTable(returned, step.dataTable).filter((d) => !d.ok)
            if (bad.length > 0) throw new CellMismatchError(bad)
          } else if (step.docString) {
            const diff = compareDocString(returned, step.docString.content, step.docString.span)
            if (diff) throw new DocStringMismatchError(diff)
          }
        } catch (err) {
          throw augmentStack(err, step, path)
        }
      }
      if (ex.rowChecks && ex.rowChecks.length > 0) {
        const bad = compareRow(lastReturn, ex.rowChecks).filter((d) => !d.ok)
        if (bad.length > 0) {
          const lastStep = ex.steps[ex.steps.length - 1]
          // biome-ignore lint/style/noNonNullAssertion: a header-bound row example always has its row step
          throw augmentStack(new CellMismatchError(bad), lastStep!, path)
        }
      }
    })
  }
}

// Inject a synthetic V8 stack frame pointing at the matched step text's
// location in the source .var.md. Terminals (vitest, iTerm, VSCode) recognize
// the `file:line:col` pattern and make it cmd-clickable. The frame sits
// directly BELOW the handler's `.ts` frame — conceptually the markdown calls
// into the handler, so the handler is the callee (top) and the markdown is
// the caller (one level out). Vitest's reporter auto-renders the code snippet
// for the topmost frame, so the `.ts` source stays as the main error location
// and the .var.md becomes a clickable link directly under it.
function augmentStack(err: unknown, step: PlannedStep, varPath: string): unknown {
  if (!(err instanceof Error) || typeof err.stack !== 'string') return err
  const label = step.text.length > 60 ? `${step.text.slice(0, 60)}…` : step.text
  const frame = `    at ${label} (${varPath}:${step.matchSpan.startLine}:${step.matchSpan.startCol})`
  const lines = err.stack.split('\n')
  // Find the first existing stack frame (the handler's `.ts` line) and insert
  // immediately after it. If the error has no frames, fall back to position 1.
  let insertAt = 1
  for (let i = 1; i < lines.length; i++) {
    if (/^\s+at\s/.test(lines[i] ?? '')) {
      insertAt = i + 1
      break
    }
  }
  lines.splice(insertAt, 0, frame)
  err.stack = lines.join('\n')
  return err
}
