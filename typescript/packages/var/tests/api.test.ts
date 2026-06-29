import { beforeEach, expect, expectTypeOf, test } from 'vitest'
import { defineState } from '../src/index.js'
import { _resetBuilder, buildRegistry, contextFactory } from '../src/registry.js'

beforeEach(() => _resetBuilder())

test('action() adds a registration; buildRegistry() returns an immutable Registry', () => {
  const { action } = defineState(() => ({}))
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

test('duplicate action() calls throw at buildRegistry()', () => {
  const { action } = defineState(() => ({}))
  action('I have {int} cukes', () => {})
  action('I have {int} cukes', () => {})
  expect(() => buildRegistry()).toThrow(/duplicate step definition/)
})

test('action() type-checks typed handler arguments matching the cucumber expression', () => {
  // This is a TYPE-LEVEL assertion via a compile check. If `action()` lost its generic,
  // the typed `name: string` parameter below would error with TS2345.
  const { action } = defineState(() => ({}))
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

test('custom parameter types declared in defineState are inferred (Tier 2)', () => {
  // TYPE-LEVEL assertions (fire via tsconfig.tests.json under `pnpm typecheck`).
  // The transformer return types form the registry: {airport} → string,
  // {date} → Date. Built-ins still resolve alongside them.
  const { action: act, sensor: sense } = defineState(() => ({ from: '' }), {
    airport: { regexp: /[A-Z]{3}/, transformer: (code: string) => code },
    date: { regexp: /.+/, transformer: (s: string) => new Date(s) },
  })
  act('fly from {airport} to {airport} on {date}', (_ctx, from, to, when) => {
    expectTypeOf(from).toEqualTypeOf<string>()
    expectTypeOf(to).toEqualTypeOf<string>()
    expectTypeOf(when).toEqualTypeOf<Date>()
  })
  sense('at {airport} after {int} hours', (_ctx, code, hours) => {
    expectTypeOf(code).toEqualTypeOf<string>()
    expectTypeOf(hours).toEqualTypeOf<number>()
    return [code, hours]
  })
  const r = buildRegistry()
  expect(r.steps).toHaveLength(2)
  expect([...r.parameterTypes.parameterTypes].some((p) => p.name === 'airport')).toBe(true)
})

test('context/action/sensor register with their kind', () => {
  const { context, action, sensor } = defineState(() => ({}))
  context('a logged-in user', () => {})
  action('I click submit', () => {})
  sensor('the total is {int}', (_ctx, total: number) => [total])
  const r = buildRegistry()
  expect(r.steps.map((s) => s.kind)).toEqual(['context', 'action', 'sensor'])
})

test('defineState returns role functions typed against the state', () => {
  const { context: ctxStep, sensor: sense } = defineState(() => ({ greeting: '' }))
  // context/action EVOLVE state by RETURNING a partial — never by mutating.
  ctxStep('I greet {string}', (_state, name: string) => ({ greeting: `Hello, ${name}!` }))
  sense('the greeting should be {string}', (state) => [state.greeting])
  const r = buildRegistry()
  expect(r.steps).toHaveLength(2)
  expect(r.steps.map((s) => s.kind)).toEqual(['context', 'sensor'])
})

test('state is deeply readonly and context/action returns are partial-state (type-level)', () => {
  // TYPE-LEVEL assertions (fire via tsconfig.tests.json under `pnpm typecheck`).
  type S = { greeting: string; nested: { n: number } }
  const { action: act } = defineState((): S => ({ greeting: '', nested: { n: 0 } }))
  // returning a partial is fine
  act('a', () => ({ greeting: 'hi' }))
  // returning nothing is fine
  act('b', () => {})
  act('c', (state) => {
    // @ts-expect-error - state is deeply readonly; top-level mutation is forbidden
    state.greeting = 'x'
  })
  act('d', (state) => {
    // @ts-expect-error - nested mutation is forbidden too
    state.nested.n = 1
  })
  // @ts-expect-error - an unknown/excess key is rejected
  act('e', () => ({ nope: 1 }))
  const r = buildRegistry()
  expect(r.steps).toHaveLength(5)
})

test('a second defineState in the SAME file throws', () => {
  defineState(() => ({ balance: 0 }))
  expect(() => defineState(() => ({ other: 1 }))).toThrow(/called more than once/)
})
