import { expect, test } from 'vitest'
import { isCellMismatchError } from '../src/cell-diff.ts'
import { type ExecutePorts, executePlan } from '../src/execute.ts'
import { parse } from '../src/parse.ts'
import { plan } from '../src/plan.ts'
import { addStep, createRegistry, defineParameterType, type StepHandler } from '../src/registry.ts'

// Minimal ports that run the example body and surface the thrown error.
function runOne(
  source: string,
  register: (r: ReturnType<typeof createRegistry>) => ReturnType<typeof createRegistry>,
) {
  let registry = createRegistry()
  registry = register(registry)
  // parse(path, source) — path first, source second
  const doc = parse('x.md', source)
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
  const getErr = runOne('# X\n\nI should have 3 cukes in my big belly\n', (r) =>
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
  const getErr = runOne('# X\n\nI should have 3 cukes in my big belly\n', (r) =>
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
  const getErr = runOne('# X\n\nI should have 3 cukes in my big belly\n', (r) =>
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
  const getErr = runOne('# X\n\nI fly to LHR\n', (r) =>
    addStep(r, {
      expression: 'I fly to {word}',
      expressionSourceFile: 's.steps.ts',
      expressionSourceLine: 1,
      kind: 'stimulus',
      handler: () => 'oops',
    }),
  )
  await new Promise((res) => setTimeout(res, 0))
  expect((getErr() as Error).name).toBe('ReturnShapeError')
})

test('a context step that returns a value throws ReturnShapeError', async () => {
  const getErr = runOne('# X\n\nI set up the world\n', (r) =>
    addStep(r, {
      expression: 'I set up the world',
      expressionSourceFile: 's.steps.ts',
      expressionSourceLine: 1,
      kind: 'stimulus',
      handler: () => 'oops',
    }),
  )
  await new Promise((res) => setTimeout(res, 0))
  expect((getErr() as Error).name).toBe('ReturnShapeError')
})

test('a sensor with a trailing data table returning the correct table passes', async () => {
  const source =
    '# X\n\nI list the items:\n\n| name | value |\n| ---- | ----- |\n| foo  | bar   |\n'
  const getErr = runOne(source, (r) =>
    addStep(r, {
      expression: 'I list the items',
      expressionSourceFile: 's.steps.ts',
      expressionSourceLine: 1,
      kind: 'sensor',
      handler: () => [{ name: 'foo', value: 'bar' }],
    }),
  )
  await new Promise((res) => setTimeout(res, 0))
  expect(getErr()).toBeUndefined()
})

test('a sensor with a trailing data table returning the wrong cell throws CellMismatchError', async () => {
  const source =
    '# X\n\nI list the items:\n\n| name | value |\n| ---- | ----- |\n| foo  | bar   |\n'
  const getErr = runOne(source, (r) =>
    addStep(r, {
      expression: 'I list the items',
      expressionSourceFile: 's.steps.ts',
      expressionSourceLine: 1,
      kind: 'sensor',
      handler: () => [{ name: 'foo', value: 'WRONG' }],
    }),
  )
  await new Promise((res) => setTimeout(res, 0))
  expect(isCellMismatchError(getErr())).toBe(true)
})

test('a sensor with a trailing doc string returning the exact content passes', async () => {
  const source = '# X\n\nthe greeting is:\n\n```text\nHello, world!\n```\n'
  const getErr = runOne(source, (r) =>
    addStep(r, {
      expression: 'the greeting is',
      expressionSourceFile: 's.steps.ts',
      expressionSourceLine: 1,
      kind: 'sensor',
      handler: ((_ctx, _body: string) => 'Hello, world!\n') as StepHandler,
    }),
  )
  await new Promise((res) => setTimeout(res, 0))
  expect(getErr()).toBeUndefined()
})

test('a sensor with a trailing doc string returning the wrong text throws CellMismatchError', async () => {
  const source = '# X\n\nthe greeting is:\n\n```text\nHello, world!\n```\n'
  const getErr = runOne(source, (r) =>
    addStep(r, {
      expression: 'the greeting is',
      expressionSourceFile: 's.steps.ts',
      expressionSourceLine: 1,
      kind: 'sensor',
      handler: ((_ctx, _body: string) => 'Goodbye!\n') as StepHandler,
    }),
  )
  await new Promise((res) => setTimeout(res, 0))
  const err = getErr()
  expect(isCellMismatchError(err)).toBe(true)
  expect((err as Error).message).toBe(
    'doc string: expected "Hello, world!\\n" but was "Goodbye!\\n"',
  )
})

test('a single-parameter sensor returns the bare value, not an array', async () => {
  const getErr = runOne('# X\n\nThe total is 42\n', (r) =>
    addStep(r, {
      expression: 'The total is {int}',
      expressionSourceFile: 's.steps.ts',
      expressionSourceLine: 1,
      kind: 'sensor',
      handler: () => 42,
    }),
  )
  await new Promise((res) => setTimeout(res, 0))
  expect(getErr()).toBeUndefined()
})

test('a single-parameter sensor wrapping its value in an array fails the comparison', async () => {
  // [42] is compared as-is against 42 — arrays are never read as tuples
  // when there is only one slot.
  const getErr = runOne('# X\n\nThe total is 42\n', (r) =>
    addStep(r, {
      expression: 'The total is {int}',
      expressionSourceFile: 's.steps.ts',
      expressionSourceLine: 1,
      kind: 'sensor',
      handler: () => [42],
    }),
  )
  await new Promise((res) => setTimeout(res, 0))
  expect(isCellMismatchError(getErr())).toBe(true)
})

test('a single parameter whose type transforms to an array is deep-compared bare', async () => {
  const register = (r: ReturnType<typeof createRegistry>) => {
    const withType = defineParameterType(r, {
      name: 'numbers',
      regexp: /\d+(?:, \d+)*/,
      parse: (raw: string) => raw.split(', ').map(Number),
    })
    return addStep(withType, {
      expression: 'The dice show {numbers}',
      expressionSourceFile: 's.steps.ts',
      expressionSourceLine: 1,
      kind: 'sensor',
      handler: () => [5, 6],
    })
  }
  const getErr = runOne('# X\n\nThe dice show 5, 6\n', register)
  await new Promise((res) => setTimeout(res, 0))
  expect(getErr()).toBeUndefined()
})

test('a zero-slot sensor returning a value throws ReturnShapeError', async () => {
  const getErr = runOne('# X\n\nThe alarm fired\n', (r) =>
    addStep(r, {
      expression: 'The alarm fired',
      expressionSourceFile: 's.steps.ts',
      expressionSourceLine: 1,
      kind: 'sensor',
      handler: () => true,
    }),
  )
  await new Promise((res) => setTimeout(res, 0))
  expect((getErr() as Error).name).toBe('ReturnShapeError')
})

test('a zero-slot sensor returning undefined passes', async () => {
  const getErr = runOne('# X\n\nThe alarm fired\n', (r) =>
    addStep(r, {
      expression: 'The alarm fired',
      expressionSourceFile: 's.steps.ts',
      expressionSourceLine: 1,
      kind: 'sensor',
      handler: () => undefined,
    }),
  )
  await new Promise((res) => setTimeout(res, 0))
  expect(getErr()).toBeUndefined()
})

test('a sensor with a slot that returns nothing throws ReturnShapeError', async () => {
  // The silent-pass hole: without this, a typo'd property access returns
  // undefined, nothing is compared, and the document keeps claiming something
  // nobody checked.
  const getErr = runOne('# X\n\nThe name is "Ada"\n', (r) =>
    addStep(r, {
      expression: 'The name is {string}',
      expressionSourceFile: 's.steps.ts',
      expressionSourceLine: 1,
      kind: 'sensor',
      handler: () => undefined,
    }),
  )
  await new Promise((res) => setTimeout(res, 0))
  const err = getErr() as Error
  expect(err?.name).toBe('ReturnShapeError')
  expect(err.message).toBe('a sensor with 1 slot(s) must return one value per slot, got nothing')
})

test('a zero-slot sensor that returns nothing still passes', async () => {
  const getErr = runOne('# X\n\nIt works\n', (r) =>
    addStep(r, {
      expression: 'It works',
      expressionSourceFile: 's.steps.ts',
      expressionSourceLine: 1,
      kind: 'sensor',
      handler: () => undefined,
    }),
  )
  await new Promise((res) => setTimeout(res, 0))
  expect(getErr()).toBeUndefined()
})

test('a header-bound row step that returns nothing throws ReturnShapeError', async () => {
  const source = [
    '# X',
    '',
    'I report the score and grade.',
    '',
    '| score | grade |',
    '| ----- | ----- |',
    '| 10    | A     |',
  ].join('\n')
  const getErr = runOne(source, (r) =>
    addStep(r, {
      expression: 'I report the score and grade',
      expressionSourceFile: 's.steps.ts',
      expressionSourceLine: 1,
      kind: 'sensor',
      handler: () => undefined,
    }),
  )
  await new Promise((res) => setTimeout(res, 0))
  const err = getErr() as Error
  expect(err?.name).toBe('ReturnShapeError')
  expect(err.message).toBe(
    'a header-bound row step must return a row object with one value per bound cell, got nothing',
  )
})
