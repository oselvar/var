import { expect, test } from 'vitest'
import { parse } from '../src/parse.js'

test('parse returns a VarDoc whose Examples come from paragraphs and carry the heading stack', () => {
  const source = '# Hello\n\nbody'
  const varDoc = parse('hello.md', source)
  expect(varDoc.path).toBe('hello.md')
  expect(varDoc.source).toBe(source)
  // One paragraph, one Example. Example name is computed by the planner, not
  // captured here; the structurer's job is just to track scope + body.
  expect(varDoc.examples).toHaveLength(1)
  expect(varDoc.examples[0]?.scopeStack).toEqual(['Hello'])
})
