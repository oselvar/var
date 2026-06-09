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

test('scan groups consecutive non-blank lines into a single paragraph', () => {
  const source = 'first line\nsecond line\n\nthird line'
  const blocks = scan(source)
  const paragraphs = blocks.filter((b) => b.kind === 'paragraph')
  expect(paragraphs).toHaveLength(2)
  if (paragraphs[0]?.kind !== 'paragraph') throw new Error('expected paragraph')
  expect(paragraphs[0].text).toBe('first line\nsecond line')
  if (paragraphs[1]?.kind !== 'paragraph') throw new Error('expected paragraph')
  expect(paragraphs[1].text).toBe('third line')
})

test('paragraph span covers the full multi-line range', () => {
  const source = 'first line\nsecond line\n\nthird line'
  const blocks = scan(source)
  const p1 = blocks.find((b) => b.kind === 'paragraph')
  if (p1?.kind !== 'paragraph') throw new Error('expected paragraph')
  expect(p1.span.startOffset).toBe(0)
  expect(p1.span.endOffset).toBe('first line\nsecond line'.length)
  expect(p1.span.startLine).toBe(1)
  expect(p1.span.endLine).toBe(2)
})

test('paragraph inlineMap maps text offsets to source offsets', () => {
  const source = '# Heading\n\nhello world'
  const blocks = scan(source)
  const paragraph = blocks.find((b) => b.kind === 'paragraph')
  if (paragraph?.kind !== 'paragraph') throw new Error('expected paragraph')
  // 'hello world' lives at source offset 11 (after '# Heading\n\n')
  expect(paragraph.inlineMap[0]).toEqual({ textOffset: 0, sourceOffset: 11 })
})

test('scan recognizes a fenced code block with info string', () => {
  const source = '# Title\n\n```json\n{ "a": 1 }\n```\n'
  const blocks = scan(source)
  const fence = blocks.find((b) => b.kind === 'fence')
  if (fence?.kind !== 'fence') throw new Error('expected fence')
  expect(fence.info).toBe('json')
  expect(fence.body).toBe('{ "a": 1 }\n')
})

test('scan tolerates a fence with no info string', () => {
  const blocks = scan('```\nplain body\n```')
  const fence = blocks.find((b) => b.kind === 'fence')
  if (fence?.kind !== 'fence') throw new Error('expected fence')
  expect(fence.info).toBe('')
  expect(fence.body).toBe('plain body\n')
})

test('scan does not split paragraphs across a fence', () => {
  const source = 'paragraph above\n\n```\nbody\n```\n\nparagraph below'
  const blocks = scan(source)
  expect(blocks.map((b) => b.kind)).toEqual(['paragraph', 'fence', 'paragraph'])
})

test('scan recognizes a GFM table with header + delimiter + rows', () => {
  const source = '| name | age |\n|------|-----|\n| Bob  | 30  |\n| Eve  | 25  |\n'
  const blocks = scan(source)
  const table = blocks.find((b) => b.kind === 'table')
  if (table?.kind !== 'table') throw new Error('expected table')
  expect(table.header.cells).toEqual(['name', 'age'])
  expect(table.rows).toHaveLength(2)
  expect(table.rows[0]?.cells).toEqual(['Bob', '30'])
  expect(table.rows[1]?.cells).toEqual(['Eve', '25'])
})

test('a line that looks like a row but has no following delimiter is a paragraph', () => {
  const blocks = scan('| not | a | table |')
  expect(blocks[0]?.kind).toBe('paragraph')
})

test.each(['---', '***', '___', '----', '* * *'])('recognizes thematic break: %s', (mark) => {
  const blocks = scan(`a\n\n${mark}\n\nb`)
  expect(blocks.map((b) => b.kind)).toEqual(['paragraph', 'thematic_break', 'paragraph'])
})

test('scan recognizes unordered list items', () => {
  const blocks = scan('- Given I have 100\n- When I withdraw 40\n- Then I should have 60')
  expect(blocks.map((b) => b.kind)).toEqual(['list_item', 'list_item', 'list_item'])
  const first = blocks[0]
  if (first?.kind !== 'list_item') throw new Error('expected list_item')
  expect(first.ordered).toBe(false)
  expect(first.text).toBe('Given I have 100')
})

test('scan recognizes ordered list items', () => {
  const blocks = scan('1. First step\n2. Second step')
  expect(blocks.map((b) => b.kind)).toEqual(['list_item', 'list_item'])
  const first = blocks[0]
  if (first?.kind !== 'list_item') throw new Error('expected list_item')
  expect(first.ordered).toBe(true)
})

test('scan recognizes blockquotes', () => {
  const blocks = scan('> Given I have 100\n> When I withdraw 40')
  expect(blocks).toHaveLength(1)
  const bq = blocks[0]
  if (bq?.kind !== 'blockquote') throw new Error('expected blockquote')
  expect(bq.text).toBe('Given I have 100\nWhen I withdraw 40')
})
