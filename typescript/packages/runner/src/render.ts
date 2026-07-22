import { isCellMismatchError, ReturnShapeError } from '@varar/core'

/**
 * Render a step failure as a human-readable string, anchored to the source `.md`
 * location when the error carries structured diff information.
 *
 * Structured errors (`CellMismatchError`, `ReturnShapeError`) produce
 * expected/actual output with the `.md` line number.
 * All other throws fall back to `error.stack` or `String(error)`.
 */
export function renderFailure(error: unknown, _source: string, path: string): string {
  if (isCellMismatchError(error)) {
    const failingCells = error.cells.filter((c) => !c.ok)
    if (failingCells.length === 0) return error.stack ?? error.message
    const lines = failingCells.map((c) => {
      const line = c.span.startLine
      return `  ${path}:${line} col "${c.column}": expected ${JSON.stringify(c.expected)} but was ${JSON.stringify(c.actual)}`
    })
    return `CellMismatchError\n${lines.join('\n')}`
  }

  if (error instanceof ReturnShapeError) {
    return `ReturnShapeError: ${error.message}`
  }

  if (error instanceof Error && typeof error.stack === 'string') return error.stack
  if (error instanceof Error) return error.message
  return String(error)
}
