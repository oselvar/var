import { addStep, createRegistry, type Diagnostic } from '@oselvar/var-core'
import { expect, test } from 'vitest'
import { examplesWithRuns, planSpec, RecordingReporter } from '../src/run.js'

function makeRegistry() {
  let r = createRegistry()
  r = addStep(r, {
    expression: 'I have {int} cucumbers',
    expressionSourceFile: 'steps.ts',
    expressionSourceLine: 1,
    kind: 'context',
    handler: () => {},
  })
  r = addStep(r, {
    expression: 'I eat {int} cucumbers',
    expressionSourceFile: 'steps.ts',
    expressionSourceLine: 2,
    kind: 'action',
    handler: () => {},
  })
  r = addStep(r, {
    expression: 'I should have {int} cucumbers left',
    expressionSourceFile: 'steps.ts',
    expressionSourceLine: 3,
    kind: 'sensor',
    handler: () => {},
  })
  return r
}

test('planSpec returns an ExecutionPlan with examples and steps', () => {
  const source = [
    '# Cucumbers',
    '',
    'I have 10 cucumbers. I eat 3 cucumbers. I should have 7 cucumbers left.',
  ].join('\n')

  const result = planSpec('spec.md', source, makeRegistry())

  expect(result.diagnostics).toHaveLength(0)
  expect(result.examples).toHaveLength(1)
  const ex = result.examples[0]
  if (!ex) throw new Error('no example')
  expect(ex.name).toBe('I have 10 cucumbers. I eat 3 cucumbers. I should have 7 cucumbers left')
  expect(ex.scopeStack).toEqual(['Cucumbers'])
  expect(ex.steps.map((s) => s.text)).toEqual([
    'I have 10 cucumbers',
    'I eat 3 cucumbers',
    'I should have 7 cucumbers left',
  ])
})

test('planSpec uses an empty scannerPlugins array when not provided', () => {
  const source = '# Simple\n\nI have 5 cucumbers.\n'
  const result = planSpec('spec.md', source, makeRegistry())
  expect(result.varDoc.source).toBe(source)
})

test('planSpec accepts explicit scannerPlugins', () => {
  const source = '# Simple\n\nI have 5 cucumbers.\n'
  // Pass an empty plugins array explicitly — should behave identically.
  const result = planSpec('spec.md', source, makeRegistry(), [])
  expect(result.examples).toHaveLength(1)
})

test('RecordingReporter records diagnostics', () => {
  const reporter = new RecordingReporter()
  expect(reporter.diagnostics).toHaveLength(0)

  const d: Diagnostic = {
    severity: 'error',
    code: 'ambiguous-match',
    message: 'Ambiguous step',
    span: { startOffset: 0, endOffset: 5, startLine: 1, startCol: 1, endLine: 1, endCol: 6 },
  }
  reporter.diagnostic(d)
  expect(reporter.diagnostics).toHaveLength(1)
  expect(reporter.diagnostics[0]).toBe(d)
})

test('examplesWithRuns pairs examples with run functions', async () => {
  const source = [
    '# Calc',
    '',
    'I have 10 cucumbers. I eat 3 cucumbers. I should have 7 cucumbers left.',
  ].join('\n')
  const plan = planSpec('spec.md', source, makeRegistry())
  const reporter = new RecordingReporter()
  const pairs = examplesWithRuns(plan, () => ({}), reporter)

  expect(pairs).toHaveLength(1)
  const { example, run } = pairs[0]!
  expect(example.name).toBe(
    'I have 10 cucumbers. I eat 3 cucumbers. I should have 7 cucumbers left',
  )
  // Passing run resolves without throwing
  await expect(run()).resolves.toBeUndefined()
})

test('examplesWithRuns — failing run rejects', async () => {
  // Build a registry whose sensor always throws
  let r = createRegistry()
  r = addStep(r, {
    expression: 'the value is {int}',
    expressionSourceFile: 'steps.ts',
    expressionSourceLine: 1,
    kind: 'sensor',
    handler: (_state, _expected) => {
      throw new Error('intentional failure')
    },
  })
  const source = '# Test\n\nthe value is 42.\n'
  const plan = planSpec('spec.md', source, r)
  const reporter = new RecordingReporter()
  const pairs = examplesWithRuns(plan, () => ({}), reporter)

  expect(pairs).toHaveLength(1)
  const { run } = pairs[0]!
  // Failing run rejects
  await expect(run()).rejects.toThrow('intentional failure')
})

test('RecordingReporter accumulates multiple diagnostics', () => {
  const reporter = new RecordingReporter()
  const makeD = (msg: string): Diagnostic => ({
    severity: 'warning',
    code: 'ambiguous-match',
    message: msg,
    span: { startOffset: 0, endOffset: 1, startLine: 1, startCol: 1, endLine: 1, endCol: 2 },
  })
  reporter.diagnostic(makeD('first'))
  reporter.diagnostic(makeD('second'))
  expect(reporter.diagnostics).toHaveLength(2)
  expect(reporter.diagnostics.map((d) => d.message)).toEqual(['first', 'second'])
})
