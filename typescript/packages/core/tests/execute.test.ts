import { expect, test } from 'vitest'
import {
  type CellDiff,
  type CellMismatchError,
  isCellMismatchError,
  ReturnShapeError,
} from '../src/cell-diff.ts'
import type { Diagnostic } from '../src/diagnostics.ts'
import { executePlan, isUnexpectedPassError, type StepObservation } from '../src/execute.ts'
import { parse } from '../src/parse.ts'
import { plan } from '../src/plan.ts'
import { addStep, createRegistry, type StepHandler } from '../src/registry.ts'

async function runOnly(p: ReturnType<typeof plan>, observer?: { step(o: StepObservation): void }) {
  let run: (() => void | Promise<void>) | undefined
  executePlan(p, {
    sink: {
      example: (_n, r) => {
        run = r
      },
    },
    reporter: { diagnostic: () => {} },
    ...(observer ? { observer } : {}),
  })
  return run
}

test('executePlan calls sink.example for each PlannedExample', () => {
  const r = addStep(createRegistry(), {
    expression: 'I have {int} cukes',
    expressionSourceFile: 's.ts',
    expressionSourceLine: 1,
    kind: 'stimulus',
    handler: () => {},
  })
  // With the paragraph-as-test model, each paragraph is its own example and
  // its name is the entire paragraph (with the trailing terminator
  // stripped). Two paragraphs → two named tests.
  const p = plan(parse('e.md', '# A\n\nGiven I have 5 cukes\n\n# B\n\nGiven I have 9 cukes'), r)
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
    kind: 'stimulus',
    handler: () => {},
  })
  r = addStep(r, {
    expression: 'I have 5 cukes',
    expressionSourceFile: 's.ts',
    expressionSourceLine: 2,
    kind: 'stimulus',
    handler: () => {},
  })
  const p = plan(parse('m.md', '# A\n\nGiven I have 5 cukes'), r)
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
      kind: 'stimulus',
      handler: (_ctx, n) => {
        calls.push(`add:${n as number}`)
      },
    }),
    {
      expression: 'I should have {int}',
      expressionSourceFile: 's.ts',
      expressionSourceLine: 2,
      kind: 'sensor',
      handler: (_ctx, n) => {
        calls.push(`check:${n as number}`)
        return n
      },
    },
  )
  const p = plan(parse('e.md', '# Adding\n\nI add 5. I should have 5.'), r)
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

test('executePlan augments a thrown error with a .md frame for the failing step', async () => {
  const r = addStep(createRegistry(), {
    expression: 'I throw',
    expressionSourceFile: 's.ts',
    expressionSourceLine: 1,
    kind: 'stimulus',
    handler: () => {
      throw new Error('boom')
    },
  })
  const p = plan(parse('e.md', '# A\n\nI throw'), r)
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
  // The synthetic stack frame points at the .md line where the step
  // text lives, directly BELOW the handler's `.ts` frame so vitest still
  // auto-renders the .ts snippet at the top.
  const stack = captured?.stack ?? ''
  expect(stack).toContain('e.md:3:1')
  expect(stack).toContain('at I throw')
  const frameLines = stack.split('\n').filter((l) => /^\s+at\s/.test(l))
  const handlerIdx = frameLines.findIndex((l) => !l.includes('e.md'))
  const varIdx = frameLines.findIndex((l) => l.includes('e.md'))
  expect(handlerIdx).toBeGreaterThanOrEqual(0)
  expect(varIdx).toBeGreaterThan(handlerIdx)
})

