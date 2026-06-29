import { isCellMismatchError } from './cell-diff.js'
import { isDocStringMismatchError } from './doc-string-diff.js'
import type { CellFailure, ExampleResult } from './result.js'

// Recover the 1-based failing line from the `<specPath>:line:col` frame
// executePlan injects (see execute.ts augmentStack). Internal — not exported
// from the package index.
function failingLine(stack: string, specPath: string): number | undefined {
  const escaped = specPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const m = new RegExp(`${escaped}:(\\d+):\\d+`).exec(stack)
  return m ? Number(m[1]) : undefined
}

// A thrown step error → the ExampleResult.failure payload. Shared by every
// producer (the vitest worker wrapper and the browser runner) so failures are
// byte-identical. Called only on the failure path, so it always returns a
// payload.
export function toFailure(
  error: unknown,
  specPath: string,
  fallbackLine: number,
): NonNullable<ExampleResult['failure']> {
  const e = error as { message?: unknown; stack?: unknown }
  const stack = typeof e?.stack === 'string' ? e.stack : String(error)
  const message = e?.message != null ? String(e.message) : String(error)

  const cells: ReadonlyArray<CellFailure> | undefined = isCellMismatchError(error)
    ? error.cells
        .filter((c) => !c.ok)
        .map((c) => ({ from: c.span.startOffset, to: c.span.endOffset, actual: c.actual }))
    : undefined

  const doc: CellFailure | undefined = isDocStringMismatchError(error)
    ? {
        from: error.diff.span.startOffset,
        to: error.diff.span.endOffset,
        actual: error.diff.actual,
      }
    : undefined

  return {
    line: failingLine(stack, specPath) ?? fallbackLine,
    message,
    stack,
    ...(cells && cells.length > 0 ? { cells } : {}),
    ...(doc ? { doc } : {}),
  }
}
