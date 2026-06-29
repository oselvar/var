import { beforeEach, expect, test } from 'vitest'
import {
  _resetBuilder,
  action,
  buildRegistry,
  contextFactory,
  defineParameterType,
  defineState,
} from '../src/api.js'

beforeEach(() => _resetBuilder())

test('action() adds a registration; buildRegistry() returns an immutable Registry', () => {
  action('I have {int} cukes', () => {})
  const r = buildRegistry()
  expect(r.steps).toHaveLength(1)
  expect(r.steps[0]?.expression).toBe('I have {int} cukes')
})

test('defineState() sets a per-stepfile factory keyed by caller path', () => {
  defineState(() => ({ balance: 0 }))
  const f = contextFactory()
  // `defineState` was just called from THIS file, so look it up by our path.
  const here = new URL(import.meta.url).pathname
  const c1 = f(here)
  const c2 = f(here)
  expect(c1).toEqual({ balance: 0 })
  expect(c1).not.toBe(c2)
})

test('contextFactory() returns a default `{}` for a stepfile that did not call defineState', () => {
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

test('duplicate action() calls throw at buildRegistry()', () => {
  action('I have {int} cukes', () => {})
  action('I have {int} cukes', () => {})
  expect(() => buildRegistry()).toThrow(/duplicate step definition/)
})

test('action() type-checks typed handler arguments matching the cucumber expression', () => {
  // This is a TYPE-LEVEL assertion via a compile check. If `action()` lost its generic,
  // the typed `name: string` parameter below would error with TS2345.
  action('I greet {string}', (_ctx, name: string) => {
    expect(typeof name).toBe('string')
  })
  action('I have {int} cukes', (_ctx, count: number) => {
    expect(typeof count).toBe('number')
  })
  const r = buildRegistry()
  expect(r.steps).toHaveLength(2)
})

test('a second defineState() in the SAME file throws', () => {
  defineState(() => ({ balance: 0 }))
  expect(() => defineState(() => ({ other: 1 }))).toThrow(
    /defineState\(\) called more than once/,
  )
})

test('defineState() returns typed role functions with ctx typed against the factory output', () => {
  // The typed action lets handler bodies read/write `ctx.foo` without casts. If
  // this regresses, the property accesses below fail with TS2339 ("Property
  // does not exist on type 'unknown'").
  const { action: typedAction, sensor: typedSensor } = defineState(() => ({ greeting: '' }))
  typedAction('I greet {string}', (ctx, name: string) => {
    ctx.greeting = `Hello, ${name}!`
  })
  typedSensor('the greeting is {string}', (ctx, _expected: string) => [ctx.greeting] as [string])
  const r = buildRegistry()
  expect(r.steps).toHaveLength(2)
})
