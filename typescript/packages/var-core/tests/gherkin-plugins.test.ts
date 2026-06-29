import { expect, test } from 'vitest'
import { gherkinDocStrings } from '../src/plugins/gherkin/doc-strings.js'
import { gherkinTables } from '../src/plugins/gherkin/tables.js'
import { scan } from '../src/scanner.js'

test('gherkinTables recognises pipe rows without a |---| separator', () => {
  const source = '| title | author |\n| Lolita | Nabokov |\n| 1984 | Orwell |\n'
  const blocks = scan(source, [gherkinTables()])
  expect(blocks).toHaveLength(1)
  const table = blocks[0]!
  expect(table.kind).toBe('table')
  if (table.kind !== 'table') return
  expect(table.header.cells).toEqual(['title', 'author'])
  expect(table.rows.map((r) => r.cells)).toEqual([
    ['Lolita', 'Nabokov'],
    ['1984', 'Orwell'],
  ])
})

test('gherkinTables handles indented rows (typical Gherkin layout)', () => {
  const source = '      | title  | author      |\n      | Lolita | Nabokov     |\n'
  const blocks = scan(source, [gherkinTables()])
  expect(blocks).toHaveLength(1)
  const table = blocks[0]!
  expect(table.kind).toBe('table')
  if (table.kind !== 'table') return
  expect(table.header.cells).toEqual(['title', 'author'])
})

test('an indented gherkin table row exposes cell spans that slice back to the trimmed cell text', () => {
  const source = '   | a | bb  |\n   | 1 | 222 |\n'
  const blocks = scan(source, [gherkinTables()])
  const table = blocks[0]!
  if (table.kind !== 'table') throw new Error('expected table')
  const slice = (s: { startOffset: number; endOffset: number }) =>
    source.slice(s.startOffset, s.endOffset)
  // Header carries cell spans despite the leading indentation.
  expect(slice(table.header.cellSpans[1]!)).toBe('bb')
  // Data row spans slice back to the trimmed cell text.
  const row = table.rows[0]!
  expect(row.cellSpans).toHaveLength(2)
  expect(slice(row.cellSpans[0]!)).toBe('1')
  expect(slice(row.cellSpans[1]!)).toBe('222')
})

test('gherkinTables defers to the built-in scanner when a |---| separator is present', () => {
  const source = '| a | b |\n|---|---|\n| 1 | 2 |\n'
  // With the gherkin plugin enabled but a separator present, the built-in
  // table scanner still wins and produces the same Table shape.
  const blocks = scan(source, [gherkinTables()])
  expect(blocks).toHaveLength(1)
  const table = blocks[0]!
  if (table.kind !== 'table') return
  expect(table.header.cells).toEqual(['a', 'b'])
})

test('gherkinDocStrings recognises a """ delimited block with a language hint', () => {
  const source = '"""json\n{"ok": true}\n"""\n'
  const blocks = scan(source, [gherkinDocStrings()])
  expect(blocks).toHaveLength(1)
  const fence = blocks[0]!
  if (fence.kind !== 'fence') return
  expect(fence.info).toBe('json')
  expect(fence.body).toBe('{"ok": true}\n')
})

test("gherkinDocStrings also handles ''' as the marker", () => {
  const source = "'''\nhello\n'''\n"
  const blocks = scan(source, [gherkinDocStrings()])
  expect(blocks).toHaveLength(1)
  const fence = blocks[0]!
  if (fence.kind !== 'fence') return
  expect(fence.body).toBe('hello\n')
})

test('gherkinDocStrings strips the common indent of the opening marker from each body line', () => {
  const source = '      """json\n      {"ok": true}\n      """\n'
  const blocks = scan(source, [gherkinDocStrings()])
  expect(blocks).toHaveLength(1)
  const fence = blocks[0]!
  if (fence.kind !== 'fence') return
  expect(fence.body).toBe('{"ok": true}\n')
})

test('both plugins compose without conflict', () => {
  const source =
    '      | a | b |\n      | 1 | 2 |\n\n      """json\n      {"hi": true}\n      """\n'
  const blocks = scan(source, [gherkinTables(), gherkinDocStrings()])
  expect(blocks.map((b) => b.kind)).toEqual(['table', 'fence'])
})

test('without the plugins, the same Gherkin syntax produces only paragraphs', () => {
  const source =
    '      | a | b |\n      | 1 | 2 |\n\n      """json\n      {"hi": true}\n      """\n'
  const blocks = scan(source)
  expect(blocks.every((b) => b.kind === 'paragraph')).toBe(true)
})
