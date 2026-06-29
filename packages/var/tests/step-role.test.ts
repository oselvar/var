import { expect, test } from 'vitest'
import { inferStepRole } from '../src/step-role.js'

test('no step after the selection → sensor (expectation last)', () => {
  expect(inferStepRole({ before: ['action'], after: [] })).toBe('sensor')
})

test('a sensor follows and no action sits between → action', () => {
  expect(inferStepRole({ before: ['context'], after: ['sensor'] })).toBe('action')
})

test('nothing before and a step after → context', () => {
  expect(inferStepRole({ before: [], after: ['action'] })).toBe('context')
})

test('otherwise → action', () => {
  expect(inferStepRole({ before: ['action'], after: ['action'] })).toBe('action')
})
