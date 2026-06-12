import { expect, test } from 'vitest'
import { addStep, createRegistry, parse, plan } from '../src/index.js'

test('end-to-end: a complete BDD file with headings, prose, list, table, and fence', () => {
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
  r = addStep(r, {
    expression: 'I should have {int} left',
    expressionSourceFile: 's.ts',
    expressionSourceLine: 3,
    handler: () => {},
  })
  r = addStep(r, {
    expression: 'these users exist',
    expressionSourceFile: 's.ts',
    expressionSourceLine: 4,
    handler: () => {},
  })
  r = addStep(r, {
    expression: 'I send the payload',
    expressionSourceFile: 's.ts',
    expressionSourceLine: 5,
    handler: () => {},
  })

  const source = `# Withdrawing cash

Given I have 100 in my account, when I withdraw 40, then I should have 60 left.

# Importing users

Given these users exist:

| name | age |
|------|-----|
| Bob  | 30  |
| Eve  | 25  |

When I send the payload:

\`\`\`json
{ "action": "import" }
\`\`\``

  const result = plan(parse('e.bdd.md', source), r)
  expect(result.diagnostics).toHaveLength(0)
  // 3 paragraphs across 2 headings → 3 examples:
  //   1. "Withdrawing cash" scope, one paragraph with all 3 banking steps
  //   2. "Importing users" scope, "these users exist" paragraph + attached table
  //   3. "Importing users" scope, "send the payload" paragraph + attached fence
  expect(result.examples).toHaveLength(3)

  const withdraw = result.examples[0]
  expect(withdraw?.scopeStack).toEqual(['Withdrawing cash'])
  expect(withdraw?.steps.map((s) => s.text)).toEqual([
    'I have 100 in my account',
    'I withdraw 40',
    'I should have 60 left',
  ])

  const users = result.examples[1]
  expect(users?.scopeStack).toEqual(['Importing users'])
  expect(users?.steps).toHaveLength(1)
  expect(users?.steps[0]?.dataTable?.rows).toHaveLength(2)

  const payload = result.examples[2]
  expect(payload?.scopeStack).toEqual(['Importing users'])
  expect(payload?.steps).toHaveLength(1)
  expect(payload?.steps[0]?.docString?.contentType).toBe('json')
})
