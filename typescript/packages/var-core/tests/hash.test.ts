import { expect, test } from 'vitest'
import { hashSource } from '../src/hash.js'

test('hashSource is deterministic for the same input', () => {
  expect(hashSource('abc')).toBe(hashSource('abc'))
})

test('hashSource changes for a one-character difference', () => {
  expect(hashSource('abc')).not.toBe(hashSource('abd'))
})

test('hashSource is namespaced with the algorithm prefix', () => {
  expect(hashSource('abc').startsWith('fnv1a:')).toBe(true)
})

test('hashSource matches a stable known vector (pins the algorithm)', () => {
  expect(hashSource('hello')).toBe('fnv1a:4f9f2cab')
  expect(hashSource('abc')).toBe('fnv1a:1a47e90b')
  expect(hashSource('# Title\n')).toBe('fnv1a:4eace75e')
})
