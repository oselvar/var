import type { Span } from './span.js'

// One checked column of one header-bound row: the input the comparison needs.
export type RowCheck = {
  readonly column: string
  readonly value: string // the cell text, e.g. "9"
  readonly span: Span // the cell text's source range in the .var.md
}

// The verdict for one checked column after comparing against the table.
export type CellDiff = {
  readonly column: string
  readonly span: Span
  readonly expected: string
  readonly actual: string
  readonly ok: boolean
}

// Compare a row step's returned object against the row's cells. Only columns
// present on `returned` are checked; the rest are inputs. A non-object return
// (including undefined) checks nothing.
export function compareRow(
  returned: unknown,
  checks: ReadonlyArray<RowCheck>,
): ReadonlyArray<CellDiff> {
  if (returned === null || typeof returned !== 'object') return []
  const obj = returned as Record<string, unknown>
  const diffs: CellDiff[] = []
  for (const check of checks) {
    if (!(check.column in obj)) continue
    const actual = String(obj[check.column])
    diffs.push({
      column: check.column,
      span: check.span,
      expected: check.value,
      actual,
      ok: actual === check.value,
    })
  }
  return diffs
}

// Thrown by the executor when a header-bound row's returned columns don't all
// match. Carries the mismatched cells so adapters render/record them.
export class CellMismatchError extends Error {
  readonly cells: ReadonlyArray<CellDiff>
  constructor(cells: ReadonlyArray<CellDiff>) {
    super(cells.map((c) => `${c.column}: expected ${c.expected} but was ${c.actual}`).join('; '))
    this.name = 'CellMismatchError'
    this.cells = cells
  }
}

export function isCellMismatchError(e: unknown): e is CellMismatchError {
  return e instanceof CellMismatchError
}
