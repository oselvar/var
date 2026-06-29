import { ParameterTypeRegistry } from '@cucumber/cucumber-expressions'
import { expect, test } from 'vitest'
import { addStep, createRegistry, defineParameterType } from '../src/registry.js'

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

test('defineParameterType makes a custom type available to subsequent step compilations', () => {
  let r = createRegistry()
  r = defineParameterType(r, { name: 'airport', regexp: /[A-Z]{3}/ })
  // Compiling an expression that uses {airport} should now succeed without
  // an UndefinedParameterTypeError.
  expect(() =>
    addStep(r, {
      expression: 'I fly to {airport}',
      expressionSourceFile: 'steps.ts',
      expressionSourceLine: 1,
      handler: () => {},
    }),
  ).not.toThrow()
})

test('defineParameterType returned step actually matches the regex at runtime', () => {
  let r = createRegistry()
  r = defineParameterType(r, {
    name: 'airport',
    regexp: /[A-Z]{3}/,
    transformer: (raw) => raw.toLowerCase(),
  })
  r = addStep(r, {
    expression: 'I fly to {airport}',
    expressionSourceFile: 'steps.ts',
    expressionSourceLine: 1,
    handler: () => {},
  })
  const match = r.steps[0]?.compiled.match('I fly to LHR')
  expect(match).not.toBeNull()
  expect(match?.[0]?.getValue(undefined)).toBe('lhr')
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

test('addStep carries the step kind through to the registration', () => {
  const r = addStep(createRegistry(), {
    expression: 'I greet {string}',
    expressionSourceFile: 'a.steps.ts',
    expressionSourceLine: 1,
    handler: () => {},
    kind: 'sensor',
  })
  expect(r.steps[0]?.kind).toBe('sensor')
})

test('kind is optional (legacy step path)', () => {
  const r = addStep(createRegistry(), {
    expression: 'I greet {string}',
    expressionSourceFile: 'a.steps.ts',
    expressionSourceLine: 1,
    handler: () => {},
  })
  expect(r.steps[0]?.kind).toBeUndefined()
})
