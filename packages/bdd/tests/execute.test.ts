import { expect, test } from 'vitest'
import type { Diagnostic } from '../src/diagnostics.js'
import { executePlan } from '../src/execute.js'
import { parse } from '../src/parse.js'
import { plan } from '../src/plan.js'
import { addStep, createRegistry } from '../src/registry.js'

test('executePlan calls sink.example for each PlannedExample', () => {
  const r = addStep(createRegistry(), {
    expression: 'I have {int} cukes',
    expressionSourceFile: 's.ts',
    expressionSourceLine: 1,
    handler: () => {},
  })
  const p = plan(parse('e.bdd.md', '# A\n\nGiven I have 5 cukes\n\n# B\n\nGiven I have 9 cukes'), r)
  const names: string[] = []
  executePlan(p, {
    sink: { example: (name) => names.push(name) },
    reporter: { diagnostic: () => {} },
  })
  expect(names).toEqual(['A', 'B'])
})

test('executePlan reports all diagnostics through reporter.diagnostic', () => {
  const r = createRegistry()
  const p = plan(parse('m.bdd.md', '# A\n\nGiven I have 5 cukes'), r)
  const got: Diagnostic[] = []
  executePlan(p, {
    sink: { example: (_n, _r) => {} },
    reporter: { diagnostic: (d) => got.push(d) },
  })
  expect(got).toHaveLength(1)
  expect(got[0]?.code).toBe('missing-step')
})

test('the sink.example run callback executes the step handlers in order', async () => {
  const calls: string[] = []
  const r = addStep(
    addStep(createRegistry(), {
      expression: 'I add {int}',
      expressionSourceFile: 's.ts',
      expressionSourceLine: 1,
      handler: (_ctx, n) => {
        calls.push(`add:${n as number}`)
      },
    }),
    {
      expression: 'I should have {int}',
      expressionSourceFile: 's.ts',
      expressionSourceLine: 2,
      handler: (_ctx, n) => {
        calls.push(`check:${n as number}`)
      },
    },
  )
  const p = plan(parse('e.bdd.md', '# Adding\n\nI add 5. I should have 5.'), r)
  let run: (() => void | Promise<void>) | undefined
  executePlan(p, {
    sink: {
      example: (_n, r) => {
        run = r
      },
    },
    reporter: { diagnostic: () => {} },
  })
  await run?.()
  expect(calls).toEqual(['add:5', 'check:5'])
})
