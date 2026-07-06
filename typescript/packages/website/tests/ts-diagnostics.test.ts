import { expect, test } from 'vitest'
// The real dogfood sample the front-page editor shows — if the editor's
// virtual module drifts from the actual @oselvar/var API, this file stops
// type-checking cleanly and the first test fails, exactly like the front
// page would.
import librarySteps from '../../../../examples/typescript-vitest/steps/library.steps.ts?raw'
import { createTsDiagnostics } from '../src/lib/ts-diagnostics.ts'

// The sample imports its domain module ('./library'); the in-browser service
// has no filesystem, so mirror what the editor does for unresolvable local
// imports: nothing. Those imports type as `any`, which must not produce
// diagnostics with the service's lenient options — assert only on messages
// that are NOT unresolved-module noise for './library'.
function realProblems(tsd: ReturnType<typeof createTsDiagnostics>, name: string, source: string) {
  tsd.updateDoc(name, source)
  return tsd.diagnostics(name).filter((d) => !d.message.includes("'./library'"))
}

test('the front-page library sample type-checks against the real @oselvar/var types', () => {
  const problems = realProblems(createTsDiagnostics(), 'library_steps.ts', librarySteps)
  expect(problems).toEqual([])
})

test('stimulus and sensor are the destructurable names defineState returns', () => {
  const source = `import { defineState } from '@oselvar/var'
const { stimulus, sensor } = defineState(() => ({ total: 0 }))
stimulus('I add {int}', (state, n) => ({ total: state.total + n }))
sensor('the total is {int}', (state) => state.total)
`
  const problems = realProblems(createTsDiagnostics(), 'adds.steps.ts', source)
  expect(problems).toEqual([])
})

test('the stale pre-rename API names are rejected', () => {
  const source = `import { defineState } from '@oselvar/var'
const { context, action } = defineState(() => ({}))
`
  const tsd = createTsDiagnostics()
  tsd.updateDoc('old.steps.ts', source)
  const messages = tsd.diagnostics('old.steps.ts').map((d) => d.message)
  expect(messages.join('\n')).toContain("Property 'context' does not exist")
})

test('a format whose parameter contradicts its parse return is a type error', () => {
  const source = `import { defineState } from '@oselvar/var'
const { sensor } = defineState(() => ({}), {
  money: {
    regexp: /£\\d+\\.\\d{2}/,
    parse: (raw: string) => ({ value: Number(raw.slice(1)) }),
    format: (m: string) => m,
  },
})
`
  const tsd = createTsDiagnostics()
  tsd.updateDoc('money.steps.ts', source)
  expect(tsd.diagnostics('money.steps.ts').length).toBeGreaterThan(0)
})
