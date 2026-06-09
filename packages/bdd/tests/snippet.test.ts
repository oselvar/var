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

test('leading keyword is stripped before snippet generation', () => {
  const s = generateSnippet('Given I have 5 cukes', createRegistry())
  expect(s.expression).toBe('I have {int} cukes')
})
