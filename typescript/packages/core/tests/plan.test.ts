import { expect, test } from 'vitest'
import { parse } from '../src/parse.ts'
import { plan } from '../src/plan.ts'
import { addStep, createRegistry } from '../src/registry.ts'

function reg() {
  let r = createRegistry()
  r = addStep(r, {
    expression: 'I have {int} in my account',
    expressionSourceFile: 'steps.ts',
    expressionSourceLine: 1,
    kind: 'stimulus',
    handler: () => {},
  })
  r = addStep(r, {
    expression: 'I withdraw {int}',
    expressionSourceFile: 'steps.ts',
    expressionSourceLine: 2,
    kind: 'stimulus',
    handler: () => {},
  })
  r = addStep(r, {
    expression: 'I should have {int} left',
    expressionSourceFile: 'steps.ts',
    expressionSourceLine: 3,
    kind: 'stimulus',
    handler: () => {},
  })
  return r
}

test('plan produces a PlannedExample with steps in document order', () => {
  // The whole paragraph becomes the example name (trailing terminator
  // stripped), even when only parts of it match steps. The heading becomes
  // a `describe` scope.
  const source =
    '# Withdrawing\n\nGiven I have 100 in my account. When I withdraw 40. Then I should have 60 left.'
  const varDoc = parse('w.md', source)
  const result = plan(varDoc, reg())
  expect(result.diagnostics).toHaveLength(0)
  expect(result.examples).toHaveLength(1)
  const ex = result.examples[0]
  if (!ex) throw new Error('no example')
  expect(ex.name).toBe(
    'Given I have 100 in my account. When I withdraw 40. Then I should have 60 left',
  )
  expect(ex.scopeStack).toEqual(['Withdrawing'])
  expect(ex.steps.map((s) => s.text)).toEqual([
    'I have 100 in my account',
    'I withdraw 40',
    'I should have 60 left',
  ])
  expect(ex.steps[0]?.args).toEqual([100])
})

test('the example name is the entire paragraph even when only part of it matches steps', () => {
  const source = 'It was a dark night. I withdraw 40. Nobody was watching.'
  const result = plan(parse('w.md', source), reg())
  expect(result.examples).toHaveLength(1)
  expect(result.examples[0]?.name).toBe('It was a dark night. I withdraw 40. Nobody was watching')
  expect(result.examples[0]?.steps.map((s) => s.text)).toEqual(['I withdraw 40'])
})

test('hard line breaks inside the paragraph collapse to single spaces in the name', () => {
  const source = 'I withdraw 40.\nI should have 60 left.'
  const result = plan(parse('w.md', source), reg())
  expect(result.examples[0]?.name).toBe('I withdraw 40. I should have 60 left')
})

test('plan emits an ambiguous-match diagnostic and produces no runnable example', () => {
  let r = createRegistry()
  r = addStep(r, {
    expression: 'I have {int} cukes',
    expressionSourceFile: 'a.ts',
    expressionSourceLine: 3,
    kind: 'stimulus',
    handler: () => {},
  })
  r = addStep(r, {
    expression: 'I have {int} {word}',
    expressionSourceFile: 'a.ts',
    expressionSourceLine: 8,
    kind: 'stimulus',
    handler: () => {},
  })
  const varDoc = parse('e.md', '# Ambig\n\nGiven I have 5 cukes')
  const result = plan(varDoc, r)
  expect(result.diagnostics).toHaveLength(1)
  expect(result.diagnostics[0]?.code).toBe('ambiguous-match')
  // An ambiguous candidate has no runnable step, so it is prose (a delimiter),
  // not an example — the diagnostic is the signal. See ADR 0012.
  expect(result.examples).toHaveLength(0)
})

test('plan skips an example heading whose body has no matches and no keyword-led sentences', () => {
  const source = '# Just docs\n\nSome prose with no matches and no keywords.'
  const varDoc = parse('d.md', source)
  const result = plan(varDoc, reg())
  expect(result.examples).toHaveLength(0)
  expect(result.diagnostics).toHaveLength(0)
})

