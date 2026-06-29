import { expect, test } from 'vitest'
import { deepEqual } from '../src/deep-equal.js'

test('primitives compare by value', () => {
  expect(deepEqual(3, 3)).toBe(true)
  expect(deepEqual(3, 4)).toBe(false)
  expect(deepEqual('a', 'a')).toBe(true)
  expect(deepEqual(Number.NaN, Number.NaN)).toBe(true)
  expect(deepEqual(null, undefined)).toBe(false)
})

test('arrays compare element-wise', () => {
  expect(deepEqual([1, 2, 3], [1, 2, 3])).toBe(true)
  expect(deepEqual([1, 2], [1, 2, 3])).toBe(false)
})

test('plain objects compare by keys and values across references', () => {
  expect(deepEqual({ a: 1, b: { c: 2 } }, { a: 1, b: { c: 2 } })).toBe(true)
  expect(deepEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false)
})

test('Dates compare by time', () => {
  expect(deepEqual(new Date('2026-01-01'), new Date('2026-01-01'))).toBe(true)
  expect(deepEqual(new Date('2026-01-01'), new Date('2026-01-02'))).toBe(false)
})

test('Maps compare by entries', () => {
  expect(deepEqual(new Map([['a', 1]]), new Map([['a', 1]]))).toBe(true)
  expect(deepEqual(new Map([['a', 1]]), new Map([['a', 2]]))).toBe(false)
})

test('Sets compare by membership', () => {
  expect(deepEqual(new Set([1, 2]), new Set([1, 2]))).toBe(true)
  expect(deepEqual(new Set([1, 2]), new Set([1, 3]))).toBe(false)
})
