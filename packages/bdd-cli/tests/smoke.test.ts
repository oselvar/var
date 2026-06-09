import { expect, test } from 'vitest'
import { VERSION } from '../src/index.js'

test('package exposes a version constant', () => {
  expect(VERSION).toBe('0.0.0')
})
