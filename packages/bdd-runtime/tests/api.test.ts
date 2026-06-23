import { beforeEach, expect, test } from 'vitest'
import {
  _resetBuilder,
  buildRegistry,
  contextFactory,
  defineContext,
  defineParameterType,
  step,
} from '../src/index.js'

beforeEach(() => _resetBuilder())

test('step() adds a registration; buildRegistry() returns an immutable Registry', () => {
  step('I have {int} cukes', () => {})
  const r = buildRegistry()
  expect(r.steps).toHaveLength(1)
  expect(r.steps[0]?.expression).toBe('I have {int} cukes')
})

test('defineContext() sets a per-stepfile factory keyed by caller path', () => {
  defineContext(() => ({ balance: 0 }))
  const f = contextFactory()
  // `defineContext` was just called from THIS file, so look it up by our path.
  const here = new URL(import.meta.url).pathname
  const c1 = f(here)
  const c2 = f(here)
  expect(c1).toEqual({ balance: 0 })
  expect(c1).not.toBe(c2)
})

test('contextFactory() returns a default `{}` for a stepfile that did not call defineContext', () => {
  const here = new URL(import.meta.url).pathname
  expect(contextFactory()(here)).toEqual({})
  expect(contextFactory()('/some/other/file.steps.ts')).toEqual({})
})

test('defineParameterType() registers a custom type for snippet inference', () => {
  defineParameterType({
    name: 'color',
    regexp: /red|green|blue/,
    transformer: (s) => s,
  })
  const r = buildRegistry()
  const has = [...r.parameterTypes.parameterTypes].some((p) => p.name === 'color')
  expect(has).toBe(true)
})

test('duplicate step() calls throw at buildRegistry()', () => {
  step('I have {int} cukes', () => {})
  step('I have {int} cukes', () => {})
  expect(() => buildRegistry()).toThrow(/duplicate step definition/)
})

test('step() type-checks typed handler arguments matching the cucumber expression', () => {
  // This is a TYPE-LEVEL assertion via a compile check. If `step()` lost its generic,
  // the typed `name: string` parameter below would error with TS2345.
  step('I greet {string}', (_ctx, name: string) => {
    expect(typeof name).toBe('string')
  })
  step('I have {int} cukes', (_ctx, count: number) => {
    expect(typeof count).toBe('number')
  })
  const r = buildRegistry()
  expect(r.steps).toHaveLength(2)
})

test('a second defineContext() in the SAME file throws', () => {
  defineContext(() => ({ balance: 0 }))
  expect(() => defineContext(() => ({ other: 1 }))).toThrow(
    /defineContext\(\) called more than once/,
  )
})

test('defineContext() returns a `step` typed against the context factory output', () => {
  // The typed step lets handler bodies read/write `ctx.foo` without casts. If
  // this regresses, the property accesses below fail with TS2339 ("Property
  // does not exist on type 'unknown'").
  const { step: typedStep } = defineContext(() => ({ greeting: '' }))
  typedStep('I greet {string}', (ctx, name: string) => {
    ctx.greeting = `Hello, ${name}!`
  })
  typedStep('the greeting is {string}', (ctx, expected: string) => {
    if (ctx.greeting !== expected) throw new Error('mismatch')
  })
  const r = buildRegistry()
  expect(r.steps).toHaveLength(2)
})
