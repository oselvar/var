import { expect, test } from 'vitest'
import { isCellMismatchError } from '../src/cell-diff.js'
import { isDocStringMismatchError } from '../src/doc-string-diff.js'
import { executePlan, type ExecutePorts } from '../src/execute.js'
import { parse } from '../src/parse.js'
import { plan } from '../src/plan.js'
import { addStep, createRegistry } from '../src/registry.js'

// Minimal ports that run the example body and surface the thrown error.
function runOne(
  source: string,
  register: (r: ReturnType<typeof createRegistry>) => ReturnType<typeof createRegistry>,
) {
  let registry = createRegistry()
  registry = register(registry)
  // parse(path, source) — path first, source second
  const doc = parse('x.var.md', source)
  const p = plan(doc, registry)
  let caught: unknown
  const ports: ExecutePorts = {
    reporter: { diagnostic: () => {} },
    sink: {
      example: (_name, fn) => {
        void (fn() as Promise<void>).catch((e) => {
          caught = e
        })
      },
    },
  }
  executePlan(p, ports)
  return () => caught
}

test('a sensor returning a mismatching inline value throws CellMismatchError', async () => {
  const getErr = runOne(
    '# X\n\nI should have 3 cukes in my big belly\n',
    (r) =>
      addStep(r, {
        expression: 'I should have {int} cukes in my {word} belly',
        expressionSourceFile: 's.steps.ts',
        expressionSourceLine: 1,
        kind: 'sensor',
        handler: (_ctx, _count, name) => [4, name],
      }),
  )
  await new Promise((res) => setTimeout(res, 0))
  expect(isCellMismatchError(getErr())).toBe(true)
})

test('a sensor returning matching inline values passes', async () => {
  const getErr = runOne(
    '# X\n\nI should have 3 cukes in my big belly\n',
    (r) =>
      addStep(r, {
        expression: 'I should have {int} cukes in my {word} belly',
        expressionSourceFile: 's.steps.ts',
        expressionSourceLine: 1,
        kind: 'sensor',
        handler: (_ctx, count, name) => [count, name],
      }),
  )
  await new Promise((res) => setTimeout(res, 0))
  expect(getErr()).toBeUndefined()
})

test('a sensor returning the wrong tuple length throws ReturnShapeError', async () => {
  const getErr = runOne(
    '# X\n\nI should have 3 cukes in my big belly\n',
    (r) =>
      addStep(r, {
        expression: 'I should have {int} cukes in my {word} belly',
        expressionSourceFile: 's.steps.ts',
        expressionSourceLine: 1,
        kind: 'sensor',
        handler: () => [4],
      }),
  )
  await new Promise((res) => setTimeout(res, 0))
  expect((getErr() as Error).name).toBe('ReturnShapeError')
})

test('an action that returns a value throws ReturnShapeError', async () => {
  const getErr = runOne(
    '# X\n\nI fly to LHR\n',
    (r) =>
      addStep(r, {
        expression: 'I fly to {word}',
        expressionSourceFile: 's.steps.ts',
        expressionSourceLine: 1,
        kind: 'action',
        handler: () => 'oops',
      }),
  )
  await new Promise((res) => setTimeout(res, 0))
  expect((getErr() as Error).name).toBe('ReturnShapeError')
})

test('a context step that returns a value throws ReturnShapeError', async () => {
  const getErr = runOne(
    '# X\n\nI set up the world\n',
    (r) =>
      addStep(r, {
        expression: 'I set up the world',
        expressionSourceFile: 's.steps.ts',
        expressionSourceLine: 1,
        kind: 'context',
        handler: () => 'oops',
      }),
  )
  await new Promise((res) => setTimeout(res, 0))
  expect((getErr() as Error).name).toBe('ReturnShapeError')
})

test('a sensor with a trailing data table returning the correct table passes', async () => {
  const source = '# X\n\nI list the items:\n\n| name | value |\n| ---- | ----- |\n| foo  | bar   |\n'
  const getErr = runOne(
    source,
    (r) =>
      addStep(r, {
        expression: 'I list the items',
        expressionSourceFile: 's.steps.ts',
        expressionSourceLine: 1,
        kind: 'sensor',
        handler: () => [[{ name: 'foo', value: 'bar' }]],
      }),
  )
  await new Promise((res) => setTimeout(res, 0))
  expect(getErr()).toBeUndefined()
})

test('a sensor with a trailing data table returning the wrong cell throws CellMismatchError', async () => {
  const source = '# X\n\nI list the items:\n\n| name | value |\n| ---- | ----- |\n| foo  | bar   |\n'
  const getErr = runOne(
    source,
    (r) =>
      addStep(r, {
        expression: 'I list the items',
        expressionSourceFile: 's.steps.ts',
        expressionSourceLine: 1,
        kind: 'sensor',
        handler: () => [[{ name: 'foo', value: 'WRONG' }]],
      }),
  )
  await new Promise((res) => setTimeout(res, 0))
  expect(isCellMismatchError(getErr())).toBe(true)
})

test('a sensor with a trailing doc string returning the exact content passes', async () => {
  const source = '# X\n\nthe greeting is:\n\n```text\nHello, world!\n```\n'
  const getErr = runOne(
    source,
    (r) =>
      addStep(r, {
        expression: 'the greeting is',
        expressionSourceFile: 's.steps.ts',
        expressionSourceLine: 1,
        kind: 'sensor',
        handler: (_ctx, _body: string) => ['Hello, world!\n'],
      }),
  )
  await new Promise((res) => setTimeout(res, 0))
  expect(getErr()).toBeUndefined()
})

test('a sensor with a trailing doc string returning the wrong text throws DocStringMismatchError', async () => {
  const source = '# X\n\nthe greeting is:\n\n```text\nHello, world!\n```\n'
  const getErr = runOne(
    source,
    (r) =>
      addStep(r, {
        expression: 'the greeting is',
        expressionSourceFile: 's.steps.ts',
        expressionSourceLine: 1,
        kind: 'sensor',
        handler: (_ctx, _body: string) => ['Goodbye!\n'],
      }),
  )
  await new Promise((res) => setTimeout(res, 0))
  expect(isDocStringMismatchError(getErr())).toBe(true)
})