test('plan merges consecutive list items into one example (a scenario as a bullet list)', () => {
  let r = createRegistry()
  r = addStep(r, {
    expression: 'I have {int} in my account',
    expressionSourceFile: 's.ts',
    expressionSourceLine: 1,
    kind: 'stimulus',
    handler: () => {},
  })
  r = addStep(r, {
    expression: 'I withdraw {int}',
    expressionSourceFile: 's.ts',
    expressionSourceLine: 2,
    kind: 'stimulus',
    handler: () => {},
  })
  // Two list items, no delimiter between them → one example, shared state (ADR
  // 0012). A bulleted scenario reads as Given/When/Then bullets.
  const source = '# Bullets\n\n- Given I have 100 in my account\n- When I withdraw 40'
  const result = plan(parse('b.md', source), r)
  expect(result.examples).toHaveLength(1)
  expect(result.examples[0]?.steps.map((s) => s.text)).toEqual([
    'I have 100 in my account',
    'I withdraw 40',
  ])
})

test('plan walks blockquote content as step-bearing', () => {
  let r = createRegistry()
  r = addStep(r, {
    expression: 'I have {int} in my account',
    expressionSourceFile: 's.ts',
    expressionSourceLine: 1,
    kind: 'stimulus',
    handler: () => {},
  })
  const source = '# Quote\n\n> Given I have 100 in my account'
  const result = plan(parse('q.md', source), r)
  expect(result.examples[0]?.steps).toHaveLength(1)
})

test('a markdown table immediately following a step-bearing block attaches as DataTable', () => {
  let r = createRegistry()
  r = addStep(r, {
    expression: 'these users exist',
    expressionSourceFile: 's.ts',
    expressionSourceLine: 1,
    kind: 'stimulus',
    handler: () => {},
  })
  const source = `# Users
Given these users exist:

| name | age |
|------|-----|
| Bob  | 30  |
| Eve  | 25  |`
  const result = plan(parse('u.md', source), r)
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
    kind: 'stimulus',
    handler: () => {},
  })
  // Paragraph between step and table
  const source = `# Mid
Given these users exist:

Some interrupting prose.

| name | age |
|------|-----|
| Bob  | 30  |`
  const result = plan(parse('m.md', source), r)
  const step = result.examples[0]?.steps[0]
  expect(step?.dataTable).toBeUndefined()
})

test('a fenced code block immediately following a step-bearing block attaches as DocString', () => {
  let r = createRegistry()
  r = addStep(r, {
    expression: 'I send the payload',
    expressionSourceFile: 's.ts',
    expressionSourceLine: 1,
    kind: 'stimulus',
    handler: () => {},
  })
  const source = `# Payload
When I send the payload:

\`\`\`json
{ "action": "import" }
\`\`\``
  const result = plan(parse('p.md', source), r)
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
    kind: 'stimulus',
    handler: () => {},
  })
  const result = plan(parse('p.md', '# P\nWhen I send the payload'), r)
  expect(result.examples[0]?.steps[0]?.docString).toBeUndefined()
})

test('a keyword-led sentence with no match does NOT produce a diagnostic (no Given/When/Then heuristic)', () => {
  // Step-def generation is selection-driven only; we never infer that a
  // keyword-led sentence "should" have matched a step definition.
  const r = createRegistry()
  const varDoc = parse('m.md', '# Empty\n\nGiven I have 5 cukes in my belly.')
  const result = plan(varDoc, r)
  expect(result.diagnostics).toHaveLength(0)
})

test('an unmatched sentence without a keyword is also silently treated as prose', () => {
  const r = createRegistry()
  const varDoc = parse('p.md', '# Prose\n\nI have 5 cukes in my belly.')
  const result = plan(varDoc, r)
  expect(result.diagnostics).toHaveLength(0)
})

test('a header-bound table (paragraph names every header cell) expands into one example per row', () => {
  let r = createRegistry()
  r = addStep(r, {
    expression: 'each row lists the dice, the category and the score',
    expressionSourceFile: 's.ts',
    expressionSourceLine: 1,
    kind: 'stimulus',
    handler: () => {},
  })
  const source = `# Yahtzee

each row lists the dice, the category and the score:

| dice          | category   | score |
| ------------- | ---------- | ----- |
| 3, 3, 3, 4, 4 | full house | 17    |
| 3, 3, 3, 3, 3 | Yahtzee    | 50    |`
  const result = plan(parse('y.md', source), r)
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
    kind: 'stimulus',
    handler: () => {},
  })
  // "these users exist" names neither `name` nor `age` — no row mode.
  const source = `# Users
these users exist:

| name | age |
| ---- | --- |
| Bob  | 30  |
| Eve  | 25  |`
  const result = plan(parse('u.md', source), r)
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
    kind: 'stimulus',
    handler: () => {},
  })
  // Headers are lower-case `dice`/`score`; the prose says `Dice`/`Score`.
  const source = `# Case
each row lists the Dice and the Score:

| dice      | score |
| --------- | ----- |
| 1,1,1,1,1 | 5     |`
  const result = plan(parse('c.md', source), r)
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
    kind: 'stimulus',
    handler: () => {},
  })
  const source = `# Yahtzee

each row lists the dice, the category and the score:

| dice          | category   | score |
| ------------- | ---------- | ----- |
| 3, 3, 3, 4, 4 | full house | 17    |
| 3, 3, 3, 3, 3 | Yahtzee    | 50    |`
  const result = plan(parse('y.md', source), r)
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

