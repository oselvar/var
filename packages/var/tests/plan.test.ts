import { expect, test } from 'vitest'
import { parse } from '../src/parse.js'
import { plan } from '../src/plan.js'
import { addStep, createRegistry } from '../src/registry.js'

function reg() {
  let r = createRegistry()
  r = addStep(r, {
    expression: 'I have {int} in my account',
    expressionSourceFile: 'steps.ts',
    expressionSourceLine: 1,
    kind: 'action',
    handler: () => {},
  })
  r = addStep(r, {
    expression: 'I withdraw {int}',
    expressionSourceFile: 'steps.ts',
    expressionSourceLine: 2,
    kind: 'action',
    handler: () => {},
  })
  r = addStep(r, {
    expression: 'I should have {int} left',
    expressionSourceFile: 'steps.ts',
    expressionSourceLine: 3,
    kind: 'action',
    handler: () => {},
  })
  return r
}

test('plan produces a PlannedExample with steps in document order', () => {
  // The first sentence becomes the example name (terminator stripped) AND
  // is also matched as a step. The heading becomes a `describe` scope.
  const source =
    '# Withdrawing\n\nGiven I have 100 in my account. When I withdraw 40. Then I should have 60 left.'
  const varDoc = parse('w.var.md', source)
  const result = plan(varDoc, reg())
  expect(result.diagnostics).toHaveLength(0)
  expect(result.examples).toHaveLength(1)
  const ex = result.examples[0]
  if (!ex) throw new Error('no example')
  expect(ex.name).toBe('Given I have 100 in my account')
  expect(ex.scopeStack).toEqual(['Withdrawing'])
  expect(ex.steps.map((s) => s.text)).toEqual([
    'I have 100 in my account',
    'I withdraw 40',
    'I should have 60 left',
  ])
  expect(ex.steps[0]?.args).toEqual([100])
})

test('plan emits an ambiguous-match diagnostic and does NOT include the example steps', () => {
  let r = createRegistry()
  r = addStep(r, {
    expression: 'I have {int} cukes',
    expressionSourceFile: 'a.ts',
    expressionSourceLine: 3,
    kind: 'action',
    handler: () => {},
  })
  r = addStep(r, {
    expression: 'I have {int} {word}',
    expressionSourceFile: 'a.ts',
    expressionSourceLine: 8,
    kind: 'action',
    handler: () => {},
  })
  const varDoc = parse('e.var.md', '# Ambig\n\nGiven I have 5 cukes')
  const result = plan(varDoc, r)
  expect(result.diagnostics).toHaveLength(1)
  expect(result.diagnostics[0]?.code).toBe('ambiguous-match')
  expect(result.examples[0]?.steps).toHaveLength(0)
})

test('plan skips an example heading whose body has no matches and no keyword-led sentences', () => {
  const source = '# Just docs\n\nSome prose with no matches and no keywords.'
  const varDoc = parse('d.var.md', source)
  const result = plan(varDoc, reg())
  expect(result.examples).toHaveLength(0)
  expect(result.diagnostics).toHaveLength(0)
})

test('plan turns each list item into its own example (one matched step per item)', () => {
  let r = createRegistry()
  r = addStep(r, {
    expression: 'I have {int} in my account',
    expressionSourceFile: 's.ts',
    expressionSourceLine: 1,
    kind: 'action',
    handler: () => {},
  })
  r = addStep(r, {
    expression: 'I withdraw {int}',
    expressionSourceFile: 's.ts',
    expressionSourceLine: 2,
    kind: 'action',
    handler: () => {},
  })
  const source = '# Bullets\n\n- Given I have 100 in my account\n- When I withdraw 40'
  const result = plan(parse('b.var.md', source), r)
  expect(result.examples).toHaveLength(2)
  expect(result.examples.map((e) => e.steps.map((s) => s.text))).toEqual([
    ['I have 100 in my account'],
    ['I withdraw 40'],
  ])
})

test('plan walks blockquote content as step-bearing', () => {
  let r = createRegistry()
  r = addStep(r, {
    expression: 'I have {int} in my account',
    expressionSourceFile: 's.ts',
    expressionSourceLine: 1,
    kind: 'action',
    handler: () => {},
  })
  const source = '# Quote\n\n> Given I have 100 in my account'
  const result = plan(parse('q.var.md', source), r)
  expect(result.examples[0]?.steps).toHaveLength(1)
})

