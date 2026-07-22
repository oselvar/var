import { expect, test } from 'vitest'
import { CellMismatchError, ReturnShapeError } from '../src/cell-diff.ts'
import { compareDocString, DOC_STRING_COLUMN } from '../src/doc-string-diff.ts'

const span = { startLine: 1, startCol: 1, endLine: 1, endCol: 6, startOffset: 0, endOffset: 6 }

test('compareDocString: equal content → null', () => {
  expect(compareDocString('hello\n', 'hello\n', span)).toBeNull()
})

test('compareDocString: undefined return → null (asserted nothing)', () => {
  expect(compareDocString(undefined, 'hello\n', span)).toBeNull()
})

test('compareDocString: different content → a cell diff labelled "doc string"', () => {
  // A doc string is one cell, compared whole. expected/actual are JSON-quoted
  // so a whitespace-only difference stays visible.
  expect(compareDocString('bye\n', 'hello\n', span)).toEqual({
    column: DOC_STRING_COLUMN,
    span,
    expected: '"hello\\n"',
    actual: '"bye\\n"',
    ok: false,
  })
})

test('a doc-string cell reads like any other cell mismatch', () => {
  const diff = compareDocString('bye\n', 'hello\n', span)
  expect(new CellMismatchError([diff!]).message).toBe(
    'doc string: expected "hello\\n" but was "bye\\n"',
  )
})

test('compareDocString: a non-string return throws ReturnShapeError', () => {
  expect(() => compareDocString(42, 'hello\n', span)).toThrow(ReturnShapeError)
})
