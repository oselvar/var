import { ParameterTypeRegistry } from '@cucumber/cucumber-expressions'
import { expect, test } from 'vitest'
import { addStep, createRegistry } from '../src/registry.js'

test('createRegistry returns an empty registry with default parameter types', () => {
  const r = createRegistry()
  expect(r.steps).toHaveLength(0)
  expect(r.parameterTypes).toBeInstanceOf(ParameterTypeRegistry)
})

test('addStep returns a new registry; original is unchanged', () => {
  const r0 = createRegistry()
  const handler = (): void => {}
  const r1 = addStep(r0, {
    expression: 'I have {int} cukes',
    expressionSourceFile: 'steps.ts',
    expressionSourceLine: 1,
    handler,
  })
  expect(r0.steps).toHaveLength(0)
  expect(r1.steps).toHaveLength(1)
  expect(r1.steps[0]?.expression).toBe('I have {int} cukes')
})

test('addStep throws on duplicate expressions, listing both source positions', () => {
  let r = createRegistry()
  r = addStep(r, {
    expression: 'I have {int} cukes',
    expressionSourceFile: 'a.ts',
    expressionSourceLine: 3,
    handler: () => {},
  })
  expect(() =>
    addStep(r, {
      expression: 'I have {int} cukes',
      expressionSourceFile: 'b.ts',
      expressionSourceLine: 9,
      handler: () => {},
    }),
  ).toThrow(/duplicate step definition.+a\.ts:3.+b\.ts:9/)
})
