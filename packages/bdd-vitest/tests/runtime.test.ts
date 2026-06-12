import { afterEach, beforeEach, expect, test } from 'vitest'
import { _resetBuilder, step } from '../src/api.js'
import { runBddSource } from '../src/runtime.js'

beforeEach(() => _resetBuilder())
afterEach(() => _resetBuilder())

test('runBddSource emits one sink.example call per BDD example, executes its handlers', async () => {
  const calls: string[] = []
  step('I have {int} cukes', (_ctx, n) => {
    calls.push(`have:${n as number}`)
  })
  step('I eat {int}', (_ctx, n) => {
    calls.push(`eat:${n as number}`)
  })

  const seen: string[] = []
  const runs: Array<() => void | Promise<void>> = []
  runBddSource('# Eating\n\nI have 5 cukes. I eat 2.', 'belly.bdd.md', {
    sink: {
      example: (name, run) => {
        seen.push(name)
        runs.push(run)
      },
    },
    reporter: { diagnostic: () => {} },
  })
  for (const r of runs) await r()
  // Paragraph-as-test: one paragraph becomes one example; the heading just
  // forms a `describe` scope. The example name is the first sentence (with
  // the trailing terminator stripped).
  expect(seen).toEqual(['I have 5 cukes'])
  expect(calls).toEqual(['have:5', 'eat:2'])
})
