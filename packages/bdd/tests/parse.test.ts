import { expect, test } from 'vitest'
import { parse } from '../src/parse.js'

test('parse returns a Bdd whose Examples come from paragraphs and carry the heading stack', () => {
  const source = '# Hello\n\nbody'
  const bdd = parse('hello.bdd.md', source)
  expect(bdd.path).toBe('hello.bdd.md')
  expect(bdd.source).toBe(source)
  // One paragraph, one Example. Example name is computed by the planner, not
  // captured here; the structurer's job is just to track scope + body.
  expect(bdd.examples).toHaveLength(1)
  expect(bdd.examples[0]?.scopeStack).toEqual(['Hello'])
})
