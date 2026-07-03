import { defineState } from '@oselvar/var'
import { _resetBuilder } from '@oselvar/var/registry'
import { type CellDiff, CellMismatchError, DocStringMismatchError } from '@oselvar/var-core'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { collectVarExamples, varTestBody } from '../src/runtime.js'

beforeEach(() => _resetBuilder())
afterEach(() => _resetBuilder())

function fakeCtx() {
  const meta: { varResult?: { name: string; status: string; lines: ReadonlyArray<number> } } = {}
  return { ctx: { task: { meta } }, meta }
}

test('collectVarExamples returns one indexed example per BDD example, with step lines', async () => {
  const calls: string[] = []
  const { action } = defineState(() => ({}))
  action('I have {int} cukes', (_ctx, n) => {
    calls.push(`have:${n as number}`)
  })
  action('I eat {int}', (_ctx, n) => {
    calls.push(`eat:${n as number}`)
  })

  const examples = collectVarExamples('belly.md', '# Eating\n\nI have 5 cukes. I eat 2.', {
    reporter: { diagnostic: () => {} },
  })
  // Paragraph-as-test: one paragraph becomes one example; the heading just
  // forms a `describe` scope. The example name is the entire paragraph (with
  // the trailing terminator stripped).
  expect(examples.map((e) => e.name)).toEqual(['I have 5 cukes. I eat 2'])
  expect(examples[0]?.lines).toEqual([3])
  await examples[0]?.run()
  expect(calls).toEqual(['have:5', 'eat:2'])
})

test('varTestBody runs the example and attaches a passed varResult to the task meta', async () => {
  const { action } = defineState(() => ({}))
  action('I pass', () => {})
  const examples = collectVarExamples('ok.md', 'I pass.', { reporter: { diagnostic: () => {} } })
  const { ctx, meta } = fakeCtx()
  await varTestBody(examples, 0, 'I pass', 'ok.md')(ctx)
  expect(meta.varResult).toMatchObject({ name: 'I pass', status: 'passed', lines: [1] })
})

test('varTestBody attaches a failed varResult and rethrows when the example fails', async () => {
  const { action } = defineState(() => ({}))
  action('I fail', () => {
    throw new Error('boom')
  })
  const examples = collectVarExamples('bad.md', 'I fail.', { reporter: { diagnostic: () => {} } })
  const { ctx, meta } = fakeCtx()
  await expect(varTestBody(examples, 0, 'I fail', 'bad.md')(ctx)).rejects.toThrow('boom')
  expect(meta.varResult).toMatchObject({ name: 'I fail', status: 'failed', lines: [1] })
})

test('varTestBody fails loudly when the transform is stale (name or index mismatch)', async () => {
  const { ctx } = fakeCtx()
  await expect(varTestBody([], 0, 'gone', 'x.md')(ctx)).rejects.toThrow(/stale/)
})

const sp = (startOffset: number, endOffset: number) => ({
  startOffset,
  endOffset,
  startLine: 1,
  startCol: 1,
  endLine: 1,
  endCol: 1,
})
const span = sp(0, 1)
const cell = (at: ReturnType<typeof sp>, expected: string, actual: string): CellDiff => ({
  column: 'c',
  span: at,
  expected,
  actual,
  ok: expected === actual,
})

async function rethrown(
  error: Error,
  sourceSuffix = '',
): Promise<Error & { expected?: string; actual?: string }> {
  const { action } = defineState(() => ({}))
  action('It mismatches', () => {
    throw error
  })
  const examples = collectVarExamples('diff.md', `It mismatches.${sourceSuffix}`, {
    reporter: { diagnostic: () => {} },
  })
  const { ctx } = fakeCtx()
  return varTestBody(
    examples,
    0,
    'It mismatches',
    'diff.md',
  )(ctx).then(
    () => {
      throw new Error('expected the example to fail')
    },
    (e: Error) => e,
  )
}

test('a cell mismatch rethrows with the authored line as expected and the actual spliced in', async () => {
  // 'It mismatches.' — the cell span covers 'mismatches' (offsets 3..13).
  const e = await rethrown(new CellMismatchError([cell(sp(3, 13), 'mismatches', 'passes')]))
  expect(e.expected).toBe('It mismatches.')
  expect(e.actual).toBe('It passes.')
})

test('multiple mismatched cells on one line are all spliced into the actual', async () => {
  const e = await rethrown(
    new CellMismatchError([cell(sp(0, 2), 'It', 'We'), cell(sp(3, 13), 'mismatches', 'agree')]),
  )
  expect(e.expected).toBe('It mismatches.')
  expect(e.actual).toBe('We agree.')
})

test('mismatched cells across lines expand expected/actual to the covered lines', async () => {
  // Lines 3-4 of the source; the spans cover LHR (22..25) and OSL (47..50).
  const suffix = '\n\nRoute LHR to JFK.\nRoute AMS to OSL.'
  const e = await rethrown(
    new CellMismatchError([cell(sp(22, 25), 'LHR', 'AAA'), cell(sp(47, 50), 'OSL', 'ZZZ')]),
    suffix,
  )
  expect(e.expected).toBe('Route LHR to JFK.\nRoute AMS to OSL.')
  expect(e.actual).toBe('Route AAA to JFK.\nRoute AMS to ZZZ.')
})

test('a doc string mismatch rethrows with the full expected/actual text', async () => {
  const e = await rethrown(
    new DocStringMismatchError({ span, expected: 'hello\nworld\n', actual: 'hello\nthere\n' }),
  )
  expect(e.expected).toBe('hello\nworld\n')
  expect(e.actual).toBe('hello\nthere\n')
})

test('a plain error rethrows without expected/actual', async () => {
  const e = await rethrown(new Error('boom'))
  expect(e.expected).toBeUndefined()
  expect(e.actual).toBeUndefined()
})
