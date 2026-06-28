import type { Row, Table } from './ast.js'
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

// The step returned the wrong TYPE (a non-array where a table was input, a
// string where a doc string was input) or wrong SHAPE (row/column count,
// missing record key, mixed row forms). An author mistake, not a value diff.
export class ReturnShapeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ReturnShapeError'
  }
}

// Compare a whole-table step's returned table against the input table, full
// reproduction: every column of every data row is checked (the header row is
// labels, never compared). `returned` may be an array-of-arrays (data rows,
// positional) or an array-of-records (keyed by header cell). Cells compare as
// exact strings (`String(value) === cellText`). `undefined` → no checks.
// Type/shape problems throw `ReturnShapeError`.
export function compareTable(returned: unknown, input: Table): ReadonlyArray<CellDiff> {
  if (returned === undefined) return []
  if (!Array.isArray(returned)) {
    throw new ReturnShapeError(`expected a table (array of rows), got ${typeof returned}`)
  }
  const columns = input.header.cells
  const dataRows = input.rows
  if (returned.length !== dataRows.length) {
    throw new ReturnShapeError(`expected ${dataRows.length} row(s), got ${returned.length}`)
  }
  const isRecord = (r: unknown): r is Record<string, unknown> =>
    r !== null && typeof r === 'object' && !Array.isArray(r)
  const allArrays = returned.every((r) => Array.isArray(r))
  const allRecords = returned.every(isRecord)
  if (!allArrays && !allRecords) {
    throw new ReturnShapeError('table rows must be all arrays or all objects')
  }
  const diffs: CellDiff[] = []
  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i] as Row
    const ret = returned[i]
    for (let j = 0; j < columns.length; j++) {
      const column = columns[j] as string
      let actualValue: unknown
      if (allArrays) {
        const cells = ret as ReadonlyArray<unknown>
        if (cells.length !== columns.length) {
          throw new ReturnShapeError(
            `row ${i}: expected ${columns.length} column(s), got ${cells.length}`,
          )
        }
        actualValue = cells[j]
      } else {
        const rec = ret as Record<string, unknown>
        if (!(column in rec)) {
          throw new ReturnShapeError(`row ${i}: missing column "${column}"`)
        }
        actualValue = rec[column]
      }
      const expected = row.cells[j] ?? ''
      const actual = String(actualValue)
      diffs.push({
        column,
        span: row.cellSpans[j] ?? row.span,
        expected,
        actual,
        ok: actual === expected,
      })
    }
  }
  return diffs
}
