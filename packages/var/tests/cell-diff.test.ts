import { expect, test } from 'vitest'
import {
  CellMismatchError,
  compareRow,
  isCellMismatchError,
  type RowCheck,
} from '../src/cell-diff.js'

const span = { startLine: 1, startCol: 1, endLine: 1, endCol: 2, startOffset: 0, endOffset: 1 }
const checks: ReadonlyArray<RowCheck> = [
  { column: 'dice', value: '3, 3, 3, 4, 4', span },
  { column: 'score', value: '9', span },
]

test('a returned column that matches its cell is ok', () => {
  const diffs = compareRow({ score: 9 }, checks)
  expect(diffs).toEqual([{ column: 'score', span, expected: '9', actual: '9', ok: true }])
})

test('a returned column that differs is not ok, with expected and actual', () => {
  const diffs = compareRow({ score: 6 }, checks)
  expect(diffs).toEqual([{ column: 'score', span, expected: '9', actual: '6', ok: false }])
})

test('columns that are not returned are inputs — not checked', () => {
  // `dice` is never returned, so it never appears in the diffs.
  expect(compareRow({ score: 9 }, checks).map((d) => d.column)).toEqual(['score'])
})

test('a returned key that is not a column is ignored', () => {
  expect(compareRow({ nope: 1 }, checks)).toEqual([])
})

test('undefined / non-object return checks nothing', () => {
  expect(compareRow(undefined, checks)).toEqual([])
  expect(compareRow(null, checks)).toEqual([])
  expect(compareRow(42, checks)).toEqual([])
})

test('CellMismatchError carries the cells and is detectable', () => {
  const err = new CellMismatchError([
    { column: 'score', span, expected: '9', actual: '6', ok: false },
  ])
  expect(isCellMismatchError(err)).toBe(true)
  expect(isCellMismatchError(new Error('x'))).toBe(false)
  expect(err.cells[0]?.actual).toBe('6')
  expect(err.message).toContain('score')
})