test('executePlan invokes createContext once per example and passes the result to handlers', async () => {
  const ctxSeen: unknown[] = []
  const r = addStep(createRegistry(), {
    expression: 'I record ctx',
    expressionSourceFile: 's.ts',
    expressionSourceLine: 1,
    kind: 'stimulus',
    handler: (ctx) => {
      ctxSeen.push(ctx)
    },
  })
  const p = plan(parse('e.md', '# A\n\nI record ctx\n\n# B\n\nI record ctx'), r)
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
  let captured: readonly unknown[] = []
  r = addStep(r, {
    expression: 'these books exist:',
    expressionSourceFile: 's.ts',
    expressionSourceLine: 1,
    kind: 'stimulus',
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
  const p = plan(parse('l.md', source), r)
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
  let captured: readonly unknown[] = []
  r = addStep(r, {
    expression: 'the receipt is:',
    expressionSourceFile: 's.ts',
    expressionSourceLine: 1,
    kind: 'stimulus',
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
  const p = plan(parse('l.md', source), r)
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
    kind: 'sensor',
    handler: (_ctx, ...args) => {
      const row = args[args.length - 1]
      rows.push(row)
      return row
    },
  })
  const source = `# Yahtzee

each row lists the dice, the category and the score:

| dice          | category   | score |
| ------------- | ---------- | ----- |
| 3, 3, 3, 4, 4 | full house | 17    |
| 3, 3, 3, 3, 3 | Yahtzee    | 50    |`
  const p = plan(parse('y.md', source), r)
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
    kind: 'sensor',
    // Typed fixtures bridge to the type-erased StepHandler the same way the
    // production runtime API does (`handler as StepHandler`).
    handler: ((_ctx, row: { score: string }) => {
      if (row.score === '50') throw new Error('boom')
      return row
    }) as StepHandler,
  })
  // Rows sit on source lines 7 and 8 (header=5, separator=6).
  const source = `# Yahtzee

each row lists the dice, the category and the score:

| dice          | category   | score |
| ------------- | ---------- | ----- |
| 3, 3, 3, 4, 4 | full house | 17    |
| 3, 3, 3, 3, 3 | Yahtzee    | 50    |`
  const p = plan(parse('y.md', source), r)
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
  expect(stack).toContain('y.md:8:')
})

test('a returning header-bound row that mismatches throws CellMismatchError with the cell span', async () => {
  let r = createRegistry()
  r = addStep(r, {
    expression: 'each row lists the dice, the category and the score',
    expressionSourceFile: 's.ts',
    expressionSourceLine: 1,
    kind: 'sensor',
    handler: ((_ctx, row: { score: string }) => ({
      score: row.score === '50' ? 999 : Number(row.score),
    })) as StepHandler,
  })
  const source = `# Yahtzee

each row lists the dice, the category and the score:

| dice          | category   | score |
| ------------- | ---------- | ----- |
| 3, 3, 3, 4, 4 | full house | 17    |
| 3, 3, 3, 3, 3 | Yahtzee    | 50    |`
  const p = plan(parse('y.md', source), r)
  const runs: Array<() => unknown | Promise<unknown>> = []
  executePlan(p, {
    sink: { example: (_n, run) => runs.push(run) },
    reporter: { diagnostic: () => {} },
  })
  await runs[0]?.() // 17 matches -> passes
  let caught: unknown
  try {
    await runs[1]?.() // returns 999, cell says 50 -> mismatch
  } catch (err) {
    caught = err
  }
  expect(isCellMismatchError(caught)).toBe(true)
  const cells = (caught as CellMismatchError).cells
  expect(cells).toHaveLength(1)
  expect(cells[0]?.column).toBe('score')
  expect(cells[0]?.expected).toBe('50')
  expect(cells[0]?.actual).toBe('999')
  expect(source.slice(cells[0]!.span.startOffset, cells[0]!.span.endOffset)).toBe('50')
})

test('a returning header-bound row that matches passes', async () => {
  let r = createRegistry()
  r = addStep(r, {
    expression: 'each row lists the dice, the category and the score',
    expressionSourceFile: 's.ts',
    expressionSourceLine: 1,
    kind: 'sensor',
    handler: ((_ctx, row: { score: string }) => ({ score: Number(row.score) })) as StepHandler,
  })
  const source = `# Yahtzee

each row lists the dice, the category and the score:

| dice          | category   | score |
| ------------- | ---------- | ----- |
| 3, 3, 3, 4, 4 | full house | 17    |`
  const p = plan(parse('y.md', source), r)
  const runs: Array<() => unknown | Promise<unknown>> = []
  executePlan(p, {
    sink: { example: (_n, run) => runs.push(run) },
    reporter: { diagnostic: () => {} },
  })
  await expect(runs[0]?.()).resolves.toBeUndefined()
})

function runsFor(source: string, reg: ReturnType<typeof createRegistry>) {
  const p = plan(parse('w.md', source), reg)
  const runs: Array<() => unknown | Promise<unknown>> = []
  executePlan(p, {
    sink: { example: (_n, run) => runs.push(run) },
    reporter: { diagnostic: () => {} },
  })
  return runs
}

const TABLE_DOC = `# T

uppercase each one:

| before | after |
| ------ | ----- |
| var    | VAR   |
| bdd    | BDD   |`