test('a header-bound example carries headerCellSpans pointing at the table header cells', () => {
  let r = createRegistry()
  r = addStep(r, {
    expression: 'each row lists the dice, the category and the score',
    expressionSourceFile: 's.ts',
    expressionSourceLine: 1,
    kind: 'stimulus',
    handler: () => {},
  })
  const source = `# Yahtzee

each row lists the dice, the category and the score:

| dice          | category   | score |
| ------------- | ---------- | ----- |
| 3, 3, 3, 4, 4 | full house | 17    |`
  const result = plan(parse('y.md', source), r)
  const binding = result.examples[0]?.headerBinding
  if (!binding) throw new Error('no headerBinding')
  // One span per header cell, located in the table's header row (distinct from
  // paramSpans, which point at the same words in the binding paragraph).
  expect(binding.headerCellSpans.map((s) => source.slice(s.startOffset, s.endOffset))).toEqual([
    'dice',
    'category',
    'score',
  ])
  const headerRowLine = binding.headerCellSpans[0]?.startLine
  expect(headerRowLine).toBeGreaterThan(binding.paramSpans[0]?.startLine as number)
})

test('a table not attached to a step is allowed — no diagnostic', () => {
  // Tables are valid Markdown on their own. A table that happens not to follow
  // a step-bearing paragraph is just content, not a mistake.
  let r = createRegistry()
  r = addStep(r, {
    expression: 'I have {int} cukes',
    expressionSourceFile: 's.ts',
    expressionSourceLine: 1,
    kind: 'stimulus',
    handler: () => {},
  })
  const source = `# Detached

Given I have 5 cukes.

Some interrupting prose paragraph.

| name | age |
|------|-----|
| Bob  | 30  |`
  const result = plan(parse('o.md', source), r)
  expect(result.diagnostics).toHaveLength(0)
})

test('a header-bound row example carries rowChecks (column, value, cell span)', () => {
  let r = createRegistry()
  r = addStep(r, {
    expression: 'each row lists the dice, the category and the score',
    expressionSourceFile: 's.ts',
    expressionSourceLine: 1,
    kind: 'stimulus',
    handler: () => {},
  })
  const source = `# Yahtzee

each row lists the dice, the category and the score:

| dice          | category   | score |
| ------------- | ---------- | ----- |
| 3, 3, 3, 4, 4 | full house | 17    |`
  const result = plan(parse('y.md', source), r)
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
    kind: 'stimulus',
    handler: () => {},
  })
  const src = '# Division\n\nI divide 1 by 0.\n\n```error\ndivision by zero\n```\n'
  const ex = plan(parse('e.md', src), r).examples[0]
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
    kind: 'stimulus',
    handler: () => {},
  })
  const ex = plan(parse('e.md', '# Division\n\nI divide 1 by 1.'), r).examples[0]
  expect(ex?.expectedOutcome).toBeUndefined()
})

test('an `error` fence with no matching step emits an error-fence-without-step diagnostic', () => {
  // The prose matches no step, so the expected-failure can never run.
  const r = addStep(createRegistry(), {
    expression: 'I divide {int} by {int}',
    expressionSourceFile: 's.ts',
    expressionSourceLine: 1,
    kind: 'stimulus',
    handler: () => {},
  })
  const src = '# Nope\n\nThis prose matches nothing.\n\n```error\nboom\n```\n'
  const result = plan(parse('e.md', src), r)
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
    kind: 'stimulus',
    handler: () => {},
  })
  r = addStep(r, {
    expression: 'I divide 1 by 0',
    expressionSourceFile: 's.ts',
    expressionSourceLine: 2,
    kind: 'stimulus',
    handler: () => {},
  })
  const src = '# Ambiguous\n\nI divide 1 by 0.\n\n```error\nboom\n```\n'
  const result = plan(parse('e.md', src), r)
  const codes = result.diagnostics.map((d) => d.code).sort()
  expect(codes).toEqual(['ambiguous-match', 'error-fence-without-step'])
})

