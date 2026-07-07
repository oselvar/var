import { beforeEach, expect, expectTypeOf, test } from 'vitest'
import { steps } from '../src/index.ts'
import { _resetBuilder, buildRegistry, contextFactory } from '../src/registry.ts'

beforeEach(() => _resetBuilder())

test('stimulus() adds a registration; buildRegistry() returns an immutable Registry', () => {
  const { stimulus } = steps(() => ({}))
  stimulus('I have {int} cukes', () => {})
  const r = buildRegistry()
  expect(r.steps).toHaveLength(1)
  expect(r.steps[0]?.expression).toBe('I have {int} cukes')
})

test('steps() sets a per-stepfile factory keyed by caller path', () => {
  steps(() => ({ balance: 0 }))
  const f = contextFactory()
  // `steps` was just called from THIS file, so look it up by our path.
  const here = new URL(import.meta.url).pathname
  const c1 = f(here)
  const c2 = f(here)
  expect(c1).toEqual({ balance: 0 })
  expect(c1).not.toBe(c2)
})

test('contextFactory() returns a default `{}` for a stepfile that did not call steps', () => {
  const here = new URL(import.meta.url).pathname
  expect(contextFactory()(here)).toEqual({})
  expect(contextFactory()('/some/other/file.steps.ts')).toEqual({})
})

test('duplicate stimulus() calls throw at buildRegistry()', () => {
  const { stimulus } = steps(() => ({}))
  stimulus('I have {int} cukes', () => {})
  stimulus('I have {int} cukes', () => {})
  expect(() => buildRegistry()).toThrow(/duplicate step definition/)
})

test('stimulus() type-checks typed handler arguments matching the cucumber expression', () => {
  // This is a TYPE-LEVEL assertion via a compile check. If `stimulus()` lost its generic,
  // the typed `name: string` parameter below would error with TS2345.
  const { stimulus } = steps(() => ({}))
  stimulus('I greet {string}', (_ctx, name: string) => {
    expect(typeof name).toBe('string')
  })
  stimulus('I have {int} cukes', (_ctx, count: number) => {
    expect(typeof count).toBe('number')
  })
  const r = buildRegistry()
  expect(r.steps).toHaveLength(2)
})

test('sensor() accepts return shapes independent of its captured args', () => {
  // TYPE-LEVEL assertion (fires via tsconfig.tests.json). A sensor's return is
  // compared by the pure core against the Markdown; its shape is NOT tied to the
  // captured args. All of these must type-check without a cast.
  const { sensor: sense } = steps(() => ({ greeting: '' }))
  sense('bare single value', (ctx) => ctx.greeting)
  sense('header-bound row object', (_ctx, _row: { score: string }) => ({ score: 42 }))
  sense('whole reproduced table', (_ctx, rows: ReadonlyArray<ReadonlyArray<string>>) => rows)
  sense('doc string', (_ctx, name: string) => [name, `Hello, ${name}!\n`])
  const r = buildRegistry()
  expect(r.steps).toHaveLength(4)
})

test('typed handlers reject mismatched ctx and arg usage', () => {
  const { stimulus: act } = steps(() => ({ greeting: '' }))
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
  const { stimulus: act, sensor: sense } = steps(() => ({ n: 0 }))
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

test('custom parameter types declared with .param() are inferred (Tier 2)', () => {
  // TYPE-LEVEL assertions (fire via tsconfig.tests.json under `pnpm typecheck`).
  // The parse return types accumulate into the registry as the chain widens:
  // {airport} → string, {date} → Date. Built-ins still resolve alongside them.
  const { stimulus: act, sensor: sense } = steps(() => ({ from: '' }))
    .param('airport', /[A-Z]{3}/, (code) => code)
    .param('date', /.+/, (s) => new Date(s))
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

test('stimulus/sensor register with their kind', () => {
  const { stimulus, sensor } = steps(() => ({}))
  stimulus('a logged-in user', () => {})
  stimulus('I click submit', () => {})
  sensor('the total is {int}', (_ctx, total: number) => total)
  const r = buildRegistry()
  expect(r.steps.map((s) => s.kind)).toEqual(['stimulus', 'stimulus', 'sensor'])
})

test('steps() returns role functions typed against the state', () => {
  const { stimulus: ctxStep, sensor: sense } = steps(() => ({ greeting: '' }))
  // A stimulus EVOLVES state by RETURNING a partial — never by mutating.
  ctxStep('I greet {string}', (_state, name: string) => ({ greeting: `Hello, ${name}!` }))
  sense('the greeting should be {string}', (state) => state.greeting)
  const r = buildRegistry()
  expect(r.steps).toHaveLength(2)
  expect(r.steps.map((s) => s.kind)).toEqual(['stimulus', 'sensor'])
})

test('state is deeply readonly and stimulus returns are partial-state (type-level)', () => {
  // TYPE-LEVEL assertions (fire via tsconfig.tests.json under `pnpm typecheck`).
  type S = { greeting: string; nested: { n: number } }
  const { stimulus: act } = steps((): S => ({ greeting: '', nested: { n: 0 } }))
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

test('a second steps() in the SAME file throws', () => {
  steps(() => ({ balance: 0 }))
  expect(() => steps(() => ({ other: 1 }))).toThrow(/called more than once/)
})

test('steps() without a factory registers steps against an empty state', () => {
  const { stimulus, sensor } = steps()
  stimulus('I warm up my mental math', () => {})
  sensor('the square of {int} is {int}', (_state, n) => [n, n * n])
  const r = buildRegistry()
  expect(r.steps).toHaveLength(2)
  const here = new URL(import.meta.url).pathname
  expect(contextFactory()(here)).toEqual({})
})

test('steps() without a factory still enforces once-per-file', () => {
  steps()
  expect(() => steps()).toThrow(/called more than once/)
})

test('factory-less state is empty at the type level too', () => {
  // TYPE-LEVEL assertions (fire via tsconfig.tests.json under `pnpm typecheck`).
  const { stimulus: act, sensor: sense } = steps()
  // returning nothing is fine; there are no fields to evolve
  act('a', () => {})
  sense('b', (state) => {
    // every field of the empty state is `never` — nothing real can be read
    expectTypeOf(state).toEqualTypeOf<{ readonly [key: string]: never }>()
  })
  const r = buildRegistry()
  expect(r.steps).toHaveLength(2)
})
