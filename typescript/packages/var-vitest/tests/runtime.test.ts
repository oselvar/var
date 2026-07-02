import { defineState } from '@oselvar/var'
import { _resetBuilder } from '@oselvar/var/registry'
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
