import {
  type CellDiff,
  detectDrift,
  driftDiagnostics,
  isCellMismatchError,
  type Reporter,
  type SpecBaseline,
  toFailure,
} from '@varar/core'
import { examplesWithRuns, planSpec } from '@varar/runner'
import { buildRegistry, contextFactory } from '@varar/varar/registry'
import { test } from 'vitest'

export type CollectPorts = {
  // Defaults to registering one failing vitest test per diagnostic. The
  // registration lives HERE (not in the generated module) so editors doing
  // static AST test discovery on the transformed spec never see a phantom
  // `test(...)` callsite — only the real per-example ones.
  readonly reporter?: Reporter
  // The number of examples the build-time static plan produced. When the
  // runtime plan disagrees (a step definition the static scanner could not
  // see appeared or vanished), a failing guard test is registered instead of
  // letting the suites silently diverge.
  readonly expectedCount?: number
  // This spec's committed drift baseline (from varar.lock.json), injected by the
  // plugin. When present, drift is detected and reported as a diagnostic (a
  // failing `var:diagnostic:drift` test) — a read-only gate. The baseline is
  // written only by `varar run`; VARAR_UPDATE=1 skips the gate so you can
  // re-record it there without vitest going red first.
  readonly baseline?: SpecBaseline | null
}

export type CollectedExample = {
  readonly name: string
  // Unique source lines of the example's matched steps, for the reporter.
  readonly lines: ReadonlyArray<number>
  readonly run: () => void | Promise<void>
}

// Build the registry from the step modules the virtual module imported, plan
// the spec, and hand back one lazily-executed closure per example. The
// virtual module registers one STATIC `test("literal name", ...)` per example
// — so editors can discover names and locations without running anything —
// and looks each body up here by index via `vararTestBody`.
export function collectVararExamples(
  path: string,
  source: string,
  ports: CollectPorts,
): ReadonlyArray<CollectedExample> {
  const reporter: Reporter = ports.reporter ?? {
    diagnostic: (d) =>
      test(`var:diagnostic:${d.code}`, () => {
        throw new Error(d.message)
      }),
  }
  const registry = buildRegistry()
  const p = planSpec(path, source, registry)
  // Read-only drift gate: a paragraph the baseline recorded as an example that
  // now matches no step surfaces as a drift diagnostic (a failing test) unless
  // VARAR_UPDATE is set (then re-record via `varar run --update`).
  if (ports.baseline) {
    const update = process.env.VARAR_UPDATE === '1' || process.env.VARAR_UPDATE === 'true'
    if (!update) {
      for (const d of driftDiagnostics(detectDrift(ports.baseline, p.varDoc, p))) {
        reporter.diagnostic(d)
      }
    }
  }
  const examples = examplesWithRuns(p, contextFactory(), reporter).map(({ example, run }) => ({
    name: example.name,
    lines: [...new Set(example.steps.map((s) => s.matchSpan.startLine))],
    run,
  }))
  if (ports.expectedCount !== undefined && examples.length !== ports.expectedCount) {
    test('var:stale-spec-transform', () => {
      throw new Error(
        `expected ${ports.expectedCount} example(s) in ${path} but the runtime planned ` +
          `${examples.length} — the step definitions changed after this spec was transformed; re-run the suite`,
      )
    })
  }
  return examples
}

// Structural slice of vitest's TestContext — enough to attach varResult
// without importing vitest types into the runtime.
type TaskContext = { readonly task: { readonly meta: { varResult?: unknown } } }

// A single failing cell diffs as its bare value ("JMK" vs "JFK"); several diff
// as a value list in document order (`["LGR", "JMK"]` vs `["LHR", "JFK"]`).
// The surrounding step text stays out of the pair — the editor squiggles and
// the error message already locate each cell, so the diff carries only what
// differs, which keeps VS Code's one-line inline decoration legible.
function renderCells(cells: ReadonlyArray<CellDiff>, key: 'expected' | 'actual'): string {
  return cells.length === 1
    ? (cells[0] as CellDiff)[key]
    : `[${cells.map((c) => JSON.stringify(c[key])).join(', ')}]`
}

// vitest renders a `- Expected / + Received` diff for any thrown error that
// carries `expected` and `actual` (and the VS Code vitest extension shows the
// same pair in its diff peek), so project the mismatch's structured diff onto
// that pair before the error crosses into vitest. A `format`-rendered cell
// diffs as its document-notation strings ("£2.55" vs "£2.50") — that pair IS
// the diff the author asked for by writing a format. Only an UNFORMATTED
// single object mismatch attaches the raw values instead, so vitest renders
// a structural object diff rather than two JSON strings. Presentation only —
// the pass/fail verdict stays the core's comparison.
function attachExpectedActual(error: unknown): void {
  const e = error as { expected?: unknown; actual?: unknown }
  if (isCellMismatchError(error)) {
    const bad = error.cells
      .filter((c) => !c.ok)
      .sort((a, b) => a.span.startOffset - b.span.startOffset)
    if (bad.length === 0) return
    const single = bad.length === 1 ? (bad[0] as CellDiff) : undefined
    if (
      single &&
      !single.formatted &&
      'actualValue' in single &&
      typeof single.actualValue === 'object'
    ) {
      e.expected = single.expectedValue
      e.actual = single.actualValue
      return
    }
    e.expected = renderCells(bad, 'expected')
    e.actual = renderCells(bad, 'actual')
  }
}

export function vararTestBody(
  examples: ReadonlyArray<CollectedExample>,
  index: number,
  name: string,
  path: string,
): (ctx: TaskContext) => Promise<void> {
  return async (ctx) => {
    const ex = examples[index]
    if (!ex || ex.name !== name) {
      throw new Error(
        `stale spec transform: expected example #${index} of ${path} to be named ` +
          `${JSON.stringify(name)}${ex ? `, found ${JSON.stringify(ex.name)}` : ', but it no longer exists'}. ` +
          'The step definitions changed after this spec was transformed — re-run the suite.',
      )
    }
    const lines = ex.lines
    try {
      await ex.run()
      ctx.task.meta.varResult = { name, status: 'passed', lines }
    } catch (error) {
      ctx.task.meta.varResult = {
        name,
        status: 'failed',
        lines,
        failure: toFailure(error, path, lines[0] ?? 0),
      }
      attachExpectedActual(error)
      throw error
    }
  }
}
