import { expect, test } from 'vitest'
import { defineState } from '../src/index.js'
import { _customParameterTypes, _resetBuilder } from '../src/registry.js'

test('_customParameterTypes projects name and regexp source', () => {
  _resetBuilder()
  defineState(() => ({}), {
    airport: { regexp: /[A-Z]{3}/, transformer: (code: string) => code.toLowerCase() },
  })
  expect(_customParameterTypes()).toEqual([{ name: 'airport', regexp: '[A-Z]{3}' }])
  _resetBuilder()
  expect(_customParameterTypes()).toEqual([])
})

test('_customParameterTypes rejects the regexp-array form for now', () => {
  _resetBuilder()
  defineState(() => ({}), {
    code: { regexp: [/[A-Z]{3}/, /[0-9]{3}/], transformer: (c: string) => c },
  })
  expect(() => _customParameterTypes()).toThrowError(/not supported/i)
  _resetBuilder()
})