test('a markdown table immediately following a step-bearing block attaches as DataTable', () => {
  let r = createRegistry()
  r = addStep(r, {
    expression: 'these users exist',
    expressionSourceFile: 's.ts',
    expressionSourceLine: 1,
    kind: 'action',
    handler: () => {},
  })
  const source = `# Users
Given these users exist:

| name | age |
|------|-----|
| Bob  | 30  |
| Eve  | 25  |`
  const result = plan(parse('u.var.md', source), r)
  const step = result.examples[0]?.steps[0]
  expect(step?.dataTable?.header.cells).toEqual(['name', 'age'])
  expect(step?.dataTable?.rows).toHaveLength(2)
})

test('a table not immediately after a step-bearing block does NOT attach', () => {
  let r = createRegistry()
  r = addStep(r, {
    expression: 'these users exist',
    expressionSourceFile: 's.ts',
    expressionSourceLine: 1,
    kind: 'action',
    handler: () => {},
  })
  // Paragraph between step and table
  const source = `# Mid
Given these users exist:

Some interrupting prose.

| name | age |
|------|-----|
| Bob  | 30  |`
  const result = plan(parse('m.var.md', source), r)
  const step = result.examples[0]?.steps[0]
  expect(step?.dataTable).toBeUndefined()
})

test('a fenced code block immediately following a step-bearing block attaches as DocString', () => {
  let r = createRegistry()
  r = addStep(r, {
    expression: 'I send the payload',
    expressionSourceFile: 's.ts',
    expressionSourceLine: 1,
    kind: 'action',
    handler: () => {},
  })
  const source = `# Payload
When I send the payload:

\`\`\`json
{ "action": "import" }
\`\`\``
  const result = plan(parse('p.var.md', source), r)
  const step = result.examples[0]?.steps[0]
  expect(step?.docString?.contentType).toBe('json')
  expect(step?.docString?.content).toBe('{ "action": "import" }\n')
})

test('a step with NO following fence has no docString', () => {
  let r = createRegistry()
  r = addStep(r, {
    expression: 'I send the payload',
    expressionSourceFile: 's.ts',
    expressionSourceLine: 1,
    kind: 'action',
    handler: () => {},
  })
  const result = plan(parse('p.var.md', '# P\nWhen I send the payload'), r)
  expect(result.examples[0]?.steps[0]?.docString).toBeUndefined()
})

test('a keyword-led sentence with no match does NOT produce a diagnostic (no Given/When/Then heuristic)', () => {
  // Step-def generation is selection-driven only; we never infer that a
  // keyword-led sentence "should" have matched a step definition.
  const r = createRegistry()
  const varDoc = parse('m.var.md', '# Empty\n\nGiven I have 5 cukes in my belly.')
  const result = plan(varDoc, r)
  expect(result.diagnostics).toHaveLength(0)
})

test('an unmatched sentence without a keyword is also silently treated as prose', () => {
  const r = createRegistry()
  const varDoc = parse('p.var.md', '# Prose\n\nI have 5 cukes in my belly.')
  const result = plan(varDoc, r)
  expect(result.diagnostics).toHaveLength(0)
})

test('a header-bound table (paragraph names every header cell) expands into one example per row', () => {
  let r = createRegistry()
  r = addStep(r, {
    expression: 'each row lists the dice, the category and the score',
    expressionSourceFile: 's.ts',
    expressionSourceLine: 1,
    kind: 'action',
    handler: () => {},
  })
  const source = `# Yahtzee

each row lists the dice, the category and the score:

| dice          | category   | score |
| ------------- | ---------- | ----- |
| 3, 3, 3, 4, 4 | full house | 17    |
| 3, 3, 3, 3, 3 | Yahtzee    | 50    |`
  const result = plan(parse('y.var.md', source), r)
  expect(result.diagnostics).toHaveLength(0)
  // One example per data row (the header row is the binding, not an example).
  expect(result.examples).toHaveLength(2)
  const [first, second] = result.examples
  // Each row example runs the matched step once, with the row object — keyed by
  // header cell, raw string values — as the trailing handler argument.
  expect(first?.steps).toHaveLength(1)
  expect(first?.steps[0]?.args).toEqual([
    { dice: '3, 3, 3, 4, 4', category: 'full house', score: '17' },
  ])
  expect(second?.steps[0]?.args).toEqual([
    { dice: '3, 3, 3, 3, 3', category: 'Yahtzee', score: '50' },
  ])
  // The whole table is NOT also handed over in row mode.
  expect(first?.steps[0]?.dataTable).toBeUndefined()
})

