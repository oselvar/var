import { expect, test } from 'vitest'
import { addStep, createRegistry, parse, plan } from '../src/index.ts'

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

  const result = plan(parse('e.md', source), r)
  expect(result.diagnostics).toHaveLength(0)
  // 3 paragraphs across 2 headings → 2 examples (ADR 0012):
  //   1. "Withdrawing cash" scope, one paragraph with all 3 banking steps
  //   2. "Importing users" scope — "these users exist" + table and "send the
  //      payload" + fence are consecutive matching paragraphs with no delimiter
  //      between them, so they merge into ONE example (a Given→table→When→fence
  //      flow sharing one state — the multi-table shape issue #61 asked for).
  expect(result.examples).toHaveLength(2)

  const withdraw = result.examples[0]
  expect(withdraw?.scopeStack).toEqual(['Withdrawing cash'])
  expect(withdraw?.steps.map((s) => s.text)).toEqual([
    'I have 100 in my account',
    'I withdraw 40',
    'I should have 60 left',
  ])

  const importing = result.examples[1]
  expect(importing?.scopeStack).toEqual(['Importing users'])
  expect(importing?.steps.map((s) => s.text)).toEqual(['these users exist', 'I send the payload'])
  expect(importing?.steps[0]?.dataTable?.rows).toHaveLength(2)
  expect(importing?.steps[1]?.docString?.contentType).toBe('json')
})
