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
  const source =
    '# Withdrawing\n\nGiven I have 100 in my account. When I withdraw 40. Then I should have 60 left.'
  const bdd = parse('w.bdd.md', source)
  const result = plan(bdd, reg())
  expect(result.diagnostics).toHaveLength(0)
  expect(result.examples).toHaveLength(1)
  const ex = result.examples[0]
  if (!ex) throw new Error('no example')
  expect(ex.name).toBe('Withdrawing')
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

test('plan walks list items as step-bearing blocks', () => {
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
    handler: () => {},
  })
  const source = '# Quote\n\n> Given I have 100 in my account'
  const result = plan(parse('q.bdd.md', source), r)
  expect(result.examples[0]?.steps).toHaveLength(1)
})