test('a doc-string step carries the fence body span on its plan', () => {
  const r = addStep(createRegistry(), {
    expression: 'the payload is',
    expressionSourceFile: 's.ts',
    expressionSourceLine: 1,
    kind: 'stimulus',
    handler: () => {},
  })
  const source = `# T

the payload is:

\`\`\`json
{ "ok": true }
\`\`\``
  const result = plan(parse('d.md', source), r)
  const ds = result.examples[0]?.steps[0]?.docString
  if (!ds) throw new Error('no docString')
  expect(ds.content).toBe('{ "ok": true }\n')
  // The span slices back to the exact body content (trailing newline included).
  expect(source.slice(ds.span.startOffset, ds.span.endOffset)).toBe('{ "ok": true }\n')
})

// ---- Example delimiters (ADR 0012) ----------------------------------------

test('consecutive matching paragraphs with no delimiter merge into one example', () => {
  const source = 'I have 100 in my account.\n\nI withdraw 40.\n\nI should have 60 left.'
  const result = plan(parse('m.md', source), reg())
  expect(result.examples).toHaveLength(1)
  expect(result.examples[0]?.steps.map((s) => s.text)).toEqual([
    'I have 100 in my account',
    'I withdraw 40',
    'I should have 60 left',
  ])
  // The name is the first matching paragraph's text.
  expect(result.examples[0]?.name).toBe('I have 100 in my account')
})

test('a thematic break (---) between matching paragraphs splits them into two examples', () => {
  const source = 'I have 100 in my account.\n\n---\n\nI withdraw 40.'
  const result = plan(parse('h.md', source), reg())
  expect(result.examples).toHaveLength(2)
  expect(result.examples.map((e) => e.steps.map((s) => s.text))).toEqual([
    ['I have 100 in my account'],
    ['I withdraw 40'],
  ])
})

test('a heading between matching paragraphs splits them into two examples', () => {
  const source = 'I have 100 in my account.\n\n## Next\n\nI withdraw 40.'
  const result = plan(parse('hd.md', source), reg())
  expect(result.examples).toHaveLength(2)
  expect(result.examples[1]?.scopeStack).toEqual(['Next'])
})

test('a non-matching paragraph (prose) between matching paragraphs splits the example', () => {
  const source = 'I have 100 in my account.\n\nJust explaining what happens next.\n\nI withdraw 40.'
  const result = plan(parse('p.md', source), reg())
  expect(result.examples).toHaveLength(2)
  expect(result.examples.map((e) => e.steps.map((s) => s.text))).toEqual([
    ['I have 100 in my account'],
    ['I withdraw 40'],
  ])
})

test('leading and trailing prose does not merge into an example', () => {
  const source = 'A preamble that matches nothing.\n\nI withdraw 40.\n\nA closing remark.'
  const result = plan(parse('pp.md', source), reg())
  expect(result.examples).toHaveLength(1)
  expect(result.examples[0]?.steps.map((s) => s.text)).toEqual(['I withdraw 40'])
})

test('the multi-table shape from issue #61: two tables in one example survive blank lines', () => {
  let r = createRegistry()
  r = addStep(r, {
    expression: 'the following users have been imported',
    expressionSourceFile: 's.ts',
    expressionSourceLine: 1,
    kind: 'stimulus',
    handler: () => {},
  })
  r = addStep(r, {
    expression: 'the following assets have been imported',
    expressionSourceFile: 's.ts',
    expressionSourceLine: 2,
    kind: 'stimulus',
    handler: () => {},
  })
  const source = `Given the following users have been imported:

| email | name |
| ----- | ---- |
| a@b.c | Ada  |

And the following assets have been imported:

| name  |
| ----- |
| Moose |`
  const result = plan(parse('basket.md', source), r)
  expect(result.examples).toHaveLength(1)
  const ex = result.examples[0]
  expect(ex?.steps).toHaveLength(2)
  expect(ex?.steps[0]?.dataTable?.rows).toHaveLength(1)
  expect(ex?.steps[1]?.dataTable?.rows).toHaveLength(1)
})
