import { expect, test } from 'vitest'
import * as bdd from '../src/index.js'

test('public surface exposes parse, plan, registry, and types', () => {
  expect(typeof bdd.parse).toBe('function')
  expect(typeof bdd.plan).toBe('function')
  expect(typeof bdd.createRegistry).toBe('function')
  expect(typeof bdd.addStep).toBe('function')
})

test('end-to-end: parse + plan with a simple expression', () => {
  let r = bdd.createRegistry()
  r = bdd.addStep(r, {
    expression: 'I have {int} cukes',
    expressionSourceFile: 'inline',
    expressionSourceLine: 1,
    handler: () => {},
  })
  const result = bdd.plan(bdd.parse('hello.bdd.md', '# Belly\n\nGiven I have 5 cukes.'), r)
  expect(result.examples).toHaveLength(1)
  expect(result.examples[0]?.steps[0]?.text).toBe('I have 5 cukes')
  expect(result.examples[0]?.steps[0]?.args).toEqual([5])
})

test('public surface re-exports snippet + diagnostic factories', () => {
  expect(typeof bdd.generateSnippet).toBe('function')
  expect(typeof bdd.missingStep).toBe('function')
  expect(typeof bdd.orphanAttachment).toBe('function')
})
