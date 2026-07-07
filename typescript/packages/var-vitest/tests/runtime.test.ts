import { steps } from '@oselvar/var'
import { _resetBuilder } from '@oselvar/var/registry'
import {
  type CellDiff,
  CellMismatchError,
  type Diagnostic,
  DocStringMismatchError,
  type SpecBaseline,
} from '@oselvar/var-core'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { collectVarExamples, varTestBody } from '../src/runtime.ts'

beforeEach(() => _resetBuilder())
afterEach(() => {
  _resetBuilder()
  delete process.env.VAR_UPDATE
})

// Capture diagnostics instead of the default reporter (which would register
// real vitest tests inside this test file).
function capturingReporter(): {
  reporter: { diagnostic: (d: Diagnostic) => void }
  diags: Diagnostic[]
} {
  const diags: Diagnostic[] = []
  return { reporter: { diagnostic: (d) => diags.push(d) }, diags }
}

function fakeCtx() {
  const meta: { varResult?: { name: string; status: string; lines: ReadonlyArray<number> } } = {}
  return { ctx: { task: { meta } }, meta }
}

test('collectVarExamples returns one indexed example per BDD example, with step lines', async () => {
  const calls: string[] = []
  const { stimulus } = steps(() => ({}))
  stimulus('I have {int} cukes', (_ctx, n) => {
    calls.push(`have:${n as number}`)
  })
  stimulus('I eat {int}', (_ctx, n) => {
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

test('the drift gate reports a baseline example that no longer matches', () => {
  // No steps registered, so "The vault is sealed." matches nothing; the
  // baseline says it was an example → drift.
  const baseline: SpecBaseline = {
    sourceHash: 'fnv1a:00000000',
    examples: [{ name: 'The vault is sealed', line: 1 }],
  }
  const { reporter, diags } = capturingReporter()
  collectVarExamples('vault.md', 'The vault is sealed.', { reporter, baseline })
  expect(diags.map((d) => d.code)).toContain('drift')
  expect(diags.find((d) => d.code === 'drift')?.message).toContain('The vault is sealed')
})

test('the drift gate stays quiet when the baseline example still matches', () => {
  const { stimulus } = steps(() => ({}))
  stimulus('I open the vault', () => {})
  const baseline: SpecBaseline = {
    sourceHash: 'fnv1a:00000000',
    examples: [{ name: 'I open the vault', line: 1 }],
  }
  const { reporter, diags } = capturingReporter()
  collectVarExamples('vault.md', 'I open the vault.', { reporter, baseline })
  expect(diags.map((d) => d.code)).not.toContain('drift')
})

test('VAR_UPDATE skips the drift gate', () => {
  process.env.VAR_UPDATE = '1'
  const baseline: SpecBaseline = {
    sourceHash: 'fnv1a:00000000',
    examples: [{ name: 'The vault is sealed', line: 1 }],
  }
  const { reporter, diags } = capturingReporter()
  collectVarExamples('vault.md', 'The vault is sealed.', { reporter, baseline })
  expect(diags).toEqual([])
})

test('varTestBody runs the example and attaches a passed varResult to the task meta', async () => {
  const { stimulus } = steps(() => ({}))
  stimulus('I pass', () => {})
  const examples = collectVarExamples('ok.md', 'I pass.', { reporter: { diagnostic: () => {} } })
  const { ctx, meta } = fakeCtx()
  await varTestBody(examples, 0, 'I pass', 'ok.md')(ctx)
  expect(meta.varResult).toMatchObject({ name: 'I pass', status: 'passed', lines: [1] })
})

test('varTestBody attaches a failed varResult and rethrows when the example fails', async () => {
  const { stimulus } = steps(() => ({}))
  stimulus('I fail', () => {
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

async function rethrown(error: Error): Promise<Error & { expected?: string; actual?: string }> {
  const { stimulus } = steps(() => ({}))
  stimulus('It mismatches', () => {
    throw error
  })
  const examples = collectVarExamples('diff.md', 'It mismatches.', {
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

test('a single-cell mismatch rethrows with the bare cell values as expected/actual', async () => {
  const e = await rethrown(new CellMismatchError([cell(sp(3, 13), 'JMK', 'JFK')]))
  expect(e.expected).toBe('JMK')
  expect(e.actual).toBe('JFK')
})

test('multiple mismatched cells diff as value lists in document order', async () => {
  // Deliberately passed out of document order; the spans put LGR first.
  const e = await rethrown(
    new CellMismatchError([cell(sp(10, 13), 'JMK', 'JFK'), cell(sp(3, 6), 'LGR', 'LHR')]),
  )
  expect(e.expected).toBe('["LGR", "JMK"]')
  expect(e.actual).toBe('["LHR", "JFK"]')
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
