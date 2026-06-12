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
    handler: () => {},
  })
  r = addStep(r, {
    expression: 'I withdraw {int}',
    expressionSourceFile: 'steps.ts',
    expressionSourceLine: 2,
    handler: () => {},
  })
  r = addStep(r, {
    expression: 'I should have {int} left',
    expressionSourceFile: 'steps.ts',
    expressionSourceLine: 3,
    handler: () => {},
  })
  return r
}

test('plan produces a PlannedExample with steps in document order', () => {
  // The first sentence becomes the example name (terminator stripped) AND
  // is also matched as a step. The heading becomes a `describe` scope.
  const source =
    '# Withdrawing\n\nGiven I have 100 in my account. When I withdraw 40. Then I should have 60 left.'
  const bdd = parse('w.bdd.md', source)
  const result = plan(bdd, reg())
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
    handler: () => {},
  })
  r = addStep(r, {
    expression: 'I have {int} {word}',
    expressionSourceFile: 'a.ts',
    expressionSourceLine: 8,
    handler: () => {},
  })
  const bdd = parse('e.bdd.md', '# Ambig\n\nGiven I have 5 cukes')
  const result = plan(bdd, r)
  expect(result.diagnostics).toHaveLength(1)
  expect(result.diagnostics[0]?.code).toBe('ambiguous-match')
  expect(result.examples[0]?.steps).toHaveLength(0)
})

test('plan skips an example heading whose body has no matches and no keyword-led sentences', () => {
  const source = '# Just docs\n\nSome prose with no matches and no keywords.'
  const bdd = parse('d.bdd.md', source)
  const result = plan(bdd, reg())
  expect(result.examples).toHaveLength(0)
  expect(result.diagnostics).toHaveLength(0)
})

test('plan turns each list item into its own example (one matched step per item)', () => {
  let r = createRegistry()
  r = addStep(r, {
    expression: 'I have {int} in my account',
    expressionSourceFile: 's.ts',
    expressionSourceLine: 1,
    handler: () => {},
  })
  r = addStep(r, {
    expression: 'I withdraw {int}',
    expressionSourceFile: 's.ts',
    expressionSourceLine: 2,
    handler: () => {},
  })
  const source = '# Bullets\n\n- Given I have 100 in my account\n- When I withdraw 40'
  const result = plan(parse('b.bdd.md', source), r)
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
    handler: () => {},
  })
  const source = '# Quote\n\n> Given I have 100 in my account'
  const result = plan(parse('q.bdd.md', source), r)
  expect(result.examples[0]?.steps).toHaveLength(1)
})

test('a markdown table immediately following a step-bearing block attaches as DataTable', () => {
  let r = createRegistry()
  r = addStep(r, {
    expression: 'these users exist',
    expressionSourceFile: 's.ts',
    expressionSourceLine: 1,
    handler: () => {},
  })
  const source = `# Users
Given these users exist:

| name | age |
|------|-----|
| Bob  | 30  |
| Eve  | 25  |`
  const result = plan(parse('u.bdd.md', source), r)
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
    handler: () => {},
  })
  // Paragraph between step and table
  const source = `# Mid
Given these users exist:

Some interrupting prose.

| name | age |
|------|-----|
| Bob  | 30  |`
  const result = plan(parse('m.bdd.md', source), r)
  const step = result.examples[0]?.steps[0]
  expect(step?.dataTable).toBeUndefined()
})

test('a fenced code block immediately following a step-bearing block attaches as DocString', () => {
  let r = createRegistry()
  r = addStep(r, {
    expression: 'I send the payload',
    expressionSourceFile: 's.ts',
    expressionSourceLine: 1,
    handler: () => {},
  })
  const source = `# Payload
When I send the payload:

\`\`\`json
{ "action": "import" }
\`\`\``
  const result = plan(parse('p.bdd.md', source), r)
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
    handler: () => {},
  })
  const result = plan(parse('p.bdd.md', '# P\nWhen I send the payload'), r)
  expect(result.examples[0]?.steps[0]?.docString).toBeUndefined()
})

test('a keyword-led sentence with no match does NOT produce a diagnostic (no Given/When/Then heuristic)', () => {
  // Step-def generation is selection-driven only; we never infer that a
  // keyword-led sentence "should" have matched a step definition.
  const r = createRegistry()
  const bdd = parse('m.bdd.md', '# Empty\n\nGiven I have 5 cukes in my belly.')
  const result = plan(bdd, r)
  expect(result.diagnostics).toHaveLength(0)
})

test('an unmatched sentence without a keyword is also silently treated as prose', () => {
  const r = createRegistry()
  const bdd = parse('p.bdd.md', '# Prose\n\nI have 5 cukes in my belly.')
  const result = plan(bdd, r)
  expect(result.diagnostics).toHaveLength(0)
})

test('a table not attached to a step produces an orphan-attachment warning', () => {
  let r = createRegistry()
  r = addStep(r, {
    expression: 'I have {int} cukes',
    expressionSourceFile: 's.ts',
    expressionSourceLine: 1,
    handler: () => {},
  })
  const source = `# Detached

Given I have 5 cukes.

Some interrupting prose paragraph.

| name | age |
|------|-----|
| Bob  | 30  |`
  const result = plan(parse('o.bdd.md', source), r)
  const orphan = result.diagnostics.find((d) => d.code === 'orphan-attachment')
  expect(orphan?.severity).toBe('warning')
})
