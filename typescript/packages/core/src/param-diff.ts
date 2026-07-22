import { type CellDiff, renderCellValue } from './cell-diff.ts'
import { deepEqual } from './deep-equal.ts'
import type { ParameterFormat } from './registry.ts'
import type { Span } from './span.ts'

// Render one side of a parameter diff: the parameter type's `format` when it
// has one (document notation — the only rendering conformance can pin), then
// the shared string/primitive/JSON chain. A throwing formatter falls through
// rather than masking the real mismatch. `viaFormat` reports which branch
// produced the text so the diff can carry the `formatted` hint.
function renderParamValue(
  value: unknown,
  format: ParameterFormat | undefined,
): { readonly text: string; readonly viaFormat: boolean } {
  if (format) {
    try {
      return { text: format(value), viaFormat: true }
    } catch {
      // fall through to the generic rendering
    }
  }
  return { text: renderCellValue(value), viaFormat: false }
}

// Compare a sensor's returned inline actuals against the values captured from
// the document. `expected` is the captured arguments, `sourceTexts` the matched
// text at each parameter's span (used as the diff's `expected` display), and
// `paramSpans` anchors each cell to the .md source. `formats` carries each
// parameter type's display formatter (or undefined), used only to render the
// actual side. The four arrays align 1:1 with `returned`; the caller validates
// length first.
export function compareParams(
  returned: ReadonlyArray<unknown>,
  expected: ReadonlyArray<unknown>,
  paramSpans: ReadonlyArray<Span>,
  sourceTexts: ReadonlyArray<string>,
  formats?: ReadonlyArray<ParameterFormat | undefined>,
): ReadonlyArray<CellDiff> {
  const diffs: CellDiff[] = []
  for (let i = 0; i < expected.length; i++) {
    const ok = deepEqual(returned[i], expected[i])
    const format = formats?.[i]
    const actual = renderParamValue(returned[i], format)
    diffs.push({
      column: `cell ${i + 1}`,
      span: paramSpans[i] as Span,
      expected: sourceTexts[i] ?? renderParamValue(expected[i], format).text,
      actual: actual.text,
      ok,
      expectedValue: expected[i],
      actualValue: returned[i],
      formatted: actual.viaFormat,
    })
  }
  return diffs
}