test('a whole-table sensor returning a mismatched table throws CellMismatchError at the cell span', async () => {
  // The table is the sensor's only slot, so it is returned bare.
  // Row-array format: each row is an array of cell strings in column order.
  const r = addStep(createRegistry(), {
    expression: 'uppercase each one',
    expressionSourceFile: 's.ts',
    expressionSourceLine: 1,
    kind: 'sensor',
    handler: () => [
      ['var', 'WRONG'],
      ['bdd', 'BDD'],
    ],
  })
  const source = TABLE_DOC
  const runs = runsFor(source, r)
  let caught: unknown
  try {
    await runs[0]?.()
  } catch (e) {
    caught = e
  }
  expect(isCellMismatchError(caught)).toBe(true)
  const cells = (caught as CellMismatchError).cells
  expect(cells).toHaveLength(1)
  expect(cells[0]?.expected).toBe('VAR')
  expect(cells[0]?.actual).toBe('WRONG')
  expect(source.slice(cells[0]!.span.startOffset, cells[0]!.span.endOffset)).toBe('VAR')
})

test('a whole-table sensor returning a matching table passes', async () => {
  // The table is the only slot: returned bare, as an array of row objects.
  const r = addStep(createRegistry(), {
    expression: 'uppercase each one',
    expressionSourceFile: 's.ts',
    expressionSourceLine: 1,
    kind: 'sensor',
    handler: () => [
      { before: 'var', after: 'VAR' },
      { before: 'bdd', after: 'BDD' },
    ],
  })
  await expect(runsFor(TABLE_DOC, r)[0]?.()).resolves.toBeUndefined()
})

test('a whole-table sensor returning the wrong type throws ReturnShapeError', async () => {
  const r = addStep(createRegistry(), {
    expression: 'uppercase each one',
    expressionSourceFile: 's.ts',
    expressionSourceLine: 1,
    kind: 'sensor',
    handler: () => 'not a table' as unknown as [],
  })
  await expect(runsFor(TABLE_DOC, r)[0]?.()).rejects.toBeInstanceOf(ReturnShapeError)
})

const DOCSTRING_DOC = `# T

the greeting is:

\`\`\`text
Hello, world!
\`\`\``

test('a doc-string sensor returning a different string throws CellMismatchError at the body span', async () => {
  // The doc string is the only slot: returned bare.
  const r = addStep(createRegistry(), {
    expression: 'the greeting is',
    expressionSourceFile: 's.ts',
    expressionSourceLine: 1,
    kind: 'sensor',
    handler: () => 'Goodbye!\n',
  })
  const source = DOCSTRING_DOC
  let caught: unknown
  try {
    await runsFor(source, r)[0]?.()
  } catch (e) {
    caught = e
  }
  expect(isCellMismatchError(caught)).toBe(true)
  const cell = (caught as CellMismatchError).cells[0] as CellDiff
  expect(cell.column).toBe('doc string')
  // JSON-quoted, so a whitespace-only difference stays visible.
  expect(cell.expected).toBe('"Hello, world!\\n"')
  expect(cell.actual).toBe('"Goodbye!\\n"')
  expect(source.slice(cell.span.startOffset, cell.span.endOffset)).toBe('Hello, world!\n')
})

test('a whole-table action returning undefined passes (asserted nothing)', async () => {
  const r = addStep(createRegistry(), {
    expression: 'uppercase each one',
    expressionSourceFile: 's.ts',
    expressionSourceLine: 1,
    kind: 'stimulus',
    handler: () => undefined,
  })
  await expect(runsFor(TABLE_DOC, r)[0]?.()).resolves.toBeUndefined()
})

test('a doc-string action returning undefined passes (asserted nothing)', async () => {
  const r = addStep(createRegistry(), {
    expression: 'the greeting is',
    expressionSourceFile: 's.ts',
    expressionSourceLine: 1,
    kind: 'stimulus',
    handler: () => undefined,
  })
  await expect(runsFor(DOCSTRING_DOC, r)[0]?.()).resolves.toBeUndefined()
})

test('a doc-string sensor returning the exact body passes', async () => {
  // The doc string is the only slot: echo the exact content bare.
  const r = addStep(createRegistry(), {
    expression: 'the greeting is',
    expressionSourceFile: 's.ts',
    expressionSourceLine: 1,
    kind: 'sensor',
    handler: ((_ctx, body: string) => body) as StepHandler,
  })
  await expect(runsFor(DOCSTRING_DOC, r)[0]?.()).resolves.toBeUndefined()
})

