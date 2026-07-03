import { CellMismatchError, compareRow, compareTable, ReturnShapeError } from './cell-diff.js'
import { deepFreeze } from './deep-freeze.js'
import { compareDocString, DocStringMismatchError } from './doc-string-diff.js'
import { compareParams } from './param-diff.js'
import type { ExecutionPlan, PlannedStep } from './plan.js'
import type { Reporter, TestSink } from './ports.js'

export class UnexpectedPassError extends Error {
  constructor(message = 'expected the example to fail, but it passed') {
    super(message)
    this.name = 'UnexpectedPassError'
  }
}
export function isUnexpectedPassError(e: unknown): e is UnexpectedPassError {
  return e instanceof UnexpectedPassError
}

export type StepObservation = {
  readonly exampleName: string
  readonly exampleIndex: number // 0-based index within plan.examples
  readonly ordinal: number // 1-based index within the example
  readonly stepFile: string // step.stepDef.expressionSourceFile (raw)
  readonly outcome: 'pass' | 'fail'
  readonly error?: unknown // the augmented error on failure
}
export interface ExecutionObserver {
  step(o: StepObservation): void
}

export type ExecutePorts = {
  readonly sink: TestSink
  readonly reporter: Reporter
  // Per-stepfile context factory. The runtime calls this once per
  // (example, stepfile) pair on demand — successive steps from the same
  // stepfile share the same context object, steps in different stepfiles
  // each get their own. Defaults to `() => ({})` when omitted.
  readonly createContext?: (stepFile: string) => unknown | Promise<unknown>
  // Optional per-step observer for instrumentation (conformance trace mode).
  // Called once per executed step; steps after a failure are not observed.
  readonly observer?: ExecutionObserver
}

export type QueuedExample = { readonly name: string; readonly run: () => void | Promise<void> }

// Run a plan only to collect its examples into an ordered queue, leaving the
// caller to invoke (and time/observe) each `run()` itself. Wires the `sink` for
// you; forward `reporter` (and optionally `createContext`/`observer`) as needed.
export function collectExamples(
  plan: ExecutionPlan,
  ports: Omit<ExecutePorts, 'sink'>,
): QueuedExample[] {
  const queue: QueuedExample[] = []
  executePlan(plan, {
    ...ports,
    sink: { example: (name, run) => queue.push({ name, run }) },
  })
  return queue
}

