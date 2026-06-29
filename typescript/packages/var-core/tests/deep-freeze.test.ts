import { expect, test } from 'vitest'
import { deepFreeze } from '../src/deep-freeze.js'

test('deepFreeze freezes nested objects and arrays', () => {
  const o = deepFreeze({ a: { b: 1 }, list: [{ c: 2 }] })
  expect(Object.isFrozen(o)).toBe(true)
  expect(Object.isFrozen(o.a)).toBe(true)
  expect(Object.isFrozen(o.list)).toBe(true)
  expect(Object.isFrozen(o.list[0])).toBe(true)
})

test('deepFreeze returns primitives and null unchanged', () => {
  expect(deepFreeze(5)).toBe(5)
  expect(deepFreeze('x')).toBe('x')
  expect(deepFreeze(null)).toBe(null)
})

test('deepFreeze returns the same reference (idempotent on frozen input)', () => {
  const f = Object.freeze({ a: 1 })
  expect(deepFreeze(f)).toBe(f)
})

test('deepFreeze leaves class instances live (their methods still mutate)', () => {
  class Box {
    items: number[] = []
    add(n: number) {
      this.items.push(n)
    }
  }
  const box = new Box()
  const state = deepFreeze({ box, label: 'x' })
  expect(Object.isFrozen(state)).toBe(true) // enclosing plain object IS frozen
  expect(Object.isFrozen(state.box)).toBe(false) // class instance left live
  expect(() => state.box.add(1)).not.toThrow()
  expect(state.box.items).toEqual([1])
})

test('deepFreeze leaves Date instances live', () => {
  const state = deepFreeze({ when: new Date('2026-06-12T00:00:00Z') })
  expect(Object.isFrozen(state.when)).toBe(false)
})
