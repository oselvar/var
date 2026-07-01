import { expect, test } from 'vitest'
import { createTypeScriptSnippetEmitter } from '../src/snippet-emitter.js'

test('maps a Number-typed parameter type to "number"', () => {
  const emitter = createTypeScriptSnippetEmitter()
  expect(emitter.typeNameFor({ type: Number })).toBe('number')
})

test('maps anything else, including custom parameter types, to "string"', () => {
  const emitter = createTypeScriptSnippetEmitter()
  expect(emitter.typeNameFor({ type: String })).toBe('string')
  expect(emitter.typeNameFor({ type: Boolean })).toBe('string')
})
