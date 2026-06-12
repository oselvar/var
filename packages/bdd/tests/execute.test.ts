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
  // With the paragraph-as-test model, each paragraph is its own example and
  // its name comes from the first sentence (with the trailing terminator
  // stripped). Two paragraphs → two named tests.
  const p = plan(parse('e.bdd.md', '# A\n\nGiven I have 5 cukes\n\n# B\n\nGiven I have 9 cukes'), r)
  const names: string[] = []
  executePlan(p, {
    sink: { example: (name) => names.push(name) },
    reporter: { diagnostic: () => {} },
  })
  expect(names).toEqual(['Given I have 5 cukes', 'Given I have 9 cukes'])
})

test('executePlan reports all diagnostics through reporter.diagnostic', () => {
  // Two step definitions that match the same sentence → ambiguous-match.
  // Avoids the keyword heuristic but still produces a diagnostic.
  let r = createRegistry()
  r = addStep(r, {
    expression: 'I have {int} cukes',
    expressionSourceFile: 's.ts',
    expressionSourceLine: 1,
    handler: () => {},
  })
  r = addStep(r, {
    expression: 'I have 5 cukes',
    expressionSourceFile: 's.ts',
    expressionSourceLine: 2,
    handler: () => {},
  })
  const p = plan(parse('m.bdd.md', '# A\n\nGiven I have 5 cukes'), r)
  const got: Diagnostic[] = []
  executePlan(p, {
    sink: { example: (_n, _r) => {} },
    reporter: { diagnostic: (d) => got.push(d) },
  })
  expect(got).toHaveLength(1)
  expect(got[0]?.code).toBe('ambiguous-match')
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

test('executePlan augments a thrown error with a .bdd.md frame for the failing step', async () => {
  const r = addStep(createRegistry(), {
    expression: 'I throw',
    expressionSourceFile: 's.ts',
    expressionSourceLine: 1,
    handler: () => {
      throw new Error('boom')
    },
  })
  const p = plan(parse('e.bdd.md', '# A\n\nI throw'), r)
  let captured: Error | undefined
  let run: (() => void | Promise<void>) | undefined
  executePlan(p, {
    sink: {
      example: (_n, r) => {
        run = r
      },
    },
    reporter: { diagnostic: () => {} },
  })
  try {
    await run?.()
  } catch (e) {
    captured = e as Error
  }
  expect(captured).toBeInstanceOf(Error)
  // Original error message is left alone — augmentation only touches the stack.
  expect(captured?.message).toBe('boom')
  // The synthetic stack frame points at the .bdd.md line where the step
  // text lives, directly BELOW the handler's `.ts` frame so vitest still
  // auto-renders the .ts snippet at the top.
  const stack = captured?.stack ?? ''
  expect(stack).toContain('e.bdd.md:3:1')
  expect(stack).toContain('at I throw')
  const frameLines = stack.split('\n').filter((l) => /^\s+at\s/.test(l))
  const handlerIdx = frameLines.findIndex((l) => !l.includes('e.bdd.md'))
  const bddIdx = frameLines.findIndex((l) => l.includes('e.bdd.md'))
  expect(handlerIdx).toBeGreaterThanOrEqual(0)
  expect(bddIdx).toBeGreaterThan(handlerIdx)
})

test('executePlan invokes createContext once per example and passes the result to handlers', async () => {
  const ctxSeen: unknown[] = []
  const r = addStep(createRegistry(), {
    expression: 'I record ctx',
    expressionSourceFile: 's.ts',
    expressionSourceLine: 1,
    handler: (ctx) => {
      ctxSeen.push(ctx)
    },
  })
  const p = plan(parse('e.bdd.md', '# A\n\nI record ctx\n\n# B\n\nI record ctx'), r)
  let calls = 0
  const runs: Array<() => void | Promise<void>> = []
  executePlan(p, {
    sink: { example: (_n, r) => runs.push(r) },
    reporter: { diagnostic: () => {} },
    createContext: () => {
      calls++
      return { greeting: '', n: calls }
    },
  })
  for (const r of runs) await r()
  expect(calls).toBe(2)
  expect(ctxSeen[0]).toEqual({ greeting: '', n: 1 })
  expect(ctxSeen[1]).toEqual({ greeting: '', n: 2 })
})

test('executePlan appends a data table as the last handler arg (after cucumber args)', async () => {
  let r = createRegistry()
  let captured: unknown[] = []
  r = addStep(r, {
    expression: 'these books exist:',
    expressionSourceFile: 's.ts',
    expressionSourceLine: 1,
    handler: (_ctx, ...args) => {
      captured = args
    },
  })
  const source = `# Library

these books exist:

| title  | author  |
|--------|---------|
| Lolita | Nabokov |
| Anna   | Tolstoy |
`
  const p = plan(parse('l.bdd.md', source), r)
  const runs: Array<() => unknown | Promise<unknown>> = []
  executePlan(p, {
    sink: { example: (_n, run) => runs.push(run) },
    reporter: { diagnostic: () => {} },
  })
  for (const run of runs) await run()
  expect(captured).toHaveLength(1)
  expect(captured[0]).toEqual([
    ['title', 'author'],
    ['Lolita', 'Nabokov'],
    ['Anna', 'Tolstoy'],
  ])
})

test('executePlan appends a docstring as the last handler arg', async () => {
  let r = createRegistry()
  let captured: unknown[] = []
  r = addStep(r, {
    expression: 'the receipt is:',
    expressionSourceFile: 's.ts',
    expressionSourceLine: 1,
    handler: (_ctx, ...args) => {
      captured = args
    },
  })
  const source = `# Library

the receipt is:

\`\`\`json
{"ok": true}
\`\`\`
`
  const p = plan(parse('l.bdd.md', source), r)
  const runs: Array<() => unknown | Promise<unknown>> = []
  executePlan(p, {
    sink: { example: (_n, run) => runs.push(run) },
    reporter: { diagnostic: () => {} },
  })
  for (const run of runs) await run()
  expect(captured).toEqual(['{"ok": true}\n'])
})