test('a table whose paragraph names only SOME header cells keeps whole-table behaviour', () => {
  let r = createRegistry()
  r = addStep(r, {
    expression: 'these users exist',
    expressionSourceFile: 's.ts',
    expressionSourceLine: 1,
    kind: 'action',
    handler: () => {},
  })
  // "these users exist" names neither `name` nor `age` — no row mode.
  const source = `# Users
these users exist:

| name | age |
| ---- | --- |
| Bob  | 30  |
| Eve  | 25  |`
  const result = plan(parse('u.var.md', source), r)
  expect(result.examples).toHaveLength(1)
  const step = result.examples[0]?.steps[0]
  expect(step?.dataTable?.header.cells).toEqual(['name', 'age'])
  expect(step?.dataTable?.rows).toHaveLength(2)
})

test('header-bound matching is case-sensitive — the paragraph must echo the header exactly', () => {
  let r = createRegistry()
  r = addStep(r, {
    expression: 'each row lists the Dice and the Score',
    expressionSourceFile: 's.ts',
    expressionSourceLine: 1,
    kind: 'action',
    handler: () => {},
  })
  // Headers are lower-case `dice`/`score`; the prose says `Dice`/`Score`.
  const source = `# Case
each row lists the Dice and the Score:

| dice      | score |
| --------- | ----- |
| 1,1,1,1,1 | 5     |`
  const result = plan(parse('c.var.md', source), r)
  // No exact-case match → falls back to a single whole-table example.
  expect(result.examples).toHaveLength(1)
  expect(result.examples[0]?.steps[0]?.dataTable?.rows).toHaveLength(1)
})

test('header-bound rows are named by their cells and nested under the paragraph', () => {
  let r = createRegistry()
  r = addStep(r, {
    expression: 'each row lists the dice, the category and the score',
    expressionSourceFile: 's.ts',
    expressionSourceLine: 1,
    kind: 'action',
    handler: () => {},
  })
  const source = `# Yahtzee

each row lists the dice, the category and the score:

| dice          | category   | score |
| ------------- | ---------- | ----- |
| 3, 3, 3, 4, 4 | full house | 17    |
| 3, 3, 3, 3, 3 | Yahtzee    | 50    |`
  const result = plan(parse('y.var.md', source), r)
  expect(result.examples.map((e) => e.name)).toEqual([
    '3, 3, 3, 4, 4 / full house / 17',
    '3, 3, 3, 3, 3 / Yahtzee / 50',
  ])
  for (const ex of result.examples) {
    expect(ex.scopeStack).toEqual([
      'Yahtzee',
      'each row lists the dice, the category and the score',
    ])
  }
  // Each row example maps to its own (distinct, ascending) source line.
  const lines = result.examples.map((e) => e.span.startLine)
  expect(new Set(lines).size).toBe(2)
  expect(lines[0]).toBeLessThan(lines[1] as number)
})

test('a table not attached to a step is allowed — no diagnostic', () => {
  // Tables are valid Markdown on their own. A table that happens not to follow
  // a step-bearing paragraph is just content, not a mistake.
  let r = createRegistry()
  r = addStep(r, {
    expression: 'I have {int} cukes',
    expressionSourceFile: 's.ts',
    expressionSourceLine: 1,
    kind: 'action',
    handler: () => {},
  })
  const source = `# Detached

Given I have 5 cukes.

Some interrupting prose paragraph.

| name | age |
|------|-----|
| Bob  | 30  |`
  const result = plan(parse('o.var.md', source), r)
  expect(result.diagnostics).toHaveLength(0)
})

