import { expect, test } from 'vitest'
import { partitionGlobs } from '../src/globs.js'

test('splits plain patterns into includes, with no excludes', () => {
  expect(partitionGlobs(['docs/**/*.md', 'features/**/*.feature'])).toEqual({
    includes: ['docs/**/*.md', 'features/**/*.feature'],
    excludes: [],
  })
})

test('routes `!`-prefixed patterns into excludes with the bang stripped', () => {
  expect(partitionGlobs(['docs/tutorial/**/*.md', '!docs/tutorial/05-roman-numerals.md'])).toEqual({
    includes: ['docs/tutorial/**/*.md'],
    excludes: ['docs/tutorial/05-roman-numerals.md'],
  })
})

test('handles an all-excludes list (no includes)', () => {
  expect(partitionGlobs(['!a.md', '!b.md'])).toEqual({
    includes: [],
    excludes: ['a.md', 'b.md'],
  })
})

test('returns empty arrays for an empty pattern list', () => {
  expect(partitionGlobs([])).toEqual({ includes: [], excludes: [] })
})
