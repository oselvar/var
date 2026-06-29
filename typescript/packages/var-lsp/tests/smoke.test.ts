import { expect, test } from 'vitest'
import { registerHandlers } from '../src/server.js'

test('registerHandlers is a function', () => {
  expect(typeof registerHandlers).toBe('function')
})
