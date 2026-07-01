import { expect, test } from 'vitest'
import * as varApi from '../src/index.js'

test('public surface exposes parse, plan, registry, and types', () => {
  expect(typeof varApi.parse).toBe('function')
  expect(typeof varApi.plan).toBe('function')
  expect(typeof varApi.createRegistry).toBe('function')
  expect(typeof varApi.addStep).toBe('function')
})

test('end-to-end: parse + plan with a simple expression', () => {
  let r = varApi.createRegistry()
  r = varApi.addStep(r, {
    expression: 'I have {int} cukes',
    expressionSourceFile: 'inline',
    expressionSourceLine: 1,
    handler: () => {},
  })
  const result = varApi.plan(varApi.parse('hello.md', '# Belly\n\nGiven I have 5 cukes.'), r)
  expect(result.examples).toHaveLength(1)
  expect(result.examples[0]?.steps[0]?.text).toBe('I have 5 cukes')
  expect(result.examples[0]?.steps[0]?.args).toEqual([5])
})

test('public surface re-exports diagnostic factories', () => {
  expect(typeof varApi.ambiguousMatch).toBe('function')
})
