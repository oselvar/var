import { expect, test } from 'vitest'
import type { Bdd } from '../src/ast.js'
import { scan } from '../src/scanner.js'
import { structure } from '../src/structurer.js'

test('every paragraph becomes a candidate Example, scoped by the headings above it', () => {
  const source =
    '# Withdrawing cash\n\nGiven I have $100 in my account\n\n# Overdraft\n\nGiven I have $10 in my account'
  const bdd: Bdd = structure('test.bdd.md', source, scan(source))
  expect(bdd.examples).toHaveLength(2)
  expect(bdd.examples[0]?.scopeStack).toEqual(['Withdrawing cash'])
  expect(bdd.examples[1]?.scopeStack).toEqual(['Overdraft'])
})

test('two paragraphs under the same heading each become a separate Example', () => {
  const source = '## Example\n\nFirst paragraph.\n\nSecond paragraph.'
  const bdd = structure('test.bdd.md', source, scan(source))
  expect(bdd.examples).toHaveLength(2)
  expect(bdd.examples[0]?.body[0]?.kind).toBe('paragraph')
  expect(bdd.examples[1]?.body[0]?.kind).toBe('paragraph')
  expect(bdd.examples[0]?.scopeStack).toEqual(['Example'])
  expect(bdd.examples[1]?.scopeStack).toEqual(['Example'])
})

test('nested headings stack into an outer→inner scopeStack', () => {
  const source = '## Outer\n\nbody one\n\n### Inner\n\nbody two'
  const bdd = structure('test.bdd.md', source, scan(source))
  expect(bdd.examples).toHaveLength(2)
  expect(bdd.examples[0]?.scopeStack).toEqual(['Outer'])
  expect(bdd.examples[1]?.scopeStack).toEqual(['Outer', 'Inner'])
})

test('a heading at the same level pops the previous sibling off the scope stack', () => {
  const source = '## A\n\nbody A\n\n## B\n\nbody B'
  const bdd = structure('test.bdd.md', source, scan(source))
  expect(bdd.examples).toHaveLength(2)
  expect(bdd.examples[0]?.scopeStack).toEqual(['A'])
  expect(bdd.examples[1]?.scopeStack).toEqual(['B'])
})

test('a paragraph with no enclosing heading has an empty scopeStack', () => {
  const source = 'standalone paragraph'
  const bdd = structure('p.bdd.md', source, scan(source))
  expect(bdd.examples).toHaveLength(1)
  expect(bdd.examples[0]?.scopeStack).toEqual([])
})

test('headings on their own produce no examples', () => {
  const source = '# Title only\n\n## Sub-title\n\n### Another'
  const bdd = structure('h.bdd.md', source, scan(source))
  expect(bdd.examples).toHaveLength(0)
})

test('structure preserves the source string verbatim', () => {
  const source = '# Hi\n\nbody'
  const bdd = structure('p.bdd.md', source, scan(source))
  expect(bdd.source).toBe(source)
  expect(bdd.path).toBe('p.bdd.md')
})

test('orphan tables and fences are recorded on the Bdd', () => {
  const source = '| name | age |\n|------|-----|\n| Bob  | 30  |'
  const bdd = structure('o.bdd.md', source, scan(source))
  expect(bdd.orphanAttachments).toHaveLength(1)
  expect(bdd.orphanAttachments[0]?.kind).toBe('table')
})

test('a table right after a paragraph attaches to that paragraph (not orphan)', () => {
  const source =
    '## Example\n\nGiven these users:\n\n| name | age |\n|------|-----|\n| Bob  | 30  |'
  const bdd = structure('o.bdd.md', source, scan(source))
  expect(bdd.orphanAttachments).toHaveLength(0)
  expect(bdd.examples[0]?.body.some((b) => b.kind === 'table')).toBe(true)
})

test('a heading between a paragraph and a fence makes the fence an orphan', () => {
  const source = '## A\n\npara\n\n## B\n\n```\nfenced body\n```\n'
  const bdd = structure('h.bdd.md', source, scan(source))
  expect(bdd.orphanAttachments).toHaveLength(1)
  expect(bdd.examples[0]?.body.some((b) => b.kind === 'fence')).toBe(false)
})
