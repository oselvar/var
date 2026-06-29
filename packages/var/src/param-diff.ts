import type { CellDiff } from './cell-diff.js'
import { deepEqual } from './deep-equal.js'
import type { Span } from './span.js'

// Compare a sensor's returned inline actuals against the values captured from
// the document. `expected` is the captured arguments, `sourceTexts` the matched
// text at each parameter's span (used as the diff's `expected` display), and
// `paramSpans` anchors each cell to the .var.md source. The three arrays align
// 1:1 with `returned`; the caller validates length first.
export function compareParams(
  returned: ReadonlyArray<unknown>,
  expected: ReadonlyArray<unknown>,
  paramSpans: ReadonlyArray<Span>,
  sourceTexts: ReadonlyArray<string>,
): ReadonlyArray<CellDiff> {
  const diffs: CellDiff[] = []
  for (let i = 0; i < expected.length; i++) {
    const ok = deepEqual(returned[i], expected[i])
    diffs.push({
      column: `arg ${i + 1}`,
      span: paramSpans[i] as Span,
      expected: sourceTexts[i] ?? String(expected[i]),
      actual: String(returned[i]),
      ok,
    })
  }
  return diffs
}
