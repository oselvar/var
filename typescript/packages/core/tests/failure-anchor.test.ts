import { expect, test } from 'vitest'
import { CellMismatchError } from '../src/cell-diff.ts'
import { failureAnchor } from '../src/failure-anchor.ts'
import type { Span } from '../src/span.ts'

const fallback: Span = {
  startOffset: 0,
  endOffset: 1,
  startLine: 1,
  startCol: 1,
  endLine: 1,
  endCol: 2,
}
const cellSpan: Span = {
  startOffset: 10,
  endOffset: 13,
  startLine: 3,
  startCol: 3,
  endLine: 3,
  endCol: 6,
}

test('failureAnchor points at the first failing cell of a CellMismatchError', () => {
  const err = new CellMismatchError([
    { column: 'a', span: fallback, expected: '1', actual: '1', ok: true },
    { column: 'b', span: cellSpan, expected: '2', actual: '3', ok: false },
  ])
  expect(failureAnchor(err, fallback)).toBe(cellSpan)
})

test('failureAnchor falls back when a CellMismatchError has no failing cell', () => {
  const err = new CellMismatchError([
    { column: 'a', span: cellSpan, expected: '1', actual: '1', ok: true },
  ])
  expect(failureAnchor(err, fallback)).toBe(fallback)
})

test('failureAnchor falls back for a non-cell error', () => {
  expect(failureAnchor(new Error('boom'), fallback)).toBe(fallback)
})
