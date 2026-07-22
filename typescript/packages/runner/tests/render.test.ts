import type { CellDiff } from '@varar/core'
import { CellMismatchError, compareDocString, ReturnShapeError } from '@varar/core'
import { expect, test } from 'vitest'
import { renderFailure } from '../src/render.ts'

const PATH = 'spec.md'
const SOURCE = '# Spec\n\nSome step.\n'

function makeSpan(startLine: number) {
  return {
    startOffset: 0,
    endOffset: 1,
    startLine,
    startCol: 1,
    endLine: startLine,
    endCol: 2,
  }
}

test('renderFailure: CellMismatchError → contains expected/actual and .md line', () => {
  const cells: ReadonlyArray<CellDiff> = [
    { column: 'amount', span: makeSpan(5), expected: '100', actual: '99', ok: false },
  ]
  const err = new CellMismatchError(cells)
  const result = renderFailure(err, SOURCE, PATH)
  expect(result).toContain('CellMismatchError')
  expect(result).toContain('"100"')
  expect(result).toContain('"99"')
  expect(result).toContain('spec.md:5')
  expect(result).toContain('"amount"')
})

test('renderFailure: CellMismatchError with multiple failing cells', () => {
  const cells: ReadonlyArray<CellDiff> = [
    { column: 'a', span: makeSpan(3), expected: '1', actual: '2', ok: false },
    { column: 'b', span: makeSpan(4), expected: '3', actual: '4', ok: false },
  ]
  const err = new CellMismatchError(cells)
  const result = renderFailure(err, SOURCE, PATH)
  expect(result).toContain('spec.md:3')
  expect(result).toContain('spec.md:4')
  expect(result).toContain('"a"')
  expect(result).toContain('"b"')
})

test('renderFailure: CellMismatchError ignores passing cells', () => {
  const cells: ReadonlyArray<CellDiff> = [
    { column: 'x', span: makeSpan(2), expected: 'ok', actual: 'ok', ok: true },
    { column: 'y', span: makeSpan(3), expected: 'want', actual: 'got', ok: false },
  ]
  const err = new CellMismatchError(cells)
  const result = renderFailure(err, SOURCE, PATH)
  // Only the failing cell y should appear
  expect(result).toContain('"y"')
  expect(result).not.toContain('"x"')
})

test('renderFailure: a doc-string cell → contains expected/actual and .md line', () => {
  const diff = compareDocString('Hello earth\n', 'Hello world\n', makeSpan(7))
  const result = renderFailure(new CellMismatchError([diff!]), SOURCE, PATH)
  expect(result).toContain('CellMismatchError')
  expect(result).toContain('spec.md:7')
  expect(result).toContain('doc string')
  expect(result).toContain('Hello world')
  expect(result).toContain('Hello earth')
})

test('renderFailure: ReturnShapeError → contains the message', () => {
  const err = new ReturnShapeError('expected a table (array of rows), got string')
  const result = renderFailure(err, SOURCE, PATH)
  expect(result).toContain('ReturnShapeError')
  expect(result).toContain('expected a table (array of rows), got string')
})

test('renderFailure: arbitrary Error → contains the message (via stack)', () => {
  const err = new Error('something went wrong')
  const result = renderFailure(err, SOURCE, PATH)
  expect(result).toContain('something went wrong')
})

test('renderFailure: non-Error throw → String(error)', () => {
  const result = renderFailure('plain string throw', SOURCE, PATH)
  expect(result).toBe('plain string throw')
})

test('renderFailure: Error without stack → message', () => {
  const err = new Error('no stack')
  // Simulate missing stack
  Object.defineProperty(err, 'stack', { get: () => undefined })
  const result = renderFailure(err, SOURCE, PATH)
  expect(result).toContain('no stack')
})
