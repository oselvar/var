import { expect, test } from 'vitest'
import { ReturnShapeError } from '../src/cell-diff.js'
import {
  compareDocString,
  DocStringMismatchError,
  isDocStringMismatchError,
} from '../src/doc-string-diff.js'

const span = { startLine: 1, startCol: 1, endLine: 1, endCol: 6, startOffset: 0, endOffset: 6 }

test('compareDocString: equal content → null', () => {
  expect(compareDocString('hello\n', 'hello\n', span)).toBeNull()
})

test('compareDocString: undefined return → null (asserted nothing)', () => {
  expect(compareDocString(undefined, 'hello\n', span)).toBeNull()
})

test('compareDocString: different content → diff with span, expected, actual', () => {
  expect(compareDocString('bye\n', 'hello\n', span)).toEqual({
    span,
    expected: 'hello\n',
    actual: 'bye\n',
  })
})

test('compareDocString: a non-string return throws ReturnShapeError', () => {
  expect(() => compareDocString(42, 'hello\n', span)).toThrow(ReturnShapeError)
})

test('DocStringMismatchError carries the diff and is detectable', () => {
  const err = new DocStringMismatchError({ span, expected: 'hello\n', actual: 'bye\n' })
  expect(isDocStringMismatchError(err)).toBe(true)
  expect(isDocStringMismatchError(new Error('x'))).toBe(false)
  expect(err.diff.actual).toBe('bye\n')
})
