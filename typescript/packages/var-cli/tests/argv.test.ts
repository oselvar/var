import { expect, test } from 'vitest'
import { parseArgv } from '../src/argv.js'

test('parses a subcommand with positionals', () => {
  const r = parseArgv(['lint', 'packages/**/*.md'])
  expect(r.command).toBe('lint')
  expect(r.positionals).toEqual(['packages/**/*.md'])
  expect(r.flags).toEqual({})
})

test('parses long flags with values', () => {
  const r = parseArgv(['lint', 'packages/**/*.md', '--file', 'steps/foo.steps.ts'])
  expect(r.flags.file).toBe('steps/foo.steps.ts')
})

test('parses long flags without values as true', () => {
  const r = parseArgv(['lint', '--json'])
  expect(r.flags.json).toBe(true)
})

test('parses --key=value syntax', () => {
  const r = parseArgv(['lint', 'x', '--file=steps/foo.steps.ts'])
  expect(r.flags.file).toBe('steps/foo.steps.ts')
})

test('reports the empty command when no args', () => {
  const r = parseArgv([])
  expect(r.command).toBe('')
})
