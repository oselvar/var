import { expectTypeOf, test } from 'vitest'
import type { Diagnostic } from '../src/diagnostics.js'
import type { Reporter, TestSink } from '../src/ports.js'

test('TestSink declares example(name, run)', () => {
  expectTypeOf<TestSink['example']>().toEqualTypeOf<
    (name: string, run: () => void | Promise<void>) => void
  >()
})

test('Reporter declares diagnostic(d)', () => {
  expectTypeOf<Reporter['diagnostic']>().toEqualTypeOf<(d: Diagnostic) => void>()
})
