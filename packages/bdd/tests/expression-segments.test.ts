import { expect, test } from 'vitest'
import {
  diffExpressions,
  expressionSegments,
  renderExpression,
} from '../src/expression-segments.js'
import { createRegistry, defineParameterType } from '../src/registry.js'

test('segments a simple expression with one parameter', () => {
  const r = createRegistry()
  const segs = expressionSegments('I greet {string}', r)
  expect(segs.map((s) => s.kind)).toEqual(['literal', 'param'])
  expect(segs[0]).toMatchObject({ kind: 'literal', text: 'I greet ' })
  expect(segs[1]).toMatchObject({ kind: 'param', name: 'string' })
})

test('segments custom parameter types like {airport}', () => {
  let r = createRegistry()
  r = defineParameterType(r, { name: 'airport', regexp: /[A-Z]{3}/ })
  const segs = expressionSegments('I fly from {airport} to {airport}', r)
  expect(segs.map((s) => s.kind)).toEqual(['literal', 'param', 'literal', 'param'])
  expect(segs.filter((s) => s.kind === 'param').map((s) => (s as { name: string }).name)).toEqual([
    'airport',
    'airport',
  ])
})

test('segments preserve start/end so callers can splice the expression source', () => {
  const r = createRegistry()
  const expr = 'I greet {string}'
  const segs = expressionSegments(expr, r)
  expect(expr.slice(segs[1]!.start, segs[1]!.end)).toBe('{string}')
})

test('diffExpressions reports identical expressions as no changes', () => {
  const r = createRegistry()
  const d = diffExpressions('I greet {string}', 'I greet {string}', r)
  expect(d.paramFates).toEqual([
    { kind: 'kept', oldIndex: 0, newIndex: 0, nameUnchanged: true },
  ])
  expect(d.literalChanged).toBe(false)
})

test('diffExpressions detects literal-only changes', () => {
  const r = createRegistry()
  const d = diffExpressions('I greet {string}', 'I welcome {string}', r)
  expect(d.literalChanged).toBe(true)
  expect(d.paramFates).toEqual([
    { kind: 'kept', oldIndex: 0, newIndex: 0, nameUnchanged: true },
  ])
})

test('diffExpressions detects an added parameter at the end', () => {
  const r = createRegistry()
  const d = diffExpressions('I greet {string}', 'I greet {string} {int} times', r)
  expect(d.paramFates).toEqual([
    { kind: 'kept', oldIndex: 0, newIndex: 0, nameUnchanged: true },
    { kind: 'added', newIndex: 1, name: 'int' },
  ])
})

test('diffExpressions detects a removed parameter', () => {
  const r = createRegistry()
  const d = diffExpressions('I greet {string} {int} times', 'I greet {string}', r)
  expect(d.paramFates).toEqual([
    { kind: 'kept', oldIndex: 0, newIndex: 0, nameUnchanged: true },
    { kind: 'removed', oldIndex: 1 },
  ])
})

test('diffExpressions reports a type change as kept-but-nameChanged', () => {
  let r = createRegistry()
  r = defineParameterType(r, { name: 'airport', regexp: /[A-Z]{3}/ })
  const d = diffExpressions('I fly to {string}', 'I fly to {airport}', r)
  expect(d.paramFates).toEqual([
    { kind: 'kept', oldIndex: 0, newIndex: 0, nameUnchanged: false },
  ])
})

test('renderExpression rebuilds the matched text from a new expression + captured values', () => {
  const r = createRegistry()
  expect(renderExpression('I welcome {string}', ['"world"'], r)).toBe('I welcome "world"')
})

test('renderExpression preserves verbatim values for custom parameter types', () => {
  let r = createRegistry()
  r = defineParameterType(r, { name: 'airport', regexp: /[A-Z]{3}/ })
  expect(renderExpression('I drive from {airport} to {airport}', ['LHR', 'JFK'], r)).toBe(
    'I drive from LHR to JFK',
  )
})

test('renderExpression throws when too few values are supplied', () => {
  const r = createRegistry()
  expect(() => renderExpression('I have {int} cukes and {string}', ['5'], r)).toThrow(/parameter/)
})

test('renderExpression throws when too many values are supplied', () => {
  const r = createRegistry()
  expect(() => renderExpression('I have {int} cukes', ['5', '"oops"'], r)).toThrow(/parameter/)
})
