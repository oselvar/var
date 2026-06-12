import { ParameterType } from '@cucumber/cucumber-expressions'
import { expect, test } from 'vitest'
import { createRegistry } from '../src/registry.js'
import { generateSnippet } from '../src/snippet.js'

test('integers become {int}', () => {
  const s = generateSnippet('I have 5 cukes in my belly', createRegistry())
  expect(s.expression).toBe('I have {int} cukes in my belly')
  expect(s.handlerSignature).toBe('(ctx, count: number) => {')
})

test('decimals become {float}', () => {
  const s = generateSnippet('the price is 3.14', createRegistry())
  expect(s.expression).toBe('the price is {float}')
  expect(s.handlerSignature).toBe('(ctx, price: number) => {')
})

test('double-quoted strings become {string}', () => {
  const s = generateSnippet('the user "Alice" arrives', createRegistry())
  expect(s.expression).toBe('the user {string} arrives')
  expect(s.handlerSignature).toBe('(ctx, user: string) => {')
})

test('multiple parameters infer distinct names', () => {
  const s = generateSnippet('I have 5 cukes and 3 oranges', createRegistry())
  expect(s.expression).toBe('I have {int} cukes and {int} oranges')
  expect(s.handlerSignature).toBe('(ctx, count: number, count2: number) => {')
})

test('leading keyword is NOT stripped — the selection is the expression verbatim', () => {
  // No Given/When/Then heuristics. If the user selects narration, they keep
  // it in the generated cucumber expression.
  const s = generateSnippet('Given I have 5 cukes', createRegistry())
  expect(s.expression).toBe('Given I have {int} cukes')
})

test('registered custom parameter types are preferred over built-ins', () => {
  const r = createRegistry()
  r.parameterTypes.defineParameterType(
    new ParameterType('color', /red|green|blue/, String, (s: string) => s, true, true),
  )
  const s = generateSnippet('the hat is red', r)
  expect(s.expression).toBe('the hat is {color}')
  expect(s.handlerSignature).toBe('(ctx, color: string) => {')
})

test('accepts a custom template via options.template', () => {
  const s = generateSnippet('I have 5 cukes', createRegistry(), {
    template: '[{{expression}}] :: ({{args}})',
  })
  expect(s.fullCode).toBe('[I have {int} cukes] :: (ctx, count: number)')
})

test('default template renders the "Write code here" comment and an Error throw', () => {
  const s = generateSnippet('I have 5 cukes', createRegistry())
  expect(s.fullCode).toContain("step('I have {int} cukes', (ctx, count: number) => {")
  expect(s.fullCode).toContain('Write code here that turns the phrase above into concrete actions')
  expect(s.fullCode).toContain("throw new Error('not implemented')")
})

test('a custom {airport} parameter type drives both the expression and the arg name', () => {
  const r = createRegistry()
  r.parameterTypes.defineParameterType(
    new ParameterType('airport', /[A-Z]{3}/, String, (s: string) => s, true, false),
  )
  const s = generateSnippet('I fly to LHR', r)
  expect(s.expression).toBe('I fly to {airport}')
  expect(s.handlerSignature).toBe('(ctx, airport: string) => {')
})