test('a header-bound row example carries rowChecks (column, value, cell span)', () => {
  let r = createRegistry()
  r = addStep(r, {
    expression: 'each row lists the dice, the category and the score',
    expressionSourceFile: 's.ts',
    expressionSourceLine: 1,
    kind: 'action',
    handler: () => {},
  })
  const source = `# Yahtzee

each row lists the dice, the category and the score:

| dice          | category   | score |
| ------------- | ---------- | ----- |
| 3, 3, 3, 4, 4 | full house | 17    |`
  const result = plan(parse('y.var.md', source), r)
  const checks = result.examples[0]?.rowChecks
  if (!checks) throw new Error('no rowChecks')
  expect(checks.map((c) => c.column)).toEqual(['dice', 'category', 'score'])
  expect(checks.map((c) => c.value)).toEqual(['3, 3, 3, 4, 4', 'full house', '17'])
  // The score cell span slices back to "17" in the source.
  const scoreCheck = checks[2]!
  expect(source.slice(scoreCheck.span.startOffset, scoreCheck.span.endOffset)).toBe('17')
})

test('an `error` fence marks the example expectedOutcome=fail with a message substring', () => {
  const r = addStep(createRegistry(), {
    expression: 'I divide {int} by {int}',
    expressionSourceFile: 's.ts',
    expressionSourceLine: 1,
    kind: 'action',
    handler: () => {},
  })
  const src = '# Division\n\nI divide 1 by 0.\n\n```error\ndivision by zero\n```\n'
  const ex = plan(parse('e.var.md', src), r).examples[0]
  expect(ex?.expectedOutcome).toBe('fail')
  expect(ex?.expectedErrorMessage).toBe('division by zero')
  // The error fence must NOT become a docString attachment on the step.
  expect(ex?.steps[0]?.docString).toBeUndefined()
})

test('no `error` fence leaves expectedOutcome undefined', () => {
  const r = addStep(createRegistry(), {
    expression: 'I divide {int} by {int}',
    expressionSourceFile: 's.ts',
    expressionSourceLine: 1,
    kind: 'action',
    handler: () => {},
  })
  const ex = plan(parse('e.var.md', '# Division\n\nI divide 1 by 1.'), r).examples[0]
  expect(ex?.expectedOutcome).toBeUndefined()
})

test('an `error` fence with no matching step emits an error-fence-without-step diagnostic', () => {
  // The prose matches no step, so the expected-failure can never run.
  const r = addStep(createRegistry(), {
    expression: 'I divide {int} by {int}',
    expressionSourceFile: 's.ts',
    expressionSourceLine: 1,
    kind: 'action',
    handler: () => {},
  })
  const src = '# Nope\n\nThis prose matches nothing.\n\n```error\nboom\n```\n'
  const result = plan(parse('e.var.md', src), r)
  expect(result.examples).toHaveLength(0)
  expect(result.diagnostics).toHaveLength(1)
  expect(result.diagnostics[0]?.code).toBe('error-fence-without-step')
})

test('an `error` fence on an ambiguous example emits both diagnostics', () => {
  let r = createRegistry()
  r = addStep(r, {
    expression: 'I divide {int} by {int}',
    expressionSourceFile: 's.ts',
    expressionSourceLine: 1,
    kind: 'action',
    handler: () => {},
  })
  r = addStep(r, {
    expression: 'I divide 1 by 0',
    expressionSourceFile: 's.ts',
    expressionSourceLine: 2,
    kind: 'action',
    handler: () => {},
  })
  const src = '# Ambiguous\n\nI divide 1 by 0.\n\n```error\nboom\n```\n'
  const result = plan(parse('e.var.md', src), r)
  const codes = result.diagnostics.map((d) => d.code).sort()
  expect(codes).toEqual(['ambiguous-match', 'error-fence-without-step'])
})

test('a doc-string step carries the fence body span on its plan', () => {
  const r = addStep(createRegistry(), {
    expression: 'the payload is',
    expressionSourceFile: 's.ts',
    expressionSourceLine: 1,
    kind: 'action',
    handler: () => {},
  })
  const source = `# T

the payload is:

\`\`\`json
{ "ok": true }
\`\`\``
  const result = plan(parse('d.var.md', source), r)
  const ds = result.examples[0]?.steps[0]?.docString
  if (!ds) throw new Error('no docString')
  expect(ds.content).toBe('{ "ok": true }\n')
  // The span slices back to the exact body content (trailing newline included).
  expect(source.slice(ds.span.startOffset, ds.span.endOffset)).toBe('{ "ok": true }\n')
})
