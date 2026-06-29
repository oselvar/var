import { beforeEach, expect, expectTypeOf, test } from 'vitest'
import {
  _resetBuilder,
  action,
  buildRegistry,
  context,
  contextFactory,
  defineParameterType,
  defineState,
  sensor,
} from '../src/index.js'

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

test('sensor() accepts return shapes independent of its captured args', () => {
  // TYPE-LEVEL assertion (fires via tsconfig.tests.json). A sensor's return is
  // compared by the pure core against the Markdown; its shape is NOT tied to the
  // captured args. All of these must type-check without a cast.
  const { sensor: sense } = defineState(() => ({ greeting: '' }))
  sense('by-index column tuple', (ctx) => [ctx.greeting])
  sense('header-bound row object', (_ctx, _row: { score: string }) => ({ score: 42 }))
  sense('whole reproduced table', (_ctx, rows: ReadonlyArray<ReadonlyArray<string>>) => [rows])
  sense('doc string', (_ctx, name: string) => [name, `Hello, ${name}!\n`])
  const r = buildRegistry()
  expect(r.steps).toHaveLength(4)
})

test('typed handlers reject mismatched ctx and arg usage', () => {
  const { action: act } = defineState(() => ({ greeting: '' }))
  // @ts-expect-error - `name` is declared string; multiplying it is a type error
  act('I greet {string}', (_ctx, name: string) => name * 2)
  // @ts-expect-error - `count` is not a field on the state context
  act('I have {int} cukes', (ctx) => ctx.count++)
  const r = buildRegistry()
  expect(r.steps).toHaveLength(2)
})

test('built-in parameter types are inferred from the expression (no annotations)', () => {
  // TYPE-LEVEL assertions (fire via tsconfig.tests.json under `pnpm typecheck`).
  // The handler params carry NO annotations — their types come from the
  // cucumber expression. This is the Tier 1 inference contract.
  const { action: act, sensor: sense } = defineState(() => ({ n: 0 }))
  act('I greet {string}', (_ctx, name) => {
    expectTypeOf(name).toEqualTypeOf<string>()
  })
  act('add {int} and {float}', (_ctx, a, b) => {
    expectTypeOf(a).toEqualTypeOf<number>()
    expectTypeOf(b).toEqualTypeOf<number>()
  })
  sense('have {biginteger} cukes', (_ctx, big) => {
    expectTypeOf(big).toEqualTypeOf<bigint>()
    return [big]
  })
  // A trailing doc-string/table arg has no placeholder, so it stays flexible:
  // the author annotates it and it lands in the `...AnyArg[]` tail.
  sense('greet {word}:', (_ctx, who, body: string) => {
    expectTypeOf(who).toEqualTypeOf<string>()
    return [who, body]
  })
  const r = buildRegistry()
  expect(r.steps).toHaveLength(4)
})

test('context/action/sensor register with their kind', () => {
  context('a logged-in user', () => {})
  action('I click submit', () => {})
  sensor('the total is {int}', (_ctx, total: number) => [total])
  const r = buildRegistry()
  expect(r.steps.map((s) => s.kind)).toEqual(['context', 'action', 'sensor'])
})

test('defineState returns role functions typed against the state', () => {
  const { context: ctxStep, sensor: sense } = defineState(() => ({ greeting: '' }))
  ctxStep('I greet {string}', (ctx, name: string) => {
    ctx.greeting = `Hello, ${name}!`
  })
  sense('the greeting should be {string}', (ctx) => [ctx.greeting])
  const r = buildRegistry()
  expect(r.steps).toHaveLength(2)
  expect(r.steps.map((s) => s.kind)).toEqual(['context', 'sensor'])
})

test('a second defineState in the SAME file throws', () => {
  defineState(() => ({ balance: 0 }))
  expect(() => defineState(() => ({ other: 1 }))).toThrow(/called more than once/)
})
