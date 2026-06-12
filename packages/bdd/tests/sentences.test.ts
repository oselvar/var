import { expect, test } from 'vitest'
import { splitSentences } from '../src/sentences.js'

test('splits a paragraph on periods, question marks, exclamation marks', () => {
  const text = 'First sentence. Second one? Third one!'
  const result = splitSentences(text)
  expect(result.map((s) => s.text)).toEqual(['First sentence.', 'Second one?', 'Third one!'])
})

test('keeps offsets relative to the input text', () => {
  const text = 'Alpha. Beta.'
  const result = splitSentences(text)
  expect(result).toEqual([
    { text: 'Alpha.', startOffset: 0, endOffset: 6 },
    { text: 'Beta.', startOffset: 7, endOffset: 12 },
  ])
})

test('does not split inside numeric literals', () => {
  const text = 'The price is $1.50 today.'
  const result = splitSentences(text)
  expect(result.map((s) => s.text)).toEqual(['The price is $1.50 today.'])
})

test('does not split on common abbreviations', () => {
  const text = 'Use e.g. coffee. It works.'
  const result = splitSentences(text)
  expect(result.map((s) => s.text)).toEqual(['Use e.g. coffee.', 'It works.'])
})

test('treats a blank line as a sentence boundary', () => {
  const text = 'First.\n\nSecond.'
  const result = splitSentences(text)
  expect(result.map((s) => s.text)).toEqual(['First.', 'Second.'])
})

test('treats a backtick code span as a single token (no split inside)', () => {
  const text = 'Run `npm test` first. Then `git push`.'
  const result = splitSentences(text)
  expect(result.map((s) => s.text)).toEqual(['Run `npm test` first.', 'Then `git push`.'])
})

test('the final sentence does not require a terminator', () => {
  const text = 'Alpha. Beta'
  const result = splitSentences(text)
  expect(result.map((s) => s.text)).toEqual(['Alpha.', 'Beta'])
})

test('does not split on terminators inside a double-quoted string', () => {
  const text = 'Alpha "with . and ? inside" beta. Gamma.'
  const result = splitSentences(text)
  // Both `.` and `?` inside the quoted string are no-split zones.
  expect(result.map((s) => s.text)).toEqual([
    'Alpha "with . and ? inside" beta.',
    'Gamma.',
  ])
})

test('splits on a single newline (Gherkin-style line-per-step)', () => {
  const text = 'Given I greet "world"\nThen the greeting is "Hello, world!"'
  const result = splitSentences(text)
  // Each line is now its own sentence. The `!` inside the quoted string on
  // line 2 stays a no-split zone.
  expect(result.map((s) => s.text)).toEqual([
    'Given I greet "world"',
    'Then the greeting is "Hello, world!"',
  ])
})

test('splits between terminators outside quoted strings, ignoring those inside', () => {
  const text = 'Alpha "with ! inside". Beta "and ? inside"!'
  const result = splitSentences(text)
  expect(result.map((s) => s.text)).toEqual(['Alpha "with ! inside".', 'Beta "and ? inside"!'])
})
