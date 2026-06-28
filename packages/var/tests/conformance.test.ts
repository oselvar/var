import { expect, test } from 'vitest'
import { CellMismatchError } from '../src/cell-diff.js'
import { canonicalStringify, toFailureArtifact } from '../src/conformance.js'
import { DocStringMismatchError } from '../src/doc-string-diff.js'
import { UnexpectedPassError } from '../src/execute.js'

test('canonicalStringify sorts keys recursively and ends with a newline', () => {
  const out = canonicalStringify({ b: 1, a: { d: 2, c: 3 } })
  expect(out).toBe('{\n  "a": {\n    "c": 3,\n    "d": 2\n  },\n  "b": 1\n}\n')
})

test('canonicalStringify preserves array order', () => {
  expect(canonicalStringify([3, 1, 2])).toBe('[\n  3,\n  1,\n  2\n]\n')
})

const span = { startOffset: 0, endOffset: 1, startLine: 7, startCol: 1, endLine: 7, endCol: 2 }

test('toFailureArtifact projects a CellMismatchError to cell-mismatch', () => {
  const err = new CellMismatchError([
    { column: 'score', span, expected: '9', actual: '6', ok: false },
  ])
  expect(toFailureArtifact(err, 'e.var.md', 7)).toEqual({
    kind: 'cell-mismatch',
    line: 7,
    cells: [{ column: 'score', expected: '9', actual: '6', span }],
  })
})

test('toFailureArtifact projects a DocStringMismatchError to doc-string-mismatch', () => {
  const err = new DocStringMismatchError({ span, expected: 'a', actual: 'b' })
  expect(toFailureArtifact(err, 'e.var.md', 7)).toEqual({
    kind: 'doc-string-mismatch',
    line: 7,
    diff: { expected: 'a', actual: 'b', span },
  })
})

test('toFailureArtifact maps UnexpectedPassError and opaque throws', () => {
  expect(toFailureArtifact(new UnexpectedPassError(), 'e.var.md', 4).kind).toBe('unexpected-pass')
  expect(toFailureArtifact(new Error('boom'), 'e.var.md', 4)).toEqual({ kind: 'thrown', line: 4 })
})
