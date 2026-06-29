import { expect, test } from 'vitest'
import type { Table } from '../src/ast.js'
import {
  CellMismatchError,
  compareRow,
  compareTable,
  isCellMismatchError,
  ReturnShapeError,
  type RowCheck,
} from '../src/cell-diff.js'
import { parse } from '../src/parse.js'

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

// Build a real Table (with cellSpans) by parsing a markdown table.
function tableOf(source: string): { table: Table; source: string } {
  const doc = parse('t.md', source)
  const table = doc.examples[0]?.body.find((b) => b.kind === 'table') as Table | undefined
  if (!table) throw new Error('no table parsed')
  return { table, source }
}

const TABLE_SRC = `# T

these:

| before | after |
| ------ | ----- |
| var    | VAR   |
| bdd    | BDD   |`

test('compareTable: array-of-arrays full match → all ok', () => {
  const { table } = tableOf(TABLE_SRC)
  const diffs = compareTable(
    [
      ['var', 'VAR'],
      ['bdd', 'BDD'],
    ],
    table,
  )
  expect(diffs).toHaveLength(4)
  expect(diffs.every((d) => d.ok)).toBe(true)
})

test('compareTable: array-of-records full match → all ok', () => {
  const { table } = tableOf(TABLE_SRC)
  const diffs = compareTable(
    [
      { before: 'var', after: 'VAR' },
      { before: 'bdd', after: 'BDD' },
    ],
    table,
  )
  expect(diffs.every((d) => d.ok)).toBe(true)
})

test('compareTable: one wrong cell → that CellDiff is not ok, with expected/actual/span', () => {
  const { table, source } = tableOf(TABLE_SRC)
  const diffs = compareTable(
    [
      ['var', 'WRONG'],
      ['bdd', 'BDD'],
    ],
    table,
  )
  const bad = diffs.filter((d) => !d.ok)
  expect(bad).toHaveLength(1)
  expect(bad[0]?.column).toBe('after')
  expect(bad[0]?.expected).toBe('VAR')
  expect(bad[0]?.actual).toBe('WRONG')
  expect(source.slice(bad[0]!.span.startOffset, bad[0]!.span.endOffset)).toBe('VAR')
})

test('compareTable: numbers are stringified before compare', () => {
  const { table: t } = tableOf(`# T

these:

| n |
| - |
| 7 |`)
  expect(compareTable([[7]], t).every((d) => d.ok)).toBe(true)
})

test('compareTable: undefined return checks nothing', () => {
  const { table } = tableOf(TABLE_SRC)
  expect(compareTable(undefined, table)).toEqual([])
})

test('compareTable: extra keys on a returned record are ignored', () => {
  const { table } = tableOf(TABLE_SRC)
  const diffs = compareTable(
    [
      { before: 'var', after: 'VAR', extra: 'ignored' },
      { before: 'bdd', after: 'BDD', note: 123 },
    ],
    table,
  )
  expect(diffs.every((d) => d.ok)).toBe(true)
  expect(diffs.map((d) => d.column)).toEqual(['before', 'after', 'before', 'after'])
})

test('compareTable: shape/type errors throw ReturnShapeError', () => {
  const { table } = tableOf(TABLE_SRC)
  expect(() => compareTable('nope', table)).toThrow(ReturnShapeError) // not an array
  expect(() => compareTable([['var', 'VAR']], table)).toThrow(ReturnShapeError) // wrong row count
  expect(() => compareTable([['var'], ['bdd']], table)).toThrow(ReturnShapeError) // wrong width
  expect(() => compareTable([{ before: 'var' }, { before: 'bdd' }], table)).toThrow(
    ReturnShapeError,
  ) // missing key
  expect(() => compareTable([['var', 'VAR'], { before: 'bdd', after: 'BDD' }], table)).toThrow(
    ReturnShapeError,
  ) // mixed forms
})
