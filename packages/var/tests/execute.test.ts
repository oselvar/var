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
  const p = plan(parse('e.var.md', '# A\n\nGiven I have 5 cukes\n\n# B\n\nGiven I have 9 cukes'), r)
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
  const p = plan(parse('m.var.md', '# A\n\nGiven I have 5 cukes'), r)
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
  const p = plan(parse('e.var.md', '# Adding\n\nI add 5. I should have 5.'), r)
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

test('executePlan augments a thrown error with a .var.md frame for the failing step', async () => {
  const r = addStep(createRegistry(), {
    expression: 'I throw',
    expressionSourceFile: 's.ts',
    expressionSourceLine: 1,
    handler: () => {
      throw new Error('boom')
    },
  })
  const p = plan(parse('e.var.md', '# A\n\nI throw'), r)
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
  // The synthetic stack frame points at the .var.md line where the step
  // text lives, directly BELOW the handler's `.ts` frame so vitest still
  // auto-renders the .ts snippet at the top.
  const stack = captured?.stack ?? ''
  expect(stack).toContain('e.var.md:3:1')
  expect(stack).toContain('at I throw')
  const frameLines = stack.split('\n').filter((l) => /^\s+at\s/.test(l))
  const handlerIdx = frameLines.findIndex((l) => !l.includes('e.var.md'))
  const varIdx = frameLines.findIndex((l) => l.includes('e.var.md'))
  expect(handlerIdx).toBeGreaterThanOrEqual(0)
  expect(varIdx).toBeGreaterThan(handlerIdx)
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
  const p = plan(parse('e.var.md', '# A\n\nI record ctx\n\n# B\n\nI record ctx'), r)
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
  const p = plan(parse('l.var.md', source), r)
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
  const p = plan(parse('l.var.md', source), r)
  const runs: Array<() => unknown | Promise<unknown>> = []
  executePlan(p, {
    sink: { example: (_n, run) => runs.push(run) },
    reporter: { diagnostic: () => {} },
  })
  for (const run of runs) await run()
  expect(captured).toEqual(['{"ok": true}\n'])
})

test('executePlan runs a header-bound table once per row, passing the row object', async () => {
  let r = createRegistry()
  const rows: unknown[] = []
  r = addStep(r, {
    expression: 'each row lists the dice, the category and the score',
    expressionSourceFile: 's.ts',
    expressionSourceLine: 1,
    handler: (_ctx, ...args) => {
      rows.push(args[args.length - 1])
    },
  })
  const source = `# Yahtzee

each row lists the dice, the category and the score:

| dice          | category   | score |
| ------------- | ---------- | ----- |
| 3, 3, 3, 4, 4 | full house | 17    |
| 3, 3, 3, 3, 3 | Yahtzee    | 50    |`
  const p = plan(parse('y.var.md', source), r)
  const named: Array<{ name: string; run: () => unknown | Promise<unknown> }> = []
  executePlan(p, {
    sink: { example: (name, run) => named.push({ name, run }) },
    reporter: { diagnostic: () => {} },
  })
  expect(named.map((e) => e.name)).toEqual([
    '3, 3, 3, 4, 4 / full house / 17',
    '3, 3, 3, 3, 3 / Yahtzee / 50',
  ])
  for (const e of named) await e.run()
  expect(rows).toEqual([
    { dice: '3, 3, 3, 4, 4', category: 'full house', score: '17' },
    { dice: '3, 3, 3, 3, 3', category: 'Yahtzee', score: '50' },
  ])
})

test('a failing header-bound row points the stack frame at that row line', async () => {
  let r = createRegistry()
  r = addStep(r, {
    expression: 'each row lists the dice, the category and the score',
    expressionSourceFile: 's.ts',
    expressionSourceLine: 1,
    handler: (_ctx, row: { score: string }) => {
      if (row.score === '50') throw new Error('boom')
    },
  })
  // Rows sit on source lines 7 and 8 (header=5, separator=6).
  const source = `# Yahtzee

each row lists the dice, the category and the score:

| dice          | category   | score |
| ------------- | ---------- | ----- |
| 3, 3, 3, 4, 4 | full house | 17    |
| 3, 3, 3, 3, 3 | Yahtzee    | 50    |`
  const p = plan(parse('y.var.md', source), r)
  const runs: Array<() => unknown | Promise<unknown>> = []
  executePlan(p, {
    sink: { example: (_n, run) => runs.push(run) },
    reporter: { diagnostic: () => {} },
  })
  await runs[0]?.() // row on line 7 passes
  let stack = ''
  try {
    await runs[1]?.() // row on line 8 throws
  } catch (err) {
    stack = (err as Error).stack ?? ''
  }
  expect(stack).toContain('y.var.md:8:')
})
