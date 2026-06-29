import { expect, test } from 'vitest'
import { CellMismatchError, ReturnShapeError } from '../src/cell-diff.js'
import { DocStringMismatchError } from '../src/doc-string-diff.js'
import { toFailure } from '../src/failure.js'
import { spanFromOffsets } from '../src/span.js'

test('toFailure extracts cells from a CellMismatchError', () => {
  const source = 'a | 5 |'
  const err = new CellMismatchError([
    { column: 'n', span: spanFromOffsets(source, 4, 5), expected: '5', actual: '4', ok: false },
  ])
  const f = toFailure(err, 'spec.md', 3)
  expect(f.cells).toEqual([{ from: 4, to: 5, actual: '4' }])
  expect(f.doc).toBeUndefined()
  expect(typeof f.message).toBe('string')
  expect(typeof f.stack).toBe('string')
})

test('toFailure extracts doc from a DocStringMismatchError', () => {
  const source = 'Hello!\n'
  const err = new DocStringMismatchError({
    span: spanFromOffsets(source, 0, 7),
    expected: 'Hello!\n',
    actual: 'Goodbye!\n',
  })
  const f = toFailure(err, 'spec.md', 3)
  expect(f.doc).toEqual({ from: 0, to: 7, actual: 'Goodbye!\n' })
  expect(f.cells).toBeUndefined()
})

test('toFailure leaves cells/doc undefined for a plain error or ReturnShapeError', () => {
  expect(toFailure(new Error('nope'), 'spec.md', 3).cells).toBeUndefined()
  expect(toFailure(new Error('nope'), 'spec.md', 3).doc).toBeUndefined()
  expect(toFailure(new ReturnShapeError('bad'), 'spec.md', 3).cells).toBeUndefined()
})

test('toFailure reads the failing line from an injected stack frame, else falls back', () => {
  const err = new Error('boom')
  err.stack = 'Error: boom\n    at handler (steps.ts:1:1)\n    at step (docs/a.md:12:3)'
  expect(toFailure(err, 'docs/a.md', 99).line).toBe(12)

  const noFrame = new Error('boom')
  noFrame.stack = 'Error: boom\n    at handler (steps.ts:1:1)'
  expect(toFailure(noFrame, 'docs/a.md', 99).line).toBe(99)
})

test('toFailure regex-escapes the spec path (a dot is literal)', () => {
  const err = new Error('boom')
  // 'X' stands in for the dot: if the spec path's `.` were treated as a regex
  // wildcard it would match this frame; escaped, it must not.
  err.stack = 'Error: boom\n    at step (aXmd:7:1)'
  // specPath "a.md" must NOT match "aXmd"
  expect(toFailure(err, 'a.md', 42).line).toBe(42)
})
