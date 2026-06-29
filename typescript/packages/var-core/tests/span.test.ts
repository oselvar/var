import { expect, test } from 'vitest'
import { spanFromOffsets } from '../src/span.js'

test('spanFromOffsets computes line and column for a single-line source', () => {
  const source = 'hello world'
  const span = spanFromOffsets(source, 6, 11)
  expect(span).toEqual({
    startOffset: 6,
    endOffset: 11,
    startLine: 1,
    startCol: 7,
    endLine: 1,
    endCol: 12,
  })
})

test('spanFromOffsets handles multi-line sources', () => {
  const source = 'line one\nline two\nline three'
  // 'two' starts at offset 14, ends at 17
  const span = spanFromOffsets(source, 14, 17)
  expect(span).toEqual({
    startOffset: 14,
    endOffset: 17,
    startLine: 2,
    startCol: 6,
    endLine: 2,
    endCol: 9,
  })
})

test('spanFromOffsets handles a range crossing a newline', () => {
  const source = 'ab\ncd'
  // From offset 1 ('b') to 4 ('d')
  const span = spanFromOffsets(source, 1, 4)
  expect(span).toEqual({
    startOffset: 1,
    endOffset: 4,
    startLine: 1,
    startCol: 2,
    endLine: 2,
    endCol: 2,
  })
})
