import { expect, test } from 'vitest'
import { steps } from '../src/index.ts'
import { _customParameterTypes, _resetBuilder } from '../src/registry.ts'

test('_customParameterTypes projects name and regexp source', () => {
  _resetBuilder()
  steps(() => ({})).param('airport', /[A-Z]{3}/, (code) => code.toLowerCase())
  expect(_customParameterTypes()).toEqual([{ name: 'airport', regexp: '[A-Z]{3}' }])
  _resetBuilder()
  expect(_customParameterTypes()).toEqual([])
})

test('_customParameterTypes rejects the regexp-array form for now', () => {
  _resetBuilder()
  steps(() => ({})).param('code', [/[A-Z]{3}/, /[0-9]{3}/], (c) => c)
  expect(() => _customParameterTypes()).toThrowError(/not supported/i)
  _resetBuilder()
})
