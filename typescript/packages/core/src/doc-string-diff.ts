import { type CellDiff, ReturnShapeError } from './cell-diff.ts'
import type { Span } from './span.ts'

// The column label a doc-string cell carries in a CellDiff, so its mismatch
// message reads `doc string: expected … but was …`.
export const DOC_STRING_COLUMN = 'doc string'

// Compare a doc-string step's returned string against the fence body content.
// A doc string is ONE CELL, compared whole — exact equality, the body's trailing
// newline included — so a difference is an ordinary CellDiff and the executor
// throws the same CellMismatchError as any other cell.
//
// `expected`/`actual` are JSON-quoted: a doc string routinely differs only in
// whitespace, and bare text would render a missing trailing newline as no
// difference at all.
//
// `undefined` → no check (null). A non-string return is an author mistake →
// ReturnShapeError.
export function compareDocString(returned: unknown, content: string, span: Span): CellDiff | null {
  if (returned === undefined) return null
  if (typeof returned !== 'string') {
    throw new ReturnShapeError(`expected a doc string (string), got ${typeof returned}`)
  }
  if (returned === content) return null
  return {
    column: DOC_STRING_COLUMN,
    span,
    expected: JSON.stringify(content),
    actual: JSON.stringify(returned),
    ok: false,
  }
}
