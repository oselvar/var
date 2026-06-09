import { expect, test } from 'vitest'
import { stripInline } from '../src/inline.js'

test('strips bold and italic markers, preserving inner text', () => {
  const { text, map } = stripInline('Given I have **100** in *my* account', 10)
  expect(text).toBe('Given I have 100 in my account')
  expect(map.find((m) => m.textOffset === 13)?.sourceOffset).toBe(10 + 'Given I have **'.length)
})

test('reduces inline links to their text, drops the URL', () => {
  const { text } = stripInline('See [the docs](https://example.com).', 0)
  expect(text).toBe('See the docs.')
})

test('preserves backtick code spans verbatim (including the backticks)', () => {
  const { text } = stripInline('Run `npm test` first.', 0)
  expect(text).toBe('Run `npm test` first.')
})

test('map allows lifting text offsets back to source offsets', () => {
  const { text, map } = stripInline('a **bold** word', 100)
  expect(text).toBe('a bold word')
  // 'bold' starts at text offset 2; in source it is at 100 + 'a **'.length = 104
  const offset = liftOffset(map, 2)
  expect(offset).toBe(104)
})

test('mid-word underscores are preserved (snake_case is not mangled)', () => {
  const { text } = stripInline('the field do_something_now is set', 0)
  expect(text).toBe('the field do_something_now is set')
})

test('leading underscore at a word boundary still emphasizes', () => {
  const { text } = stripInline('Hello _world_ today', 0)
  expect(text).toBe('Hello world today')
})

test('mid-word asterisk still strips (CommonMark allows it)', () => {
  const { text } = stripInline('we *love* code', 0)
  expect(text).toBe('we love code')
})

function liftOffset(
  map: ReadonlyArray<{ textOffset: number; sourceOffset: number }>,
  t: number,
): number {
  let best = map[0]
  for (const e of map) {
    if (e.textOffset <= t) best = e
  }
  if (!best) throw new Error('empty map')
  return best.sourceOffset + (t - best.textOffset)
}