export function executePlan(plan: ExecutionPlan, ports: ExecutePorts): void {
  for (const d of plan.diagnostics) ports.reporter.diagnostic(d)
  const createContext = ports.createContext ?? (() => ({}))
  const path = plan.varDoc.path
  plan.examples.forEach((ex, exampleIndex) => {
    ports.sink.example(
      ex.name,
      async () => {
        // Cache one state value per stepfile within this example. Lazy creation
        // keeps the cost zero for stepfiles whose steps don't run.
        const stateByFile = new Map<string, unknown>()
        let lastReturn: unknown
        let thrown: unknown
        for (let i = 0; i < ex.steps.length; i++) {
          const step = ex.steps[i] as PlannedStep
          const file = step.stepDef.expressionSourceFile
          let state = stateByFile.get(file)
          if (!stateByFile.has(file)) {
            state = deepFreeze(await createContext(file))
            stateByFile.set(file, state)
          }
          // A trailing data table or doc string is passed as the LAST handler
          // argument, after whatever the cucumber expression captured. Tables
          // arrive as a plain `string[][]` (header row first); doc strings as a
          // plain string.
          const extra: unknown[] = []
          if (step.dataTable) {
            extra.push([
              step.dataTable.header.cells,
              ...step.dataTable.rows.map((r) => r.cells),
            ] as ReadonlyArray<ReadonlyArray<string>>)
          } else if (step.docString) {
            extra.push(step.docString.content)
          }
          try {
            const returned = await step.stepDef.handler(state, ...step.args, ...extra)
            lastReturn = returned
            // Dispatch on the step's role. `context`/`action` merge a returned
            // partial state (or no-op when they return nothing); `sensor`
            // compares its return against the Markdown; an unknown kind is a
            // wiring bug.
            const kind = step.stepDef.kind
            if (kind === 'context' || kind === 'action') {
              // A context/action step EVOLVES state: returning a partial state
              // object shallow-merges onto the current state (re-frozen, then
              // threaded to later steps in this stepfile). Returning nothing is
              // a no-op. Any non-object return is a contract violation.
              if (returned !== undefined) {
                if (typeof returned !== 'object' || returned === null) {
                  throw new ReturnShapeError(
                    'a context/action step must return a partial state object or nothing',
                  )
                }
                state = deepFreeze({ ...(state as object), ...(returned as object) })
                stateByFile.set(file, state)
              }
            } else if (kind === 'sensor') {
              // Header-bound rows are compared after the loop via ex.rowChecks;
              // skip the tuple contract for them (they return a row object).
              if (!ex.rowChecks && returned !== undefined) {
                if (!Array.isArray(returned)) {
                  throw new ReturnShapeError(
                    `a sensor must return a tuple of its arguments after state, got ${typeof returned}`,
                  )
                }
                const expectedLen = step.args.length + extra.length
                if (returned.length !== expectedLen) {
                  throw new ReturnShapeError(
                    `sensor return must have ${expectedLen} element(s), got ${returned.length}`,
                  )
                }
                // Inline parameters: returned[0..args.length) vs captured args.
                const inlineReturned = returned.slice(0, step.args.length)
                const sourceTexts = step.paramSpans.map((s) =>
                  plan.varDoc.source.slice(s.startOffset, s.endOffset),
                )
                const paramDiffs = compareParams(
                  inlineReturned,
                  step.args,
                  step.paramSpans,
                  sourceTexts,
                ).filter((d) => !d.ok)
                if (paramDiffs.length > 0) throw new CellMismatchError(paramDiffs)
                // Trailing table / doc string: the extra, if any, is at
                // index step.args.length in the returned tuple.
                if (step.dataTable) {
                  const bad = compareTable(returned[step.args.length], step.dataTable).filter(
                    (d) => !d.ok,
                  )
                  if (bad.length > 0) throw new CellMismatchError(bad)
                } else if (step.docString) {
                  const diff = compareDocString(
                    returned[step.args.length],
                    step.docString.content,
                    step.docString.span,
                  )
                  if (diff) throw new DocStringMismatchError(diff)
                }
              }
            } else {
              throw new ReturnShapeError(`unknown step kind: ${String(kind)}`)
            }
          } catch (err) {
            const augmented = augmentStack(err, step, path)
            ports.observer?.step({
              exampleName: ex.name,
              exampleIndex,
              ordinal: i + 1,
              stepFile: file,
              outcome: 'fail',
              error: augmented,
            })
            thrown = augmented
            break
          }
          ports.observer?.step({
            exampleName: ex.name,
            exampleIndex,
            ordinal: i + 1,
            stepFile: file,
            outcome: 'pass',
          })
        }
        if (thrown === undefined && ex.rowChecks && ex.rowChecks.length > 0) {
          const bad = compareRow(lastReturn, ex.rowChecks).filter((d) => !d.ok)
          if (bad.length > 0) {
            const lastStep = ex.steps[ex.steps.length - 1] as PlannedStep
            const augmented = augmentStack(new CellMismatchError(bad), lastStep, path)
            ports.observer?.step({
              exampleName: ex.name,
              exampleIndex,
              ordinal: ex.steps.length,
              stepFile: lastStep.stepDef.expressionSourceFile,
              outcome: 'fail',
              error: augmented,
            })
            thrown = augmented
          }
        }
        if (ex.expectedOutcome === 'fail') {
          if (thrown === undefined) {
            const lastStep = ex.steps[ex.steps.length - 1]
            const e = new UnexpectedPassError()
            throw lastStep ? augmentStack(e, lastStep, path) : e
          }
          if (ex.expectedErrorMessage) {
            const msg = thrown instanceof Error ? thrown.message : String(thrown)
            if (!msg.includes(ex.expectedErrorMessage)) throw thrown
          }
          return
        }
        if (thrown !== undefined) throw thrown
      },
      { lines: [...new Set(ex.steps.map((s) => s.matchSpan.startLine))] },
    )
  })
}

// Inject a synthetic V8 stack frame pointing at the matched step text's
// location in the source .md. Terminals (vitest, iTerm, VSCode) recognize
// the `file:line:col` pattern and make it cmd-clickable. The frame sits
// directly BELOW the handler's `.ts` frame — conceptually the markdown calls
// into the handler, so the handler is the callee (top) and the markdown is
// the caller (one level out). Vitest's reporter auto-renders the code snippet
// for the topmost frame, so the `.ts` source stays as the main error location
// and the .md becomes a clickable link directly under it.
function augmentStack(err: unknown, step: PlannedStep, varPath: string): unknown {
  if (!(err instanceof Error) || typeof err.stack !== 'string') return err
  const label = step.text.length > 60 ? `${step.text.slice(0, 60)}…` : step.text
  // Editors resolve the failure's location from this frame (the VS Code vitest
  // extension underlines the word at line:col), so a mismatch anchors at its
  // own first failing span — the cell/fence body — not the step's match start.
  const anchor =
    (err instanceof CellMismatchError ? err.cells.find((c) => !c.ok)?.span : undefined) ??
    (err instanceof DocStringMismatchError ? err.diff.span : undefined) ??
    step.matchSpan
  const frame = `    at ${label} (${varPath}:${anchor.startLine}:${anchor.startCol})`
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
