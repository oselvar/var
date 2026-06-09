import { expect, test } from 'vitest'
import { scan } from '../src/scanner.js'

test('scan finds a single h1 heading', () => {
  const blocks = scan('# Hello')
  expect(blocks).toHaveLength(1)
  const h = blocks[0]
  expect(h?.kind).toBe('heading')
  if (h?.kind !== 'heading') throw new Error('not a heading')
  expect(h.level).toBe(1)
  expect(h.text).toBe('Hello')
  expect(h.span).toEqual({
    startOffset: 0,
    endOffset: 7,
    startLine: 1,
    startCol: 1,
    endLine: 1,
    endCol: 8,
  })
})

test('scan finds headings at levels 1..6', () => {
  const source = '# a\n## b\n### c\n#### d\n##### e\n###### f'
  const blocks = scan(source)
  const levels = blocks
    .filter((b) => b.kind === 'heading')
    .map((b) => (b.kind === 'heading' ? b.level : null))
  expect(levels).toEqual([1, 2, 3, 4, 5, 6])
})

test('scan ignores headings with more than 6 hashes', () => {
  const blocks = scan('####### too deep')
  // Treated as a paragraph (or nothing in this scope) — at minimum, not a heading.
  expect(blocks.find((b) => b.kind === 'heading')).toBeUndefined()
})

test('scan strips the optional trailing # marker', () => {
  const blocks = scan('## Hello ##')
  const h = blocks[0]
  if (h?.kind !== 'heading') throw new Error('not a heading')
  expect(h.text).toBe('Hello')
})