test('executePlan passes each example its deduped 1-based step lines via info', async () => {
  let r = createRegistry()
  r = addStep(r, {
    expression: 'I have {int} cukes',
    expressionSourceFile: 'inline',
    expressionSourceLine: 1,
    kind: 'stimulus',
    handler: () => {},
  })
  r = addStep(r, {
    expression: 'I eat {int} cukes',
    expressionSourceFile: 'inline',
    expressionSourceLine: 2,
    kind: 'stimulus',
    handler: () => {},
  })
  // Both steps are in one paragraph (no blank line between them) so the planner
  // creates a single example. "I have 5 cukes" is on line 3, "I eat 2 cukes" on line 4.
  const source = '# T\n\nI have 5 cukes.\nI eat 2 cukes.\n'
  const p = plan(parse('t.md', source), r)

  const seen: Array<{ name: string; lines: ReadonlyArray<number> | undefined }> = []
  const sink = {
    example: (
      name: string,
      _run: () => void | Promise<void>,
      info?: { readonly lines: ReadonlyArray<number> },
    ) => {
      seen.push({ name, lines: info?.lines })
    },
  }
  executePlan(p, { sink, reporter: { diagnostic() {} } })

  expect(seen).toHaveLength(1)
  expect(seen[0]?.lines).toEqual([3, 4])
})

test('expected-failure example: a thrown step makes the run resolve (pass)', async () => {
  const r = addStep(createRegistry(), {
    expression: 'I divide {int} by {int}',
    expressionSourceFile: 's.ts',
    expressionSourceLine: 1,
    kind: 'stimulus',
    handler: (_c, _a, b) => {
      if (b === 0) throw new Error('division by zero')
    },
  })
  const src = '# D\n\nI divide 1 by 0.\n\n```error\ndivision by zero\n```\n'
  const run = await runOnly(plan(parse('e.md', src), r))
  await expect(run?.()).resolves.toBeUndefined()
})

test('expected-failure example: no throw makes the run reject with UnexpectedPassError', async () => {
  const r = addStep(createRegistry(), {
    expression: 'I divide {int} by {int}',
    expressionSourceFile: 's.ts',
    expressionSourceLine: 1,
    kind: 'stimulus',
    handler: () => {},
  })
  const src = '# D\n\nI divide 1 by 1.\n\n```error\n```\n'
  const run = await runOnly(plan(parse('e.md', src), r))
  await expect(run?.()).rejects.toSatisfy(isUnexpectedPassError)
})

test('expected-failure with message substring: mismatch rejects with the real error', async () => {
  const r = addStep(createRegistry(), {
    expression: 'I divide {int} by {int}',
    expressionSourceFile: 's.ts',
    expressionSourceLine: 1,
    kind: 'stimulus',
    handler: () => {
      throw new Error('boom')
    },
  })
  const src = '# D\n\nI divide 1 by 0.\n\n```error\ndivision by zero\n```\n'
  const run = await runOnly(plan(parse('e.md', src), r))
  await expect(run?.()).rejects.toThrow('boom')
})

test('observer receives a pass observation per executed step', async () => {
  const r = addStep(createRegistry(), {
    expression: 'I add {int}',
    expressionSourceFile: 's.ts',
    expressionSourceLine: 1,
    kind: 'stimulus',
    handler: () => {},
  })
  const obs: StepObservation[] = []
  const run = await runOnly(plan(parse('e.md', '# A\n\nI add 5.'), r), {
    step: (o) => obs.push(o),
  })
  await run?.()
  expect(obs).toEqual([
    { exampleName: 'I add 5', exampleIndex: 0, ordinal: 1, stepFile: 's.ts', outcome: 'pass' },
  ])
})

test('observer receives a fail observation when a step throws', async () => {
  const r = addStep(createRegistry(), {
    expression: 'I blow up',
    expressionSourceFile: 's.ts',
    expressionSourceLine: 1,
    kind: 'stimulus',
    handler: () => {
      throw new Error('kaboom')
    },
  })
  const obs: StepObservation[] = []
  const run = await runOnly(plan(parse('e.md', '# A\n\nI blow up.'), r), {
    step: (o) => obs.push(o),
  })
  await Promise.resolve(run?.()).catch(() => {})
  expect(obs).toHaveLength(1)
  expect(obs[0]?.outcome).toBe('fail')
  expect(obs[0]?.error).toBeDefined()
})
